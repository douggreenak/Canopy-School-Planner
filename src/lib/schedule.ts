// ============================================================
// Schedule Utilities
// ============================================================
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import type { SchoolClass, ScheduleDisruption, DaySchedule } from '@/types';
import { buildDaySchedule } from './calendar';
import { parseMinutes } from './calendarMetrics';
import { ASSEMBLY_PERIOD } from './disruptionTypes';

dayjs.extend(isoWeek);

export const LATHROP_EARLY_OUT: Record<number, { startTime: string; endTime: string }> = {
  1: { startTime: '07:30', endTime: '08:10' },
  2: { startTime: '08:15', endTime: '08:55' },
  3: { startTime: '09:00', endTime: '09:40' },
  4: { startTime: '09:50', endTime: '10:30' },
  5: { startTime: '10:35', endTime: '11:15' },
  6: { startTime: '11:20', endTime: '12:00' },
};

export function buildLathropEarlyOutTemplate(classes?: SchoolClass[]): Record<number, { startTime: string; endTime: string }> {
  const tpl = { ...LATHROP_EARLY_OUT };
  if (classes) {
    const extClass = classes.find((c) => /\b(ext|extension|seminar|advisory|homeroom)\b/i.test(c.name));
    if (extClass) tpl[extClass.period] = { startTime: '07:30', endTime: '08:10' };
  }
  return tpl;
}

type LathropSlot = 'ext' | 1 | 2 | 3 | 4 | 5 | 6;

// Lathrop High School's real weekly bell schedule: Monday and Friday run all
// six periods straight through; Tuesday-Thursday alternate odd/even periods
// plus an Extension/Advisory block — genuinely different days, not a
// straight "periods 1-6 every day" pattern. That flat pattern is exactly
// what a class keeps if this template is never actually applied to it
// (whether newly synced from PowerSchool or added manually) — the bug
// computeLathropSchedule below exists to fix.
const LATHROP_WEEK_TEMPLATE: Record<number, Partial<Record<LathropSlot, { start: string; end: string }>>> = {
  1: { 1: { start: '07:30', end: '08:24' }, 2: { start: '08:31', end: '09:25' }, 3: { start: '09:32', end: '10:26' }, 4: { start: '11:04', end: '11:58' }, 5: { start: '12:05', end: '12:59' }, 6: { start: '13:06', end: '14:00' } },
  2: { ext: { start: '07:30', end: '08:05' }, 1: { start: '08:13', end: '09:26' }, 2: { start: '09:34', end: '10:47' }, 4: { start: '11:26', end: '12:39' }, 5: { start: '12:47', end: '14:00' } },
  3: { ext: { start: '07:30', end: '08:05' }, 2: { start: '08:13', end: '09:26' }, 3: { start: '09:34', end: '10:47' }, 5: { start: '11:26', end: '12:39' }, 6: { start: '12:47', end: '14:00' } },
  4: { ext: { start: '07:30', end: '08:05' }, 1: { start: '08:13', end: '09:26' }, 3: { start: '09:34', end: '10:47' }, 4: { start: '11:26', end: '12:39' }, 6: { start: '12:47', end: '14:00' } },
  5: { 1: { start: '07:30', end: '08:24' }, 2: { start: '08:31', end: '09:25' }, 3: { start: '09:32', end: '10:26' }, 4: { start: '11:04', end: '11:58' }, 5: { start: '12:05', end: '12:59' }, 6: { start: '13:06', end: '14:00' } },
};

function isLathropExtensionClass(name: string): boolean {
  return /\b(ext|extension|seminar|advisory|homeroom)\b/i.test(name || '');
}

export interface LathropScheduleUpdate {
  startTime: string;
  endTime: string;
  days: number[];
  dayTimes: Record<number, { startTime: string; endTime: string }>;
}

/**
 * Computes one class's slot in the real Lathrop weekly bell schedule above.
 * The single source of truth for "apply the Lathrop schedule" — used both
 * client-side (Settings' "Apply Default Bell Schedule" button and the
 * Lathrop Mode toggle) and server-side (runPowerSchoolSync, so newly synced
 * classes get the real schedule immediately, with no UI needing to be open
 * to trigger it). Returns null for a class that isn't period 1-6 or an
 * Extension/Advisory block — left alone rather than guessed at.
 */
