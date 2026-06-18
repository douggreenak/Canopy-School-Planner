// ============================================================
// Neon (PostgreSQL) Database Layer
// ============================================================
import { neon } from '@neondatabase/serverless';
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

function getDb() {
  return neon(process.env.DATABASE_URL!);
}

// ---- Schema initialization ----

export async function initializeDatabase() {
  const sql = getDb();

  // Auth tables
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;

  // Data tables — created with user_id from the start for new installs
  await sql`
    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      teacher TEXT NOT NULL DEFAULT '',
      room TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '',
      period INTEGER NOT NULL DEFAULT 0,
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      days JSONB NOT NULL DEFAULT '[]',
      day_times JSONB,
      semester TEXT NOT NULL DEFAULT '',
      source TEXT,
      source_id TEXT,
      grade TEXT,
      grade_percent NUMERIC
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS homework (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      class_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      due_date TEXT NOT NULL DEFAULT '',
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      priority TEXT NOT NULL DEFAULT 'medium',
      source TEXT NOT NULL DEFAULT 'manual',
      source_id TEXT,
      score TEXT,
      category TEXT,
      flags TEXT,
      score_percent NUMERIC
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      class_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT ''
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      due_date TEXT NOT NULL DEFAULT '',
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      priority TEXT NOT NULL DEFAULT 'medium',
      category TEXT NOT NULL DEFAULT 'General',
      class_id TEXT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS disruptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL DEFAULT '',
      period_overrides JSONB NOT NULL DEFAULT '[]'
    )
  `;

  // Settings — composite PK (user_id, key) for new installs
  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT NOT NULL DEFAULT '',
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (user_id, key)
    )
  `;

  // Migration: add user_id to existing tables that predate multi-user support
  await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE homework ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE exams ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE disruptions ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT ''`;

  // Migration: category weights (what-if calculator, exam stakes, missing-work triage)
  await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS category_weights JSONB`;
  await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS weight_source TEXT`;
  await sql`ALTER TABLE exams ADD COLUMN IF NOT EXISTS weight_percent NUMERIC`;

  // grade_history: one row per class per sync — powers velocity alerts + GPA projection
  await sql`
    CREATE TABLE IF NOT EXISTS grade_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      class_id TEXT NOT NULL DEFAULT '',
      grade_percent NUMERIC,
      letter TEXT,
      semester TEXT NOT NULL DEFAULT '',
      captured_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_grade_history_class ON grade_history (user_id, class_id, captured_at DESC)`;

  // sync_log: diff trail written on every sync — powers the change-log feature
  await sql`
    CREATE TABLE IF NOT EXISTS sync_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      sync_id TEXT NOT NULL DEFAULT '',
      occurred_at TIMESTAMPTZ DEFAULT NOW(),
      entity_type TEXT NOT NULL DEFAULT '',
      entity_id TEXT NOT NULL DEFAULT '',
      class_id TEXT,
      label TEXT NOT NULL DEFAULT '',
      change_type TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT ''
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_sync_log_user_time ON sync_log (user_id, occurred_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sync_log_class ON sync_log (user_id, class_id, occurred_at DESC)`;

  // Admin support: role column on users, created_at on sessions
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`;
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`;

  // Migrate settings table PK from single-column (key) to composite (user_id, key)
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'settings' AND column_name = 'user_id'
      ) THEN
        ALTER TABLE settings ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
        ALTER TABLE settings ADD PRIMARY KEY (user_id, key);
      END IF;
    END $$
  `;
}

// ---- Row mappers ----

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
    days: (row.days as number[]) || [],
    dayTimes: (row.day_times as SchoolClass['dayTimes']) ?? undefined,
    semester: (row.semester as string) || '',
    source: (row.source as SchoolClass['source']) ?? undefined,
    sourceId: (row.source_id as string) || undefined,
    grade: (row.grade as string) || undefined,
    gradePercent: row.grade_percent != null ? Number(row.grade_percent) : undefined,
    categoryWeights: (row.category_weights as Record<string, number>) ?? undefined,
    weightSource: (row.weight_source as SchoolClass['weightSource']) ?? undefined,
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
    priority: (row.priority as Homework['priority']) || 'medium',
    source: (row.source as Homework['source']) || 'manual',
    sourceId: (row.source_id as string) || undefined,
    score: (row.score as string) || undefined,
    category: (row.category as string) || undefined,
    flags: (row.flags as string) || undefined,
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
    capturedAt: row.captured_at as string,
  };
}

function dbToSyncLogEntry(row: Record<string, unknown>): SyncLogEntry {
  return {
    id: row.id as string,
    syncId: row.sync_id as string,
    occurredAt: row.occurred_at as string,
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
    priority: (row.priority as Task['priority']) || 'medium',
    category: (row.category as string) || 'General',
    classId: (row.class_id as string) || undefined,
  };
}

function dbToDisruption(row: Record<string, unknown>): ScheduleDisruption {
  return {
    id: row.id as string,
    date: (row.date as string) || '',
    type: (row.type as ScheduleDisruption['type']),
    label: (row.label as string) || '',
    periodOverrides: (row.period_overrides as PeriodOverride[]) || [],
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
  const sql = getDb();
  await sql`
    INSERT INTO users (id, username, password_hash, role)
    VALUES (${id}, ${username.toLowerCase()}, ${passwordHash}, 'user')
  `;
}

/** Upsert the admin account. Takes a pre-hashed password to avoid circular imports with auth.ts. */
export async function createOrUpdateAdminUser(username: string, passwordHash: string): Promise<void> {
  const sql = getDb();
  const id = uuid();
  await sql`
    INSERT INTO users (id, username, password_hash, role)
    VALUES (${id}, ${username.toLowerCase()}, ${passwordHash}, 'admin')
    ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'
  `;
}

export async function getUserByUsername(username: string): Promise<DbUser | null> {
  const sql = getDb();
  const rows = await sql`SELECT id, username, password_hash, role FROM users WHERE username = ${username.toLowerCase()}`;
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  return { id: row.id as string, username: row.username as string, passwordHash: row.password_hash as string, role: (row.role as string) || 'user' };
}

export async function getUserByIdWithHash(id: string): Promise<DbUser | null> {
  const sql = getDb();
  const rows = await sql`SELECT id, username, password_hash, role FROM users WHERE id = ${id}`;
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  return { id: row.id as string, username: row.username as string, passwordHash: row.password_hash as string, role: (row.role as string) || 'user' };
}

export async function updateUserPassword(userId: string, newPasswordHash: string): Promise<void> {
  const sql = getDb();
  await sql`UPDATE users SET password_hash = ${newPasswordHash} WHERE id = ${userId}`;
}

export async function getUserById(id: string): Promise<{ id: string; username: string; role: string } | null> {
  const sql = getDb();
  const rows = await sql`SELECT id, username, role FROM users WHERE id = ${id}`;
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  return { id: row.id as string, username: row.username as string, role: (row.role as string) || 'user' };
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
  const sql = getDb();
  const [users, active7, active30, classes, hw, exams, tasks, regByMonth, userList] = await Promise.all([
    sql`SELECT COUNT(*) AS count FROM users WHERE role != 'admin'`,
    sql`SELECT COUNT(DISTINCT s.user_id) AS count FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.role != 'admin' AND s.created_at > NOW() - INTERVAL '7 days'`,
    sql`SELECT COUNT(DISTINCT s.user_id) AS count FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.role != 'admin' AND s.created_at > NOW() - INTERVAL '30 days'`,
    sql`SELECT COUNT(*) AS count FROM classes c JOIN users u ON u.id = c.user_id WHERE u.role != 'admin'`,
    sql`SELECT COUNT(*) AS count FROM homework h JOIN users u ON u.id = h.user_id WHERE u.role != 'admin'`,
    sql`SELECT COUNT(*) AS count FROM exams e JOIN users u ON u.id = e.user_id WHERE u.role != 'admin'`,
    sql`SELECT COUNT(*) AS count FROM tasks t JOIN users u ON u.id = t.user_id WHERE u.role != 'admin'`,
    sql`SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month, COUNT(*) AS count FROM users WHERE role != 'admin' GROUP BY month ORDER BY month DESC LIMIT 12`,
    sql`SELECT u.username, u.created_at, MAX(s.created_at) AS last_active FROM users u LEFT JOIN sessions s ON s.user_id = u.id WHERE u.role != 'admin' GROUP BY u.username, u.created_at ORDER BY u.created_at DESC`,
  ]);
  return {
    totalUsers: Number(users[0].count),
    activeUsersLast7Days: Number(active7[0].count),
    activeUsersLast30Days: Number(active30[0].count),
    totalClasses: Number(classes[0].count),
    totalAssignments: Number(hw[0].count),
    totalExams: Number(exams[0].count),
    totalTasks: Number(tasks[0].count),
    registrationsByMonth: (regByMonth as Record<string, unknown>[]).map((r) => ({ month: r.month as string, count: Number(r.count) })),
    userList: (userList as Record<string, unknown>[]).map((r) => ({
      username: r.username as string,
      registeredAt: (r.created_at as Date).toISOString(),
      lastActiveAt: r.last_active ? (r.last_active as Date).toISOString() : null,
    })),
  };
}

/** Permanently delete a user and every row they own across all tables. */
export async function deleteUserAndAllData(userId: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM settings    WHERE user_id = ${userId}`;
  await sql`DELETE FROM disruptions WHERE user_id = ${userId}`;
  await sql`DELETE FROM homework    WHERE user_id = ${userId}`;
  await sql`DELETE FROM exams       WHERE user_id = ${userId}`;
  await sql`DELETE FROM tasks       WHERE user_id = ${userId}`;
  await sql`DELETE FROM classes     WHERE user_id = ${userId}`;
  await sql`DELETE FROM sessions    WHERE user_id = ${userId}`;
  await sql`DELETE FROM users       WHERE id      = ${userId}`;
}

