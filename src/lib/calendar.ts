// ============================================================
// iCal Calendar Feed Generator
// ============================================================
import ical, { ICalCalendarMethod, ICalWeekday, ICalEventRepeatingFreq } from 'ical-generator';
import dayjs from 'dayjs';
import type { SchoolClass, Exam, Homework, ScheduleDisruption, DaySchedule, ScheduleEntry } from '@/types';
import { parseMinutes } from './calendarMetrics';

/**
 * Build the full day schedule for a given date, accounting for disruptions.
 * If semesterStart/semesterEnd are provided, days outside that range return
 * an empty class list so the schedule doesn't run forever.
 */
export function buildDaySchedule(
  date: string,
  classes: SchoolClass[],
  disruptions: ScheduleDisruption[],
  semesterStart?: string,
  semesterEnd?: string,
): DaySchedule {
  const d = dayjs(date);
  const dayOfWeek = d.day(); // 0=Sun

  const disruption = disruptions.find((dis) => dis.date === date);

  if (semesterStart && d.isBefore(dayjs(semesterStart), 'day')) {
    return { date, classes: [], disruption };
  }
  if (semesterEnd && d.isAfter(dayjs(semesterEnd), 'day')) {
    return { date, classes: [], disruption };
  }

  const dayClasses = classes.filter((c) => c.days.includes(dayOfWeek));

  const entries: ScheduleEntry[] = dayClasses.map((classInfo) => {
    if (disruption) {
      const override = disruption.periodOverrides.find(
        (o) => o.period === classInfo.period
      );
    if (override) {
        return {
          classInfo,
          startTime: override.cancelled ? (classInfo.dayTimes?.[dayOfWeek]?.startTime || classInfo.startTime) : override.startTime,
          endTime: override.cancelled ? (classInfo.dayTimes?.[dayOfWeek]?.endTime || classInfo.endTime) : override.endTime,
          cancelled: override.cancelled,
        };
      }
      if (disruption.type === 'no_school') {
        return {
          classInfo,
          startTime: classInfo.dayTimes?.[dayOfWeek]?.startTime || classInfo.startTime,
          endTime: classInfo.dayTimes?.[dayOfWeek]?.endTime || classInfo.endTime,
          cancelled: true,
        };
      }
    }
    // Use per-day override times if present, otherwise class-level times.
    return {
      classInfo,
      startTime: classInfo.dayTimes?.[dayOfWeek]?.startTime || classInfo.startTime,
      endTime: classInfo.dayTimes?.[dayOfWeek]?.endTime || classInfo.endTime,
      cancelled: false,
    };
  });

  // Sort by numeric minutes to avoid locale/string pitfalls and ensure
  // per-day overrides (dayTimes) are respected when present.
  const timeToMinutes = parseMinutes;
  entries.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  return { date, classes: entries, disruption };
}

/**
 * Generate an iCal feed for the full semester schedule.
 */
