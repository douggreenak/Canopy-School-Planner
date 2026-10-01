// ============================================================
// MySQL Database Layer (mysql2)
// ============================================================
import mysql, { type Pool, type RowDataPacket, type ExecuteValues, type QueryValues } from 'mysql2/promise';
import crypto from 'crypto';
import type {
  SchoolClass,
  Homework,
  Exam,
  Task,
  ScheduleDisruption,
  PeriodOverride,
  AppSettings,
  GradeHistoryEntry,
  SyncLogEntry,
} from '@/types';
import { v4 as uuid } from 'uuid';
import { parseStages } from '@/lib/stages';
import { detectApFromName, resolveIsApOnSync } from '@/lib/apDetection';

// A single connection pool reused across requests/invocations.
let _pool: Pool | null = null;
function getDb(): Pool {
  if (!_pool) {
    _pool = mysql.createPool(process.env.DATABASE_URL!);
  }
  return _pool;
}

// Convenience helper: run a query and return typed rows.
async function query<T extends RowDataPacket>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const pool = getDb();
  const [rows] = await pool.query<T[]>(sql, params as QueryValues[]);
  return rows;
}

// Convenience helper: run a write (INSERT / UPDATE / DELETE).
async function execute(sql: string, params: unknown[] = []): Promise<void> {
  const pool = getDb();
  await pool.execute(sql, params as ExecuteValues[]);
}

// Batched writes: run each query sequentially (mysql2 pools handle concurrency
// efficiently; no complex transaction batching API is needed here).
async function runBatchedWrites(
  writes: Array<{ sql: string; params: unknown[] }>,
): Promise<void> {
  for (const w of writes) {
    await execute(w.sql, w.params);
  }
}

// Build a MySQL IN-clause placeholder string and matching params array.
// e.g. inClause(['a','b','c']) → { clause: 'IN (?,?,?)', params: ['a','b','c'] }
function inClause(ids: string[]): { clause: string; params: string[] } {
  return {
    clause: `IN (${ids.map(() => '?').join(',')})`,
    params: ids,
  };
}

// Check if a column already exists in a table via INFORMATION_SCHEMA.
async function columnExists(table: string, column: string): Promise<boolean> {
  const db = process.env.DATABASE_URL
    ? new URL(process.env.DATABASE_URL).pathname.replace(/^\//, '')
    : '';
  const rows = await query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  void db; // suppress unused-var lint — DATABASE() is used directly in SQL
  return rows.length > 0;
}

// Conditionally add a column; MySQL < 8.0 lacks IF NOT EXISTS on ALTER TABLE.
async function addColumnIfMissing(
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  if (!(await columnExists(table, column))) {
    await execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

// ---- Schema initialization ----

export async function initializeDatabase() {
  // Auth tables
  await execute(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(191) PRIMARY KEY,
      username VARCHAR(191) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT NOW()
    )
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(191) PRIMARY KEY,
      user_id VARCHAR(191) NOT NULL,
      expires_at DATETIME NOT NULL
    )
  `);

  // Data tables
  await execute(`
    CREATE TABLE IF NOT EXISTS classes (
      id VARCHAR(191) PRIMARY KEY,
      user_id VARCHAR(191) NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      teacher TEXT NOT NULL DEFAULT '',
      room TEXT NOT NULL DEFAULT '',
      color VARCHAR(50) NOT NULL DEFAULT '',
      period INTEGER NOT NULL DEFAULT 0,
      start_time VARCHAR(20) NOT NULL DEFAULT '',
      end_time VARCHAR(20) NOT NULL DEFAULT '',
      days JSON NOT NULL,
      day_times JSON,
      semester VARCHAR(50) NOT NULL DEFAULT '',
      source VARCHAR(50),
      source_id TEXT,
      grade VARCHAR(10),
      grade_percent DECIMAL(10,4),
      category_weights JSON,
      weight_source VARCHAR(50),
      is_ap TINYINT(1) NOT NULL DEFAULT 0
    )
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS homework (
      id VARCHAR(191) PRIMARY KEY,
      user_id VARCHAR(191) NOT NULL DEFAULT '',
      class_id VARCHAR(191) NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      due_date VARCHAR(20) NOT NULL DEFAULT '',
      completed TINYINT(1) NOT NULL DEFAULT 0,
      priority VARCHAR(20) NOT NULL DEFAULT 'medium',
      source VARCHAR(50) NOT NULL DEFAULT 'manual',
      source_id TEXT,
      score TEXT,
      category TEXT,
      flags TEXT,
      score_percent DECIMAL(10,4),
      stage_id VARCHAR(191),
      stages JSON,
      due_timing VARCHAR(50),
      teacher_note TEXT
    )
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS exams (
      id VARCHAR(191) PRIMARY KEY,
      user_id VARCHAR(191) NOT NULL DEFAULT '',
      class_id VARCHAR(191) NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      date VARCHAR(20) NOT NULL DEFAULT '',
      start_time VARCHAR(20) NOT NULL DEFAULT '',
      end_time VARCHAR(20) NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      weight_percent DECIMAL(10,4)
    )
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id VARCHAR(191) PRIMARY KEY,
      user_id VARCHAR(191) NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      due_date VARCHAR(20) NOT NULL DEFAULT '',
      completed TINYINT(1) NOT NULL DEFAULT 0,
      priority VARCHAR(20) NOT NULL DEFAULT 'medium',
      category VARCHAR(100) NOT NULL DEFAULT 'General',
      class_id VARCHAR(191),
      stage_id VARCHAR(191),
      stages JSON,
      due_timing VARCHAR(50)
    )
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS disruptions (
      id VARCHAR(191) PRIMARY KEY,
      user_id VARCHAR(191) NOT NULL DEFAULT '',
      date VARCHAR(20) NOT NULL DEFAULT '',
      end_date VARCHAR(20) NOT NULL DEFAULT '',
      type VARCHAR(50) NOT NULL DEFAULT '',
      label TEXT NOT NULL DEFAULT '',
      period_overrides JSON NOT NULL,
      source_day_of_week INTEGER
    )
  `);

  // Settings — composite PK (user_id, key)
  await execute(`
    CREATE TABLE IF NOT EXISTS settings (
      user_id VARCHAR(191) NOT NULL DEFAULT '',
      \`key\` VARCHAR(191) NOT NULL,
      value TEXT,
      PRIMARY KEY (user_id, \`key\`)
    )
  `);

  // Migration: add columns to existing tables (safe no-ops if already present)
  await addColumnIfMissing('classes', 'user_id', "VARCHAR(191) NOT NULL DEFAULT ''");
  await addColumnIfMissing('homework', 'user_id', "VARCHAR(191) NOT NULL DEFAULT ''");
  await addColumnIfMissing('exams', 'user_id', "VARCHAR(191) NOT NULL DEFAULT ''");
  await addColumnIfMissing('tasks', 'user_id', "VARCHAR(191) NOT NULL DEFAULT ''");
  await addColumnIfMissing('disruptions', 'user_id', "VARCHAR(191) NOT NULL DEFAULT ''");
  await addColumnIfMissing('disruptions', 'end_date', "VARCHAR(20) NOT NULL DEFAULT ''");
  await addColumnIfMissing('disruptions', 'source_day_of_week', 'INTEGER');

  // Indexes
  await execute(`CREATE INDEX IF NOT EXISTS idx_classes_user ON classes (user_id)`);
  await execute(`CREATE INDEX IF NOT EXISTS idx_homework_user ON homework (user_id)`);
  await execute(`CREATE INDEX IF NOT EXISTS idx_homework_user_source_class ON homework (user_id, source(20), class_id)`);
  await execute(`CREATE INDEX IF NOT EXISTS idx_exams_user ON exams (user_id)`);
  await execute(`CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks (user_id)`);
  await execute(`CREATE INDEX IF NOT EXISTS idx_disruptions_user ON disruptions (user_id)`);
  await execute(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)`);

  // Migration: category weights
  await addColumnIfMissing('classes', 'category_weights', 'JSON');
  await addColumnIfMissing('classes', 'weight_source', 'VARCHAR(50)');
  await addColumnIfMissing('exams', 'weight_percent', 'DECIMAL(10,4)');

  // grade_history
  await execute(`
    CREATE TABLE IF NOT EXISTS grade_history (
      id VARCHAR(191) PRIMARY KEY,
      user_id VARCHAR(191) NOT NULL DEFAULT '',
      class_id VARCHAR(191) NOT NULL DEFAULT '',
      grade_percent DECIMAL(10,4),
      letter VARCHAR(10),
      semester VARCHAR(50) NOT NULL DEFAULT '',
      captured_at DATETIME DEFAULT NOW()
    )
  `);
  await execute(`CREATE INDEX IF NOT EXISTS idx_grade_history_class ON grade_history (user_id, class_id, captured_at)`);

  // sync_log
  await execute(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id VARCHAR(191) PRIMARY KEY,
      user_id VARCHAR(191) NOT NULL DEFAULT '',
      sync_id VARCHAR(191) NOT NULL DEFAULT '',
      occurred_at DATETIME DEFAULT NOW(),
      entity_type VARCHAR(50) NOT NULL DEFAULT '',
      entity_id VARCHAR(191) NOT NULL DEFAULT '',
      class_id VARCHAR(191),
      label TEXT NOT NULL DEFAULT '',
      change_type VARCHAR(50) NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT ''
    )
  `);
  await execute(`CREATE INDEX IF NOT EXISTS idx_sync_log_user_time ON sync_log (user_id, occurred_at)`);
  await execute(`CREATE INDEX IF NOT EXISTS idx_sync_log_class ON sync_log (user_id, class_id, occurred_at)`);

  // powerschool_sync_status
  await execute(`
    CREATE TABLE IF NOT EXISTS powerschool_sync_status (
      user_id VARCHAR(191) PRIMARY KEY,
      sync_id VARCHAR(191) NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'idle',
      started_at DATETIME,
      finished_at DATETIME,
      log JSON,
      result JSON,
      error TEXT
    )
  `);

  // powerschool_sync_lock
  await execute(`
    CREATE TABLE IF NOT EXISTS powerschool_sync_lock (
      user_id VARCHAR(191) PRIMARY KEY,
      sync_id VARCHAR(191) NOT NULL,
      acquired_at DATETIME DEFAULT NOW()
    )
  `);

  // Admin support
  await addColumnIfMissing('users', 'role', "VARCHAR(20) NOT NULL DEFAULT 'user'");
  await addColumnIfMissing('sessions', 'created_at', 'DATETIME DEFAULT NOW()');

  // Stage pipeline columns
  await addColumnIfMissing('homework', 'stage_id', 'VARCHAR(191)');
  await addColumnIfMissing('homework', 'stages', 'JSON');
  await addColumnIfMissing('tasks', 'stage_id', 'VARCHAR(191)');
  await addColumnIfMissing('tasks', 'stages', 'JSON');

  // Due timing
  await addColumnIfMissing('homework', 'due_timing', 'VARCHAR(50)');
  await addColumnIfMissing('tasks', 'due_timing', 'VARCHAR(50)');

  // Teacher note
  await addColumnIfMissing('homework', 'teacher_note', 'TEXT');

  // AP flag
  await addColumnIfMissing('classes', 'is_ap', 'TINYINT(1) NOT NULL DEFAULT 0');

  // Settings table: migrate PK from single-column (key) to composite (user_id, key).
  // In MySQL we check if the PK already covers both columns.
  const pkRows = await query<RowDataPacket>(
    `SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings'
       AND CONSTRAINT_NAME = 'PRIMARY' AND COLUMN_NAME = 'user_id'`,
  );
  if (pkRows.length === 0) {
    // Old schema: single-column PK on `key`. Add user_id and rebuild the PK.
    await addColumnIfMissing('settings', 'user_id', "VARCHAR(191) NOT NULL DEFAULT ''");
    await execute(`ALTER TABLE settings DROP PRIMARY KEY`);
    await execute(`ALTER TABLE settings ADD PRIMARY KEY (user_id, \`key\`)`);
  }
}

