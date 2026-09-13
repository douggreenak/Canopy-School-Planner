import { describe, it, expect } from 'vitest';
import { unweightedGpaPoints, weightedGpaPoints } from '@/lib/gradeEngine';

describe('unweightedGpaPoints', () => {
  // Regression test: a prior version used a granular +/- scale (A=4.0,
  // A-=3.7, B+=3.3, …), so an A- visibly pulled a normal class's GPA below
  // 4.0 and an AP A- landed at 4.7 instead of a clean 5.0. GPA points are now
  // whole-letter only — a +/- changes the displayed letter grade, not the
  // GPA value.
  it('gives A and A- the same full 4.0 (no fractional penalty for the minus)', () => {
    expect(unweightedGpaPoints(95)).toBe(4.0); // A
    expect(unweightedGpaPoints(91)).toBe(4.0); // A-
    expect(unweightedGpaPoints(90)).toBe(4.0); // A- boundary
  });

  it('gives every B (+/-/plain) the same 3.0, every C the same 2.0, every D the same 1.0', () => {
    for (const p of [89, 85, 81, 80]) expect(unweightedGpaPoints(p)).toBe(3.0);
    for (const p of [79, 75, 71, 70]) expect(unweightedGpaPoints(p)).toBe(2.0);
    for (const p of [69, 65, 61, 60]) expect(unweightedGpaPoints(p)).toBe(1.0);
  });

  it('gives an F 0.0', () => {
    expect(unweightedGpaPoints(59)).toBe(0.0);
    expect(unweightedGpaPoints(0)).toBe(0.0);
  });
});

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

  it('an AP class with an A- hits a clean 5.0, not 4.7', () => {
    expect(weightedGpaPoints(91, true)).toBe(5.0);
  });
});
