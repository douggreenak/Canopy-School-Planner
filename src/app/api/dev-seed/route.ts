// ============================================================
// TEMPORARY dev-only seed route — populates realistic demo data for the
// logged-in user so the app can be manually verified against something
// resembling a real student's data. NOT a product feature: gated behind
// NODE_ENV !== 'production' and deleted again before this branch ships.
// Idempotent — clears this user's existing data first, so it can be re-run
// freely while iterating.
// ============================================================
import { NextRequest } from 'next/server';
import { v4 as uuid } from 'uuid';
import dayjs from 'dayjs';
import {
  initializeDatabase,
  getClasses,
  getHomework,
  getExams,
  getTasks,
  getDisruptions,
  deleteClass,
  deleteHomework,
  deleteExam,
  deleteTask,
  deleteDisruption,
  addClass,
  addHomework,
  addExam,
  addTask,
  addDisruption,
  setSetting,
  addGradeHistoryEntries,
} from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';
import type { SchoolClass, Homework, Exam, Task, ScheduleDisruption } from '@/types';

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'Not available in production' }, { status: 404 });
  }
  const userId = await getSessionUserId(request);
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  await initializeDatabase();

  // Clear this user's existing data so the route can be re-run freely.
  const [prevClasses, prevHomework, prevExams, prevTasks, prevDisruptions] = await Promise.all([
    getClasses(userId), getHomework(userId), getExams(userId), getTasks(userId), getDisruptions(userId),
  ]);
  await Promise.all([
    ...prevClasses.map((c) => deleteClass(c.id, userId)),
    ...prevHomework.map((h) => deleteHomework(h.id, userId)),
    ...prevExams.map((e) => deleteExam(e.id, userId)),
    ...prevTasks.map((t) => deleteTask(t.id, userId)),
    ...prevDisruptions.map((d) => deleteDisruption(d.id, userId)),
  ]);

  const today = dayjs();
  const semester = 'Fall 2026';

  // source: 'powerschool' (with a fake sourceId) so these show up on the
  // Grades page exactly like a real synced class would — the Grades page
  // only ever shows source==='powerschool' classes. Deliberately DO NOT set
  // isAp here for the AP-named classes — the point of this seed data is to
  // exercise the real detectApFromName() fallback in addClass() end-to-end,
  // the same way a fresh PowerSchool sync would.
  const classDefs: Array<Omit<SchoolClass, 'id' | 'semester' | 'days' | 'startTime' | 'endTime'>> = [
    { name: 'AP Chemistry', teacher: 'Ms. Rivera', room: '214', color: '#4285F4', period: 1, source: 'powerschool', sourceId: 'ps-1', grade: 'A-', gradePercent: 91, categoryWeights: { Tests: 50, Homework: 30, Quizzes: 20 }, weightSource: 'scraped' },
    { name: 'AP Calculus AB', teacher: 'Mr. Chen', room: '118', color: '#EA4335', period: 2, source: 'powerschool', sourceId: 'ps-2', grade: 'B+', gradePercent: 88, categoryWeights: { Tests: 60, Homework: 40 }, weightSource: 'scraped' },
    { name: 'English 11', teacher: 'Ms. Patel', room: '302', color: '#34A853', period: 3, source: 'powerschool', sourceId: 'ps-3', grade: 'A', gradePercent: 95, categoryWeights: { Tests: 40, Homework: 30, Quizzes: 30 }, weightSource: 'scraped' },
    { name: 'US History AP', teacher: 'Mr. Alvarez', room: '210', color: '#FF6D01', period: 4, source: 'powerschool', sourceId: 'ps-4', grade: 'B', gradePercent: 84, categoryWeights: { Tests: 50, Homework: 50 }, weightSource: 'scraped' },
    { name: 'Spanish III', teacher: 'Sra. Lopez', room: '145', color: '#A142F4', period: 5, source: 'powerschool', sourceId: 'ps-5', grade: 'A+', gradePercent: 97, categoryWeights: { Tests: 40, Homework: 30, Quizzes: 30 }, weightSource: 'scraped' },
    { name: 'AP Physics 1', teacher: 'Dr. Kim', room: '220', color: '#24C1E0', period: 6, source: 'powerschool', sourceId: 'ps-6', grade: 'C+', gradePercent: 79, categoryWeights: { Tests: 60, Homework: 40 }, weightSource: 'scraped' },
    { name: 'Study Hall', teacher: 'TBD', room: '101', color: '#9E9E9E', period: 7, source: 'manual' },
  ];

  const classes: SchoolClass[] = classDefs.map((c) => ({
    ...c,
    id: uuid(),
    semester,
    days: [1, 2, 3, 4, 5],
    startTime: '08:00',
    endTime: '08:50',
  }));

  for (const c of classes) {
    await addClass(c, userId);
  }

  // grade_history: two snapshots per graded class (a week ago + today) so
  // velocity chips and the transcript page both have something to show.
  const gradedClasses = classes.filter((c) => c.gradePercent != null);
  await addGradeHistoryEntries(
    userId,
    gradedClasses.map((c) => ({
      classId: c.id,
      gradePercent: (c.gradePercent ?? 0) - 2.3,
      letter: c.grade,
      semester,
    })),
  );
  await addGradeHistoryEntries(
    userId,
    gradedClasses.map((c) => ({
      classId: c.id,
      gradePercent: c.gradePercent,
      letter: c.grade,
      semester,
    })),
  );

  const categories = ['Homework', 'Tests', 'Quizzes'];
  const homeworkItems: Homework[] = [];
  gradedClasses.forEach((c, ci) => {
    for (let i = 0; i < 4; i++) {
      const due = today.add(i - 1, 'day').format('YYYY-MM-DD');
      const missing = i === 2;
      homeworkItems.push({
        id: uuid(),
        classId: c.id,
        title: `${['Reading Response', 'Problem Set', 'Lab Report', 'Vocab Quiz', 'Essay Draft'][(ci + i) % 5]} ${i + 1}`,
        description: '',
        dueDate: due,
        completed: i === 0,
        dueTiming: i % 2 === 0 ? 'in_class' : undefined,
        priority: (['low', 'medium', 'high'] as const)[i % 3],
        source: 'powerschool',
        sourceId: `ps-hw-${c.sourceId}-${i}`,
        category: categories[i % categories.length],
        scorePercent: !missing && i !== 3 ? 82 + ci * 2 + i : undefined,
        score: !missing && i !== 3 ? `${82 + ci * 2 + i}%` : undefined,
        flags: missing ? 'Missing' : undefined,
      });
    }
  });
  for (const h of homeworkItems) await addHomework(h, userId);

  // A few plain manual/personal homework items too (not PowerSchool-sourced).
  const manualHomework: Homework[] = [
    { id: uuid(), classId: classes[6].id, title: 'Read Ch. 4', description: '', dueDate: today.add(1, 'day').format('YYYY-MM-DD'), completed: false, priority: 'low', source: 'manual', category: 'Reading' },
  ];
  for (const h of manualHomework) await addHomework(h, userId);

  const exams: Exam[] = gradedClasses.slice(0, 4).map((c, i) => ({
    id: uuid(),
    classId: c.id,
    title: `${c.name} — Unit ${i + 2} Exam`,
    date: today.add(3 + i * 4, 'day').format('YYYY-MM-DD'),
    startTime: '09:00',
    endTime: '10:00',
    location: `Room ${c.room}`,
    notes: '',
    weightPercent: 20,
  }));
  for (const e of exams) await addExam(e, userId);

  // Plain tasks (no classId) — some with dueTiming unset on purpose to show
  // today's "unset by default" behavior (Phase 8 will change the default).
  const tasks: Task[] = [
    { id: uuid(), title: 'Pack gym bag', description: '', dueDate: today.format('YYYY-MM-DD'), completed: false, priority: 'low', category: 'General' },
    { id: uuid(), title: 'Renew library book', description: '', dueDate: today.add(2, 'day').format('YYYY-MM-DD'), completed: false, priority: 'medium', category: 'General' },
    { id: uuid(), title: 'College app essay draft', description: '', dueDate: today.add(5, 'day').format('YYYY-MM-DD'), completed: false, priority: 'high', category: 'College' },
  ];
  for (const t of tasks) await addTask(t, userId);

  const disruptions: ScheduleDisruption[] = [
    { id: uuid(), date: today.add(1, 'day').format('YYYY-MM-DD'), type: 'early_out', label: 'Early Out — Staff PD', periodOverrides: [] },
    { id: uuid(), date: today.add(4, 'day').format('YYYY-MM-DD'), type: 'no_school', label: 'No School — Holiday', periodOverrides: [] },
    { id: uuid(), date: today.add(7, 'day').format('YYYY-MM-DD'), type: 'assembly', label: 'Fall Assembly', periodOverrides: [] },
    { id: uuid(), date: today.add(9, 'day').format('YYYY-MM-DD'), type: 'late_start', label: 'Late Start — Weather', periodOverrides: [] },
    { id: uuid(), date: today.add(11, 'day').format('YYYY-MM-DD'), type: '1_6', label: '1-6 Schedule', periodOverrides: [] },
  ];
  for (const d of disruptions) await addDisruption(d, userId);

  await setSetting('schoolName', 'Lathrop High School', userId);
  await setSetting('semesterStart', today.subtract(3, 'week').format('YYYY-MM-DD'), userId);
  await setSetting('semesterEnd', today.add(4, 'month').format('YYYY-MM-DD'), userId);
  await setSetting('timezone', 'America/Anchorage', userId);

  return Response.json({
    success: true,
    cleared: { classes: prevClasses.length, homework: prevHomework.length, exams: prevExams.length, tasks: prevTasks.length, disruptions: prevDisruptions.length },
    seeded: { classes: classes.length, homework: homeworkItems.length + manualHomework.length, exams: exams.length, tasks: tasks.length, disruptions: disruptions.length },
  });
}
