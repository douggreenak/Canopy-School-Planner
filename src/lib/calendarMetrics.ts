// Shared calendar layout constants and helpers to ensure DayView and WeekView
// compute identical pixel positions for the same times.
export const PX_PER_HOUR = 64;
export const DAY_START_MIN = 7 * 60; // 7:00 AM
export const DAY_END_MIN = 19 * 60; // 7:00 PM
export const TIME_GUTTER = 64; // left gutter for time labels
export const MIN_BLOCK_HEIGHT = 28; // minimum visible block height in px
export const TOTAL_HEIGHT = ((DAY_END_MIN - DAY_START_MIN) / 60) * PX_PER_HOUR;

export function minutesToPixels(minutesSinceMidnight: number) {
  return ((minutesSinceMidnight - DAY_START_MIN) / 60) * PX_PER_HOUR;
}

export function topForMinutes(minutesSinceMidnight: number) {
  // Return fractional pixel value (no rounding). Using exact floats keeps
  // relative gaps proportional to actual minute differences which is more
  // visually consistent than asymmetric floor/ceil rounding.
  return minutesToPixels(minutesSinceMidnight);
}

export function heightForMinutes(startMinutes: number, endMinutes: number) {
  // Use exact fractional height. Keep a minimum so very small intervals
  // remain visible.
  const startPx = minutesToPixels(startMinutes);
  const endPx = minutesToPixels(endMinutes);
  const height = endPx - startPx;
  return Math.max(height, MIN_BLOCK_HEIGHT);
}

export function hourTop(hour: number) {
  return (hour - 7) * PX_PER_HOUR;
}

export function halfHourTop(hour: number) {
  return (hour - 7) * PX_PER_HOUR + PX_PER_HOUR / 2;
}
