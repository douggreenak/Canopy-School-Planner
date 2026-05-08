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
  // Use floor for top so elements align to the earlier pixel and avoid
  // 1px gaps caused by inconsistent rounding between start/end calculations.
  return Math.floor(minutesToPixels(minutesSinceMidnight));
}

export function heightForMinutes(startMinutes: number, endMinutes: number) {
  // Use ceil for height so the block covers the full fractional pixel area
  // between start and end; this prevents tiny gaps at boundaries.
  return Math.max(Math.ceil(minutesToPixels(endMinutes) - minutesToPixels(startMinutes)), MIN_BLOCK_HEIGHT);
}

export function hourTop(hour: number) {
  return Math.floor((hour - 7) * PX_PER_HOUR);
}

export function halfHourTop(hour: number) {
  return Math.floor((hour - 7) * PX_PER_HOUR + PX_PER_HOUR / 2);
}
