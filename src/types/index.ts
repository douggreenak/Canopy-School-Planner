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
}

export interface Homework {
  id: string;
  classId: string;
  title: string;
  description: string;
  dueDate: string;   // ISO date
  completed: boolean;
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
  entityType: 'class' | 'homework';
  entityId: string;
  classId?: string;
  label: string;
  changeType: 'added' | 'removed' | 'score_changed' | 'grade_changed' | 'flag_changed';
  detail: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  category: string;
  // Optional link to a SchoolClass — set by the Quick Add Homework feature
  // and the Class dropdown on the Add/Edit Task form. Older tasks predate
  // this column and will simply have undefined here.
  classId?: string;
}

export interface ScheduleDisruption {
  id: string;
  date: string;          // ISO date
  type: 'early_out' | 'late_start' | 'no_school' | 'assembly' | 'custom';
  label: string;
  periodOverrides: PeriodOverride[];
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
  semesterStart: string;
  semesterEnd: string;
  defaultSchedule: 'A/B' | 'daily' | 'weekly';
  calendarToken: string;
  powerschoolUrl: string;
  powerschoolUsername: string;
  classroomEnabled: boolean;
  theme: 'light' | 'dark';
  lunchTimes?: Record<number, { startTime: string; endTime: string }>;
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
