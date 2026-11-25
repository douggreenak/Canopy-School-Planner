// ============================================================
// Shared service layer for the public REST API (/api/v1) and the MCP server.
//
// Every function takes the authenticated userId and passes it to the
// user-scoped db.ts helpers — nothing here can address another user's rows.
// Output goes through explicit allowlist serializers: new DB columns (or
// anything credential-like) are NOT exposed until deliberately added here.
// Settings, PowerSchool credentials, sync logs, sessions and tokens are never
// reachable through this layer.
// ============================================================
import { v4 as uuid } from 'uuid';
import {
  getClasses, getClassById, getHomework, updateHomework, getExams, getTasks,
  addTask, updateTask, deleteTask, getGradeHistory, getSettings,
} from './db';
import { completedForStage, stageIndex } from './stages';
import type { SchoolClass, Homework, Task, Exam, GradeHistoryEntry, TaskStage } from '@/types';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITIES = ['low', 'medium', 'high'] as const;
const MAX_LIMIT = 500;

// ---- serializers ----
export const serializeClass = (c: SchoolClass) => ({
  id: c.id, name: c.name, teacher: c.teacher, room: c.room, period: c.period,
  startTime: c.startTime, endTime: c.endTime, days: c.days, semester: c.semester,
  grade: c.grade ?? null, gradePercent: c.gradePercent ?? null,
  categoryWeights: c.categoryWeights ?? null, isAp: !!c.isAp, schoolName: c.schoolName ?? null,
});

export const serializeAssignment = (h: Homework, className?: string) => ({
  id: h.id, classId: h.classId, className: className ?? null, title: h.title,
  description: h.description, dueDate: h.dueDate, completed: h.completed,
  priority: h.priority, dueTiming: h.dueTiming ?? null, category: h.category ?? null,
  score: h.score ?? null, scorePercent: h.scorePercent ?? null, flags: h.flags ?? null,
  teacherNote: h.teacherNote ?? null, source: h.source,
  stages: h.stages ?? [], stageId: h.stageId ?? null,
});

export const serializeTask = (t: Task) => ({
  id: t.id, title: t.title, description: t.description, dueDate: t.dueDate,
  completed: t.completed, priority: t.priority, category: t.category,
  classId: t.classId ?? null, dueTiming: t.dueTiming ?? null,
  stages: t.stages ?? [], stageId: t.stageId ?? null,
});

export const serializeExam = (e: Exam) => ({
  id: e.id, classId: e.classId, title: e.title, date: e.date, startTime: e.startTime,
  endTime: e.endTime, location: e.location, notes: e.notes, weightPercent: e.weightPercent ?? null,
});

export const serializeGrade = (g: GradeHistoryEntry) => ({
  classId: g.classId, gradePercent: g.gradePercent ?? null, letter: g.letter ?? null,
  semester: g.semester, capturedAt: g.capturedAt,
});

// ---- helpers ----
const day = (s: string) => (s || '').slice(0, 10);

function checkDate(v: unknown, field: string): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string' || !DATE_RE.test(v)) throw new ApiError(400, `${field} must be YYYY-MM-DD.`);
  return v;
}

function clampLimit(v: unknown, def = 100): number {
  const n = Number(v ?? def);
  if (!Number.isInteger(n) || n < 1) throw new ApiError(400, 'limit must be a positive integer.');
  return Math.min(n, MAX_LIMIT);
}

