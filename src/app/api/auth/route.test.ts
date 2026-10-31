import { describe, it, expect, vi, beforeEach } from 'vitest';

// Covers the per-IP login/register rate limit added in
// docs/SECURITY_AUDIT.md (H2) — not a full auth-flow test, just that the
// limit actually kicks in after enough attempts from one IP, and that a
// different IP is unaffected.
const mocks = vi.hoisted(() => ({
  initializeDatabase: vi.fn(),
  createOrUpdateAdminUser: vi.fn(),
  createUser: vi.fn(),
  getUserByUsername: vi.fn(),
  getUserById: vi.fn(),
  getUserByIdWithHash: vi.fn(),
  updateUserPassword: vi.fn(),
  deleteUserAndAllData: vi.fn(),
  setSetting: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  hasSessionToken: vi.fn(),
  getSessionUserId: vi.fn(),
  deleteSession: vi.fn(),
  clearSessionCookie: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  initializeDatabase: mocks.initializeDatabase,
  createOrUpdateAdminUser: mocks.createOrUpdateAdminUser,
  createUser: mocks.createUser,
  getUserByUsername: mocks.getUserByUsername,
  getUserById: mocks.getUserById,
  getUserByIdWithHash: mocks.getUserByIdWithHash,
  updateUserPassword: mocks.updateUserPassword,
  deleteUserAndAllData: mocks.deleteUserAndAllData,
  setSetting: mocks.setSetting,
}));

vi.mock('@/lib/auth', () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
  createSession: mocks.createSession,
  hasSessionToken: mocks.hasSessionToken,
  getSessionUserId: mocks.getSessionUserId,
  deleteSession: mocks.deleteSession,
  clearSessionCookie: mocks.clearSessionCookie,
}));

const { POST } = await import('./route');
const loadRoute = () => import('./route');

function loginRequest(ip: string, password = 'wrong-password') {
  return {
    json: async () => ({ action: 'login', username: 'demo', password }),
    headers: { get: (h: string) => (h === 'x-forwarded-for' ? ip : null) },
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserByUsername.mockResolvedValue({ id: 'u1', username: 'demo', passwordHash: 'salt:hash', role: 'user' });
  mocks.verifyPassword.mockResolvedValue(false);
  mocks.hasSessionToken.mockReturnValue(false);
});

describe('POST /api/auth login rate limit', () => {
  it('allows the configured number of attempts, then returns 429', async () => {
    const ip = '203.0.113.5';
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await POST(loginRequest(ip));
      statuses.push(res.status);
    }
    // First 10 are evaluated normally (401 — wrong password); the 11th+
    // are rejected before even checking credentials.
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it('rate-limits independently per IP', async () => {
    const ipA = '203.0.113.10';
    const ipB = '203.0.113.11';
    for (let i = 0; i < 11; i++) await POST(loginRequest(ipA));

    const blockedA = await POST(loginRequest(ipA));
    const okB = await POST(loginRequest(ipB));

    expect(blockedA.status).toBe(429);
    expect(okB.status).toBe(401); // not rate-limited — still a normal wrong-password response
  });
});

describe('GET /api/auth', () => {
  it('skips database initialization when no session exists', async () => {
    vi.resetModules();
    mocks.getSessionUserId.mockResolvedValue(null);
    const { GET } = await loadRoute();

    const response = await GET(new Request('https://example.test/api/auth'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null });
    expect(mocks.hasSessionToken).toHaveBeenCalledOnce();
    expect(mocks.getSessionUserId).not.toHaveBeenCalled();
    expect(mocks.initializeDatabase).not.toHaveBeenCalled();
  });

  it('initializes the database before loading a signed-in user', async () => {
    vi.resetModules();
    mocks.hasSessionToken.mockReturnValue(true);
    mocks.getSessionUserId.mockResolvedValue('u1');
    mocks.getUserById.mockResolvedValue({ id: 'u1', username: 'demo', role: 'user' });
    const { GET } = await loadRoute();

    const response = await GET(new Request('https://example.test/api/auth'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: { id: 'u1', username: 'demo', role: 'user' } });
    expect(mocks.initializeDatabase).toHaveBeenCalledOnce();
    expect(mocks.initializeDatabase.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getSessionUserId.mock.invocationCallOrder[0],
    );
  });
});
