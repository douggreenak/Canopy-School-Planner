import { describe, it, expect } from 'vitest';
import { generateAssemblyOverrides } from './schedule';
import { buildDaySchedule, generateCalendarFeed } from './calendar';
import { ASSEMBLY_PERIOD } from './disruptionTypes';
import type { SchoolClass, ScheduleDisruption } from '@/types';

// Wednesday (day 3): an Extension block plus periods 2, 3, 5, 6 — matches
// Lathrop High School's real Wed block pattern.
const wedClasses: SchoolClass[] = [
  { id: 'ext', name: 'Extension', teacher: '', room: '', color: '#000', period: 9, startTime: '07:30', endTime: '08:05', days: [3], semester: '' },
  { id: 'p2', name: 'English', teacher: 'A', room: '1', color: '#000', period: 2, startTime: '08:13', endTime: '09:26', days: [3], semester: '' },
  { id: 'p3', name: 'Math', teacher: 'B', room: '2', color: '#000', period: 3, startTime: '09:34', endTime: '10:47', days: [3], semester: '' },
  { id: 'p5', name: 'Science', teacher: 'C', room: '3', color: '#000', period: 5, startTime: '11:26', endTime: '12:39', days: [3], semester: '' },
  { id: 'p6', name: 'History', teacher: 'D', room: '4', color: '#000', period: 6, startTime: '12:47', endTime: '14:00', days: [3], semester: '' },
  { id: '__lunch__', name: 'Lunch', teacher: '', room: '', color: '#9E9E9E', period: 0, startTime: '10:50', endTime: '11:20', days: [1, 2, 3, 4, 5], semester: '' },
];

describe('generateAssemblyOverrides', () => {
  it('drops Extension, compresses every other period to 70 min with 8 min passing, and appends a 45 min Assembly block', () => {
    const overrides = generateAssemblyOverrides(wedClasses, 3);

    const ext = overrides.find((o) => o.period === 9);
    expect(ext?.cancelled).toBe(true);

    const p2 = overrides.find((o) => o.period === 2)!;
    expect(p2.cancelled).toBe(false);
    // Starts at the day's original earliest time (Extension's 07:30), not its own normal 08:13.
    expect(p2.startTime).toBe('07:30');
    expect(p2.endTime).toBe('08:40'); // 70 minutes

    const lunch = overrides.find((o) => o.period === 0)!;
    expect(lunch.startTime < overrides.find((o) => o.period === 5)!.startTime).toBe(true);

    const assembly = overrides.find((o) => o.period === ASSEMBLY_PERIOD)!;
    expect(assembly).toBeDefined();
    expect(assembly.cancelled).toBe(false);
    // 45-minute block
    const [sh, sm] = assembly.startTime.split(':').map(Number);
    const [eh, em] = assembly.endTime.split(':').map(Number);
    expect((eh * 60 + em) - (sh * 60 + sm)).toBe(45);
  });

  it('returns no overrides for a weekday with no classes', () => {
    expect(generateAssemblyOverrides(wedClasses, 6)).toEqual([]);
  });
});

describe('buildDaySchedule with an assembly disruption', () => {
  it('applies the compressed times and synthesizes a visible Assembly block — not the original schedule', () => {
    const overrides = generateAssemblyOverrides(wedClasses, 3);
    const disruption: ScheduleDisruption = {
      id: 'a1',
      date: '2026-02-04', // a Wednesday
      type: 'assembly',
      label: 'Pep Assembly',
      periodOverrides: overrides,
    };
    const day = buildDaySchedule('2026-02-04', wedClasses, [disruption]);

    // The bug this guards against: an assembly disruption with no wired-up
    // override generation left every class at its normal, undisrupted time.
    const p2 = day.classes.find((e) => e.classInfo.id === 'p2')!;
    expect(p2.startTime).not.toBe('08:13');
    expect(p2.startTime).toBe('07:30');

    const assembly = day.classes.find((e) => e.classInfo.id === '__assembly__');
    expect(assembly).toBeDefined();
    expect(assembly!.classInfo.name).toBe('Pep Assembly');
    expect(assembly!.cancelled).toBe(false);

    // The cancelled Extension entry collides (same start time) with the real,
    // now-active p2 entry that took over its slot — buildDaySchedule drops a
    // cancelled entry in that case (the running class takes priority in the
    // grid), so Extension simply doesn't appear rather than showing crossed out.
    const ext = day.classes.find((e) => e.classInfo.id === 'ext');
    expect(ext).toBeUndefined();
  });

  it('the Assembly block and compressed period times show up in the generated iCal feed', () => {
    const overrides = generateAssemblyOverrides(wedClasses, 3);
    const disruption: ScheduleDisruption = {
      id: 'a1',
      date: '2026-02-04',
      type: 'assembly',
      label: 'Pep Assembly',
      periodOverrides: overrides,
    };
    const ics = generateCalendarFeed(wedClasses, [], [], [disruption], '2026-01-28', '2026-02-11', 'Test High');
    expect(ics).toContain('SUMMARY:Pep Assembly');
    // The recurring English (period 2) occurrence for that Wednesday is
    // excluded and replaced by a one-off event at the compressed 07:30 start.
    expect(ics).toMatch(/EXDATE[^\n]*20260204T081300/);
    expect(ics).toContain('DTSTART;TZID=America/Anchorage:20260204T073000');
  });
});
