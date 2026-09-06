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
});