// ---- Sessions ----

export async function createDbSession(id: string, userId: string, expiresAt: Date): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (${id}, ${userId}, ${expiresAt.toISOString()})
  `;
}

export async function getDbSession(id: string): Promise<{ userId: string; expiresAt: Date } | null> {
  const sql = getDb();
  const rows = await sql`SELECT user_id, expires_at FROM sessions WHERE id = ${id}`;
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  return { userId: row.user_id as string, expiresAt: new Date(row.expires_at as string) };
}

export async function deleteDbSession(id: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM sessions WHERE id = ${id}`;
}

// ---- Classes ----

export async function getClasses(userId: string): Promise<SchoolClass[]> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM classes WHERE user_id = ${userId} ORDER BY period, name`;
  return rows.map((r) => dbToClass(r as Record<string, unknown>));
}

export async function getClassById(id: string, userId: string): Promise<SchoolClass | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM classes WHERE id = ${id} AND user_id = ${userId}`;
  return rows.length > 0 ? dbToClass(rows[0] as Record<string, unknown>) : null;
}

export async function addClass(c: SchoolClass, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO classes (id, user_id, name, teacher, room, color, period, start_time, end_time, days, day_times, semester, source, source_id, grade, grade_percent, category_weights, weight_source)
    VALUES (
      ${c.id}, ${userId}, ${c.name}, ${c.teacher}, ${c.room}, ${c.color}, ${c.period},
      ${c.startTime}, ${c.endTime}, ${JSON.stringify(c.days)}::jsonb,
      ${c.dayTimes ? JSON.stringify(c.dayTimes) : null}::jsonb,
      ${c.semester}, ${c.source ?? null}, ${c.sourceId ?? null},
      ${c.grade ?? null}, ${c.gradePercent ?? null},
      ${c.categoryWeights ? JSON.stringify(c.categoryWeights) : null}::jsonb, ${c.weightSource ?? null}
    )
  `;
}

export async function updateClass(c: SchoolClass, userId: string): Promise<void> {
  const sql = getDb();
  if (c.dayTimes === undefined) {
    await sql`
      UPDATE classes SET
        name = ${c.name}, teacher = ${c.teacher}, room = ${c.room},
        color = ${c.color}, period = ${c.period}, start_time = ${c.startTime},
        end_time = ${c.endTime}, days = ${JSON.stringify(c.days)}::jsonb,
        semester = ${c.semester}, source = ${c.source ?? null},
        source_id = ${c.sourceId ?? null}, grade = ${c.grade ?? null},
        grade_percent = ${c.gradePercent ?? null},
        category_weights = ${c.categoryWeights ? JSON.stringify(c.categoryWeights) : null}::jsonb,
        weight_source = ${c.weightSource ?? null}
      WHERE id = ${c.id} AND user_id = ${userId}
    `;
  } else {
    await sql`
      UPDATE classes SET
        name = ${c.name}, teacher = ${c.teacher}, room = ${c.room},
        color = ${c.color}, period = ${c.period}, start_time = ${c.startTime},
        end_time = ${c.endTime}, days = ${JSON.stringify(c.days)}::jsonb,
        day_times = ${c.dayTimes ? JSON.stringify(c.dayTimes) : null}::jsonb,
        semester = ${c.semester}, source = ${c.source ?? null},
        source_id = ${c.sourceId ?? null}, grade = ${c.grade ?? null},
        grade_percent = ${c.gradePercent ?? null},
        category_weights = ${c.categoryWeights ? JSON.stringify(c.categoryWeights) : null}::jsonb,
        weight_source = ${c.weightSource ?? null}
      WHERE id = ${c.id} AND user_id = ${userId}
    `;
  }
}

export async function deleteClass(id: string, userId: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM classes WHERE id = ${id} AND user_id = ${userId}`;
}

