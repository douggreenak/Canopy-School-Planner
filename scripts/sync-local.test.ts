import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Unit tests for the main() function exported from scripts/sync-local.ts.
// All DB / browser / sync dependencies are mocked so no real network calls or
// Chrome processes are started. The test exercises the same orchestration
// properties as the Vercel cron route tests (sequential execution, credential
// guard, lock guard, bad-login skip) so both paths stay in parity.

const mocks = vi.hoisted(() => ({
  getUsersWithAutoSyncEnabled: vi.fn(),
  getPowerSchoolCredentials: vi.fn(),
  getSyncStatus: vi.fn(),
  startPowerSchoolSync: vi.fn(),
  runPowerSchoolSync: vi.fn(),
  closeBrowser: vi.fn().mockResolvedValue(undefined),
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
// launchBrowser must be mocked — the real implementation spawns Chrome.
// close() must return a Promise because the script calls browser.close().catch(…)
vi.mock('@/lib/powerschool', () => ({
  launchBrowser: vi.fn(async () => ({
    close: mocks.closeBrowser,
    connected: true,
  })),
}));
// dotenv/config is a side-effect import that reads .env — suppress it in tests.
vi.mock('dotenv/config', () => ({}));

const { main } = await import('./sync-local');

const CREDS = { url: 'https://ps.example.com', username: 'stu', password: 'pw' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPowerSchoolCredentials.mockResolvedValue(CREDS);
  mocks.getSyncStatus.mockResolvedValue(null);
  mocks.startPowerSchoolSync.mockImplementation(async (id: string) => `sync-${id}`);
  mocks.runPowerSchoolSync.mockResolvedValue(undefined);
  mocks.closeBrowser.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sync-local.ts — main()', () => {
  it('syncs every auto-sync user exactly once, sequentially', async () => {
    mocks.getUsersWithAutoSyncEnabled.mockResolvedValue(['u1', 'u2', 'u3']);

    let inFlight = 0;
    let maxInFlight = 0;
    mocks.runPowerSchoolSync.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });

    await main();

    expect(maxInFlight).toBe(1);
    expect(mocks.runPowerSchoolSync).toHaveBeenCalledTimes(3);
  });

  it('exits cleanly without launching a browser when no users have auto-sync enabled', async () => {
    mocks.getUsersWithAutoSyncEnabled.mockResolvedValue([]);
    const { launchBrowser } = await import('@/lib/powerschool');

    await main();

    expect(mocks.runPowerSchoolSync).not.toHaveBeenCalled();
    expect(launchBrowser).not.toHaveBeenCalled();
  });

  it('skips a user with no saved credentials without calling startPowerSchoolSync', async () => {
    mocks.getUsersWithAutoSyncEnabled.mockResolvedValue(['u1']);
    mocks.getPowerSchoolCredentials.mockResolvedValue({ url: '', username: '', password: '' });

    await main();

    expect(mocks.startPowerSchoolSync).not.toHaveBeenCalled();
    expect(mocks.runPowerSchoolSync).not.toHaveBeenCalled();
  });

  it('skips a user whose last sync failed on login instead of hammering a bad password daily', async () => {
    mocks.getUsersWithAutoSyncEnabled.mockResolvedValue(['bad', 'good']);
    mocks.getSyncStatus.mockImplementation(async (id: string) =>
      id === 'bad'
        ? { status: 'error', error: 'PowerSchool login failed: Invalid Username or Password!' }
        : null
    );

    await main();

    expect(mocks.runPowerSchoolSync).toHaveBeenCalledTimes(1);
    expect(mocks.runPowerSchoolSync.mock.calls[0][0]).toBe('good');
  });

  it('skips a user whose sync lock is already held instead of racing it', async () => {
    mocks.getUsersWithAutoSyncEnabled.mockResolvedValue(['u1']);
    mocks.startPowerSchoolSync.mockResolvedValue(null); // lock already acquired

    await main();

    expect(mocks.runPowerSchoolSync).not.toHaveBeenCalled();
  });

  it('always closes the browser in the finally block after completing the batch', async () => {
    mocks.getUsersWithAutoSyncEnabled.mockResolvedValue(['u1']);

    await main();

    expect(mocks.closeBrowser).toHaveBeenCalledOnce();
  });
});
