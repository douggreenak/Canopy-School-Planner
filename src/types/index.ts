// ============================================================
// School Planner – Core Type Definitions
// ============================================================

export interface SchoolClass {
  id: string;
  name: string;
  teacher: string;
  room: string;
  color: string;
  period: number;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  days: number[];    // 0=Sun … 6=Sat
  // Optional per-day override times. Key is weekday number (0=Sun..6=Sat).
  // When present the calendar and views should prefer these times for the
  // corresponding weekday; missing days fall back to `startTime`/`endTime`.
  dayTimes?: Record<number, { startTime: string; endTime: string }>;
  semester: string;
  // --- PowerSchool / Classroom sync fields (optional) ---
  source?: 'manual' | 'powerschool' | 'classroom';
  sourceId?: string;    // stable external ID (e.g. PowerSchool `frn`)
  grade?: string;        // letter grade, e.g. "A-", "B+"
  gradePercent?: number; // 0-100
  // Assignment category weights, e.g. { "Tests": 40, "Homework": 20 }.
  // 'manual' means the user has edited these via the UI — once set, sync
  // never overwrites them again (see syncClassesFromSource in db.ts).
  categoryWeights?: Record<string, number>;
  weightSource?: 'scraped' | 'manual';
  // True = this is an AP class — its grade counts as weighted (+1.0 on the
  // 4.0 scale, standard AP weighting) in the weighted-GPA calculation on the
  // Transcript page, distinct from the always-shown unweighted GPA.
  isAp?: boolean;
}

// One step in a completion pipeline (e.g. "Done" -> "Turned In"). Each
// Task/Homework carries its own `stages` array — this is per-assignment,
// not a site-wide setting, so different items can define completely
// different pipelines (or none, for a plain checkbox). `id` is stable
// across renames/reorders so that item's `stageId` never dangles.
export interface TaskStage {
  id: string;
  label: string;
}

// Whether an item is due during class ("in_class") or after class / can be
// done online ("after_class"). Per-item, optional — undefined = unset,
// matching the same "classic behavior when absent" convention as `stages`.
export type DueTiming = 'in_class' | 'after_class';

export interface Homework {
  id: string;
  classId: string;
  title: string;
  description: string;
  dueDate: string;   // ISO date
  completed: boolean;
  // This item's own completion pipeline. Empty/undefined = plain checkbox.
  stages?: TaskStage[];
  // Current step in `stages`, when this item has any. undefined = not
  // started yet. Whenever this is set/cleared, `completed` is kept in sync
  // (true iff stageId is `stages`' last entry) so every existing "done"
  // filter/count keeps working without change.
  stageId?: string;
  // Due in class vs. after class/online. undefined = not set.
  dueTiming?: DueTiming;
  priority: 'low' | 'medium' | 'high';
  source: 'manual' | 'powerschool' | 'classroom';
  sourceId?: string;
  score?: string;     // raw score text, e.g. "18/20", "95%", "B"
  // Percent captured directly from PowerSchool's "%" column. The raw score
  // string ("18/20" or just "18") can't always be parsed client-side into a
  // percent — bare point values have no denominator. When PowerSchool shows
  // a % column, we stash it here so the UI's percent display is reliable.
  scorePercent?: number; // 0-100
  category?: string;  // assignment category, e.g. "Homework", "Test", "Quiz"
  flags?: string;     // PowerSchool flag column, e.g. "Late", "Missing", "Collected"
  // A teacher's comment on this specific graded assignment. PowerSchool
  // renders it as extra text trailing the score in the same cell (no
  // separate column) — split out during scraping (see
  // splitScoreAndNote/scrapeAssignmentsFromPage in powerschool.ts) so it can
  // be shown as its own, visually distinct note instead of glued onto the score.
  teacherNote?: string;
}

export interface Exam {
  id: string;
  classId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  // Manual-only: how much this exam counts toward the class grade (0-100).
  // No reliable way to scrape a single exam's weight from PowerSchool.
  weightPercent?: number;
}

// One row per class captured on every PowerSchool sync — powers grade
// velocity alerts and cross-semester GPA projection.
export interface GradeHistoryEntry {
  id: string;
  classId: string;
  gradePercent?: number;
  letter?: string;
  semester: string;
  capturedAt: string;
}

// One row per detected change on a sync (added/removed/score changed/etc.)
// — powers the PowerSchool change log and category-weight transparency.
export interface SyncLogEntry {
  id: string;
  syncId: string;
  occurredAt: string;
  // 'sync' is the synthetic whole-sync entry written when a completed sync
  // found zero class/homework diffs — see runPowerSchoolSyncInner in
  // powerschoolSync.ts. Every real sync writes at least one log entry now,
  // so "no rows for this sync" always means the sync never ran/completed.
  entityType: 'class' | 'homework' | 'sync';
  entityId: string;
  classId?: string;
  label: string;
  changeType: 'added' | 'removed' | 'score_changed' | 'grade_changed' | 'flag_changed' | 'none';
  detail: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  completed: boolean;
  // This task's own completion pipeline and current step — see Homework.stages/stageId.
  stages?: TaskStage[];
  stageId?: string;
  // Due in class vs. after class/online. undefined = not set.
  dueTiming?: DueTiming;
  priority: 'low' | 'medium' | 'high';
  category: string;
  // Optional link to a SchoolClass — set by the Quick Add Homework feature
  // and the Class dropdown on the Add/Edit Task form. Older tasks predate
  // this column and will simply have undefined here.
  classId?: string;
}

export interface ScheduleDisruption {
  id: string;
  date: string;          // ISO date — start date (inclusive)
  // ISO date — end date (inclusive). Omitted/equal to `date` means a
  // single-day disruption. When set, the disruption applies to every day
  // in [date, endDate].
  endDate?: string;
  type: 'early_out' | 'late_start' | 'no_school' | 'assembly' | '1_6' | 'day_swap' | 'custom';
  // May be '' — an unnamed disruption falls back to displaying its type's
  // label everywhere it's shown (see DISRUPTION_TYPES).
  label: string;
  periodOverrides: PeriodOverride[];
  // Only meaningful when type === 'day_swap' — the weekday (0=Sun..6=Sat)
  // whose normal class list/times should run on this date instead of the
  // date's own weekday. E.g. running a Thursday (4) schedule on a Monday.
  sourceDayOfWeek?: number;
}

export interface PeriodOverride {
  period: number;
  startTime: string;
  endTime: string;
  cancelled: boolean;
}

export interface AppSettings {
  schoolName: string;
  spreadsheetId: string;
  defaultSchedule: 'A/B' | 'daily' | 'weekly';
  calendarToken: string;
  powerschoolUrl: string;
  powerschoolUsername: string;
  classroomEnabled: boolean;
  theme: 'light' | 'dark';
  lunchTimes?: Record<number, { startTime: string; endTime: string }>;
  lathropMode?: boolean | string;
  early_out_schedule?: Record<number, { startTime: string; endTime: string }> | string;
  themeMode?: 'light' | 'dark' | 'system';
  accentColor?: string;
  timezone?: string;
  lastSyncAt?: string;
  // Scheduled automatic PowerSchool sync.
  powerschoolAutoSync?: { enabled: boolean };
}

export interface DaySchedule {
  date: string;
  classes: ScheduleEntry[];
  disruption?: ScheduleDisruption;
}

export interface ScheduleEntry {
  classInfo: SchoolClass;
  startTime: string;
  endTime: string;
  cancelled: boolean;
}

export type SheetName =
  | 'Classes'
  | 'Homework'
  | 'Exams'
  | 'Tasks'
  | 'Disruptions'
  | 'Settings';