// ---- Homework ----

export async function getHomework(userId: string): Promise<Homework[]> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM homework WHERE user_id = ${userId} ORDER BY due_date, title`;
  return rows.map((r) => dbToHomework(r as Record<string, unknown>));
}

export async function addHomework(h: Homework, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO homework (id, user_id, class_id, title, description, due_date, completed, priority, source, source_id, score, category, flags, score_percent)
    VALUES (
      ${h.id}, ${userId}, ${h.classId}, ${h.title}, ${h.description}, ${h.dueDate},
      ${h.completed}, ${h.priority}, ${h.source}, ${h.sourceId ?? null},
      ${h.score ?? null}, ${h.category ?? null}, ${h.flags ?? null},
      ${h.scorePercent ?? null}
    )
  `;
}

export async function updateHomework(h: Homework, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE homework SET
      class_id = ${h.classId}, title = ${h.title}, description = ${h.description},
      due_date = ${h.dueDate}, completed = ${h.completed}, priority = ${h.priority},
      source = ${h.source}, source_id = ${h.sourceId ?? null}, score = ${h.score ?? null},
      category = ${h.category ?? null}, flags = ${h.flags ?? null},
      score_percent = ${h.scorePercent ?? null}
    WHERE id = ${h.id} AND user_id = ${userId}
  `;
}

export async function deleteHomework(id: string, userId: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM homework WHERE id = ${id} AND user_id = ${userId}`;
}

