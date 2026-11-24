// Pure helpers behind the custom-disruption drag-and-drop schedule editor
// (components/CustomScheduleEditor.tsx). Kept free of React so the
// move/resize/overlap rules can be unit tested.
import type { PeriodOverride, SchoolClass } from '@/types';
import { parseMinutes } from './calendarMetrics';
import {
  generateOneToSixOverrides,
  generateEarlyOutOverrides,
  generateLathropEarlyOutOverrides,
} from './schedule';

export const SNAP_MINUTES = 5;
/** Shortest block the editor allows. */
export const MIN_BLOCK_MINUTES = 10;
/** Editable window of the day (minutes from midnight): 6:30 AM – 4:00 PM. */
export const DAY_START_MIN = 6 * 60 + 30;
export const DAY_END_MIN = 16 * 60;

export function minutesToTime(min: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function snap(min: number, step = SNAP_MINUTES): number {
  return Math.round(min / step) * step;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Move a block by `deltaMin`, keeping its length and staying inside the editable day. */
export function moveOverride(o: PeriodOverride, deltaMin: number): PeriodOverride {
  const start = parseMinutes(o.startTime);
  const end = parseMinutes(o.endTime);
  const len = end - start;
  const newStart = clamp(snap(start + deltaMin), DAY_START_MIN, DAY_END_MIN - len);
  return { ...o, startTime: minutesToTime(newStart), endTime: minutesToTime(newStart + len) };
}

/** Resize one edge of a block by `deltaMin`; never shorter than MIN_BLOCK_MINUTES. */
export function resizeOverride(o: PeriodOverride, edge: 'start' | 'end', deltaMin: number): PeriodOverride {
  const start = parseMinutes(o.startTime);
  const end = parseMinutes(o.endTime);
  if (edge === 'start') {
    const s = clamp(snap(start + deltaMin), DAY_START_MIN, end - MIN_BLOCK_MINUTES);
    return { ...o, startTime: minutesToTime(s) };
  }
  const e = clamp(snap(end + deltaMin), start + MIN_BLOCK_MINUTES, DAY_END_MIN);
  return { ...o, endTime: minutesToTime(e) };
}

/** Indexes of non-cancelled blocks that overlap another non-cancelled block. */
export function findOverlaps(overrides: PeriodOverride[]): Set<number> {
  const bad = new Set<number>();
  const live = overrides.map((o, i) => ({ o, i })).filter(({ o }) => !o.cancelled);
  for (let a = 0; a < live.length; a++) {
    for (let b = a + 1; b < live.length; b++) {
      const as = parseMinutes(live[a].o.startTime), ae = parseMinutes(live[a].o.endTime);
      const bs = parseMinutes(live[b].o.startTime), be = parseMinutes(live[b].o.endTime);
      if (as < be && bs < ae) { bad.add(live[a].i); bad.add(live[b].i); }
    }
  }
  return bad;
}

export type StartFrom =
  | { kind: 'weekday'; day: number }
  | { kind: '1_6' }
  | { kind: 'early_out' };

/**
 * Starting point for the editor: the normal schedule of a weekday, a straight
 * 1-6 day, or an early out. `classes` must include the synthetic Lunch class.
 */
export function buildStartingOverrides(
  start: StartFrom,
  classes: SchoolClass[],
  opts: { lathrop: boolean },
): PeriodOverride[] {
  if (start.kind === '1_6') return generateOneToSixOverrides(classes);
  if (start.kind === 'early_out') {
    if (opts.lathrop) return generateLathropEarlyOutOverrides(classes);
    return generateEarlyOutOverrides(classes, '12:00');
  }
  const day = start.day;
  return classes
    .filter((c) => c.days.includes(day))
    .map((c) => ({
      period: c.period,
      startTime: c.dayTimes?.[day]?.startTime || c.startTime,
      endTime: c.dayTimes?.[day]?.endTime || c.endTime,
      cancelled: false,
    }))
    .sort((a, b) => parseMinutes(a.startTime) - parseMinutes(b.startTime));
}
