import { describe, it, expect } from 'vitest';
import { moveOverride, resizeOverride, findOverlaps, buildStartingOverrides, minutesToTime, snap, DAY_START_MIN, DAY_END_MIN } from './customSchedule';
import { buildDaySchedule } from './calendar';
import type { PeriodOverride, SchoolClass } from '@/types';

const o = (period: number, startTime: string, endTime: string, cancelled = false): PeriodOverride => ({ period, startTime, endTime, cancelled });
const cls = (period: number, days: number[], start = '08:00', end = '09:00'): SchoolClass => ({
  id: `c${period}`, name: `Class ${period}`, teacher: '', room: '', color: '#fff', period, startTime: start, endTime: end, days, semester: '',
} as SchoolClass);

describe('customSchedule helpers', () => {
  it('formats and snaps minutes', () => {
    expect(minutesToTime(7 * 60 + 5)).toBe('07:05');
    expect(snap(7)).toBe(5);
    expect(snap(8)).toBe(10);
  });
  it('moves a block, keeping its length and snapping to 5 minutes', () => {
    expect(moveOverride(o(1, '08:00', '08:50'), 13)).toMatchObject({ startTime: '08:15', endTime: '09:05' });
    expect(moveOverride(o(1, '08:00', '08:50'), -20)).toMatchObject({ startTime: '07:40', endTime: '08:30' });
  });
  it('clamps moves to the editable day', () => {
    expect(moveOverride(o(1, '07:00', '07:50'), -600).startTime).toBe(minutesToTime(DAY_START_MIN));
    const late = moveOverride(o(1, '15:00', '15:50'), 600);
    expect(late.endTime).toBe(minutesToTime(DAY_END_MIN));
    expect(late.startTime).toBe(minutesToTime(DAY_END_MIN - 50));
  });
  it('resizes either edge but never below the minimum length', () => {
    expect(resizeOverride(o(1, '08:00', '08:50'), 'end', 10).endTime).toBe('09:00');
    expect(resizeOverride(o(1, '08:00', '08:50'), 'start', -10).startTime).toBe('07:50');
    expect(resizeOverride(o(1, '08:00', '08:50'), 'end', -500).endTime).toBe('08:10');
    expect(resizeOverride(o(1, '08:00', '08:50'), 'start', 500).startTime).toBe('08:40');
  });
  it('finds overlapping live blocks and ignores cancelled ones', () => {
    const list = [o(1, '08:00', '09:00'), o(2, '08:30', '09:30'), o(3, '09:30', '10:00'), o(4, '08:00', '10:00', true)];
    expect([...findOverlaps(list)].sort()).toEqual([0, 1]);
  });
  it('starts from a weekday, using only classes that meet that day, sorted by time', () => {
    const classes = [cls(2, [1, 3], '09:00', '10:00'), cls(1, [1], '08:00', '09:00'), cls(3, [2])];
    const out = buildStartingOverrides({ kind: 'weekday', day: 1 }, classes, { lathrop: false });
    expect(out.map((x) => x.period)).toEqual([1, 2]);
  });
  it('starts from 1-6 and from the Lathrop early out', () => {
    const classes = [cls(1, [2]), cls(2, [3]), { ...cls(0, [1, 2, 3, 4, 5]), id: '__lunch__' }];
    expect(buildStartingOverrides({ kind: '1_6' }, classes, { lathrop: true }).length).toBeGreaterThan(0);
    const eo = buildStartingOverrides({ kind: 'early_out' }, classes, { lathrop: true });
    expect(eo.find((x) => x.period === 1)).toMatchObject({ startTime: '07:30', endTime: '08:10' });
    expect(eo.find((x) => x.period === 0)).toMatchObject({ startTime: '12:00', endTime: '12:30' });
  });
  it('a custom disruption drives the day schedule, including classes not normally meeting', () => {
    const classes = [cls(1, [2]), cls(2, [3])];
    const dis = [{ id: 'x', date: '2026-11-25', type: 'custom' as const, label: '', periodOverrides: [o(1, '10:00', '10:30'), o(2, '11:00', '11:30', true)] }];
    const day = buildDaySchedule('2026-11-25', classes, dis); // Wed: only P2 normally
    const p1 = day.classes.find((e) => e.classInfo.period === 1);
    expect(p1).toMatchObject({ startTime: '10:00', endTime: '10:30', cancelled: false });
    expect(day.classes.find((e) => e.classInfo.period === 2)?.cancelled).toBe(true);
  });
});
