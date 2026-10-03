import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock every DB/scrape dependency so this exercises pure orchestration —
// this is a regression test for two reported bugs: (1) a "nothing changed"
// sync silently wrote zero sync_log rows, making a scheduled sync
// indistinguishable from one that never ran; (2) `lastSyncAt` was only ever
// written client-side, so scheduled (cron) syncs never updated the "Last
// synced" caption on the Grades page. Both manual and cron routes call the
// same runPowerSchoolSync, so fixing it here covers both.
const mocks = vi.hoisted(() => ({
  scrapePowerSchool: vi.fn(),
  syncClassesFromSource: vi.fn(),
  syncHomeworkFromSource: vi.fn(),
  addSyncLogEntries: vi.fn(),
  addGradeHistoryEntries: vi.fn(),
  setSyncStatus: vi.fn(),
  setSetting: vi.fn(),
  getSettings: vi.fn(),
  getClasses: vi.fn(),
  updateClass: vi.fn(),
  tryAcquireSyncLock: vi.fn(),
  releaseSyncLock: vi.fn(),
}));

vi.mock('@/lib/powerschool', () => ({ scrapePowerSchool: mocks.scrapePowerSchool }));
vi.mock('@/lib/db', () => ({
  syncClassesFromSource: mocks.syncClassesFromSource,
  syncHomeworkFromSource: mocks.syncHomeworkFromSource,
  addSyncLogEntries: mocks.addSyncLogEntries,
  addGradeHistoryEntries: mocks.addGradeHistoryEntries,
  setSyncStatus: mocks.setSyncStatus,
  setSetting: mocks.setSetting,
  getSettings: mocks.getSettings,
  getClasses: mocks.getClasses,
  updateClass: mocks.updateClass,
  tryAcquireSyncLock: mocks.tryAcquireSyncLock,
  releaseSyncLock: mocks.releaseSyncLock,
}));

const { runPowerSchoolSync } = await import('@/lib/powerschoolSync');

const CREDS = { url: 'https://ps.example.com', username: 'stu', password: 'pw' };
const SCRAPED_CLASS = {
  id: 'scraped-1', name: 'AP Chemistry', teacher: 'Ms. Rivera', room: '214', color: '#4285F4',
  period: 1, startTime: '08:00', endTime: '08:50', days: [1, 2, 3, 4, 5], semester: 'Fall 2026',
  source: 'powerschool' as const, sourceId: 'ps-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scrapePowerSchool.mockResolvedValue({ classes: [SCRAPED_CLASS], assignments: [], log: ['scraped ok'] });
  mocks.syncClassesFromSource.mockResolvedValue({ added: 0, updated: 1, removed: 0, idMap: new Map([[SCRAPED_CLASS.id, 'local-1']]), logEntries: [] });
  mocks.syncHomeworkFromSource.mockResolvedValue({ added: 0, updated: 0, removed: 0, logEntries: [] });
  mocks.addGradeHistoryEntries.mockResolvedValue(undefined);
  mocks.setSyncStatus.mockResolvedValue(undefined);
  mocks.setSetting.mockResolvedValue(undefined);
  mocks.addSyncLogEntries.mockResolvedValue(undefined);
  mocks.releaseSyncLock.mockResolvedValue(undefined);
  // Lathrop Mode off by default in these tests — its own behavior is
  // covered by the dedicated describe block below.
  mocks.getSettings.mockResolvedValue({ lathropMode: 'false' });
  mocks.getClasses.mockResolvedValue([]);
  mocks.updateClass.mockResolvedValue(undefined);
});

