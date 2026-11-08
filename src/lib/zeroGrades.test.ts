import { describe, it, expect } from 'vitest';
import type { Homework } from '@/types';
import { activeZeroAssignments, isZeroGrade, parseDismissedZeros, serializeDismissedZeros, zeroKey } from './zeroGrades';

function hw(over: Partial<Homework>): Homework {
  return {
    id: 'h1', classId: 'c1', title: 'Quiz', description: '', dueDate: '2026-11-01', completed: false,
    priority: 'medium', source: 'powerschool', sourceId: 'ps-1', ...over,
  } as Homework;
}

describe('zeroGrades', () => {
  it('flags only PowerSchool assignments scored exactly 0', () => {
    expect(isZeroGrade(hw({ scorePercent: 0 }))).toBe(true);
    expect(isZeroGrade(hw({ scorePercent: undefined, score: '0/20' }))).toBe(true);
    expect(isZeroGrade(hw({ scorePercent: 55 }))).toBe(false);
    expect(isZeroGrade(hw({ scorePercent: undefined, score: undefined }))).toBe(false);
    expect(isZeroGrade(hw({ scorePercent: 0, source: 'manual' }))).toBe(false);
    expect(isZeroGrade(hw({ scorePercent: 0, flags: 'Exempt' }))).toBe(false);
  });

  it('keys on the PowerSchool id and hides dismissed items', () => {
    const a = hw({ id: 'a', sourceId: 'ps-a', scorePercent: 0 });
    const b = hw({ id: 'b', sourceId: 'ps-b', scorePercent: 0 });
    expect(zeroKey(a)).toBe('ps-a');
    expect(zeroKey({ id: 'x', sourceId: undefined })).toBe('x');
    expect(activeZeroAssignments([a, b], ['ps-a']).map((h) => h.id)).toEqual(['b']);
  });

  it('round-trips the stored setting and tolerates junk', () => {
    expect(parseDismissedZeros(serializeDismissedZeros(['a', 'b', 'a']))).toEqual(['a', 'b']);
    expect(parseDismissedZeros('not json')).toEqual([]);
    expect(parseDismissedZeros(undefined)).toEqual([]);
  });
});