export async function deleteHomeworkBatch(ids: string[], userId: string): Promise<number> {
  if (ids.length === 0) return 0;
  const sql = getDb();
  const result = await sql`DELETE FROM homework WHERE id = ANY(${ids}) AND user_id = ${userId}`;
  return result.length ?? ids.length;
}

// ---- Exams ----

export async function getExams(userId: string): Promise<Exam[]> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM exams WHERE user_id = ${userId} ORDER BY date, start_time`;
  return rows.map((r) => dbToExam(r as Record<string, unknown>));
}

export async function addExam(e: Exam, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO exams (id, user_id, class_id, title, date, start_time, end_time, location, notes, weight_percent)
    VALUES (${e.id}, ${userId}, ${e.classId}, ${e.title}, ${e.date}, ${e.startTime}, ${e.endTime}, ${e.location}, ${e.notes}, ${e.weightPercent ?? null})
  `;
}

export async function updateExam(e: Exam, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE exams SET
      class_id = ${e.classId}, title = ${e.title}, date = ${e.date},
      start_time = ${e.startTime}, end_time = ${e.endTime},
      location = ${e.location}, notes = ${e.notes}, weight_percent = ${e.weightPercent ?? null}
    WHERE id = ${e.id} AND user_id = ${userId}
  `;
}

export async function deleteExam(id: string, userId: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM exams WHERE id = ${id} AND user_id = ${userId}`;
}

// ---- Tasks ----

export async function getTasks(userId: string): Promise<Task[]> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM tasks WHERE user_id = ${userId} ORDER BY due_date, title`;
  return rows.map((r) => dbToTask(r as Record<string, unknown>));
}

export async function addTask(t: Task, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO tasks (id, user_id, title, description, due_date, completed, priority, category, class_id)
    VALUES (${t.id}, ${userId}, ${t.title}, ${t.description}, ${t.dueDate}, ${t.completed}, ${t.priority}, ${t.category}, ${t.classId ?? null})
  `;
}