export function computeLathropSchedule(cls: { name: string; period: number | string }): LathropScheduleUpdate | null {
  const periodNum = parseInt(String(cls.period ?? ''), 10);
  let slot: LathropSlot | null = null;
  if (isLathropExtensionClass(cls.name)) slot = 'ext';
  else if (periodNum >= 1 && periodNum <= 6) slot = periodNum as LathropSlot;
  if (slot === null) return null;

  const days: number[] = [];
  const dayTimes: Record<number, { startTime: string; endTime: string }> = {};
  for (let d = 1; d <= 5; d++) {
    const slotTime = LATHROP_WEEK_TEMPLATE[d]?.[slot];
    if (slotTime) {
      days.push(d);
      dayTimes[d] = { startTime: slotTime.start, endTime: slotTime.end };
    }
  }
  if (days.length === 0) return null;

  const firstDay = days[0];
  const representative = dayTimes[firstDay];
  return {
    startTime: representative.startTime,
    endTime: representative.endTime,
    days: days.sort((a, b) => a - b),
    dayTimes,
  };
}

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
 * Monday that should anchor the "week" containing `date`, for display/
 * navigation purposes. Ordinarily this is just the ISO week's Monday
 * (`date.startOf('isoWeek')`) — but Sunday is the LAST day of its ISO
 * week, so treating "today" as a Sunday would land the week view on the
 * week that's ending rather than the week ahead. A Sunday date is nudged
 * forward one day (to Monday) first, landing on the upcoming week instead.
 * Applying this uniformly (not just for "today") keeps week-to-week
 * navigation consistent — each prev/next still moves exactly 7 days.
 */
export function weekViewStart(date: dayjs.Dayjs): dayjs.Dayjs {
  const anchor = date.day() === 0 ? date.add(1, 'day') : date;
  return anchor.startOf('isoWeek');
}

/**
 * Get the schedule for an entire week.
 */