// ---- Row mappers ----

function parseJson<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'object') return value as T; // mysql2 auto-parses JSON columns
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return undefined; }
  }
  return undefined;
}

function dbToClass(row: Record<string, unknown>): SchoolClass {
  return {
    id: row.id as string,
    name: row.name as string,
    teacher: (row.teacher as string) || '',
    room: (row.room as string) || '',
    color: (row.color as string) || '',
    period: Number(row.period) || 0,
    startTime: (row.start_time as string) || '',
    endTime: (row.end_time as string) || '',
    days: parseJson<number[]>(row.days) ?? [],
    dayTimes: parseJson<SchoolClass['dayTimes']>(row.day_times) ?? undefined,
    semester: (row.semester as string) || '',
    source: (row.source as SchoolClass['source']) ?? undefined,
    sourceId: (row.source_id as string) || undefined,
    grade: (row.grade as string) || undefined,
    gradePercent: row.grade_percent != null ? Number(row.grade_percent) : undefined,
    categoryWeights: parseJson<Record<string, number>>(row.category_weights) ?? undefined,
    weightSource: (row.weight_source as SchoolClass['weightSource']) ?? undefined,
    isAp: Boolean(row.is_ap),
  };
}

function dbToHomework(row: Record<string, unknown>): Homework {
  return {
    id: row.id as string,
    classId: (row.class_id as string) || '',
    title: (row.title as string) || '',
    description: (row.description as string) || '',
    dueDate: (row.due_date as string) || '',
    completed: Boolean(row.completed),
    stages: (() => { const s = parseStages(parseJson(row.stages)); return s.length > 0 ? s : undefined; })(),
    stageId: (row.stage_id as string) || undefined,
    dueTiming: (row.due_timing as Homework['dueTiming']) || undefined,
    priority: (row.priority as Homework['priority']) || 'medium',
    source: (row.source as Homework['source']) || 'manual',
    sourceId: (row.source_id as string) || undefined,
    score: (row.score as string) || undefined,
    category: (row.category as string) || undefined,
    flags: (row.flags as string) || undefined,
    teacherNote: (row.teacher_note as string) || undefined,
    scorePercent: (() => {
      const n = Number(row.score_percent);
      return row.score_percent != null && Number.isFinite(n) ? n : undefined;
    })(),
  };
}

function dbToExam(row: Record<string, unknown>): Exam {
  return {
    id: row.id as string,
    classId: (row.class_id as string) || '',
    title: (row.title as string) || '',
    date: (row.date as string) || '',
    startTime: (row.start_time as string) || '',
    endTime: (row.end_time as string) || '',
    location: (row.location as string) || '',
    notes: (row.notes as string) || '',
    weightPercent: row.weight_percent != null ? Number(row.weight_percent) : undefined,
  };
}

function dbToGradeHistory(row: Record<string, unknown>): GradeHistoryEntry {
  return {
    id: row.id as string,
    classId: row.class_id as string,
    gradePercent: row.grade_percent != null ? Number(row.grade_percent) : undefined,
    letter: (row.letter as string) || undefined,
    semester: (row.semester as string) || '',
    capturedAt: row.captured_at instanceof Date
      ? (row.captured_at as Date).toISOString()
      : row.captured_at as string,
  };
}

