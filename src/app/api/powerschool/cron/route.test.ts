import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression test for a real crash risk: this route used to fire every
// matched user's sync via after() in a loop with no concurrency limit at
// all, so a burst of enabled users would launch that
// many headless-Chromium scrapes at once inside ONE ~1024MB serverless
// invocation — easily enough to OOM it (Vercel Hobby plan). It now runs them
// one at a time in a plain sequential loop; this asserts that property
// directly by tracking how many mocked syncs are in flight simultaneously.
const mocks = vi.hoisted(() => ({
  getUsersWithAutoSyncEnabled: vi.fn(),
  getPowerSchoolCredentials: vi.fn(),
  getSyncStatus: vi.fn(),
  startPowerSchoolSync: vi.fn(),
  runPowerSchoolSync: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getUsersWithAutoSyncEnabled: mocks.getUsersWithAutoSyncEnabled,
  getPowerSchoolCredentials: mocks.getPowerSchoolCredentials,
  getSyncStatus: mocks.getSyncStatus,
}));
vi.mock('@/lib/powerschoolSync', () => ({
  startPowerSchoolSync: mocks.startPowerSchoolSync,
  runPowerSchoolSync: mocks.runPowerSchoolSync,
}));

const { GET } = await import('./route');

const TEST_CRON_SECRET = 'test-cron-secret';

function makeRequest(): Parameters<typeof GET>[0] {
  return {
    headers: { get: () => `Bearer ${TEST_CRON_SECRET}` },
    nextUrl: { searchParams: new URLSearchParams() },
  } as unknown as Parameters<typeof GET>[0];
}

const CREDS = { url: 'https://ps.example.com', username: 'stu', password: 'pw' };

beforeEach(() => {
  // The route now fails closed without a configured CRON_SECRET (see
  // docs/SECURITY_AUDIT.md C3) — these tests exercise the sync-loop logic,
  // not the auth gate, so they authenticate like a real Vercel Cron request.
  vi.stubEnv('CRON_SECRET', TEST_CRON_SECRET);
  vi.clearAllMocks();
  mocks.getPowerSchoolCredentials.mockResolvedValue(CREDS);
  mocks.getSyncStatus.mockResolvedValue(null);
  mocks.startPowerSchoolSync.mockImplementation(async (userId: string) => `sync-${userId}`);
});

describe('GET /api/powerschool/cron', () => {
  it('fails closed (401) when CRON_SECRET is not configured, rather than skipping the auth check', async () => {
    vi.stubEnv('CRON_SECRET', '');
    mocks.getUsersWithAutoSyncEnabled.mockResolvedValue(['u1']);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mocks.getUsersWithAutoSyncEnabled).not.toHaveBeenCalled();
  });

  it('rejects a request whose bearer token does not match CRON_SECRET', async () => {
    mocks.getUsersWithAutoSyncEnabled.mockResolvedValue(['u1']);

    const res = await GET({
      headers: { get: () => 'Bearer wrong-secret' },
      nextUrl: { searchParams: new URLSearchParams() },
    } as unknown as Parameters<typeof GET>[0]);

    expect(res.status).toBe(401);
    expect(mocks.getUsersWithAutoSyncEnabled).not.toHaveBeenCalled();
  });

  it('never runs more than one scrape at a time, even when several users share the daily run', async () => {
    mocks.getUsersWithAutoSyncEnabled.mockResolvedValue(['u1', 'u2', 'u3']);

    let inFlight = 0;
    let maxInFlight = 0;
    mocks.runPowerSchoolSync.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(maxInFlight).toBe(1);
    expect(mocks.runPowerSchoolSync).toHaveBeenCalledTimes(3);
    expect(body).toMatchObject({ matched: 3, fired: 3, skipped: 0, deferred: 0 });
  });

  it('skips a matched user with no saved credentials without starting a sync', async () => {
    mocks.getUsersWithAutoSyncEnabled.mockResolvedValue(['u1']);
    mocks.getPowerSchoolCredentials.mockResolvedValue({ url: '', username: '', password: '' });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(mocks.startPowerSchoolSync).not.toHaveBeenCalled();
    expect(mocks.runPowerSchoolSync).not.toHaveBeenCalled();
    expect(body).toMatchObject({ matched: 1, fired: 0, skipped: 1, deferred: 0 });
  });

  it('skips a user whose last sync failed on login, instead of retrying a rejected password every day', async () => {
    mocks.getUsersWithAutoSyncEnabled.mockResolvedValue(['bad', 'good']);
    mocks.getSyncStatus.mockImplementation(async (id: string) =>
      id === 'bad' ? { status: 'error', error: 'PowerSchool login failed: Invalid Username or Password!' } : null);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(mocks.runPowerSchoolSync).toHaveBeenCalledTimes(1);
    expect(mocks.runPowerSchoolSync.mock.calls[0][0]).toBe('good');
    expect(body).toMatchObject({ matched: 2, fired: 1, skipped: 1 });
  });

  it('skips a user already mid-sync instead of racing it', async () => {
    mocks.getUsersWithAutoSyncEnabled.mockResolvedValue(['u1']);
    mocks.startPowerSchoolSync.mockResolvedValue(null); // lock already held

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(mocks.runPowerSchoolSync).not.toHaveBeenCalled();
    expect(body).toMatchObject({ fired: 0, skipped: 1 });
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});
