import { describe, it, expect } from 'vitest';
import { generateCalendarFeed, buildDaySchedule } from '@/lib/calendar';
import type { SchoolClass, ScheduleDisruption } from '@/types';

// A single class meeting every Monday, generated for a feed window that
// spans exactly three Mondays: Jan 5, 12, 19 2026.
const monday: SchoolClass = {
  id: 'c1',
  name: 'Algebra II',
  teacher: 'Ms. Rivera',
  room: '204',
  color: '#2E7D32',
  period: 3,
  startTime: '09:00',
  endTime: '09:50',
  days: [1], // Monday
  semester: 'Spring 2026',
};

const SEM_START = '2026-01-05';
const SEM_END = '2026-01-19';

describe('generateCalendarFeed disruption-awareness', () => {
  it('excludes a no_school date from the recurring class RRULE (EXDATE) and emits no replacement event', () => {
    const disruption: ScheduleDisruption = {
      id: 'd1',
      date: '2026-01-12', // the middle Monday
      type: 'no_school',
      label: 'Teacher In-Service',
      periodOverrides: [],
    };
    const ics = generateCalendarFeed([monday], [], [], [disruption], SEM_START, SEM_END, 'Test High');

    // The recurring event's RRULE must exclude the disrupted Monday...
    expect(ics).toMatch(/EXDATE[^\n]*20260112T090000/);
    // ...and buildDaySchedule (what the one-off-event loop relies on) must
    // mark every period as cancelled that day, so no substitute "Algebra II"
    // event is created for Jan 12 either — the class is just gone that day.
    const day = buildDaySchedule('2026-01-12', [monday], [disruption]);
    expect(day.classes.every((e) => e.cancelled)).toBe(true);
    // No standalone "Algebra II" one-off event *starting* on the no-school
    // date itself (its EXDATE naming that date is expected and lives in the
    // same block as the recurring master — check DTSTART, not the whole block).
    const algebraEvents = ics.split('BEGIN:VEVENT').filter((b) => b.includes('SUMMARY:Algebra II'));
    expect(algebraEvents.some((b) => /DTSTART[^\n]*20260112/.test(b))).toBe(false);
  });

  it('shifts a class to its override time on an early-out day and reflects that in the feed', () => {
    const disruption: ScheduleDisruption = {
      id: 'd2',
      date: '2026-01-12',
      type: 'early_out',
      label: 'Early Out',
      periodOverrides: [{ period: 3, startTime: '09:00', endTime: '09:20', cancelled: false }],
    };
    const ics = generateCalendarFeed([monday], [], [], [disruption], SEM_START, SEM_END, 'Test High');
    // Recurring occurrence for that date is still excluded (replaced by a one-off)...
    expect(ics).toMatch(/EXDATE[^\n]*20260112T090000/);
    // ...and a one-off event exists at the shortened end time.
    expect(ics).toContain('DTSTART;TZID=America/Anchorage:20260112T090000');
    expect(ics).toContain('DTEND;TZID=America/Anchorage:20260112T092000');
  });

  it('emits an all-day marker event for every disruption, spanning multi-day ranges with an exclusive end date', () => {
    const disruption: ScheduleDisruption = {
      id: 'd3',
      date: '2026-01-12',
      endDate: '2026-01-13',
      type: 'no_school',
      label: 'Winter Storm Closure',
      periodOverrides: [],
    };
    const ics = generateCalendarFeed([monday], [], [], [disruption], SEM_START, SEM_END, 'Test High');
    expect(ics).toContain('SUMMARY:Winter Storm Closure');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260112');
    // Exclusive end (RFC5545 all-day convention) = day after the last covered day.
    expect(ics).toContain('DTEND;VALUE=DATE:20260114');
  });

  it('a 1_6 day runs a period even on a weekday the class does not normally meet', () => {
    const disruption: ScheduleDisruption = {
      id: 'd4',
      date: '2026-01-13', // a Tuesday — `monday` above never meets on Tuesday
      type: '1_6',
      label: '1-6 Schedule',
      periodOverrides: [{ period: 3, startTime: '10:00', endTime: '10:45', cancelled: false }],
    };
    const day = buildDaySchedule('2026-01-13', [monday], [disruption]);
    expect(day.classes).toHaveLength(1);
    expect(day.classes[0].cancelled).toBe(false);
    expect(day.classes[0].startTime).toBe('10:00');
  });

  it('a day_swap disruption runs the source weekday\'s classes/times instead of the actual date\'s', () => {
    const thursdayClass: SchoolClass = {
      id: 'c2',
      name: 'Chemistry',
      teacher: 'Mr. Lund',
      room: '110',
      color: '#0277BD',
      period: 5,
      startTime: '11:00',
      endTime: '11:50',
      days: [4], // Thursday only
      semester: 'Spring 2026',
    };
    const disruption: ScheduleDisruption = {
      id: 'd5',
      date: '2026-01-12', // a Monday — `monday` above normally meets this day
      type: 'day_swap',
      sourceDayOfWeek: 4, // run Thursday's schedule instead
      label: 'Thursday Schedule',
      periodOverrides: [],
    };
    const day = buildDaySchedule('2026-01-12', [monday, thursdayClass], [disruption]);
    // Only the Thursday class shows up — the Monday class (which doesn't
    // meet on Thursdays) is entirely absent, not just shifted/cancelled.
    expect(day.classes).toHaveLength(1);
    expect(day.classes[0].classInfo.id).toBe('c2');
    expect(day.classes[0].startTime).toBe('11:00');
    expect(day.classes[0].cancelled).toBe(false);
  });
});