export async function updateTask(t: Task, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE tasks SET
      title = ${t.title}, description = ${t.description}, due_date = ${t.dueDate},
      completed = ${t.completed}, priority = ${t.priority}, category = ${t.category},
      class_id = ${t.classId ?? null}
    WHERE id = ${t.id} AND user_id = ${userId}
  `;
}

export async function deleteTask(id: string, userId: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM tasks WHERE id = ${id} AND user_id = ${userId}`;
}

export async function deleteTasksBatch(ids: string[], userId: string): Promise<number> {
  if (ids.length === 0) return 0;
  const sql = getDb();
  await sql`DELETE FROM tasks WHERE id = ANY(${ids}) AND user_id = ${userId}`;
  return ids.length;
}

// ---- Disruptions ----

export async function getDisruptions(userId: string): Promise<ScheduleDisruption[]> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM disruptions WHERE user_id = ${userId} ORDER BY date`;
  return rows.map((r) => dbToDisruption(r as Record<string, unknown>));
}

export async function addDisruption(d: ScheduleDisruption, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO disruptions (id, user_id, date, type, label, period_overrides)
    VALUES (${d.id}, ${userId}, ${d.date}, ${d.type}, ${d.label}, ${JSON.stringify(d.periodOverrides)}::jsonb)
  `;
}

export async function updateDisruption(d: ScheduleDisruption, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE disruptions SET
      date = ${d.date}, type = ${d.type}, label = ${d.label},
      period_overrides = ${JSON.stringify(d.periodOverrides)}::jsonb
    WHERE id = ${d.id} AND user_id = ${userId}
  `;
}

export async function deleteDisruption(id: string, userId: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM disruptions WHERE id = ${id} AND user_id = ${userId}`;
}

// ---- Settings ----

// Credential keys are managed via getPowerSchoolCredentials and must never be
// returned through the generic settings bag (the password is stored encrypted,
// and even the ciphertext should not be shipped to the client).
const CREDENTIAL_SETTING_KEYS = new Set(['powerschoolPassword']);

export async function getSettings(userId: string): Promise<Partial<AppSettings>> {
  const sql = getDb();
  const rows = await sql`SELECT key, value FROM settings WHERE user_id = ${userId}`;
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
  const sql = getDb();
  await sql`
    INSERT INTO settings (user_id, key, value) VALUES (${userId}, ${key}, ${value})
    ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value
  `;
}

export async function deleteSetting(key: string, userId: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM settings WHERE user_id = ${userId} AND key = ${key}`;
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
  const sql = getDb();
  const rows = await sql`
    SELECT key, value FROM settings
    WHERE user_id = ${userId}
      AND key IN ('powerschoolUrl', 'powerschoolUsername', 'powerschoolPassword')
  `;
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
  await setSetting('powerschoolUrl', url, userId);
  await setSetting('powerschoolUsername', username, userId);
  await setSetting('powerschoolPassword', encryptCredential(password), userId);
}

export async function clearPowerSchoolCredentials(userId: string): Promise<void> {
  await deleteSetting('powerschoolUrl', userId);
  await deleteSetting('powerschoolUsername', userId);
  await deleteSetting('powerschoolPassword', userId);
}

// ---- Grade history & sync log ----

export async function getGradeHistory(userId: string, classId?: string): Promise<GradeHistoryEntry[]> {
  const sql = getDb();
  const rows = classId
    ? await sql`SELECT * FROM grade_history WHERE user_id = ${userId} AND class_id = ${classId} ORDER BY captured_at DESC`
    : await sql`SELECT * FROM grade_history WHERE user_id = ${userId} ORDER BY captured_at DESC`;
  return rows.map((r) => dbToGradeHistory(r as Record<string, unknown>));
}

export async function addGradeHistoryEntry(
  userId: string,
  classId: string,
  gradePercent: number | undefined,
  letter: string | undefined,
  semester: string,
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO grade_history (id, user_id, class_id, grade_percent, letter, semester)
    VALUES (${uuid()}, ${userId}, ${classId}, ${gradePercent ?? null}, ${letter ?? null}, ${semester})
  `;
}

export async function getSyncLog(
  userId: string,
  opts?: { classId?: string; limit?: number },
): Promise<SyncLogEntry[]> {
  const sql = getDb();
  const limit = opts?.limit ?? 200;
  const rows = opts?.classId
    ? await sql`
        SELECT * FROM sync_log WHERE user_id = ${userId} AND class_id = ${opts.classId}
        ORDER BY occurred_at DESC LIMIT ${limit}
      `
    : await sql`SELECT * FROM sync_log WHERE user_id = ${userId} ORDER BY occurred_at DESC LIMIT ${limit}`;
  return rows.map((r) => dbToSyncLogEntry(r as Record<string, unknown>));
}

