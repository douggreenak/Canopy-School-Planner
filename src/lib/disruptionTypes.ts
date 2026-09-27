// Canonical disruption type metadata — shared by client components
// (DisruptionCalendar's legend/dropdown) and server-side code (the iCal
// feed generator) alike, so labels can't drift between the two.
import type { ScheduleDisruption } from '@/types';

export interface DisruptionTypeInfo {
  value: ScheduleDisruption['type'];
  label: string;
  color: string;
}

export const DISRUPTION_TYPES: DisruptionTypeInfo[] = [
  { value: 'early_out',  label: 'Early Out',   color: '#f9ab00' },
  { value: 'late_start', label: 'Late Start',  color: '#1a73e8' },
  { value: 'no_school',  label: 'No School',   color: '#d93025' },
  { value: 'assembly',   label: 'Assembly',    color: '#7BAAF7' },
  { value: '1_6',        label: '1-6 Schedule', color: '#34a853' },
  // Runs another weekday's normal schedule on this date (e.g. a Thursday
  // schedule on a Monday) — see ScheduleDisruption.sourceDayOfWeek.
  { value: 'day_swap',   label: 'Different Day’s Schedule', color: '#8e24aa' },
  { value: 'custom',     label: 'Custom',      color: '#9aa0a6' },
];

/** Full weekday names, indexed 0=Sunday..6=Saturday — matches JS's Date/dayjs `.day()`. */
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Reserved `PeriodOverride.period` value for a synthesized "Assembly" block
 * on an `assembly` disruption — mirrors the `__lunch__` synthetic class's use
 * of period 0. buildDaySchedule matches this sentinel to synthesize an
 * Assembly entry directly (there's no real class behind it), the same way a
 * period 0 override lines up with the always-present synthetic Lunch class.
 */
export const ASSEMBLY_PERIOD = -1;

/** The display label for a disruption's type — used whenever a disruption's own `label` is blank. */
export function disruptionTypeLabel(type: ScheduleDisruption['type']): string {
  return DISRUPTION_TYPES.find((t) => t.value === type)?.label ?? type;
}
