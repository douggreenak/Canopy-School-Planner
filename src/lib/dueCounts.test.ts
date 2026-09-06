import { describe, it, expect } from 'vitest';
import { buildDueCountMap, dueCountFor } from '@/lib/dueCounts';

describe('buildDueCountMap / dueCountFor', () => {
  it('counts items by classId+dueDate', () => {
    const map = buildDueCountMap([
      { classId: 'c1', dueDate: '2026-09-08' },
      { classId: 'c1', dueDate: '2026-09-08' },
      { classId: 'c1', dueDate: '2026-09-09' },
      { classId: 'c2', dueDate: '2026-09-08' },
    ]);
    expect(dueCountFor(map, 'c1', '2026-09-08')).toBe(2);
    expect(dueCountFor(map, 'c1', '2026-09-09')).toBe(1);
    expect(dueCountFor(map, 'c2', '2026-09-08')).toBe(1);
  });

  it('returns 0 (not undefined) for a class instance with nothing due', () => {
    const map = buildDueCountMap([{ classId: 'c1', dueDate: '2026-09-08' }]);
    expect(dueCountFor(map, 'c1', '2026-09-09')).toBe(0);
    expect(dueCountFor(undefined, 'c1', '2026-09-08')).toBe(0);
  });

  it('excludes items with no classId or no dueDate', () => {
    const map = buildDueCountMap([
      { classId: undefined, dueDate: '2026-09-08' },
      { classId: 'c1', dueDate: '' },
    ]);
    expect(map.size).toBe(0);
  });

  it('excludes dueTiming "after_class" but includes unset and "in_class"', () => {
    const map = buildDueCountMap([
      { classId: 'c1', dueDate: '2026-09-08', dueTiming: 'in_class' },
      { classId: 'c1', dueDate: '2026-09-08', dueTiming: undefined },
      { classId: 'c1', dueDate: '2026-09-08', dueTiming: 'after_class' },
    ]);
    expect(dueCountFor(map, 'c1', '2026-09-08')).toBe(2);
  });
});