export async function addSyncLogEntries(
  userId: string,
  entries: Omit<SyncLogEntry, 'id' | 'occurredAt'>[],
): Promise<void> {
  if (entries.length === 0) return;
  const sql = getDb();
  for (const e of entries) {
    await sql`
      INSERT INTO sync_log (id, user_id, sync_id, entity_type, entity_id, class_id, label, change_type, detail)
      VALUES (${uuid()}, ${userId}, ${e.syncId}, ${e.entityType}, ${e.entityId}, ${e.classId ?? null}, ${e.label}, ${e.changeType}, ${e.detail})
    `;
  }
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
  const sql = getDb();
  const logEntries: Omit<SyncLogEntry, 'id' | 'occurredAt'>[] = [];

  const allRows = await sql`SELECT * FROM classes WHERE user_id = ${userId}`;
  const all = allRows.map((r) => dbToClass(r as Record<string, unknown>));

  const fromSource = all.filter((c) => c.source === source);
  const bySourceId = new Map<string, SchoolClass>();
  for (const c of fromSource) {
    if (c.sourceId && !bySourceId.has(c.sourceId)) bySourceId.set(c.sourceId, c);
  }

  // Scope deletes to only semesters present in the incoming batch — never delete prior-semester rows.
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
      // Guard: same sourceId but different semester → treat as a new row, not an update
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

        // Category-weight manual-sticks rule: once set manually, sync never overwrites.
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

        // Log grade changes
        if (syncId && prior.gradePercent !== undefined && cls.gradePercent !== undefined &&
            Math.abs((prior.gradePercent ?? 0) - (cls.gradePercent ?? 0)) >= 0.01) {
          logEntries.push({
            syncId,
            entityType: 'class',
            entityId: merged.id,
            classId: merged.id,
            label: merged.name,
            changeType: 'grade_changed',
            detail: `${prior.gradePercent?.toFixed(1)}% → ${cls.gradePercent?.toFixed(1)}%`,
          });
        }

        await sql`
          UPDATE classes SET
            name = ${merged.name}, teacher = ${merged.teacher}, room = ${merged.room},
            color = ${merged.color}, period = ${merged.period},
            start_time = ${merged.startTime}, end_time = ${merged.endTime},
            days = ${JSON.stringify(merged.days)}::jsonb,
            day_times = ${merged.dayTimes ? JSON.stringify(merged.dayTimes) : null}::jsonb,
            semester = ${merged.semester}, source = ${merged.source ?? null},
            source_id = ${merged.sourceId ?? null}, grade = ${merged.grade ?? null},
            grade_percent = ${merged.gradePercent ?? null},
            category_weights = ${merged.categoryWeights ? JSON.stringify(merged.categoryWeights) : null}::jsonb,
            weight_source = ${merged.weightSource ?? null}
          WHERE id = ${merged.id} AND user_id = ${userId}
        `;
        idMap.set(cls.id, prior.id);
        keptIds.add(prior.id);
        updated++;
      } else {
        await sql`
          INSERT INTO classes (id, user_id, name, teacher, room, color, period, start_time, end_time, days, day_times, semester, source, source_id, grade, grade_percent, category_weights, weight_source)
          VALUES (
            ${cls.id}, ${userId}, ${cls.name}, ${cls.teacher}, ${cls.room}, ${cls.color}, ${cls.period},
            ${cls.startTime}, ${cls.endTime}, ${JSON.stringify(cls.days)}::jsonb,
            ${cls.dayTimes ? JSON.stringify(cls.dayTimes) : null}::jsonb,
            ${cls.semester}, ${source}, ${cls.sourceId ?? null},
            ${cls.grade ?? null}, ${cls.gradePercent ?? null},
            ${cls.categoryWeights ? JSON.stringify(cls.categoryWeights) : null}::jsonb,
            ${cls.weightSource ?? null}
          )
        `;
        idMap.set(cls.id, cls.id);
        keptIds.add(cls.id);
        if (syncId) {
          logEntries.push({
            syncId,
            entityType: 'class',
            entityId: cls.id,
            classId: cls.id,
            label: cls.name,
            changeType: 'added',
            detail: cls.grade ? `Grade: ${cls.grade}` : 'New class',
          });
        }
        added++;
      }
    }

    // Only delete from semesters that appeared in the incoming batch; prior-semester rows survive.
    const deleteCandidates = fromSource.filter((c) => {
      if (keptIds.has(c.id)) return false;
      if (incomingSemesters.size === 0) return true;
      return incomingSemesters.has(c.semester);
    });
    const toDeleteIds = deleteCandidates.map((c) => c.id);
    if (syncId) {
      for (const c of deleteCandidates) {
        logEntries.push({
          syncId,
          entityType: 'class',
          entityId: c.id,
          classId: c.id,
          label: c.name,
          changeType: 'removed',
          detail: 'No longer in PowerSchool',
        });
      }
    }
    if (toDeleteIds.length > 0) {
      await sql`DELETE FROM classes WHERE id = ANY(${toDeleteIds}) AND user_id = ${userId}`;
    }
    return { added, updated, removed: toDeleteIds.length, idMap, logEntries };
  }

  // Classroom (and future sources)
  for (const cls of incoming) {
    if (!cls.sourceId) {
      await sql`
        INSERT INTO classes (id, user_id, name, teacher, room, color, period, start_time, end_time, days, day_times, semester, source, source_id, grade, grade_percent, category_weights, weight_source)
        VALUES (
          ${cls.id}, ${userId}, ${cls.name}, ${cls.teacher}, ${cls.room}, ${cls.color}, ${cls.period},
          ${cls.startTime}, ${cls.endTime}, ${JSON.stringify(cls.days)}::jsonb,
          ${cls.dayTimes ? JSON.stringify(cls.dayTimes) : null}::jsonb,
          ${cls.semester}, ${source}, ${null},
          ${cls.grade ?? null}, ${cls.gradePercent ?? null},
          ${cls.categoryWeights ? JSON.stringify(cls.categoryWeights) : null}::jsonb,
          ${cls.weightSource ?? null}
        )
      `;
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

      await sql`
        UPDATE classes SET
          name = ${merged.name}, teacher = ${merged.teacher}, room = ${merged.room},
          color = ${merged.color}, period = ${merged.period},
          start_time = ${merged.startTime}, end_time = ${merged.endTime},
          days = ${JSON.stringify(merged.days)}::jsonb,
          day_times = ${merged.dayTimes ? JSON.stringify(merged.dayTimes) : null}::jsonb,
          semester = ${merged.semester}, source = ${merged.source ?? null},
          source_id = ${merged.sourceId ?? null}, grade = ${merged.grade ?? null},
          grade_percent = ${merged.gradePercent ?? null},
          category_weights = ${merged.categoryWeights ? JSON.stringify(merged.categoryWeights) : null}::jsonb,
          weight_source = ${merged.weightSource ?? null}
        WHERE id = ${merged.id} AND user_id = ${userId}
      `;
      idMap.set(cls.id, prior.id);
      keptIds.add(prior.id);
      updated++;
    } else {
      await sql`
        INSERT INTO classes (id, user_id, name, teacher, room, color, period, start_time, end_time, days, day_times, semester, source, source_id, grade, grade_percent, category_weights, weight_source)
        VALUES (
          ${cls.id}, ${userId}, ${cls.name}, ${cls.teacher}, ${cls.room}, ${cls.color}, ${cls.period},
          ${cls.startTime}, ${cls.endTime}, ${JSON.stringify(cls.days)}::jsonb,
          ${cls.dayTimes ? JSON.stringify(cls.dayTimes) : null}::jsonb,
          ${cls.semester}, ${source}, ${cls.sourceId ?? null},
          ${cls.grade ?? null}, ${cls.gradePercent ?? null},
          ${cls.categoryWeights ? JSON.stringify(cls.categoryWeights) : null}::jsonb,
          ${cls.weightSource ?? null}
        )
      `;
      idMap.set(cls.id, cls.id);
      added++;
    }
  }

  const toDelete = fromSource.filter((c) => !keptIds.has(c.id)).map((c) => c.id);
  if (toDelete.length > 0) {
    await sql`DELETE FROM classes WHERE id = ANY(${toDelete}) AND user_id = ${userId}`;
  }
  return { added, updated, removed: toDelete.length, idMap, logEntries };
}

