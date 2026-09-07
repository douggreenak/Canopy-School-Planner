import { describe, it, expect } from 'vitest';
import { unweightedGpaPoints, weightedGpaPoints } from '@/lib/gradeEngine';

describe('weightedGpaPoints', () => {
  it('adds the standard +1.0 AP bump on top of the unweighted points', () => {
    expect(weightedGpaPoints(95, true)).toBeCloseTo(5.0, 5);
    expect(weightedGpaPoints(95, false)).toBeCloseTo(4.0, 5);
    expect(weightedGpaPoints(95)).toBeCloseTo(4.0, 5); // isAp omitted == not AP
  });

  it('matches unweightedGpaPoints exactly for non-AP classes', () => {
    for (const percent of [45, 61, 68, 74, 81, 88, 91, 96]) {
      expect(weightedGpaPoints(percent, false)).toBe(unweightedGpaPoints(percent));
    }
  });

  it('never lets an AP class score below its unweighted points', () => {
    expect(weightedGpaPoints(60, true)).toBeGreaterThan(unweightedGpaPoints(60));
  });
});
