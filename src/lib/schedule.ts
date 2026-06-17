// ============================================================
// Schedule Utilities
// ============================================================
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import type { SchoolClass, ScheduleDisruption, DaySchedule } from '@/types';
import { buildDaySchedule } from './calendar';
import { parseMinutes } from './calendarMetrics';

dayjs.extend(isoWeek);

/**
 * Find the next date a class meets, given its weekly day pattern.
 * Returns an ISO date string (YYYY-MM-DD). Returns '' if the class has no
 * meeting days (which shouldn't happen for any real class).
 *
 * Skips today by design: "next time" means the next *future* occurrence. A
 * student adding a Homework task while sitting in today's class is preparing
 * for the *following* meeting, not the one happening right now.
 *
 * @param days  Day-of-week numbers the class meets (0=Sun..6=Sat).
 * @param from  Date to search from (default: today).
 */
export function nextMeetingDate(days: number[], from: Date = new Date()): string {
  if (!days || days.length === 0) return '';
  const start = dayjs(from);
  // Look ahead up to two weeks — covers any meeting pattern.
  for (let i = 1; i <= 14; i++) {
    const candidate = start.add(i, 'day');
    if (days.includes(candidate.day())) return candidate.format('YYYY-MM-DD');
  }
  return '';
}

/**
 * Get the schedule for an entire week.
 */
export function getWeekSchedule(
  weekStart: string,
  classes: SchoolClass[],
  disruptions: ScheduleDisruption[],
  semesterStart?: string,
  semesterEnd?: string,
): DaySchedule[] {
  const start = dayjs(weekStart).startOf('isoWeek');
  const days: DaySchedule[] = [];
  for (let i = 0; i < 7; i++) {
    const date = start.add(i, 'day').format('YYYY-MM-DD');
    days.push(buildDaySchedule(date, classes, disruptions, semesterStart, semesterEnd));
  }
  return days;
}

/**
 * Get a month's worth of schedules for the year view.
 */
export function getMonthSchedules(
  year: number,
  month: number,
  classes: SchoolClass[],
  disruptions: ScheduleDisruption[],
  semesterStart?: string,
  semesterEnd?: string,
): DaySchedule[] {
  const start = dayjs().year(year).month(month).startOf('month');
  const end = start.endOf('month');
  const days: DaySchedule[] = [];
  let current = start;
  while (current.isBefore(end) || current.isSame(end, 'day')) {
    days.push(buildDaySchedule(current.format('YYYY-MM-DD'), classes, disruptions, semesterStart, semesterEnd));
    current = current.add(1, 'day');
  }
  return days;
}

/**
 * Generate early-out disruption overrides.
 * Scales each period's position proportionally within the compressed day so
 * passing-period gaps shrink proportionally instead of being eliminated.
 * Pass dayOfWeek (0=Sun…6=Sat) so per-day time overrides are respected.
 */
export function generateEarlyOutOverrides(
  classes: SchoolClass[],
  earlyEndTime: string,
  dayOfWeek?: number,
): { period: number; startTime: string; endTime: string; cancelled: boolean }[] {
  const eStart = (c: SchoolClass) =>
    (dayOfWeek !== undefined && c.dayTimes?.[dayOfWeek]?.startTime) || c.startTime;
  const eEnd = (c: SchoolClass) =>
    (dayOfWeek !== undefined && c.dayTimes?.[dayOfWeek]?.endTime) || c.endTime;

  // Sort numerically — localeCompare on "7:30" vs "10:26" gives wrong order
  // because '7' > '1' in ASCII, so single-digit hours sort after double-digit ones.
  const sorted = [...classes].sort((a, b) => timeToMinutes(eStart(a)) - timeToMinutes(eStart(b)));
  if (sorted.length === 0) return [];

  const firstStart = timeToMinutes(eStart(sorted[0]));
  const lastEnd    = timeToMinutes(eEnd(sorted[sorted.length - 1]));
  const earlyEnd   = timeToMinutes(earlyEndTime);

  // Nothing to do if the early-end is outside the school day.
  if (earlyEnd <= firstStart || earlyEnd >= lastEnd) return [];

  // Proportional scaling: shift every period's start and end by the same ratio
  // so the gaps between periods shrink proportionally rather than disappearing.
  //
  // newPosition = firstStart + (origPosition - firstStart) * ratio
  //
  // The previous Largest-Remainder approach distributed the compressed break
  // time as extra class time, packing periods back-to-back with no gaps.
  const ratio = (earlyEnd - firstStart) / (lastEnd - firstStart);

  const overrides = sorted.map((c) => {
    const origStart = timeToMinutes(eStart(c));
    const origEnd   = timeToMinutes(eEnd(c));
    const newStart  = Math.round(firstStart + (origStart - firstStart) * ratio);
    const newEnd    = Math.round(firstStart + (origEnd   - firstStart) * ratio);
    return {
      period: c.period,
      startTime: minutesToTime(newStart),
      endTime:   minutesToTime(Math.max(newStart + 1, newEnd)),
      cancelled: false,
    };
  });

  // Pin the last period to end exactly at earlyEnd (absorbs rounding error).
  overrides[overrides.length - 1].endTime = minutesToTime(earlyEnd);

  return overrides;
}

/**
 * Generate late-start overrides.
 * Pass dayOfWeek (0=Sun…6=Sat) so per-day time overrides are respected.
 */
export function generateLateStartOverrides(
  classes: SchoolClass[],
  lateStartTime: string,
  dayOfWeek?: number,
): { period: number; startTime: string; endTime: string; cancelled: boolean }[] {
  const eStart = (c: SchoolClass) =>
    (dayOfWeek !== undefined && c.dayTimes?.[dayOfWeek]?.startTime) || c.startTime;
  const eEnd = (c: SchoolClass) =>
    (dayOfWeek !== undefined && c.dayTimes?.[dayOfWeek]?.endTime) || c.endTime;

  const sorted = [...classes].sort((a, b) => timeToMinutes(eStart(a)) - timeToMinutes(eStart(b)));
  if (sorted.length === 0) return [];

  const originalFirstStart = timeToMinutes(eStart(sorted[0]));
  const newFirstStart = timeToMinutes(lateStartTime);
  const delay = newFirstStart - originalFirstStart;

  return sorted.map((c) => ({
    period: c.period,
    startTime: minutesToTime(timeToMinutes(eStart(c)) + delay),
    endTime: minutesToTime(timeToMinutes(eEnd(c)) + delay),
    cancelled: false,
  }));
}

function timeToMinutes(time: string): number {
  return parseMinutes(time);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
