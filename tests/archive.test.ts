// Integration test for the school-year rollover archive, run against the local
// test database through the real db layer (no mocks).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import './helpers/env';
import { testDb } from './helpers/db';
import { makeClass } from './helpers/api';

type Db = typeof import('@/lib/db');
let db: Db;
const userId = `arch-user-${Date.now().toString(36)}`;

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; // guarded by helpers/env
  db = await import('@/lib/db');
  await db.initializeDatabase();
  await db.createUser(userId, userId, 'x'); // password hash irrelevant here
});

afterAll(async () => { await db.deleteUserAndAllData(userId); });

describe('school-year rollover', () => {
  it('archives classes PowerSchool drops, keeps their grade history, and leaves manual classes alone', async () => {
    const ps = (name: string, sourceId: string, period: number) =>
      makeClass(period, name, [1, 3, 5], '08:00', '09:00', { source: 'powerschool', sourceId, grade: 'A', gradePercent: 95 });
    const lastYear = [ps('AP Chemistry', 'ps-old-1', 1), ps('Algebra II', 'ps-old-2', 2)];
    const manual = makeClass(6, 'Robotics Club', [2], '15:00', '16:00');

    await db.syncClassesFromSource('powerschool', lastYear, userId);
    await db.addClass(manual, userId);

    // Snapshots from last school year (May 2025 → "2024-25").
    const conn = await testDb();
    try {
      const rows = (await db.getClasses(userId)).filter((c) => c.source === 'powerschool');
      expect(rows).toHaveLength(2);
      for (const c of rows) {
        await conn.query(
          'INSERT INTO grade_history (id, user_id, class_id, grade_percent, letter, semester, captured_at) VALUES (?,?,?,?,?,?,?)',
          [`gh-${c.id}`, userId, c.id, 93.5, 'A', 'Current', '2025-05-20 12:00:00'],
        );
      }

      // New school year: PowerSchool returns completely different sections.
      const thisYear = [ps('AP Calculus BC', 'ps-new-1', 1), ps('English 11', 'ps-new-2', 2)];
      const result = await db.syncClassesFromSource('powerschool', thisYear, userId);
      expect(result.removed).toBe(2);

      const live = await db.getClasses(userId);
      expect(live.map((c) => c.name).sort()).toEqual(['AP Calculus BC', 'English 11', 'Robotics Club']);

      const archived = await db.getArchivedClasses(userId);
      expect(archived.map((a) => a.name).sort()).toEqual(['AP Chemistry', 'Algebra II']);
      expect(new Set(archived.map((a) => a.schoolYear))).toEqual(new Set(['2024-25']));
      expect(archived.find((a) => a.name === 'AP Chemistry')).toMatchObject({ grade: 'A', gradePercent: 95 });

      // Grade history for the dropped classes is still there, so the transcript can name them.
      const history = await db.getGradeHistory(userId);
      expect(history.filter((h) => rows.some((r) => r.id === h.classId))).toHaveLength(2);

      // Syncing again is idempotent — nothing new is archived, nothing duplicated.
      await db.syncClassesFromSource('powerschool', thisYear, userId);
      expect(await db.getArchivedClasses(userId)).toHaveLength(2);
    } finally { await conn.end(); }
  });

  it('files a class under the year of its last snapshot, not the day the removal was noticed', async () => {
    const solo = makeClass(3, 'Study Hall', [1], '10:00', '11:00', { source: 'powerschool', sourceId: 'ps-x', semester: 'Current' });
    await db.syncClassesFromSource('powerschool', [solo], userId);
    const conn = await testDb();
    try {
      await conn.query(
        'INSERT INTO grade_history (id, user_id, class_id, grade_percent, letter, semester, captured_at) VALUES (?,?,?,?,?,?,?)',
        [`gh-${solo.id}`, userId, (await db.getClasses(userId)).find((c) => c.name === 'Study Hall')!.id, 88, 'B+', 'Current', '2026-06-01 12:00:00'],
      );
    } finally { await conn.end(); }
    await db.syncClassesFromSource('powerschool', [makeClass(1, 'Other', [1], '08:00', '09:00', { source: 'powerschool', sourceId: 'ps-y' })], userId);
    const a = (await db.getArchivedClasses(userId)).find((x) => x.name === 'Study Hall');
    expect(a?.schoolYear).toBe('2025-26');
  });
});
