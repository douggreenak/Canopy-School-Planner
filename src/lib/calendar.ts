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

  // The synthetic "Lunch" block uses generic default times that won't line up
  // with every school's bell schedule. When it lands on top of a real class,
  // drop it instead of rendering two overlapping blocks the user can't read.
  // A lunch period that sits in a genuine gap is left untouched.
  const lunchIdx = entries.findIndex((e) => e.classInfo.id === '__lunch__');
  if (lunchIdx !== -1) {
    const lunch = entries[lunchIdx];
    const ls = timeToMinutes(lunch.startTime);
    const le = timeToMinutes(lunch.endTime);
    const overlapsRealClass = entries.some(
      (e, i) =>
        i !== lunchIdx &&
        e.classInfo.id !== '__lunch__' &&
        !e.cancelled &&
        ls < timeToMinutes(e.endTime) &&
        timeToMinutes(e.startTime) < le,
    );
    if (overlapsRealClass) entries.splice(lunchIdx, 1);
  }

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
  schoolName: string,
  timezone = 'America/Anchorage',
): string {
  const cal = ical({
    name: `${schoolName || 'School'} Schedule`,
    method: ICalCalendarMethod.PUBLISH,
    prodId: { company: 'SchoolPlanner', product: 'ClassSchedule' },
    timezone,
  });

  // Build a local-time ISO string for the given date + HH:mm minutes.
  // ical-generator pairs this with the calendar's TZID so the output is
  // DTSTART;TZID=America/Anchorage:20260112T073000 — no UTC suffix.
  const localDT = (d: dayjs.Dayjs, minutes: number): string => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${d.format('YYYY-MM-DD')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  };

  // -- Recurring class events (RRULE-based) --
  const icalDays = [ICalWeekday.SU, ICalWeekday.MO, ICalWeekday.TU, ICalWeekday.WE, ICalWeekday.TH, ICalWeekday.FR, ICalWeekday.SA];
  const semEnd = dayjs(semesterEnd);
  const semStart = dayjs(semesterStart);

  const disruptionDates = new Set(disruptions.map((d) => d.date));

  // The synthetic "Lunch" block uses generic default times that won't line up
  // with every school's bell schedule. On any weekday where it would overlap a
  // real class, skip the lunch event for that day so the feed doesn't show two
  // events stacked on top of each other (mirrors buildDaySchedule's behavior).
  const realClasses = classes.filter((c) => c.id !== '__lunch__');
  const lunchOverlapsRealClass = (dow: number, sMin: number, eMin: number): boolean =>
    realClasses.some((c) => {
      if (!c.days?.includes(dow)) return false;
      const cs = c.dayTimes?.[dow]?.startTime || c.startTime;
      const ce = c.dayTimes?.[dow]?.endTime || c.endTime;
      if (!cs || !ce) return false;
      return sMin < parseMinutes(ce) && parseMinutes(cs) < eMin;
    });

  for (const cls of classes) {
    if (!cls.days || cls.days.length === 0) continue;

    for (const dow of cls.days) {
      const startTime = cls.dayTimes?.[dow]?.startTime || cls.startTime;
      const endTime = cls.dayTimes?.[dow]?.endTime || cls.endTime;
      if (!startTime || !endTime) continue;

      const sMin = parseMinutes(startTime);
      const eMin = parseMinutes(endTime);

      if (cls.id === '__lunch__' && lunchOverlapsRealClass(dow, sMin, eMin)) continue;

      let firstDate = semStart;
      while (firstDate.day() !== dow && firstDate.isBefore(semEnd)) {
        firstDate = firstDate.add(1, 'day');
      }
      if (firstDate.isAfter(semEnd)) continue;

      const exDates: string[] = [];
      let scan = firstDate;
      while (scan.isBefore(semEnd) || scan.isSame(semEnd, 'day')) {
        if (disruptionDates.has(scan.format('YYYY-MM-DD'))) {
          const d = disruptions.find((dis) => dis.date === scan.format('YYYY-MM-DD'));
          if (d?.type === 'no_school' || d?.periodOverrides.some((o) => o.period === cls.period && o.cancelled)) {
            exDates.push(localDT(scan, sMin));
          }
        }
        scan = scan.add(7, 'day');
      }

      const event = cal.createEvent({
        start: localDT(firstDate, sMin),
        end: localDT(firstDate, eMin),
        timezone,
        summary: cls.name,
        location: cls.room ? `Room ${cls.room}` : '',
        description: `Teacher: ${cls.teacher}\nPeriod ${cls.period}`,
        categories: [{ name: 'Class' }],
      });

      event.repeating({
        freq: ICalEventRepeatingFreq.WEEKLY,
        byDay: [icalDays[dow]],
        until: localDT(semEnd, 23 * 60 + 59),
        exclude: exDates.length > 0 ? exDates : undefined,
      });
    }
  }

  // -- Exams --
  const classById = new Map(classes.map((c) => [c.id, c]));
  for (const exam of exams) {
    const examDate = dayjs(exam.date);
    const cls = classById.get(exam.classId);
    const startTime = exam.startTime || cls?.startTime || '08:00';
    const endTime = exam.endTime || cls?.endTime || '09:00';
    const location = exam.location || (cls?.room ? `Room ${cls.room}` : '');

    const sMin = parseMinutes(startTime);
    const eMin = parseMinutes(endTime);

    cal.createEvent({
      start: localDT(examDate, sMin),
      end: localDT(examDate, eMin),
      timezone,
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
    cal.createEvent({
      start: `${hw.dueDate}T00:00:00`,
      end: `${hw.dueDate}T00:00:00`,
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
        start: `${d.date}T00:00:00`,
        end: `${d.date}T00:00:00`,
        summary: d.label || 'No School',
        allDay: true,
        categories: [{ name: 'Disruption' }],
      });
    }
  }

  return cal.toString();
}
