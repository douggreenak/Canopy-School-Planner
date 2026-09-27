// ============================================================
// iCal Calendar Feed Generator
// ============================================================
import ical, { ICalCalendarMethod, ICalWeekday, ICalEventRepeatingFreq } from 'ical-generator';
import dayjs from 'dayjs';
import type { SchoolClass, Exam, Homework, ScheduleDisruption, DaySchedule, ScheduleEntry } from '@/types';
import { parseMinutes } from './calendarMetrics';
import { disruptionTypeLabel, ASSEMBLY_PERIOD } from './disruptionTypes';
import { tzlib_get_ical_block } from 'timezones-ical-library';

/**
 * Whether a disruption's date range covers a given ISO date. Single-day
 * disruptions have no `endDate` (or one equal to `date`); multi-day ones
 * apply to every day in [date, endDate] inclusive. Relies on 'YYYY-MM-DD'
 * strings sorting lexicographically the same as chronologically.
 */
export function disruptionCoversDate(disruption: ScheduleDisruption, date: string): boolean {
  const end = disruption.endDate || disruption.date;
  return date >= disruption.date && date <= end;
}

/**
 * Build the full day schedule for a given date, accounting for disruptions.
 * School is treated as in session every day, every year — there's no
 * semester boundary to fall outside of. The exception is a disruption
 * covering this date (most commonly a multi-day `no_school` range like
 * summer or winter break), which cancels every class that would otherwise
 * meet, the same way a single-day closure does.
 */
export function buildDaySchedule(
  date: string,
  classes: SchoolClass[],
  disruptions: ScheduleDisruption[],
): DaySchedule {
  const d = dayjs(date);
  const dayOfWeek = d.day(); // 0=Sun

  const disruption = disruptions.find((dis) => disruptionCoversDate(dis, date));

  // A "1-6 Schedule" disruption overrides the normal A/B block pattern —
  // every period in its overrides meets that day even if the class doesn't
  // normally meet on this weekday (e.g. a period that's only part of the
  // Tue/Thu block still runs on a straight 1-6 day).
  const oneToSixPeriods = disruption?.type === '1_6'
    ? new Set(disruption.periodOverrides.map((o) => o.period))
    : null;

  // A "Different Day's Schedule" disruption swaps in another weekday's
  // normal class list/times wholesale — e.g. a Thursday schedule on a
  // Monday. Every lookup below that would otherwise use the date's own
  // weekday (which classes meet, and their per-day times) uses the source
  // weekday instead; falls back to the real weekday if unset so a
  // half-configured disruption doesn't just show an empty day.
  const scheduleDayOfWeek = disruption?.type === 'day_swap' && disruption.sourceDayOfWeek !== undefined
    ? disruption.sourceDayOfWeek
    : dayOfWeek;

  const dayClasses = classes.filter(
    (c) => c.days.includes(scheduleDayOfWeek) || (oneToSixPeriods?.has(c.period) ?? false)
  );

  const entries: ScheduleEntry[] = dayClasses.map((classInfo) => {
    if (disruption) {
      const override = disruption.periodOverrides.find(
        (o) => o.period === classInfo.period
      );
    if (override) {
        return {
          classInfo,
          startTime: override.cancelled ? (classInfo.dayTimes?.[scheduleDayOfWeek]?.startTime || classInfo.startTime) : override.startTime,
          endTime: override.cancelled ? (classInfo.dayTimes?.[scheduleDayOfWeek]?.endTime || classInfo.endTime) : override.endTime,
          cancelled: override.cancelled,
        };
      }
      if (disruption.type === 'no_school') {
        return {
          classInfo,
          startTime: classInfo.dayTimes?.[scheduleDayOfWeek]?.startTime || classInfo.startTime,
          endTime: classInfo.dayTimes?.[scheduleDayOfWeek]?.endTime || classInfo.endTime,
          cancelled: true,
        };
      }
    }
    // Use per-day override times if present, otherwise class-level times.
    return {
      classInfo,
      startTime: classInfo.dayTimes?.[scheduleDayOfWeek]?.startTime || classInfo.startTime,
      endTime: classInfo.dayTimes?.[scheduleDayOfWeek]?.endTime || classInfo.endTime,
      cancelled: false,
    };
  });

  // An "assembly" disruption's Assembly block isn't tied to any of the
  // student's real classes — synthesize it directly from the sentinel
  // ASSEMBLY_PERIOD override (see generateAssemblyOverrides), the same way
  // the always-present synthetic `__lunch__` class stands in for Lunch.
  if (disruption?.type === 'assembly') {
    const assemblyOverride = disruption.periodOverrides.find((o) => o.period === ASSEMBLY_PERIOD);
    if (assemblyOverride && !assemblyOverride.cancelled) {
      entries.push({
        classInfo: {
          id: '__assembly__',
          name: disruption.label || 'Assembly',
          teacher: '',
          room: '',
          color: '#7BAAF7',
          period: ASSEMBLY_PERIOD,
          startTime: assemblyOverride.startTime,
          endTime: assemblyOverride.endTime,
          days: [dayOfWeek],
          semester: '',
        },
        startTime: assemblyOverride.startTime,
        endTime: assemblyOverride.endTime,
        cancelled: false,
      });
    }
  }

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

  // A cancelled entry (e.g. a period-9 Extension block that doesn't run on a
  // 1-6 day) is shown crossed-out at its normal fallback time purely as
  // information. But when a disruption's override shifts a DIFFERENT,
  // still-running class into that same slot — which a 1-6 day's straight
  // schedule can do — the two blocks visually collide and become
  // unreadable. Drop the cancelled one in that case; the class actually
  // happening takes priority in the grid.
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (!e.cancelled) continue;
    const es = timeToMinutes(e.startTime);
    const ee = timeToMinutes(e.endTime);
    const collidesWithActive = entries.some(
      (other, j) =>
        j !== i &&
        !other.cancelled &&
        es < timeToMinutes(other.endTime) &&
        timeToMinutes(other.startTime) < ee,
    );
    if (collidesWithActive) entries.splice(i, 1);
  }

  return { date, classes: entries, disruption };
}