export async function syncHomeworkFromSource(
  source: 'powerschool' | 'classroom',
  incoming: Homework[],
  userId: string,
  syncId: string = '',
): Promise<{ added: number; updated: number; removed: number; logEntries: Omit<SyncLogEntry, 'id' | 'occurredAt'>[] }> {
  const sql = getDb();
  const logEntries: Omit<SyncLogEntry, 'id' | 'occurredAt'>[] = [];

  // Scope to only class IDs in the incoming batch — avoids deleting prior-semester homework.
  const incomingClassIds = [...new Set(incoming.map((h) => h.classId))];
  const existingRows = incomingClassIds.length > 0
    ? await sql`SELECT * FROM homework WHERE source = ${source} AND user_id = ${userId} AND class_id = ANY(${incomingClassIds})`
    : await sql`SELECT * FROM homework WHERE source = ${source} AND user_id = ${userId}`;
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
      await sql`
        INSERT INTO homework (id, user_id, class_id, title, description, due_date, completed, priority, source, source_id, score, category, flags, score_percent)
        VALUES (
          ${hw.id}, ${userId}, ${hw.classId}, ${hw.title}, ${hw.description}, ${hw.dueDate},
          ${hw.completed}, ${hw.priority}, ${source}, ${null},
          ${hw.score ?? null}, ${hw.category ?? null}, ${hw.flags ?? null}, ${hw.scorePercent ?? null}
        )
      `;
      added++;
      continue;
    }

    const prior = bySourceId.get(hw.sourceId);
    if (prior) {
      const merged: Homework = {
        ...prior,
        ...hw,
        id: prior.id,
        completed: prior.completed,
        priority: prior.priority,
        source,
      };

      if (syncId) {
        if ((prior.scorePercent ?? null) !== (hw.scorePercent ?? null)) {
          logEntries.push({
            syncId,
            entityType: 'homework',
            entityId: merged.id,
            classId: merged.classId,
            label: merged.title,
            changeType: 'score_changed',
            detail: `${prior.scorePercent !== undefined ? prior.scorePercent + '%' : prior.score ?? '—'} → ${hw.scorePercent !== undefined ? hw.scorePercent + '%' : hw.score ?? '—'}`,
          });
        } else if ((prior.flags ?? '') !== (hw.flags ?? '')) {
          logEntries.push({
            syncId,
            entityType: 'homework',
            entityId: merged.id,
            classId: merged.classId,
            label: merged.title,
            changeType: 'flag_changed',
            detail: `${prior.flags || '(none)'} → ${hw.flags || '(none)'}`,
          });
        }
      }

      await sql`
        UPDATE homework SET
          class_id = ${merged.classId}, title = ${merged.title},
          description = ${merged.description}, due_date = ${merged.dueDate},
          completed = ${merged.completed}, priority = ${merged.priority},
          source = ${merged.source}, source_id = ${merged.sourceId ?? null},
          score = ${merged.score ?? null}, category = ${merged.category ?? null},
          flags = ${merged.flags ?? null}, score_percent = ${merged.scorePercent ?? null}
        WHERE id = ${merged.id} AND user_id = ${userId}
      `;
      keptIds.add(prior.id);
      updated++;
    } else {
      await sql`
        INSERT INTO homework (id, user_id, class_id, title, description, due_date, completed, priority, source, source_id, score, category, flags, score_percent)
        VALUES (
          ${hw.id}, ${userId}, ${hw.classId}, ${hw.title}, ${hw.description}, ${hw.dueDate},
          ${hw.completed}, ${hw.priority}, ${source}, ${hw.sourceId ?? null},
          ${hw.score ?? null}, ${hw.category ?? null}, ${hw.flags ?? null}, ${hw.scorePercent ?? null}
        )
      `;
      if (syncId) {
        logEntries.push({
          syncId,
          entityType: 'homework',
          entityId: hw.id,
          classId: hw.classId,
          label: hw.title,
          changeType: 'added',
          detail: hw.score ? `Score: ${hw.score}` : hw.dueDate,
        });
      }
      added++;
    }
  }

  const toDelete = existing.filter((hw) => !keptIds.has(hw.id)).map((hw) => hw.id);
  if (toDelete.length > 0) {
    await sql`DELETE FROM homework WHERE id = ANY(${toDelete}) AND user_id = ${userId}`;
  }
  return { added, updated, removed: toDelete.length, logEntries };
}
