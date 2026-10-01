import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUsersWithAutoSyncDueAt: vi.fn(),
  getPowerSchoolCredentials: vi.fn(),
  tryAcquireSyncLock: vi.fn(),
  releaseSyncLock: vi.fn(),
  setSyncStatus: vi.fn(),
  scrapePowerSchool: vi.fn(),
  closeBrowser: vi.fn(),
  syncClassesFromSource: vi.fn(),
  syncHomeworkFromSource: vi.fn(),
  addSyncLogEntries: vi.fn(),
  addGradeHistoryEntries: vi.fn(),
  setSetting: vi.fn(),
  getSettings: vi.fn(),
  getClasses: vi.fn(),
  updateClass: vi.fn(),
  statuses: [] as Array<{ userId: string; status: string }>,
}));

vi.mock('@/lib/db', () => ({
  getUsersWithAutoSyncDueAt: mocks.getUsersWithAutoSyncDueAt,
  getPowerSchoolCredentials: mocks.getPowerSchoolCredentials,
  tryAcquireSyncLock: mocks.tryAcquireSyncLock,
  releaseSyncLock: mocks.releaseSyncLock,
  setSyncStatus: mocks.setSyncStatus,
  syncClassesFromSource: mocks.syncClassesFromSource,
  syncHomeworkFromSource: mocks.syncHomeworkFromSource,
  addSyncLogEntries: mocks.addSyncLogEntries,
  addGradeHistoryEntries: mocks.addGradeHistoryEntries,
  setSetting: mocks.setSetting,
  getSettings: mocks.getSettings,
  getClasses: mocks.getClasses,
  updateClass: mocks.updateClass,
}));

vi.mock('@/lib/powerschool', () => ({
  launchBrowser: vi.fn(async () => ({ close: mocks.closeBrowser })),
  scrapePowerSchool: mocks.scrapePowerSchool,
}));

const { GET } = await import('./route');

const DEMO_CREDS = {
  url: 'https://powerschool.example.test',
  username: 'demo-student',
  password: 'not-a-real-password',
};

const DEMO_CLASS = {
  id: 'demo-class',
  name: 'Demo Biology',
  teacher: 'Demo Teacher',
  room: '100',
  color: '#4285F4',
  period: 1,
  startTime: '08:00',
  endTime: '08:50',
  days: [1, 2, 3, 4, 5],
  semester: 'Fall 2026',
  source: 'powerschool' as const,
  sourceId: 'demo-source-class',
};

function makeRequest(hour: number): Parameters<typeof GET>[0] {
  return {
    headers: { get: () => null },
    nextUrl: { searchParams: new URLSearchParams({ hour: String(hour) }) },
  } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', '');
  vi.clearAllMocks();
  mocks.statuses.length = 0;
  mocks.getUsersWithAutoSyncDueAt.mockImplementation(async (hour: number) => hour === 12 ? ['demo-user'] : []);
  mocks.getPowerSchoolCredentials.mockResolvedValue(DEMO_CREDS);
  mocks.tryAcquireSyncLock.mockResolvedValue(true);
  mocks.setSyncStatus.mockImplementation(async (userId: string, status: { status: string }) => {
    mocks.statuses.push({ userId, status: status.status });
  });
  mocks.scrapePowerSchool.mockResolvedValue({
    classes: [DEMO_CLASS],
    assignments: [],
    log: ['Demo scrape completed'],
  });
  mocks.syncClassesFromSource.mockResolvedValue({
    added: 0,
    updated: 1,
    removed: 0,
    idMap: new Map([[DEMO_CLASS.id, 'saved-demo-class']]),
    logEntries: [],
  });
  mocks.syncHomeworkFromSource.mockResolvedValue({ added: 0, updated: 0, removed: 0, logEntries: [] });
  mocks.addSyncLogEntries.mockResolvedValue(undefined);
  mocks.addGradeHistoryEntries.mockResolvedValue(undefined);
  mocks.setSetting.mockResolvedValue(undefined);
  mocks.getSettings.mockResolvedValue({ lathropMode: 'false' });
  mocks.getClasses.mockResolvedValue([]);
  mocks.updateClass.mockResolvedValue(undefined);
  mocks.releaseSyncLock.mockResolvedValue(undefined);
  mocks.closeBrowser.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('scheduled PowerSchool sync with demo data', () => {
  it('runs the matching hour bucket through scrape, sync status, and completion without a real DB or browser', async () => {
    const response = await GET(makeRequest(12));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ hour: 12, matched: 1, fired: 1, skipped: 0, deferred: 0 });
    expect(mocks.getUsersWithAutoSyncDueAt).toHaveBeenCalledWith(12);
    expect(mocks.scrapePowerSchool).toHaveBeenCalledWith(DEMO_CREDS, expect.anything());
    expect(mocks.statuses.map(({ status }) => status)).toEqual(['running', 'success']);
    expect(mocks.statuses.every(({ userId }) => userId === 'demo-user')).toBe(true);
    expect(mocks.setSetting).toHaveBeenCalledWith('lastSyncAt', expect.any(String), 'demo-user');
    expect(mocks.releaseSyncLock).toHaveBeenCalledWith('demo-user');
    expect(mocks.closeBrowser).toHaveBeenCalledOnce();
  });

  it('does not launch a browser or sync when the scheduled hour has no due users', async () => {
    const response = await GET(makeRequest(15));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ hour: 15, matched: 0, fired: 0, skipped: 0, deferred: 0 });
    expect(mocks.scrapePowerSchool).not.toHaveBeenCalled();
    expect(mocks.closeBrowser).not.toHaveBeenCalled();
  });
});