export function generateCalendarFeed(
  classes: SchoolClass[],
  exams: Exam[],
  homework: Homework[],
  disruptions: ScheduleDisruption[],
  semesterStart: string,
  semesterEnd: string,
  schoolName: string
): string {
  const cal = ical({
    name: `${schoolName || 'School'} Schedule`,
    method: ICalCalendarMethod.PUBLISH,
    prodId: { company: 'SchoolPlanner', product: 'ClassSchedule' },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  // -- Recurring class events (RRULE-based) --
  const icalDays = [ICalWeekday.SU, ICalWeekday.MO, ICalWeekday.TU, ICalWeekday.WE, ICalWeekday.TH, ICalWeekday.FR, ICalWeekday.SA];
  const semEnd = dayjs(semesterEnd);
  const semStart = dayjs(semesterStart);

  const disruptionDates = new Set(disruptions.map((d) => d.date));

  for (const cls of classes) {
    if (!cls.days || cls.days.length === 0) continue;

    for (const dow of cls.days) {
      const startTime = cls.dayTimes?.[dow]?.startTime || cls.startTime;
      const endTime = cls.dayTimes?.[dow]?.endTime || cls.endTime;
      if (!startTime || !endTime) continue;

      const sMin = parseMinutes(startTime);
      const eMin = parseMinutes(endTime);

      let firstDate = semStart;
      while (firstDate.day() !== dow && firstDate.isBefore(semEnd)) {
        firstDate = firstDate.add(1, 'day');
      }
      if (firstDate.isAfter(semEnd)) continue;

      const exDates: Date[] = [];
      let scan = firstDate;
      while (scan.isBefore(semEnd) || scan.isSame(semEnd, 'day')) {
        if (disruptionDates.has(scan.format('YYYY-MM-DD'))) {
          const d = disruptions.find((dis) => dis.date === scan.format('YYYY-MM-DD'));
          if (d?.type === 'no_school' || d?.periodOverrides.some((o) => o.period === cls.period && o.cancelled)) {
            exDates.push(scan.hour(Math.floor(sMin / 60)).minute(sMin % 60).second(0).toDate());
          }
        }
        scan = scan.add(7, 'day');
      }

      const event = cal.createEvent({
        start: firstDate.hour(Math.floor(sMin / 60)).minute(sMin % 60).second(0).toDate(),
        end: firstDate.hour(Math.floor(eMin / 60)).minute(eMin % 60).second(0).toDate(),
        summary: cls.name,
        location: cls.room ? `Room ${cls.room}` : '',
        description: `Teacher: ${cls.teacher}\nPeriod ${cls.period}`,
        categories: [{ name: 'Class' }],
      });

      event.repeating({
        freq: ICalEventRepeatingFreq.WEEKLY,
        byDay: [icalDays[dow]],
        until: semEnd.toDate(),
        exclude: exDates.length > 0 ? exDates : undefined,
      });
    }
  }

  // -- Exams --
  // Exams now happen during the linked class period. Pull start/end time and
  // room from that class; fall back to the exam's own fields (legacy rows
  // still have them) and finally to a generic 8–9 AM block.
  const classById = new Map(classes.map((c) => [c.id, c]));
  for (const exam of exams) {
    const examDate = dayjs(exam.date);
    const cls = classById.get(exam.classId);
    const startTime = exam.startTime || cls?.startTime || '08:00';
    const endTime = exam.endTime || cls?.endTime || '09:00';
    const location = exam.location || (cls?.room ? `Room ${cls.room}` : '');

    const sMin = parseMinutes(startTime);
    const eMin = parseMinutes(endTime);

    // No alarm — the user opted out of exam reminders. The event still goes
    // on the calendar; it just won't pop a notification before the exam.
    cal.createEvent({
      start: examDate.hour(Math.floor(sMin / 60)).minute(sMin % 60).second(0).toDate(),
      end: examDate.hour(Math.floor(eMin / 60)).minute(eMin % 60).second(0).toDate(),
      summary: `EXAM: ${exam.title}`,
      location,
      description: exam.notes,
      categories: [{ name: 'Exam' }],
    });
  }

  // -- Homework due dates --
  // PowerSchool-imported assignments stay on the Grades tab and are
  // intentionally excluded from the calendar feed. The feed is for user-owned
  // due dates (manual + Google Classroom), not the gradebook's full history.
  for (const hw of homework) {
    if (!hw.dueDate) continue;
    if (hw.source === 'powerschool') continue;
    const dueDate = dayjs(hw.dueDate);
    cal.createEvent({
      start: dueDate.hour(23).minute(59).toDate(),
      end: dueDate.hour(23).minute(59).toDate(),
      summary: `DUE: ${hw.title}`,
      description: hw.description,
      categories: [{ name: 'Homework' }],
      allDay: true,
    });
  }

  // -- Disruptions --
  for (const d of disruptions) {
    if (d.type === 'no_school') {
      cal.createEvent({
        start: dayjs(d.date).toDate(),
        end: dayjs(d.date).toDate(),
        summary: d.label || 'No School',
        allDay: true,
        categories: [{ name: 'Disruption' }],
      });
    }
  }

  return cal.toString();
}