/**
 * Generate an iCal feed of the schedule across [feedStart, feedEnd].
 *
 * School itself has no start/end date — classes recur indefinitely, with
 * `no_school` disruptions (e.g. summer/winter break) as the exceptions. A
 * calendar feed still needs a finite window to turn that into concrete
 * RRULEs/EXDATEs, so the caller passes one — typically a rolling window
 * (e.g. "today" through a year out) recomputed on every request, not a
 * fixed semester the user has to keep updating.
 */
export function generateCalendarFeed(
  classes: SchoolClass[],
  exams: Exam[],
  homework: Homework[],
  disruptions: ScheduleDisruption[],
  feedStart: string,
  feedEnd: string,
  schoolName: string,
  timezone = 'America/Anchorage',
): string {
  const cal = ical({
    name: `${schoolName || 'School'} Schedule`,
    method: ICalCalendarMethod.PUBLISH,
    prodId: { company: 'SchoolPlanner', product: 'ClassSchedule' },
    // ical-generator does NOT ship a timezone database — without an explicit
    // VTIMEZONE generator here, every DTSTART/DTEND/EXDATE that references
    // TZID=America/Anchorage points at a timezone the file never defines.
    // Lenient clients (Google Calendar) guess correctly from the IANA name;
    // stricter ones (Outlook, many corporate calendars) can misread the
    // times or drop the events outright. This is the actual root cause of
    // "the calendar is still messed up" — the schedule logic itself
    // (buildDaySchedule, disruption handling) was already correct.
    timezone: { name: timezone, generator: (tz) => tzlib_get_ical_block(tz)[0] },
    // Hints how often subscribers should re-poll. Apple Calendar and Outlook
    // largely respect this; Google Calendar mostly ignores it and refreshes
    // external ICS subscriptions on its own schedule (often 12-24h+)
    // regardless of what we send — there's no server-side way to force that.
    // Set it anyway since it's free and helps the clients that do honor it.
    ttl: 60 * 60,
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
  const windowEnd = dayjs(feedEnd);
  const windowStart = dayjs(feedStart);

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

  // Every date any disruption covers, clipped to the feed window. The
  // recurring weekly events below are suppressed on these dates and replaced
  // with one-off events computed from buildDaySchedule — the same function
  // the in-app Day/Week views use — so early-outs, late-starts, 1-6 days,
  // and cancellations all show up in the subscribed calendar exactly as they
  // do in the app, not just as a skipped occurrence.
  const disruptedDates = new Set<string>();
  for (const d of disruptions) {
    const end = d.endDate || d.date;
    let cur = dayjs(d.date).isAfter(windowStart) ? dayjs(d.date) : windowStart;
    const rangeEnd = dayjs(end).isBefore(windowEnd) ? dayjs(end) : windowEnd;
    while (cur.isBefore(rangeEnd) || cur.isSame(rangeEnd, 'day')) {
      disruptedDates.add(cur.format('YYYY-MM-DD'));
      cur = cur.add(1, 'day');
    }
  }

  for (const cls of classes) {
    if (!cls.days || cls.days.length === 0) continue;

    for (const dow of cls.days) {
      const startTime = cls.dayTimes?.[dow]?.startTime || cls.startTime;
      const endTime = cls.dayTimes?.[dow]?.endTime || cls.endTime;
      if (!startTime || !endTime) continue;

      const sMin = parseMinutes(startTime);
      const eMin = parseMinutes(endTime);

      if (cls.id === '__lunch__' && lunchOverlapsRealClass(dow, sMin, eMin)) continue;

      // Anchor DTSTART on the first NON-disrupted matching weekday — EXDATE
      // is meant to suppress later occurrences, and calendar clients vary in
      // whether they honor an EXDATE that coincides with DTSTART itself. If
      // the feed window (or class) starts on a disrupted day, this avoids
      // relying on that and just picks a clean anchor instead.
      let firstDate = windowStart;
      while (
        (firstDate.day() !== dow || disruptedDates.has(firstDate.format('YYYY-MM-DD'))) &&
        firstDate.isBefore(windowEnd)
      ) {
        firstDate = firstDate.add(1, 'day');
      }
      if (firstDate.isAfter(windowEnd)) continue;

      const exDates: string[] = [];
      let scan = firstDate;
      while (scan.isBefore(windowEnd) || scan.isSame(windowEnd, 'day')) {
        if (disruptedDates.has(scan.format('YYYY-MM-DD'))) {
          exDates.push(localDT(scan, sMin));
        }
        scan = scan.add(7, 'day');
      }

      const event = cal.createEvent({
        // A stable, content-derived UID — not ical-generator's default random
        // one — so that regenerating the feed from scratch on every request
        // (the whole point of it always reflecting the latest disruptions)
        // is recognized by subscribing calendar apps as "this same event,
        // possibly updated" rather than a brand new event each poll. Without
        // this, a client's periodic refresh can leave stale copies behind
        // instead of updating them, which is what "still shows the old
        // schedule" looks like from the subscriber's side.
        id: `class-${cls.id}-dow${dow}@canopy-school-planner`,
        start: localDT(firstDate, sMin),
        end: localDT(firstDate, eMin),
        timezone,
        summary: cls.name,
        location: cls.room ? `Room ${cls.room}` : '',
        description: `Teacher: ${cls.teacher}\nPeriod ${cls.period}`,
        categories: [{ name: 'Class' }],
      });

      // Use COUNT instead of UNTIL. ical-generator's UNTIL formatting only
      // ever emits local-format wall-clock digits (see formatDate in its
      // source) with no 'Z' suffix and no TZID parameter, whenever a
      // calendar timezone is set — regardless of what's passed in. RFC5545
      // requires UNTIL to be UTC when DTSTART carries a TZID, so that output
      // is spec-invalid; strict parsers can reject the whole RRULE. COUNT
      // has no timezone/UTC semantics at all, so it sidesteps the bug
      // entirely rather than depending on the library fixing it.
      const occurrenceCount = Math.floor(windowEnd.diff(firstDate, 'day') / 7) + 1;

      event.repeating({
        freq: ICalEventRepeatingFreq.WEEKLY,
        byDay: [icalDays[dow]],
        count: occurrenceCount,
        exclude: exDates.length > 0 ? exDates : undefined,
      });
    }
  }

  // -- One-off events for disrupted days --
  // Recompute each disrupted day's actual schedule (adjusted times,
  // cancellations, and — for a 1-6 day — periods that don't normally meet
  // that weekday at all) and emit it as one-off events, replacing the
  // recurring occurrence suppressed above.
  for (const dateStr of disruptedDates) {
    const day = buildDaySchedule(dateStr, classes, disruptions);
    for (const entry of day.classes) {
      if (entry.cancelled) continue;
      const sMin = parseMinutes(entry.startTime);
      const eMin = parseMinutes(entry.endTime);
      const disruptionNote = day.disruption ? `\n${day.disruption.label || disruptionTypeLabel(day.disruption.type)}` : '';
      cal.createEvent({
        // Distinct from the recurring series' UID (different suffix) since
        // this is a one-off replacement occurrence, not part of that RRULE —
        // but still stable across regenerations so editing/removing the
        // disruption later updates or cancels this same event for
        // subscribers instead of leaving a duplicate.
        id: `class-${entry.classInfo.id}-override-${dateStr}@canopy-school-planner`,
        start: localDT(dayjs(dateStr), sMin),
        end: localDT(dayjs(dateStr), eMin),
        timezone,
        summary: entry.classInfo.name,
        location: entry.classInfo.room ? `Room ${entry.classInfo.room}` : '',
        description: `Teacher: ${entry.classInfo.teacher}\nPeriod ${entry.classInfo.period}${disruptionNote}`,
        categories: [{ name: 'Class' }],
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
      id: `exam-${exam.id}@canopy-school-planner`,
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
      id: `homework-${hw.id}@canopy-school-planner`,
      start: `${hw.dueDate}T00:00:00`,
      end: `${hw.dueDate}T00:00:00`,
      summary: `DUE: ${hw.title}`,
      description: hw.description,
      categories: [{ name: 'Homework' }],
      allDay: true,
    });
  }

  // -- Disruptions --
  // An all-day marker event for every disruption (not just no_school) so
  // it's visible in the calendar app itself, in addition to the shifted
  // class times above.
  for (const d of disruptions) {
    // All-day multi-day events use an exclusive DTEND — the day *after*
    // the last covered day — per iCalendar convention.
    const endExclusive = dayjs(d.endDate || d.date).add(1, 'day').format('YYYY-MM-DD');
    cal.createEvent({
      id: `disruption-${d.id}@canopy-school-planner`,
      start: `${d.date}T00:00:00`,
      end: `${endExclusive}T00:00:00`,
      summary: d.label || disruptionTypeLabel(d.type),
      allDay: true,
      categories: [{ name: 'Disruption' }],
    });
  }

  return cal.toString();
}
