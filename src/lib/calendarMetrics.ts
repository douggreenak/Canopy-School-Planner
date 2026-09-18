// Shared calendar layout constants and helpers to ensure DayView and WeekView
// compute identical pixel positions for the same times.
import type { SchoolClass } from '@/types';

/**
 * Parse a time string in either 24-hour ("07:30") or 12-hour ("7:30 AM")
 * format into total minutes since midnight. Handles both formats so that
 * PowerSchool-imported times ("7:30 AM") work alongside manually-entered
 * 24-hour times ("07:30").
 */
export function parseMinutes(time: string): number {
  if (!time) return 0;
  const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  else if (ap === 'am' && h === 12) h = 0;
  return h * 60 + min;
}
export const PX_PER_HOUR = 64;
// Fallback window used when a user has no classes yet (or none with usable
// times) and as the floor/ceiling every real schedule's window is unioned
// with, so a normal school day keeps the same look it always has.
export const DEFAULT_DAY_START_MIN = 7 * 60; // 7:00 AM
export const DEFAULT_DAY_END_MIN = 19 * 60; // 7:00 PM
export const TIME_GUTTER = 64; // left gutter for time labels
export const MIN_BLOCK_HEIGHT = 28; // minimum visible block height in px

export interface DayBounds {
  startMin: number;
  endMin: number;
}

export const DEFAULT_DAY_BOUNDS: DayBounds = { startMin: DEFAULT_DAY_START_MIN, endMin: DEFAULT_DAY_END_MIN };

/**
 * Compute the visible hour range for the calendar grid from a user's actual
 * classes, instead of the fixed 7 AM–7 PM window every DayView/WeekView used
 * to hardcode. A class (or a per-day `dayTimes` override) starting before 7
 * AM or ending after 7 PM used to render with a negative/overflowing pixel
 * offset that the scroll container clipped — effectively cutting the class
 * off the grid entirely. Looking at every class's times (not just the day
 * currently on screen) keeps the grid's scale stable while navigating
 * between days/weeks, the same way the old fixed constants did.
 *
 * The result is always unioned with the default 7 AM–7 PM window so a
 * typical school day's grid is unchanged from before this existed.
 */
export function computeDayBounds(classes: Pick<SchoolClass, 'startTime' | 'endTime' | 'dayTimes'>[]): DayBounds {
  let minStart = Infinity;
  let maxEnd = -Infinity;

  for (const c of classes) {
    const timeRanges: { startTime?: string; endTime?: string }[] = [
      { startTime: c.startTime, endTime: c.endTime },
      ...(c.dayTimes ? Object.values(c.dayTimes) : []),
    ];
    for (const { startTime, endTime } of timeRanges) {
      if (!startTime || !endTime) continue;
      const s = parseMinutes(startTime);
      const e = parseMinutes(endTime);
      if (e <= s) continue; // guard against malformed/placeholder times
      if (s < minStart) minStart = s;
      if (e > maxEnd) maxEnd = e;
    }
  }

  if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd)) {
    return { ...DEFAULT_DAY_BOUNDS };
  }

  // Half an hour of breathing room before the first class / after the last,
  // rounded out to whole-hour gridlines.
  const paddedStart = Math.floor((minStart - 30) / 60) * 60;
  const paddedEnd = Math.ceil((maxEnd + 30) / 60) * 60;

  return {
    startMin: Math.max(0, Math.min(DEFAULT_DAY_START_MIN, paddedStart)),
    endMin: Math.min(24 * 60, Math.max(DEFAULT_DAY_END_MIN, paddedEnd)),
  };
}

export function totalHeightFor(bounds: DayBounds): number {
  return ((bounds.endMin - bounds.startMin) / 60) * PX_PER_HOUR;
}

/** Whole-hour tick marks spanning `bounds`, for hour labels/gridlines. */
export function hoursInRange(bounds: DayBounds): number[] {
  const startHour = Math.floor(bounds.startMin / 60);
  const endHour = Math.ceil(bounds.endMin / 60);
  return Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
}

export function minutesToPixels(minutesSinceMidnight: number, bounds: DayBounds = DEFAULT_DAY_BOUNDS): number {
  return ((minutesSinceMidnight - bounds.startMin) / 60) * PX_PER_HOUR;
}

export function topForMinutes(minutesSinceMidnight: number, bounds: DayBounds = DEFAULT_DAY_BOUNDS): number {
  // Return fractional pixel value (no rounding). Using exact floats keeps
  // relative gaps proportional to actual minute differences which is more
  // visually consistent than asymmetric floor/ceil rounding.
  return minutesToPixels(minutesSinceMidnight, bounds);
}

export function heightForMinutes(startMinutes: number, endMinutes: number, bounds: DayBounds = DEFAULT_DAY_BOUNDS): number {
  // Use exact fractional height. Keep a minimum so very small intervals
  // remain visible.
  const startPx = minutesToPixels(startMinutes, bounds);
  const endPx = minutesToPixels(endMinutes, bounds);
  const height = endPx - startPx;
  return Math.max(height, MIN_BLOCK_HEIGHT);
}

export function hourTop(hour: number, bounds: DayBounds = DEFAULT_DAY_BOUNDS): number {
  return minutesToPixels(hour * 60, bounds);
}

export function halfHourTop(hour: number, bounds: DayBounds = DEFAULT_DAY_BOUNDS): number {
  return minutesToPixels(hour * 60 + 30, bounds);
}