describe('runPowerSchoolSync', () => {
  it('writes a synthetic "no changes" sync_log entry when nothing changed', async () => {
    await runPowerSchoolSync('user1', CREDS, 'sync1');

    expect(mocks.addSyncLogEntries).toHaveBeenCalledTimes(1);
    const [userId, entries] = mocks.addSyncLogEntries.mock.calls[0];
    expect(userId).toBe('user1');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ syncId: 'sync1', entityType: 'sync', changeType: 'none' });
  });

  it('does not add a synthetic entry when there are real diffs', async () => {
    mocks.syncClassesFromSource.mockResolvedValue({
      added: 1, updated: 0, removed: 0, idMap: new Map([[SCRAPED_CLASS.id, 'local-1']]),
      logEntries: [{ syncId: 'sync1', entityType: 'class', entityId: 'local-1', label: 'AP Chemistry', changeType: 'added', detail: 'New class' }],
    });

    await runPowerSchoolSync('user1', CREDS, 'sync1');

    const [, entries] = mocks.addSyncLogEntries.mock.calls[0];
    expect(entries).toHaveLength(1);
    expect(entries[0].changeType).toBe('added');
  });

  it('writes lastSyncAt as an ISO timestamp on a successful sync', async () => {
    await runPowerSchoolSync('user1', CREDS, 'sync1');

    expect(mocks.setSetting).toHaveBeenCalledWith('lastSyncAt', expect.any(String), 'user1');
    const [, value] = mocks.setSetting.mock.calls[0];
    expect(new Date(value).toISOString()).toBe(value); // round-trips cleanly == real ISO string
  });

  it('does not write lastSyncAt when the scrape finds nothing (error path)', async () => {
    mocks.scrapePowerSchool.mockResolvedValue({ classes: [], assignments: [], log: [] });

    await runPowerSchoolSync('user1', CREDS, 'sync1');

    expect(mocks.setSetting).not.toHaveBeenCalled();
    expect(mocks.setSyncStatus).toHaveBeenCalledWith('user1', expect.objectContaining({ status: 'error' }));
  });

  it('always releases the sync lock, even on failure', async () => {
    mocks.scrapePowerSchool.mockRejectedValue(new Error('PowerSchool login failed'));

    await runPowerSchoolSync('user1', CREDS, 'sync1');

    expect(mocks.releaseSyncLock).toHaveBeenCalledWith('user1');
    expect(mocks.setSyncStatus).toHaveBeenCalledWith('user1', expect.objectContaining({ status: 'error' }));
  });

  it('records a failed sync in the Sync Log, not just the status row', async () => {
    mocks.scrapePowerSchool.mockRejectedValue(new Error('PowerSchool login failed: Invalid Username or Password!'));

    await runPowerSchoolSync('user1', CREDS, 'sync1');

    expect(mocks.addSyncLogEntries).toHaveBeenCalledWith('user1', [
      expect.objectContaining({ syncId: 'sync1', entityType: 'sync', changeType: 'error', detail: expect.stringContaining('login failed') }),
    ]);
  });

  it('records a Sync Log entry when the scrape finds nothing at all', async () => {
    mocks.scrapePowerSchool.mockResolvedValue({ classes: [], assignments: [], log: [] });

    await runPowerSchoolSync('user1', CREDS, 'sync1');

    expect(mocks.addSyncLogEntries).toHaveBeenCalledWith('user1', [
      expect.objectContaining({ changeType: 'error' }),
    ]);
  });
});

// Regression coverage for a real bug: the Lathrop bell schedule used to be
// applied only from a client-side handler that ran after a sync it was
// itself watching — so a sync with no browser tab open to see it through
// (the cron job, or the onboarding wizard's now-backgrounded sync) never
// got the real A/B schedule applied, and classes were left with whatever
// flat day/time PowerSchool itself reports (often every weekday, same
// time — reading as a straight "1-6 schedule"). It's now applied here,
// server-side, unconditionally on every sync when Lathrop Mode is on.
describe('runPowerSchoolSync — Lathrop Mode auto-apply', () => {
  const PERIOD_3_CLASS = { id: 'local-1', name: 'AP Chemistry', period: 3, days: [1, 2, 3, 4, 5] };
  const UNMAPPED_CLASS = { id: 'local-2', name: 'Independent Study', period: 9, days: [1, 2, 3, 4, 5] };

  it('applies the real Lathrop schedule to every mapped class when the setting is on', async () => {
    mocks.getSettings.mockResolvedValue({ lathropMode: 'true' });
    mocks.getClasses.mockResolvedValue([PERIOD_3_CLASS, UNMAPPED_CLASS]);

    await runPowerSchoolSync('user1', CREDS, 'sync1');

    // Period 3 maps to a real Lathrop slot — updated with real days/times,
    // not left at whatever flat pattern it arrived with.
    expect(mocks.updateClass).toHaveBeenCalledTimes(1);
    const [updated, userId] = mocks.updateClass.mock.calls[0];
    expect(userId).toBe('user1');
    expect(updated.id).toBe('local-1');
    expect(updated.days.length).toBeGreaterThan(0);
    expect(updated.days).not.toEqual([1, 2, 3, 4, 5]); // not the flat "every day" pattern
    // Period 9 (no Lathrop slot) is left alone entirely.
    expect(mocks.updateClass).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'local-2' }), expect.anything());
  });

  it('does nothing when Lathrop Mode is off', async () => {
    mocks.getSettings.mockResolvedValue({ lathropMode: 'false' });
    mocks.getClasses.mockResolvedValue([PERIOD_3_CLASS]);

    await runPowerSchoolSync('user1', CREDS, 'sync1');

    expect(mocks.updateClass).not.toHaveBeenCalled();
  });

  it('never fails the sync itself if the Lathrop step throws', async () => {
    mocks.getSettings.mockRejectedValue(new Error('db unreachable'));

    await runPowerSchoolSync('user1', CREDS, 'sync1');

    expect(mocks.setSyncStatus).toHaveBeenCalledWith('user1', expect.objectContaining({ status: 'success' }));
  });
});
