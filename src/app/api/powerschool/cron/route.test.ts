import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression test for a real crash risk: this route used to fire every
// matched user's sync via after() in a loop with no concurrency limit at
// all, so a burst of users sharing the same hour bucket would launch that
// many headless-Chromium scrapes at once inside ONE ~1024MB serverless
// invocation — easily enough to OOM it (Vercel Hobby plan). It now runs them
// one at a time in a plain sequential loop; this asserts that property
// directly by tracking how many mocked syncs are in flight simultaneously.
const mocks = vi.hoisted(() => ({
  getUsersWithAutoSyncDueAt: vi.fn(),
  getPowerSchoolCredentials: vi.fn(),
  startPowerSchoolSync: vi.fn(),
  runPowerSchoolSync: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getUsersWithAutoSyncDueAt: mocks.getUsersWithAutoSyncDueAt,
  getPowerSchoolCredentials: mocks.getPowerSchoolCredentials,
}));
vi.mock('@/lib/powerschoolSync', () => ({
  startPowerSchoolSync: mocks.startPowerSchoolSync,
  runPowerSchoolSync: mocks.runPowerSchoolSync,
}));

const { GET } = await import('./route');

function makeRequest(hour: number): Parameters<typeof GET>[0] {
  return {
    headers: { get: () => null },
    nextUrl: { searchParams: new URLSearchParams({ hour: String(hour) }) },
  } as unknown as Parameters<typeof GET>[0];
}

const CREDS = { url: 'https://ps.example.com', username: 'stu', password: 'pw' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPowerSchoolCredentials.mockResolvedValue(CREDS);
  mocks.startPowerSchoolSync.mockImplementation(async (userId: string) => `sync-${userId}`);
});

describe('GET /api/powerschool/cron', () => {
  it('never runs more than one scrape at a time, even when several users share the hour bucket', async () => {
    mocks.getUsersWithAutoSyncDueAt.mockResolvedValue(['u1', 'u2', 'u3']);

    let inFlight = 0;
    let maxInFlight = 0;
    mocks.runPowerSchoolSync.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });

    const res = await GET(makeRequest(12));
    const body = await res.json();

    expect(maxInFlight).toBe(1);
    expect(mocks.runPowerSchoolSync).toHaveBeenCalledTimes(3);
    expect(body).toMatchObject({ matched: 3, fired: 3, skipped: 0, deferred: 0 });
  });

  it('skips a matched user with no saved credentials without starting a sync', async () => {
    mocks.getUsersWithAutoSyncDueAt.mockResolvedValue(['u1']);
    mocks.getPowerSchoolCredentials.mockResolvedValue({ url: '', username: '', password: '' });

    const res = await GET(makeRequest(0));
    const body = await res.json();

    expect(mocks.startPowerSchoolSync).not.toHaveBeenCalled();
    expect(mocks.runPowerSchoolSync).not.toHaveBeenCalled();
    expect(body).toMatchObject({ matched: 1, fired: 0, skipped: 1, deferred: 0 });
  });

  it('skips a user already mid-sync instead of racing it', async () => {
    mocks.getUsersWithAutoSyncDueAt.mockResolvedValue(['u1']);
    mocks.startPowerSchoolSync.mockResolvedValue(null); // lock already held

    const res = await GET(makeRequest(0));
    const body = await res.json();

    expect(mocks.runPowerSchoolSync).not.toHaveBeenCalled();
    expect(body).toMatchObject({ fired: 0, skipped: 1 });
  });
});