function dbToSyncLogEntry(row: Record<string, unknown>): SyncLogEntry {
  return {
    id: row.id as string,
    syncId: row.sync_id as string,
    occurredAt: row.occurred_at instanceof Date
      ? (row.occurred_at as Date).toISOString()
      : row.occurred_at as string,
    entityType: row.entity_type as SyncLogEntry['entityType'],
    entityId: row.entity_id as string,
    classId: (row.class_id as string) || undefined,
    label: row.label as string,
    changeType: row.change_type as SyncLogEntry['changeType'],
    detail: row.detail as string,
  };
}

function dbToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: (row.title as string) || '',
    description: (row.description as string) || '',
    dueDate: (row.due_date as string) || '',
    completed: Boolean(row.completed),
    stages: (() => { const s = parseStages(parseJson(row.stages)); return s.length > 0 ? s : undefined; })(),
    stageId: (row.stage_id as string) || undefined,
    dueTiming: (row.due_timing as Task['dueTiming']) || undefined,
    priority: (row.priority as Task['priority']) || 'medium',
    category: (row.category as string) || 'General',
    classId: (row.class_id as string) || undefined,
  };
}

function dbToDisruption(row: Record<string, unknown>): ScheduleDisruption {
  const date = (row.date as string) || '';
  const endDate = (row.end_date as string) || '';
  return {
    id: row.id as string,
    date,
    endDate: endDate && endDate !== date ? endDate : undefined,
    type: (row.type as ScheduleDisruption['type']),
    label: (row.label as string) || '',
    periodOverrides: parseJson<PeriodOverride[]>(row.period_overrides) ?? [],
    sourceDayOfWeek: row.source_day_of_week === null || row.source_day_of_week === undefined
      ? undefined
      : Number(row.source_day_of_week),
  };
}

// ---- Users ----

export interface DbUser {
  id: string;
  username: string;
  passwordHash: string;
  role: string;
}

export async function createUser(id: string, username: string, passwordHash: string): Promise<void> {
  await execute(
    `INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, 'user')`,
    [id, username.toLowerCase(), passwordHash],
  );
}

/** Upsert the admin account. Takes a pre-hashed password to avoid circular imports with auth.ts. */
export async function createOrUpdateAdminUser(username: string, passwordHash: string): Promise<void> {
  const id = uuid();
  await execute(
    `INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, 'admin')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = 'admin'`,
    [id, username.toLowerCase(), passwordHash],
  );
}