export function getWeekSchedule(
  weekStart: string,
  classes: SchoolClass[],
  disruptions: ScheduleDisruption[],
): DaySchedule[] {
  const start = weekViewStart(dayjs(weekStart));
  const days: DaySchedule[] = [];
  for (let i = 0; i < 7; i++) {
    const date = start.add(i, 'day').format('YYYY-MM-DD');
    days.push(buildDaySchedule(date, classes, disruptions));
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
): DaySchedule[] {
  const start = dayjs().year(year).month(month).startOf('month');
  const end = start.endOf('month');
  const days: DaySchedule[] = [];
  let current = start;
  while (current.isBefore(end) || current.isSame(end, 'day')) {
    days.push(buildDaySchedule(current.format('YYYY-MM-DD'), classes, disruptions));
    current = current.add(1, 'day');
  }
  return days;
}

/**
 * Generate early-out disruption overrides.
 *
 * When a bell-schedule template is provided (period → exact times), those
 * fixed times are used directly — this matches the school's real early-out
 * bell schedule. Classes whose period number isn't in the template are omitted
 * (they'll show at their normal time and the user can adjust manually).
 *
 * Without a template, falls back to proportional position scaling so
 * passing-period gaps shrink proportionally instead of being eliminated.
 *
 * Pass dayOfWeek (0=Sun…6=Sat) so per-day time overrides are respected
 * in the fallback path.
 */
export function generateEarlyOutOverrides(
  classes: SchoolClass[],
  earlyEndTime: string,
  dayOfWeek?: number,
  template?: Record<number, { startTime: string; endTime: string }>,
): { period: number; startTime: string; endTime: string; cancelled: boolean }[] {
  // ── Template path: use fixed bell-schedule times ─────────────────────────
  if (template && Object.keys(template).length > 0) {
    return classes
      .filter((c) => template[c.period])
      .sort((a, b) => timeToMinutes(template[a.period].startTime) - timeToMinutes(template[b.period].startTime))
      .map((c) => ({
        period: c.period,
        startTime: template[c.period].startTime,
        endTime: template[c.period].endTime,
        cancelled: false,
      }));
  }

  // ── Fallback: proportional position scaling ───────────────────────────────
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

// The six periods a straight "1-6" day actually runs. Anything else on a
// student's normal schedule — a period-9 Extension/Advisory block, a zero
// period, etc. — does not meet at all on a 1-6 day.
const ONE_TO_SIX_CORE_PERIODS = new Set([1, 2, 3, 4, 5, 6]);

/**
 * Generate "1-6 Schedule" overrides.
 *
 * A straight 1-6 day runs periods 1-6 once each, in numeric order, using
 * each class's canonical period time (`startTime`/`endTime`) rather than any
 * day-specific block-schedule time. This overrides the normal A/B block
 * pattern, so it deliberately does NOT filter core periods by the
 * disruption's weekday — a class that doesn't normally meet on that day
 * (e.g. a period that's only part of the Tue/Thu block) still gets an
 * override so it shows up.
 *
 * Any OTHER period the student has (outside 1-6 — e.g. a period-9 Extension
 * block) is explicitly cancelled rather than left alone: buildDaySchedule
 * would otherwise show it running at its normal time whenever that period
 * happens to fall on this weekday, since nothing else overrides it.
 *
 * Also places a Lunch override (period 0, matching the synthetic Lunch
 * class) in the largest gap between two consecutive CORE periods. The
 * normal weekday-keyed lunch time is tied to the block schedule's period
 * times, so on a straight 1-6 day it usually lands on top of a period that
 * now starts earlier — buildDaySchedule silently drops Lunch when that
 * happens. Reading the gap directly off the bell schedule instead means
 * Lunch always lands somewhere real classes aren't.
 */
export function generateOneToSixOverrides(
  classes: SchoolClass[],
): { period: number; startTime: string; endTime: string; cancelled: boolean }[] {
  const byPeriod = new Map<number, SchoolClass>();
  let hasLunch = false;
  for (const c of classes) {
    if (c.id === '__lunch__') { hasLunch = true; continue; }
    if (!byPeriod.has(c.period)) byPeriod.set(c.period, c);
  }
  const allPeriods = [...byPeriod.values()].sort((a, b) => a.period - b.period);
  const corePeriods = allPeriods.filter((c) => ONE_TO_SIX_CORE_PERIODS.has(c.period));
  const otherPeriods = allPeriods.filter((c) => !ONE_TO_SIX_CORE_PERIODS.has(c.period));

  const overrides = [
    ...corePeriods.map((c) => ({ period: c.period, startTime: c.startTime, endTime: c.endTime, cancelled: false })),
    ...otherPeriods.map((c) => ({ period: c.period, startTime: c.startTime, endTime: c.endTime, cancelled: true })),
  ];

  if (hasLunch && corePeriods.length >= 2) {
    let gapIdx = -1;
    let gapSize = 0;
    for (let i = 0; i < corePeriods.length - 1; i++) {
      const gap = timeToMinutes(corePeriods[i + 1].startTime) - timeToMinutes(corePeriods[i].endTime);
      if (gap > gapSize) { gapSize = gap; gapIdx = i; }
    }
    // Only treat it as a lunch break if the gap is meaningfully longer than
    // a passing period — otherwise leave Lunch out rather than guess.
    if (gapIdx !== -1 && gapSize >= 20) {
      overrides.push({
        period: 0,
        startTime: corePeriods[gapIdx].endTime,
        endTime: corePeriods[gapIdx + 1].startTime,
        cancelled: false,
      });
    }
  }

  return overrides;
}

const ASSEMBLY_CLASS_MINUTES = 70;
const ASSEMBLY_PASSING_MINUTES = 8;
const ASSEMBLY_LUNCH_MINUTES = 32;
const ASSEMBLY_BLOCK_MINUTES = 45;

/**
 * Generate "Assembly" day overrides: a compressed bell schedule for a single
 * weekday that drops the Extension/Advisory block, runs every other period
 * that normally meets this weekday back-to-back (70 min each, with an
 * 8-minute passing period between), keeps Lunch in the same relative gap it
 * normally falls in (the largest gap between two consecutive core periods —
 * same heuristic as generateOneToSixOverrides), and appends a 45-minute
 * Assembly block after the last period.
 *
 * There's no single real "assembly bell schedule" to reuse for every
 * weekday — a school's actual published assembly-day times don't reduce to
 * a formula. This is a general compression rule, not a guarantee of
 * matching any specific school's real times; period times can still be
 * hand-adjusted afterward in the Period Overrides list.
 *
 * Pass dayOfWeek (0=Sun…6=Sat) — the disruption's own date, not `today`.
 */
export function generateAssemblyOverrides(
  classes: SchoolClass[],
  dayOfWeek: number,
): { period: number; startTime: string; endTime: string; cancelled: boolean }[] {
  const byPeriod = new Map<number, SchoolClass>();
  let hasLunch = false;
  for (const c of classes) {
    if (!c.days.includes(dayOfWeek)) continue;
    if (c.id === '__lunch__') { hasLunch = true; continue; }
    if (!byPeriod.has(c.period)) byPeriod.set(c.period, c);
  }
  const allPeriods = [...byPeriod.values()];
  if (allPeriods.length === 0) return [];

  const dayStart = (c: SchoolClass) => c.dayTimes?.[dayOfWeek]?.startTime || c.startTime;
  const dayEnd = (c: SchoolClass) => c.dayTimes?.[dayOfWeek]?.endTime || c.endTime;

  const extPeriods = allPeriods.filter((c) => isLathropExtensionClass(c.name));
  const corePeriods = allPeriods
    .filter((c) => !isLathropExtensionClass(c.name))
    .sort((a, b) => timeToMinutes(dayStart(a)) - timeToMinutes(dayStart(b)));

  if (corePeriods.length === 0) return [];

  // Anchor the compressed day at the earliest normal start time — including
  // the Extension block being dropped — so the time it frees up is absorbed
  // by the first real period rather than left as a gap at the start of the day.
  const anchorStart = Math.min(...allPeriods.map((c) => timeToMinutes(dayStart(c))));

  // Find where Lunch naturally falls: the largest gap between two
  // consecutive core periods in the NORMAL schedule.
  let lunchAfterIdx = -1;
  if (hasLunch && corePeriods.length >= 2) {
    let gapSize = 0;
    for (let i = 0; i < corePeriods.length - 1; i++) {
      const gap = timeToMinutes(dayStart(corePeriods[i + 1])) - timeToMinutes(dayEnd(corePeriods[i]));
      if (gap > gapSize) { gapSize = gap; lunchAfterIdx = i; }
    }
  }

  const overrides: { period: number; startTime: string; endTime: string; cancelled: boolean }[] = [];
  let cursor = anchorStart;
  corePeriods.forEach((c, i) => {
    const start = cursor;
    const end = start + ASSEMBLY_CLASS_MINUTES;
    overrides.push({ period: c.period, startTime: minutesToTime(start), endTime: minutesToTime(end), cancelled: false });
    cursor = end + ASSEMBLY_PASSING_MINUTES;
    if (i === lunchAfterIdx) {
      const lunchStart = cursor;
      const lunchEnd = lunchStart + ASSEMBLY_LUNCH_MINUTES;
      overrides.push({ period: 0, startTime: minutesToTime(lunchStart), endTime: minutesToTime(lunchEnd), cancelled: false });
      cursor = lunchEnd + ASSEMBLY_PASSING_MINUTES;
    }
  });

  // The Extension/Advisory block doesn't run on an assembly day — cancelled
  // explicitly so it doesn't show at its normal time (nothing else overrides it).
  for (const ext of extPeriods) {
    overrides.push({ period: ext.period, startTime: dayStart(ext), endTime: dayEnd(ext), cancelled: true });
  }

  overrides.push({
    period: ASSEMBLY_PERIOD,
    startTime: minutesToTime(cursor),
    endTime: minutesToTime(cursor + ASSEMBLY_BLOCK_MINUTES),
    cancelled: false,
  });

  return overrides;
}

function timeToMinutes(time: string): number {
  return parseMinutes(time);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
