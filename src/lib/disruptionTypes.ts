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
  { value: 'custom',     label: 'Custom',      color: '#9aa0a6' },
];

/** The display label for a disruption's type — used whenever a disruption's own `label` is blank. */
export function disruptionTypeLabel(type: ScheduleDisruption['type']): string {
  return DISRUPTION_TYPES.find((t) => t.value === type)?.label ?? type;
}