/** Today's date (YYYY-MM-DD) in the user's own timezone setting. */
export async function todayFor(userId: string): Promise<string> {
  const tz = (await getSettings(userId)).timezone || 'America/New_York';
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Keeps `completed` in lock-step with the item's stage pipeline (see Homework.stageId). */
function withCompleted<T extends Homework | Task>(item: T, completed: boolean): T {
  const stages = item.stages ?? [];
  return {
    ...item,
    completed,
    stageId: stages.length ? (completed ? stages[stages.length - 1].id : undefined) : item.stageId,
  };
}

// ---- reads ----
export async function listClasses(userId: string) {
  return (await getClasses(userId)).map(serializeClass);
}

export async function listAssignments(userId: string, f: {
  classId?: unknown; completed?: unknown; from?: unknown; to?: unknown; limit?: unknown;
}) {
  const from = checkDate(f.from, 'from');
  const to = checkDate(f.to, 'to');
  const limit = clampLimit(f.limit);
  const completed = f.completed === undefined || f.completed === '' ? undefined
    : f.completed === true || f.completed === 'true' ? true
    : f.completed === false || f.completed === 'false' ? false : (() => { throw new ApiError(400, 'completed must be true or false.'); })();
  const names = new Map((await getClasses(userId)).map((c) => [c.id, c.name]));
  return (await getHomework(userId))
    .filter((h) => (!f.classId || h.classId === f.classId)
      && (completed === undefined || h.completed === completed)
      && (!from || day(h.dueDate) >= from) && (!to || day(h.dueDate) <= to))
    .slice(0, limit)
    .map((h) => serializeAssignment(h, names.get(h.classId)));
}

export async function listTasks(userId: string, f: { completed?: unknown; limit?: unknown }) {
  const limit = clampLimit(f.limit);
  const completed = f.completed === undefined || f.completed === '' ? undefined : f.completed === true || f.completed === 'true';
  return (await getTasks(userId))
    .filter((t) => completed === undefined || t.completed === completed)
    .slice(0, limit).map(serializeTask);
}

export async function listExams(userId: string, f: { from?: unknown; to?: unknown }) {
  const from = checkDate(f.from, 'from');
  const to = checkDate(f.to, 'to');
  return (await getExams(userId))
    .filter((e) => (!from || day(e.date) >= from) && (!to || day(e.date) <= to))
    .map(serializeExam);
}

export async function listGradeHistory(userId: string, f: { classId?: unknown; limit?: unknown }) {
  const classId = typeof f.classId === 'string' && f.classId ? f.classId : undefined;
  return (await getGradeHistory(userId, classId)).slice(0, clampLimit(f.limit, 200)).map(serializeGrade);
}

/** Everything due in the next N days (and anything overdue + incomplete), across homework, tasks and exams. */
export async function getUpcoming(userId: string, daysAhead: unknown = 7) {
  const n = Number(daysAhead);
  if (!Number.isInteger(n) || n < 0 || n > 90) throw new ApiError(400, 'days must be an integer 0–90.');
  const today = await todayFor(userId);
  const end = addDays(today, n);
  const [hw, tasks, exams, classes] = await Promise.all([
    getHomework(userId), getTasks(userId), getExams(userId), getClasses(userId),
  ]);
  const names = new Map(classes.map((c) => [c.id, c.name]));
  const byDue = <T extends { dueDate: string }>(a: T, b: T) => a.dueDate.localeCompare(b.dueDate);
  return {
    today,
    through: end,
    overdue: {
      assignments: hw.filter((h) => !h.completed && day(h.dueDate) && day(h.dueDate) < today).sort(byDue).map((h) => serializeAssignment(h, names.get(h.classId))),
      tasks: tasks.filter((t) => !t.completed && day(t.dueDate) && day(t.dueDate) < today).sort(byDue).map(serializeTask),
    },
    assignments: hw.filter((h) => !h.completed && day(h.dueDate) >= today && day(h.dueDate) <= end).sort(byDue).map((h) => serializeAssignment(h, names.get(h.classId))),
    tasks: tasks.filter((t) => !t.completed && day(t.dueDate) >= today && day(t.dueDate) <= end).sort(byDue).map(serializeTask),
    exams: exams.filter((e) => day(e.date) >= today && day(e.date) <= end).map(serializeExam),
  };
}

// ---- writes (require a write-scope token) ----
export interface TaskInput {
  title?: unknown; description?: unknown; dueDate?: unknown; priority?: unknown;
  category?: unknown; classId?: unknown; completed?: unknown;
  stages?: unknown; stageId?: unknown;
}

const MAX_STAGES = 12;

/** Validates a stage pipeline: [{id,label}], 1..12 unique ids, short labels. [] clears it. */
function checkStages(v: unknown): TaskStage[] {
  if (!Array.isArray(v) || v.length > MAX_STAGES) throw new ApiError(400, `stages must be an array of at most ${MAX_STAGES} {id,label} objects.`);
  const seen = new Set<string>();
  return v.map((s) => {
    const id = (s as TaskStage)?.id, label = (s as TaskStage)?.label;
    if (typeof id !== 'string' || !id || id.length > 100 || typeof label !== 'string' || !label.trim() || label.length > 100) {
      throw new ApiError(400, 'each stage needs a string id and a label (max 100 chars).');
    }
    if (seen.has(id)) throw new ApiError(400, 'stage ids must be unique.');
    seen.add(id);
    return { id, label: label.trim() };
  });
}

async function validateTaskFields(userId: string, i: TaskInput, partial: boolean) {
  const out: Partial<Task> = {};
  if (i.title !== undefined || !partial) {
    if (typeof i.title !== 'string' || !i.title.trim() || i.title.length > 1000) throw new ApiError(400, 'title is required (max 1000 chars).');
    out.title = i.title.trim();
  }
  if (i.description !== undefined) {
    if (typeof i.description !== 'string' || i.description.length > 5000) throw new ApiError(400, 'description must be a string (max 5000 chars).');
    out.description = i.description;
  }
  if (i.dueDate !== undefined) {
    if (typeof i.dueDate !== 'string' || (i.dueDate !== '' && !DATE_RE.test(i.dueDate))) throw new ApiError(400, 'dueDate must be YYYY-MM-DD.');
    out.dueDate = i.dueDate;
  }
  if (i.priority !== undefined) {
    if (!PRIORITIES.includes(i.priority as never)) throw new ApiError(400, 'priority must be low, medium or high.');
    out.priority = i.priority as Task['priority'];
  }
  if (i.category !== undefined) {
    if (typeof i.category !== 'string' || i.category.length > 100) throw new ApiError(400, 'category must be a string (max 100 chars).');
    out.category = i.category;
  }
  if (i.completed !== undefined) {
    if (typeof i.completed !== 'boolean') throw new ApiError(400, 'completed must be a boolean.');
    out.completed = i.completed;
  }
  if (i.stages !== undefined) out.stages = checkStages(i.stages);
  if (i.stageId !== undefined) {
    if (i.stageId !== null && i.stageId !== '' && typeof i.stageId !== 'string') throw new ApiError(400, 'stageId must be a string or null.');
    out.stageId = i.stageId || undefined;
  }
  if (i.classId !== undefined && i.classId !== null && i.classId !== '') {
    // A class id from the caller is only accepted if it is one of THEIR classes.
    if (typeof i.classId !== 'string' || !(await getClassById(i.classId, userId))) throw new ApiError(400, 'classId does not match one of your classes.');
    out.classId = i.classId;
  }
  return out;
}

/**
 * Applies stages/stageId from validated input onto `task`, keeping `completed`
 * derived from the stage (true iff stageId is the last stage). An explicit
 * `completed` without a stageId is handled by withCompleted instead.
 */
export function applyStages(task: Task, f: Partial<Task>): void {
  if ('stages' in f && f.stages !== undefined) {
    task.stages = f.stages.length ? f.stages : undefined;
    if (!task.stages || stageIndex(task.stages, task.stageId) === -1) task.stageId = undefined;
  }
  if ('stageId' in f) {
    const stages = task.stages ?? [];
    if (f.stageId && stageIndex(stages, f.stageId) === -1) throw new ApiError(400, 'stageId is not one of the task\'s stages.');
    task.stageId = f.stageId || undefined;
  }
  if (('stages' in f || 'stageId' in f) && task.stages?.length) {
    task.completed = completedForStage(task.stages, task.stageId);
  }
}

export async function createTask(userId: string, input: TaskInput) {
  const f = await validateTaskFields(userId, input, false);
  const task: Task = {
    id: uuid(), title: f.title!, description: f.description ?? '', dueDate: f.dueDate ?? '',
    completed: f.completed ?? false, priority: f.priority ?? 'medium',
    category: f.category ?? 'General', classId: f.classId,
  };
  applyStages(task, f);
  await addTask(task, userId);
  return serializeTask(task);
}

async function findTask(userId: string, id: string): Promise<Task> {
  const t = (await getTasks(userId)).find((x) => x.id === id);
  if (!t) throw new ApiError(404, 'Task not found.');
  return t;
}

export async function patchTask(userId: string, id: string, input: TaskInput) {
  const existing = await findTask(userId, id);
  const f = await validateTaskFields(userId, input, true);
  let next: Task = { ...existing, ...f };
  if ('stages' in f || 'stageId' in f) {
    next.stages = existing.stages; next.stageId = existing.stageId;
    applyStages(next, f);
  } else if (f.completed !== undefined) next = withCompleted(next, f.completed);
  await updateTask(next, userId);
  return serializeTask(next);
}

export async function removeTask(userId: string, id: string) {
  await findTask(userId, id);
  await deleteTask(id, userId);
}

/** Mark an assignment (homework) done / not done. The only assignment write exposed — content is sync-managed. */
export async function setAssignmentCompleted(userId: string, id: string, completed: unknown) {
  if (typeof completed !== 'boolean') throw new ApiError(400, 'completed must be a boolean.');
  const h = (await getHomework(userId)).find((x) => x.id === id);
  if (!h) throw new ApiError(404, 'Assignment not found.');
  const next = withCompleted(h, completed);
  await updateHomework(next, userId);
  return serializeAssignment(next);
}