export async function getUserByUsername(username: string): Promise<DbUser | null> {
  const rows = await query<RowDataPacket>(
    `SELECT id, username, password_hash, role FROM users WHERE username = ?`,
    [username.toLowerCase()],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return { id: row.id, username: row.username, passwordHash: row.password_hash, role: row.role || 'user' };
}

export async function getUserByIdWithHash(id: string): Promise<DbUser | null> {
  const rows = await query<RowDataPacket>(
    `SELECT id, username, password_hash, role FROM users WHERE id = ?`,
    [id],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return { id: row.id, username: row.username, passwordHash: row.password_hash, role: row.role || 'user' };
}

export async function updateUserPassword(userId: string, newPasswordHash: string): Promise<void> {
  await execute(`UPDATE users SET password_hash = ? WHERE id = ?`, [newPasswordHash, userId]);
}

export async function getUserById(id: string): Promise<{ id: string; username: string; role: string } | null> {
  const rows = await query<RowDataPacket>(
    `SELECT id, username, role FROM users WHERE id = ?`,
    [id],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return { id: row.id, username: row.username, role: row.role || 'user' };
}

export interface SystemStats {
  totalUsers: number;
  activeUsersLast7Days: number;
  activeUsersLast30Days: number;
  totalClasses: number;
  totalAssignments: number;
  totalExams: number;
  totalTasks: number;
  registrationsByMonth: { month: string; count: number }[];
  userList: { username: string; registeredAt: string; lastActiveAt: string | null }[];
}

export async function getSystemStats(): Promise<SystemStats> {
  const now = new Date();
  const cutoff7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const cutoff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

  const [users, active7, active30, classes, hw, exams, tasks, regByMonth, userList] = await Promise.all([
    query<RowDataPacket>(`SELECT COUNT(*) AS count FROM users WHERE role != 'admin'`),
    query<RowDataPacket>(
      `SELECT COUNT(DISTINCT s.user_id) AS count FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.role != 'admin' AND s.created_at > ?`,
      [cutoff7],
    ),
    query<RowDataPacket>(
      `SELECT COUNT(DISTINCT s.user_id) AS count FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.role != 'admin' AND s.created_at > ?`,
      [cutoff30],
    ),
    query<RowDataPacket>(`SELECT COUNT(*) AS count FROM classes c JOIN users u ON u.id = c.user_id WHERE u.role != 'admin'`),
    query<RowDataPacket>(`SELECT COUNT(*) AS count FROM homework h JOIN users u ON u.id = h.user_id WHERE u.role != 'admin'`),
    query<RowDataPacket>(`SELECT COUNT(*) AS count FROM exams e JOIN users u ON u.id = e.user_id WHERE u.role != 'admin'`),
    query<RowDataPacket>(`SELECT COUNT(*) AS count FROM tasks t JOIN users u ON u.id = t.user_id WHERE u.role != 'admin'`),
    query<RowDataPacket>(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS count
       FROM users WHERE role != 'admin'
       GROUP BY month ORDER BY month DESC LIMIT 12`,
    ),
    query<RowDataPacket>(
      `SELECT u.username, u.created_at, MAX(s.created_at) AS last_active
       FROM users u LEFT JOIN sessions s ON s.user_id = u.id
       WHERE u.role != 'admin'
       GROUP BY u.username, u.created_at ORDER BY u.created_at DESC`,
    ),
  ]);

  return {
    totalUsers: Number(users[0].count),
    activeUsersLast7Days: Number(active7[0].count),
    activeUsersLast30Days: Number(active30[0].count),
    totalClasses: Number(classes[0].count),
    totalAssignments: Number(hw[0].count),
    totalExams: Number(exams[0].count),
    totalTasks: Number(tasks[0].count),
    registrationsByMonth: regByMonth.map((r) => ({ month: r.month as string, count: Number(r.count) })),
    userList: userList.map((r) => ({
      username: r.username as string,
      registeredAt: r.created_at instanceof Date ? (r.created_at as Date).toISOString() : (r.created_at as string),
      lastActiveAt: r.last_active
        ? (r.last_active instanceof Date ? (r.last_active as Date).toISOString() : String(r.last_active))
        : null,
    })),
  };
}

/** Permanently delete a user and every row they own across all tables. */
export async function deleteUserAndAllData(userId: string): Promise<void> {
  await execute(`DELETE FROM settings    WHERE user_id = ?`, [userId]);
  await execute(`DELETE FROM disruptions WHERE user_id = ?`, [userId]);
  await execute(`DELETE FROM homework    WHERE user_id = ?`, [userId]);
  await execute(`DELETE FROM exams       WHERE user_id = ?`, [userId]);
  await execute(`DELETE FROM tasks       WHERE user_id = ?`, [userId]);
  await execute(`DELETE FROM classes     WHERE user_id = ?`, [userId]);
  await execute(`DELETE FROM sessions    WHERE user_id = ?`, [userId]);
  await execute(`DELETE FROM users       WHERE id      = ?`, [userId]);
}

// ---- Sessions ----

export async function createDbSession(id: string, userId: string, expiresAt: Date): Promise<void> {
  await execute(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
    [id, userId, expiresAt.toISOString().slice(0, 19).replace('T', ' ')],
  );
}

export async function getDbSession(id: string): Promise<{ userId: string; expiresAt: Date } | null> {
  const rows = await query<RowDataPacket>(
    `SELECT user_id, expires_at FROM sessions WHERE id = ?`,
    [id],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return { userId: row.user_id as string, expiresAt: new Date(row.expires_at as string) };
}

export async function deleteDbSession(id: string): Promise<void> {
  await execute(`DELETE FROM sessions WHERE id = ?`, [id]);
}

// ---- Classes ----

export async function getClasses(userId: string): Promise<SchoolClass[]> {
  const rows = await query<RowDataPacket>(
    `SELECT * FROM classes WHERE user_id = ? ORDER BY period, name`,
    [userId],
  );
  return rows.map((r) => dbToClass(r as Record<string, unknown>));
}

export async function getClassById(id: string, userId: string): Promise<SchoolClass | null> {
  const rows = await query<RowDataPacket>(
    `SELECT * FROM classes WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
  return rows.length > 0 ? dbToClass(rows[0] as Record<string, unknown>) : null;
}

export async function addClass(c: SchoolClass, userId: string): Promise<void> {
  await execute(
    `INSERT INTO classes (id, user_id, name, teacher, room, color, period, start_time, end_time, days, day_times, semester, source, source_id, grade, grade_percent, category_weights, weight_source, is_ap)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      c.id, userId, c.name, c.teacher, c.room, c.color, c.period,
      c.startTime, c.endTime, JSON.stringify(c.days),
      c.dayTimes ? JSON.stringify(c.dayTimes) : null,
      c.semester, c.source ?? null, c.sourceId ?? null,
      c.grade ?? null, c.gradePercent ?? null,
      c.categoryWeights ? JSON.stringify(c.categoryWeights) : null,
      c.weightSource ?? null,
      c.isAp ?? detectApFromName(c.name) ? 1 : 0,
    ],
  );
}

export async function updateClass(c: SchoolClass, userId: string): Promise<void> {
  if (c.dayTimes === undefined) {
    await execute(
      `UPDATE classes SET
         name = ?, teacher = ?, room = ?, color = ?, period = ?,
         start_time = ?, end_time = ?, days = ?,
         semester = ?, source = ?, source_id = ?, grade = ?,
         grade_percent = ?, category_weights = ?, weight_source = ?, is_ap = ?
       WHERE id = ? AND user_id = ?`,
      [
        c.name, c.teacher, c.room, c.color, c.period,
        c.startTime, c.endTime, JSON.stringify(c.days),
        c.semester, c.source ?? null, c.sourceId ?? null, c.grade ?? null,
        c.gradePercent ?? null,
        c.categoryWeights ? JSON.stringify(c.categoryWeights) : null,
        c.weightSource ?? null, c.isAp ?? false ? 1 : 0,
        c.id, userId,
      ],
    );
  } else {
    await execute(
      `UPDATE classes SET
         name = ?, teacher = ?, room = ?, color = ?, period = ?,
         start_time = ?, end_time = ?, days = ?, day_times = ?,
         semester = ?, source = ?, source_id = ?, grade = ?,
         grade_percent = ?, category_weights = ?, weight_source = ?, is_ap = ?
       WHERE id = ? AND user_id = ?`,
      [
        c.name, c.teacher, c.room, c.color, c.period,
        c.startTime, c.endTime, JSON.stringify(c.days),
        c.dayTimes ? JSON.stringify(c.dayTimes) : null,
        c.semester, c.source ?? null, c.sourceId ?? null, c.grade ?? null,
        c.gradePercent ?? null,
        c.categoryWeights ? JSON.stringify(c.categoryWeights) : null,
        c.weightSource ?? null, c.isAp ?? false ? 1 : 0,
        c.id, userId,
      ],
    );
  }
}

export async function deleteClass(id: string, userId: string): Promise<void> {
  await execute(`DELETE FROM classes WHERE id = ? AND user_id = ?`, [id, userId]);
}

// ---- Homework ----

export async function getHomework(userId: string): Promise<Homework[]> {
  const rows = await query<RowDataPacket>(
    `SELECT * FROM homework WHERE user_id = ? ORDER BY due_date, title`,
    [userId],
  );
  return rows.map((r) => dbToHomework(r as Record<string, unknown>));
}

export async function addHomework(h: Homework, userId: string): Promise<void> {
  await execute(
    `INSERT INTO homework (id, user_id, class_id, title, description, due_date, completed, stage_id, stages, due_timing, priority, source, source_id, score, category, flags, teacher_note, score_percent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      h.id, userId, h.classId, h.title, h.description, h.dueDate,
      h.completed ? 1 : 0, h.stageId ?? null,
      h.stages?.length ? JSON.stringify(h.stages) : null,
      h.dueTiming ?? null,
      h.priority, h.source, h.sourceId ?? null,
      h.score ?? null, h.category ?? null, h.flags ?? null,
      h.teacherNote ?? null, h.scorePercent ?? null,
    ],
  );
}

export async function updateHomework(h: Homework, userId: string): Promise<void> {
  await execute(
    `UPDATE homework SET
       class_id = ?, title = ?, description = ?, due_date = ?,
       completed = ?, stage_id = ?,
       stages = ?, due_timing = ?, priority = ?,
       source = ?, source_id = ?, score = ?,
       category = ?, flags = ?, teacher_note = ?,
       score_percent = ?
     WHERE id = ? AND user_id = ?`,
    [
      h.classId, h.title, h.description, h.dueDate,
      h.completed ? 1 : 0, h.stageId ?? null,
      h.stages?.length ? JSON.stringify(h.stages) : null,
      h.dueTiming ?? null, h.priority,
      h.source, h.sourceId ?? null, h.score ?? null,
      h.category ?? null, h.flags ?? null, h.teacherNote ?? null,
      h.scorePercent ?? null,
      h.id, userId,
    ],
  );
}

export async function deleteHomework(id: string, userId: string): Promise<void> {
  await execute(`DELETE FROM homework WHERE id = ? AND user_id = ?`, [id, userId]);
}

export async function deleteHomeworkBatch(ids: string[], userId: string): Promise<number> {
  if (ids.length === 0) return 0;
  const { clause, params } = inClause(ids);
  await execute(`DELETE FROM homework WHERE id ${clause} AND user_id = ?`, [...params, userId]);
  return ids.length;
}

// ---- Exams ----

export async function getExams(userId: string): Promise<Exam[]> {
  const rows = await query<RowDataPacket>(
    `SELECT * FROM exams WHERE user_id = ? ORDER BY date, start_time`,
    [userId],
  );
  return rows.map((r) => dbToExam(r as Record<string, unknown>));
}

export async function addExam(e: Exam, userId: string): Promise<void> {
  await execute(
    `INSERT INTO exams (id, user_id, class_id, title, date, start_time, end_time, location, notes, weight_percent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [e.id, userId, e.classId, e.title, e.date, e.startTime, e.endTime, e.location, e.notes, e.weightPercent ?? null],
  );
}

export async function updateExam(e: Exam, userId: string): Promise<void> {
  await execute(
    `UPDATE exams SET
       class_id = ?, title = ?, date = ?,
       start_time = ?, end_time = ?,
       location = ?, notes = ?, weight_percent = ?
     WHERE id = ? AND user_id = ?`,
    [e.classId, e.title, e.date, e.startTime, e.endTime, e.location, e.notes, e.weightPercent ?? null, e.id, userId],
  );
}

export async function deleteExam(id: string, userId: string): Promise<void> {
  await execute(`DELETE FROM exams WHERE id = ? AND user_id = ?`, [id, userId]);
}

// ---- Tasks ----

export async function getTasks(userId: string): Promise<Task[]> {
  const rows = await query<RowDataPacket>(
    `SELECT * FROM tasks WHERE user_id = ? ORDER BY due_date, title`,
    [userId],
  );
  return rows.map((r) => dbToTask(r as Record<string, unknown>));
}

export async function addTask(t: Task, userId: string): Promise<void> {
  await execute(
    `INSERT INTO tasks (id, user_id, title, description, due_date, completed, stage_id, stages, due_timing, priority, category, class_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      t.id, userId, t.title, t.description, t.dueDate,
      t.completed ? 1 : 0, t.stageId ?? null,
      t.stages?.length ? JSON.stringify(t.stages) : null,
      t.dueTiming ?? null, t.priority, t.category, t.classId ?? null,
    ],
  );
}

export async function updateTask(t: Task, userId: string): Promise<void> {
  await execute(
    `UPDATE tasks SET
       title = ?, description = ?, due_date = ?,
       completed = ?, stage_id = ?,
       stages = ?, due_timing = ?,
       priority = ?, category = ?, class_id = ?
     WHERE id = ? AND user_id = ?`,
    [
      t.title, t.description, t.dueDate,
      t.completed ? 1 : 0, t.stageId ?? null,
      t.stages?.length ? JSON.stringify(t.stages) : null,
      t.dueTiming ?? null,
      t.priority, t.category, t.classId ?? null,
      t.id, userId,
    ],
  );
}

export async function deleteTask(id: string, userId: string): Promise<void> {
  await execute(`DELETE FROM tasks WHERE id = ? AND user_id = ?`, [id, userId]);
}

export async function deleteTasksBatch(ids: string[], userId: string): Promise<number> {
  if (ids.length === 0) return 0;
  const { clause, params } = inClause(ids);
  await execute(`DELETE FROM tasks WHERE id ${clause} AND user_id = ?`, [...params, userId]);
  return ids.length;
}

// ---- Disruptions ----

export async function getDisruptions(userId: string): Promise<ScheduleDisruption[]> {
  const rows = await query<RowDataPacket>(
    `SELECT * FROM disruptions WHERE user_id = ? ORDER BY date`,
    [userId],
  );
  return rows.map((r) => dbToDisruption(r as Record<string, unknown>));
}

export async function addDisruption(d: ScheduleDisruption, userId: string): Promise<void> {
  await execute(
    `INSERT INTO disruptions (id, user_id, date, end_date, type, label, period_overrides, source_day_of_week)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.id, userId, d.date, d.endDate || d.date, d.type, d.label, JSON.stringify(d.periodOverrides), d.sourceDayOfWeek ?? null],
  );
}

export async function updateDisruption(d: ScheduleDisruption, userId: string): Promise<void> {
  await execute(
    `UPDATE disruptions SET
       date = ?, end_date = ?, type = ?, label = ?,
       period_overrides = ?, source_day_of_week = ?
     WHERE id = ? AND user_id = ?`,
    [d.date, d.endDate || d.date, d.type, d.label, JSON.stringify(d.periodOverrides), d.sourceDayOfWeek ?? null, d.id, userId],
  );
}

export async function deleteDisruption(id: string, userId: string): Promise<void> {
  await execute(`DELETE FROM disruptions WHERE id = ? AND user_id = ?`, [id, userId]);
}

// ---- Settings ----

// Credential keys are managed via getPowerSchoolCredentials and must never be
// returned through the generic settings bag (the password is stored encrypted,
// and even the ciphertext should not be shipped to the client).
const CREDENTIAL_SETTING_KEYS = new Set(['powerschoolPassword']);

export async function getSettings(userId: string): Promise<Partial<AppSettings>> {
  const rows = await query<RowDataPacket>(
    `SELECT \`key\`, value FROM settings WHERE user_id = ?`,
    [userId],
  );
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    const key = row.key as string;
    if (CREDENTIAL_SETTING_KEYS.has(key)) continue;
    const value = row.value as string;
    if (key === 'lunchTimes' && value) {
      try { settings[key] = JSON.parse(value); } catch { settings[key] = value; }
    } else {
      settings[key] = value;
    }
  }
  return settings as Partial<AppSettings>;
}

export async function setSetting(key: string, value: string, userId: string): Promise<void> {
  await execute(
    `INSERT INTO settings (user_id, \`key\`, value) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [userId, key, value],
  );
}

export async function setSettingsBatch(entries: [string, string][], userId: string): Promise<void> {
  if (entries.length === 0) return;
  await runBatchedWrites(
    entries.map(([key, value]) => ({
      sql: `INSERT INTO settings (user_id, \`key\`, value) VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      params: [userId, key, value],
    })),
  );
}

/**
 * Cross-user scan for the scheduled-sync cron: every user whose stored
 * `powerschoolAutoSync` setting is enabled and matches the given UTC hour
 * bucket. Mirrors the cross-user query style already used by getSystemStats.
 */
export async function getUsersWithAutoSyncDueAt(utcHour: number): Promise<string[]> {
  const rows = await query<RowDataPacket>(
    `SELECT user_id, value FROM settings WHERE \`key\` = 'powerschoolAutoSync'`,
  );
  const due: string[] = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse((row.value as string) || '{}') as { enabled?: boolean; utcHour?: number };
      if (parsed.enabled && parsed.utcHour === utcHour) due.push(row.user_id as string);
    } catch {
      // malformed setting value — skip rather than fail the whole scan
    }
  }
  return due;
}

export async function deleteSetting(key: string, userId: string): Promise<void> {
  await execute(`DELETE FROM settings WHERE user_id = ? AND \`key\` = ?`, [userId, key]);
}

// ---- Credential encryption (AES-256-GCM, fixed-key) ----
// Used for at-rest encryption of per-user secrets (e.g. PowerSchool password)
// stored in the settings table. Unlike crypto.ts (passphrase + per-record salt),
// this derives a single fixed key from an environment secret so values can be
// transparently decrypted server-side without a user-supplied passphrase.
// Output format: base64( iv[12] | authTag[16] | ciphertext ).

const CRED_ALGORITHM = 'aes-256-gcm';
const CRED_IV_LENGTH = 12;
const CRED_TAG_LENGTH = 16;

function credentialKey(): Buffer {
  const secret = process.env.CREDENTIAL_KEY || process.env.DATABASE_URL || '';
  // Derive a stable 32-byte key from whatever secret is available.
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptCredential(plaintext: string): string {
  const iv = crypto.randomBytes(CRED_IV_LENGTH);
  const cipher = crypto.createCipheriv(CRED_ALGORITHM, credentialKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptCredential(ciphertext: string): string {
  const packed = Buffer.from(ciphertext, 'base64');
  if (packed.length < CRED_IV_LENGTH + CRED_TAG_LENGTH + 1) {
    throw new Error('Invalid credential ciphertext.');
  }
  const iv = packed.subarray(0, CRED_IV_LENGTH);
  const authTag = packed.subarray(CRED_IV_LENGTH, CRED_IV_LENGTH + CRED_TAG_LENGTH);
  const data = packed.subarray(CRED_IV_LENGTH + CRED_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(CRED_ALGORITHM, credentialKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// ---- PowerSchool credentials (per-user, password encrypted at rest) ----

export interface PowerSchoolCredentials {
  url: string;
  username: string;
  password: string;
}

export async function getPowerSchoolCredentials(userId: string): Promise<PowerSchoolCredentials> {
  const rows = await query<RowDataPacket>(
    `SELECT \`key\`, value FROM settings
     WHERE user_id = ? AND \`key\` IN ('powerschoolUrl', 'powerschoolUsername', 'powerschoolPassword')`,
    [userId],
  );
  let url = '';
  let username = '';
  let password = '';
  for (const row of rows) {
    const key = row.key as string;
    const value = (row.value as string) ?? '';
    if (key === 'powerschoolUrl') url = value;
    else if (key === 'powerschoolUsername') username = value;
    else if (key === 'powerschoolPassword' && value) {
      try {
        password = decryptCredential(value);
      } catch {
        // Corrupt or key-rotated ciphertext — treat as unset rather than throwing.
        password = '';
      }
    }
  }
  return { url, username, password };
}

export async function setPowerSchoolCredentials(
  userId: string,
  url: string,
  username: string,
  password: string,
): Promise<void> {
  const upsertSql = `INSERT INTO settings (user_id, \`key\`, value) VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE value = VALUES(value)`;
  await runBatchedWrites([
    { sql: upsertSql, params: [userId, 'powerschoolUrl', url] },
    { sql: upsertSql, params: [userId, 'powerschoolUsername', username] },
    { sql: upsertSql, params: [userId, 'powerschoolPassword', encryptCredential(password)] },
  ]);
}

export async function clearPowerSchoolCredentials(userId: string): Promise<void> {
  await execute(
    `DELETE FROM settings WHERE user_id = ? AND \`key\` IN ('powerschoolUrl', 'powerschoolUsername', 'powerschoolPassword')`,
    [userId],
  );
}

// ---- Grade history & sync log ----

export async function getGradeHistory(userId: string, classId?: string): Promise<GradeHistoryEntry[]> {
  const rows = classId
    ? await query<RowDataPacket>(
        `SELECT * FROM grade_history WHERE user_id = ? AND class_id = ? ORDER BY captured_at DESC`,
        [userId, classId],
      )
    : await query<RowDataPacket>(
        `SELECT * FROM grade_history WHERE user_id = ? ORDER BY captured_at DESC`,
        [userId],
      );
  return rows.map((r) => dbToGradeHistory(r as Record<string, unknown>));
}

export async function addGradeHistoryEntry(
  userId: string,
  classId: string,
  gradePercent: number | undefined,
  letter: string | undefined,
  semester: string,
): Promise<void> {
  await execute(
    `INSERT INTO grade_history (id, user_id, class_id, grade_percent, letter, semester)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuid(), userId, classId, gradePercent ?? null, letter ?? null, semester],
  );
}

export async function addGradeHistoryEntries(
  userId: string,
  entries: { classId: string; gradePercent: number | undefined; letter: string | undefined; semester: string }[],
): Promise<void> {
  if (entries.length === 0) return;
  await runBatchedWrites(
    entries.map((e) => ({
      sql: `INSERT INTO grade_history (id, user_id, class_id, grade_percent, letter, semester) VALUES (?, ?, ?, ?, ?, ?)`,
      params: [uuid(), userId, e.classId, e.gradePercent ?? null, e.letter ?? null, e.semester],
    })),
  );
}

export async function getSyncLog(
  userId: string,
  opts?: { classId?: string; limit?: number },
): Promise<SyncLogEntry[]> {
  const limit = opts?.limit ?? 200;
  const rows = opts?.classId
    ? await query<RowDataPacket>(
        `SELECT * FROM sync_log WHERE user_id = ? AND class_id = ? ORDER BY occurred_at DESC LIMIT ?`,
        [userId, opts.classId, limit],
      )
    : await query<RowDataPacket>(
        `SELECT * FROM sync_log WHERE user_id = ? ORDER BY occurred_at DESC LIMIT ?`,
        [userId, limit],
      );
  return rows.map((r) => dbToSyncLogEntry(r as Record<string, unknown>));
}

export async function addSyncLogEntries(
  userId: string,
  entries: Omit<SyncLogEntry, 'id' | 'occurredAt'>[],
): Promise<void> {
  if (entries.length === 0) return;
  await runBatchedWrites(
    entries.map((e) => ({
      sql: `INSERT INTO sync_log (id, user_id, sync_id, entity_type, entity_id, class_id, label, change_type, detail)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [uuid(), userId, e.syncId, e.entityType, e.entityId, e.classId ?? null, e.label, e.changeType, e.detail],
    })),
  );
}

// ---- PowerSchool sync status (background/scheduled sync progress) ----

export interface SyncStatusRow {
  syncId: string;
  status: 'idle' | 'running' | 'success' | 'error';
  startedAt?: string;
  finishedAt?: string;
  log: string[];
  result: Record<string, unknown> | null;
  error: string | null;
}

export async function getSyncStatus(userId: string): Promise<SyncStatusRow | null> {
  const rows = await query<RowDataPacket>(
    `SELECT * FROM powerschool_sync_status WHERE user_id = ?`,
    [userId],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    syncId: (row.sync_id as string) || '',
    status: (row.status as SyncStatusRow['status']) || 'idle',
    startedAt: row.started_at ? new Date(row.started_at as string).toISOString() : undefined,
    finishedAt: row.finished_at ? new Date(row.finished_at as string).toISOString() : undefined,
    log: parseJson<string[]>(row.log) ?? [],
    result: parseJson<Record<string, unknown>>(row.result) ?? null,
    error: (row.error as string) ?? null,
  };
}

const LOCK_STALE_MINUTES = 10; // generous vs. vercel.json's 280s maxDuration — covers a killed/stuck invocation

/**
 * Claims the per-user sync lock via a plain INSERT into a PK-uniqueness-
 * enforced table — race-safe on any real MySQL without depending on
 * conditional-upsert semantics. Returns true if the caller won the lock.
 */
export async function tryAcquireSyncLock(userId: string, syncId: string): Promise<boolean> {
  try {
    await execute(
      `INSERT INTO powerschool_sync_lock (user_id, sync_id) VALUES (?, ?)`,
      [userId, syncId],
    );
    return true;
  } catch {
    // PK conflict — someone already holds the lock. Reclaim if stale.
    const staleCutoff = new Date(Date.now() - LOCK_STALE_MINUTES * 60_000)
      .toISOString().slice(0, 19).replace('T', ' ');
    await execute(
      `DELETE FROM powerschool_sync_lock WHERE user_id = ? AND acquired_at < ?`,
      [userId, staleCutoff],
    ).catch(() => {});
    try {
      await execute(
        `INSERT INTO powerschool_sync_lock (user_id, sync_id) VALUES (?, ?)`,
        [userId, syncId],
      );
      return true;
    } catch {
      return false;
    }
  }
}

/** Releases the per-user sync lock — call when a sync reaches a terminal state (success or error). */
export async function releaseSyncLock(userId: string): Promise<void> {
  await execute(`DELETE FROM powerschool_sync_lock WHERE user_id = ?`, [userId]).catch(() => {});
}

/** Upsert this user's sync status row. Also acts as a simple per-user lock — check `status !== 'running'` before starting a new sync. */
export async function setSyncStatus(
  userId: string,
  data: Partial<SyncStatusRow> & { syncId: string; status: SyncStatusRow['status'] },
): Promise<void> {
  await execute(
    `INSERT INTO powerschool_sync_status (user_id, sync_id, status, started_at, finished_at, log, result, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       sync_id = VALUES(sync_id), status = VALUES(status),
       started_at = VALUES(started_at), finished_at = VALUES(finished_at),
       log = VALUES(log), result = VALUES(result), error = VALUES(error)`,
    [
      userId, data.syncId, data.status,
      data.startedAt ?? null, data.finishedAt ?? null,
      data.log ? JSON.stringify(data.log) : null,
      data.result ? JSON.stringify(data.result) : null,
      data.error ?? null,
    ],
  );
}

// ---- Sync helpers (PowerSchool / Classroom imports) ----

const normalizeName = (s?: string | null) =>
  s ? s.replace(/ /g, ' ').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase() : '';

export async function syncClassesFromSource(
  source: 'powerschool' | 'classroom',
  incoming: SchoolClass[],
  userId: string,
  syncId: string = '',
): Promise<{ added: number; updated: number; removed: number; idMap: Map<string, string>; logEntries: Omit<SyncLogEntry, 'id' | 'occurredAt'>[] }> {
  const logEntries: Omit<SyncLogEntry, 'id' | 'occurredAt'>[] = [];
  const writeQueries: Array<{ sql: string; params: unknown[] }> = [];

  const allRows = await query<RowDataPacket>(
    `SELECT * FROM classes WHERE user_id = ?`,
    [userId],
  );
  const all = allRows.map((r) => dbToClass(r as Record<string, unknown>));

  const fromSource = all.filter((c) => c.source === source);
  const bySourceId = new Map<string, SchoolClass>();
  for (const c of fromSource) {
    if (c.sourceId && !bySourceId.has(c.sourceId)) bySourceId.set(c.sourceId, c);
  }

  const incomingSemesters = new Set(incoming.map((c) => c.semester).filter(Boolean));

  let added = 0;
  let updated = 0;
  const keptIds = new Set<string>();
  const idMap = new Map<string, string>();

  if (source === 'powerschool') {
    const manualMap = new Map<string, SchoolClass>();
    for (const c of all) {
      if (c.source === 'powerschool') continue;
      const key = `${normalizeName(c.name)}||${c.period || ''}`;
      if (!manualMap.has(key)) manualMap.set(key, c);
    }

    for (const cls of incoming) {
      let prior = cls.sourceId ? bySourceId.get(cls.sourceId) : undefined;
      if (prior && prior.semester && cls.semester && prior.semester !== cls.semester) prior = undefined;
      if (!prior) {
        const key = `${normalizeName(cls.name)}||${cls.period || ''}`;
        prior = manualMap.get(key);
      }

      if (prior) {
        const merged: SchoolClass = {
          ...prior,
          ...cls,
          id: prior.id,
          color: prior.color || cls.color,
          source,
          sourceId: cls.sourceId,
        };
        if (prior.days?.length) merged.days = prior.days;
        if (prior.startTime?.trim()) merged.startTime = prior.startTime;
        if (prior.endTime?.trim()) merged.endTime = prior.endTime;
        if (prior.dayTimes && Object.keys(prior.dayTimes).length > 0) merged.dayTimes = prior.dayTimes;
        if (prior.period && Number(prior.period) > 0) merged.period = prior.period;
        merged.isAp = resolveIsApOnSync(prior.isAp, merged.name);

        if (prior.weightSource === 'manual') {
          merged.categoryWeights = prior.categoryWeights;
          merged.weightSource = 'manual';
        } else if (cls.categoryWeights && Object.keys(cls.categoryWeights).length > 0) {
          merged.categoryWeights = cls.categoryWeights;
          merged.weightSource = cls.weightSource ?? 'scraped';
        } else {
          merged.categoryWeights = prior.categoryWeights;
          merged.weightSource = prior.weightSource;
        }

        if (syncId && prior.gradePercent !== undefined && cls.gradePercent !== undefined &&
            Math.abs((prior.gradePercent ?? 0) - (cls.gradePercent ?? 0)) >= 0.01) {
          logEntries.push({
            syncId, entityType: 'class', entityId: merged.id, classId: merged.id,
            label: merged.name, changeType: 'grade_changed',
            detail: `${prior.gradePercent?.toFixed(1)}% → ${cls.gradePercent?.toFixed(1)}%`,
          });
        }

        writeQueries.push({
          sql: `UPDATE classes SET
                  name = ?, teacher = ?, room = ?, color = ?, period = ?,
                  start_time = ?, end_time = ?, days = ?, day_times = ?,
                  semester = ?, source = ?, source_id = ?, grade = ?,
                  grade_percent = ?, category_weights = ?, weight_source = ?, is_ap = ?
                WHERE id = ? AND user_id = ?`,
          params: [
            merged.name, merged.teacher, merged.room, merged.color, merged.period,
            merged.startTime, merged.endTime, JSON.stringify(merged.days),
            merged.dayTimes ? JSON.stringify(merged.dayTimes) : null,
            merged.semester, merged.source ?? null, merged.sourceId ?? null, merged.grade ?? null,
            merged.gradePercent ?? null,
            merged.categoryWeights ? JSON.stringify(merged.categoryWeights) : null,
            merged.weightSource ?? null, merged.isAp ?? false ? 1 : 0,
            merged.id, userId,
          ],
        });
        idMap.set(cls.id, prior.id);
        keptIds.add(prior.id);
        updated++;
      } else {
        writeQueries.push({
          sql: `INSERT INTO classes (id, user_id, name, teacher, room, color, period, start_time, end_time, days, day_times, semester, source, source_id, grade, grade_percent, category_weights, weight_source, is_ap)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            cls.id, userId, cls.name, cls.teacher, cls.room, cls.color, cls.period,
            cls.startTime, cls.endTime, JSON.stringify(cls.days),
            cls.dayTimes ? JSON.stringify(cls.dayTimes) : null,
            cls.semester, source, cls.sourceId ?? null,
            cls.grade ?? null, cls.gradePercent ?? null,
            cls.categoryWeights ? JSON.stringify(cls.categoryWeights) : null,
            cls.weightSource ?? null, cls.isAp ?? detectApFromName(cls.name) ? 1 : 0,
          ],
        });
        idMap.set(cls.id, cls.id);
        keptIds.add(cls.id);
        if (syncId) {
          logEntries.push({
            syncId, entityType: 'class', entityId: cls.id, classId: cls.id,
            label: cls.name, changeType: 'added',
            detail: cls.grade ? `Grade: ${cls.grade}` : 'New class',
          });
        }
        added++;
      }
    }

    const deleteCandidates = fromSource.filter((c) => {
      if (keptIds.has(c.id)) return false;
      if (incomingSemesters.size === 0) return true;
      return incomingSemesters.has(c.semester);
    });
    const toDeleteIds = deleteCandidates.map((c) => c.id);
    if (syncId) {
      for (const c of deleteCandidates) {
        logEntries.push({
          syncId, entityType: 'class', entityId: c.id, classId: c.id,
          label: c.name, changeType: 'removed', detail: 'No longer in PowerSchool',
        });
      }
    }
    if (toDeleteIds.length > 0) {
      const { clause, params } = inClause(toDeleteIds);
      writeQueries.push({ sql: `DELETE FROM classes WHERE id ${clause} AND user_id = ?`, params: [...params, userId] });
    }
    await runBatchedWrites(writeQueries);
    return { added, updated, removed: toDeleteIds.length, idMap, logEntries };
  }

  // Classroom (and future sources)
  for (const cls of incoming) {
    if (!cls.sourceId) {
      writeQueries.push({
        sql: `INSERT INTO classes (id, user_id, name, teacher, room, color, period, start_time, end_time, days, day_times, semester, source, source_id, grade, grade_percent, category_weights, weight_source, is_ap)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          cls.id, userId, cls.name, cls.teacher, cls.room, cls.color, cls.period,
          cls.startTime, cls.endTime, JSON.stringify(cls.days),
          cls.dayTimes ? JSON.stringify(cls.dayTimes) : null,
          cls.semester, source, null,
          cls.grade ?? null, cls.gradePercent ?? null,
          cls.categoryWeights ? JSON.stringify(cls.categoryWeights) : null,
          cls.weightSource ?? null, cls.isAp ?? detectApFromName(cls.name) ? 1 : 0,
        ],
      });
      idMap.set(cls.id, cls.id);
      added++;
      continue;
    }

    let prior = bySourceId.get(cls.sourceId);
    if (!prior) {
      const norm = normalizeName(cls.name);
      prior = all.find((c) => {
        if (c.source === source) return false;
        if ((c.period || 0) !== (cls.period || 0)) return false;
        return normalizeName(c.name) === norm;
      });
    }

    if (prior) {
      const merged: SchoolClass = {
        ...prior,
        ...cls,
        id: prior.id,
        color: prior.color || cls.color,
        source,
        sourceId: cls.sourceId,
      };
      if (prior.days?.length) merged.days = prior.days;
      if (prior.startTime?.trim()) merged.startTime = prior.startTime;
      if (prior.endTime?.trim()) merged.endTime = prior.endTime;
      if (prior.dayTimes && Object.keys(prior.dayTimes).length > 0) merged.dayTimes = prior.dayTimes;
      if (prior.period && Number(prior.period) > 0) merged.period = prior.period;
      merged.isAp = resolveIsApOnSync(prior.isAp, merged.name);

      writeQueries.push({
        sql: `UPDATE classes SET
                name = ?, teacher = ?, room = ?, color = ?, period = ?,
                start_time = ?, end_time = ?, days = ?, day_times = ?,
                semester = ?, source = ?, source_id = ?, grade = ?,
                grade_percent = ?, category_weights = ?, weight_source = ?, is_ap = ?
              WHERE id = ? AND user_id = ?`,
        params: [
          merged.name, merged.teacher, merged.room, merged.color, merged.period,
          merged.startTime, merged.endTime, JSON.stringify(merged.days),
          merged.dayTimes ? JSON.stringify(merged.dayTimes) : null,
          merged.semester, merged.source ?? null, merged.sourceId ?? null, merged.grade ?? null,
          merged.gradePercent ?? null,
          merged.categoryWeights ? JSON.stringify(merged.categoryWeights) : null,
          merged.weightSource ?? null, merged.isAp ?? false ? 1 : 0,
          merged.id, userId,
        ],
      });
      idMap.set(cls.id, prior.id);
      keptIds.add(prior.id);
      updated++;
    } else {
      writeQueries.push({
        sql: `INSERT INTO classes (id, user_id, name, teacher, room, color, period, start_time, end_time, days, day_times, semester, source, source_id, grade, grade_percent, category_weights, weight_source, is_ap)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          cls.id, userId, cls.name, cls.teacher, cls.room, cls.color, cls.period,
          cls.startTime, cls.endTime, JSON.stringify(cls.days),
          cls.dayTimes ? JSON.stringify(cls.dayTimes) : null,
          cls.semester, source, cls.sourceId ?? null,
          cls.grade ?? null, cls.gradePercent ?? null,
          cls.categoryWeights ? JSON.stringify(cls.categoryWeights) : null,
          cls.weightSource ?? null, cls.isAp ?? detectApFromName(cls.name) ? 1 : 0,
        ],
      });
      idMap.set(cls.id, cls.id);
      added++;
    }
  }

  const toDelete = fromSource.filter((c) => !keptIds.has(c.id)).map((c) => c.id);
  if (toDelete.length > 0) {
    const { clause, params } = inClause(toDelete);
    writeQueries.push({ sql: `DELETE FROM classes WHERE id ${clause} AND user_id = ?`, params: [...params, userId] });
  }
  await runBatchedWrites(writeQueries);
  return { added, updated, removed: toDelete.length, idMap, logEntries };
}

export async function syncHomeworkFromSource(
  source: 'powerschool' | 'classroom',
  incoming: Homework[],
  userId: string,
  syncId: string = '',
): Promise<{ added: number; updated: number; removed: number; logEntries: Omit<SyncLogEntry, 'id' | 'occurredAt'>[] }> {
  const logEntries: Omit<SyncLogEntry, 'id' | 'occurredAt'>[] = [];
  const writeQueries: Array<{ sql: string; params: unknown[] }> = [];

  const incomingClassIds = [...new Set(incoming.map((h) => h.classId))];
  let existingRows: RowDataPacket[];
  if (incomingClassIds.length > 0) {
    const { clause, params } = inClause(incomingClassIds);
    existingRows = await query<RowDataPacket>(
      `SELECT * FROM homework WHERE source = ? AND user_id = ? AND class_id ${clause}`,
      [source, userId, ...params],
    );
  } else {
    existingRows = await query<RowDataPacket>(
      `SELECT * FROM homework WHERE source = ? AND user_id = ?`,
      [source, userId],
    );
  }
  const existing = existingRows.map((r) => dbToHomework(r as Record<string, unknown>));

  const bySourceId = new Map<string, Homework>();
  for (const hw of existing) {
    if (hw.sourceId && !bySourceId.has(hw.sourceId)) bySourceId.set(hw.sourceId, hw);
  }

  let added = 0;
  let updated = 0;
  const keptIds = new Set<string>();

  for (const hw of incoming) {
    if (!hw.sourceId) {
      writeQueries.push({
        sql: `INSERT INTO homework (id, user_id, class_id, title, description, due_date, completed, priority, source, source_id, score, category, flags, teacher_note, score_percent)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          hw.id, userId, hw.classId, hw.title, hw.description, hw.dueDate,
          hw.completed ? 1 : 0, hw.priority, source, null,
          hw.score ?? null, hw.category ?? null, hw.flags ?? null,
          hw.teacherNote ?? null, hw.scorePercent ?? null,
        ],
      });
      added++;
      continue;
    }

    const prior = bySourceId.get(hw.sourceId);
    if (prior) {
      const merged: Homework = { ...prior, ...hw, id: prior.id, completed: prior.completed, priority: prior.priority, source };

      if (syncId) {
        if ((prior.scorePercent ?? null) !== (hw.scorePercent ?? null)) {
          logEntries.push({
            syncId, entityType: 'homework', entityId: merged.id, classId: merged.classId,
            label: merged.title, changeType: 'score_changed',
            detail: `${prior.scorePercent !== undefined ? prior.scorePercent + '%' : prior.score ?? '—'} → ${hw.scorePercent !== undefined ? hw.scorePercent + '%' : hw.score ?? '—'}`,
          });
        } else if ((prior.flags ?? '') !== (hw.flags ?? '')) {
          logEntries.push({
            syncId, entityType: 'homework', entityId: merged.id, classId: merged.classId,
            label: merged.title, changeType: 'flag_changed',
            detail: `${prior.flags || '(none)'} → ${hw.flags || '(none)'}`,
          });
        }
      }

      writeQueries.push({
        sql: `UPDATE homework SET
                class_id = ?, title = ?, description = ?, due_date = ?,
                completed = ?, priority = ?,
                source = ?, source_id = ?,
                score = ?, category = ?, flags = ?, teacher_note = ?,
                score_percent = ?
              WHERE id = ? AND user_id = ?`,
        params: [
          merged.classId, merged.title, merged.description, merged.dueDate,
          merged.completed ? 1 : 0, merged.priority,
          merged.source, merged.sourceId ?? null,
          merged.score ?? null, merged.category ?? null, merged.flags ?? null,
          merged.teacherNote ?? null, merged.scorePercent ?? null,
          merged.id, userId,
        ],
      });
      keptIds.add(prior.id);
      updated++;
    } else {
      writeQueries.push({
        sql: `INSERT INTO homework (id, user_id, class_id, title, description, due_date, completed, priority, source, source_id, score, category, flags, teacher_note, score_percent)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          hw.id, userId, hw.classId, hw.title, hw.description, hw.dueDate,
          hw.completed ? 1 : 0, hw.priority, source, hw.sourceId ?? null,
          hw.score ?? null, hw.category ?? null, hw.flags ?? null,
          hw.teacherNote ?? null, hw.scorePercent ?? null,
        ],
      });
      if (syncId) {
        logEntries.push({
          syncId, entityType: 'homework', entityId: hw.id, classId: hw.classId,
          label: hw.title, changeType: 'added',
          detail: hw.score ? `Score: ${hw.score}` : hw.dueDate,
        });
      }
      added++;
    }
  }

  const toDelete = existing.filter((hw) => !keptIds.has(hw.id)).map((hw) => hw.id);
  if (toDelete.length > 0) {
    const { clause, params } = inClause(toDelete);
    writeQueries.push({ sql: `DELETE FROM homework WHERE id ${clause} AND user_id = ?`, params: [...params, userId] });
  }
  await runBatchedWrites(writeQueries);
  return { added, updated, removed: toDelete.length, logEntries };
}
