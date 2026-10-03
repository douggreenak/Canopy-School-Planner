import { describe, it, expect } from 'vitest';
import { unweightedGpaPoints, weightedGpaPoints, overallGrade, simulateWhatIf, simulateScoreChange, predictGradeChange } from '@/lib/gradeEngine';
import type { Homework } from '@/types';

function hw(category: string, scorePercent: number | undefined): Homework {
  return {
    id: `${category}-${Math.random()}`, classId: 'c1', title: 'Item', description: '',
    dueDate: '', completed: scorePercent !== undefined, priority: 'medium', source: 'manual',
    category, scorePercent,
  };
}

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

describe('overallGrade', () => {
  it('weights categories by their configured percentages, not equally', () => {
    const assignments = [hw('Tests', 100), hw('Homework', 50)];
    const weights = { Tests: 80, Homework: 20 };
    // 100*0.8 + 50*0.2 = 90 — dominated by the heavily-weighted category,
    // not the 75 a plain average of the two categories would give.
    expect(overallGrade(assignments, weights)).toBeCloseTo(90, 5);
  });

  it('renormalizes over only categories with at least one graded item', () => {
    // Quizzes (30%) has no graded work yet — should drop out entirely
    // rather than averaging in as 0, leaving Tests/Homework renormalized
    // to their relative share of the remaining 70%.
    const assignments = [hw('Tests', 90), hw('Homework', 80)];
    const weights = { Tests: 50, Homework: 20, Quizzes: 30 };
    // 90*(50/70) + 80*(20/70)
    expect(overallGrade(assignments, weights)).toBeCloseTo(90 * (50 / 70) + 80 * (20 / 70), 5);
  });

  it('averages multiple assignments within the same category equally', () => {
    const assignments = [hw('Tests', 100), hw('Tests', 80), hw('Homework', 60)];
    const weights = { Tests: 70, Homework: 30 };
    // Tests avg = 90, Homework avg = 60 -> 90*0.7 + 60*0.3 = 81
    expect(overallGrade(assignments, weights)).toBeCloseTo(81, 5);
  });

  it('ignores ungraded assignments (no scorePercent) entirely', () => {
    const assignments = [hw('Tests', 100), hw('Tests', undefined)];
    expect(overallGrade(assignments, { Tests: 100 })).toBeCloseTo(100, 5);
  });

  it('returns undefined when nothing is graded yet', () => {
    expect(overallGrade([hw('Tests', undefined)], { Tests: 100 })).toBeUndefined();
  });
});

describe('simulateWhatIf', () => {
  it('projects the overall grade with a hypothetical assignment injected, respecting category weights', () => {
    const assignments = [hw('Tests', 90), hw('Homework', 80)];
    const weights = { Tests: 70, Homework: 30 };
    const before = overallGrade(assignments, weights)!; // 90*0.7 + 80*0.3 = 87
    expect(before).toBeCloseTo(87, 5);

    // A hypothetical 100 on a Tests item pulls the Tests average from 90
    // to 95 (two items, 90 and 100) — weighted: 95*0.7 + 80*0.3 = 90.5.
    const after = simulateWhatIf(assignments, weights, { category: 'Tests', percent: 100 });
    expect(after).toBeCloseTo(95 * 0.7 + 80 * 0.3, 5);
    expect(after! - before).toBeGreaterThan(0);
  });

  it('a hypothetical score in a brand-new category pulls it into the renormalized weighting', () => {
    const assignments = [hw('Tests', 100)];
    const weights = { Tests: 50, Homework: 50 };
    // Before: Homework has no graded work, so Tests (renormalized to 100%
    // of the active weight) is the whole grade.
    expect(overallGrade(assignments, weights)).toBeCloseTo(100, 5);
    // After injecting a 60 into Homework, both categories are now active
    // at their configured 50/50 split.
    const after = simulateWhatIf(assignments, weights, { category: 'Homework', percent: 60 });
    expect(after).toBeCloseTo(100 * 0.5 + 60 * 0.5, 5);
  });
});

describe('simulateScoreChange', () => {
  it('swaps one existing graded assignment\'s score and recomputes, leaving every other assignment untouched', () => {
    const assignments = [hw('Tests', 70), hw('Tests', 90), hw('Homework', 80)];
    const weights = { Tests: 70, Homework: 30 };
    const before = overallGrade(assignments, weights)!; // Tests avg 80 -> 80*0.7 + 80*0.3 = 80
    expect(before).toBeCloseTo(80, 5);

    // Swap the 70 for a hypothetical 100 -> Tests avg becomes 95.
    const targetId = assignments[0].id;
    const after = simulateScoreChange(assignments, weights, targetId, 100);
    expect(after).toBeCloseTo(95 * 0.7 + 80 * 0.3, 5);
  });

  it('assigns a hypothetical score to a still-ungraded assignment', () => {
    const assignments = [hw('Tests', 90), hw('Tests', undefined), hw('Homework', 80)];
    const weights = { Tests: 70, Homework: 30 };
    // Before: the ungraded Tests item doesn't count, so Tests avg is just 90.
    expect(overallGrade(assignments, weights)).toBeCloseTo(90 * 0.7 + 80 * 0.3, 5);

    const ungradedId = assignments[1].id;
    const after = simulateScoreChange(assignments, weights, ungradedId, 70);
    // Now both Tests items count: avg (90+70)/2 = 80.
    expect(after).toBeCloseTo(80 * 0.7 + 80 * 0.3, 5);
  });

  it('returns the same grade as before when given an unknown assignment id', () => {
    const assignments = [hw('Tests', 90), hw('Homework', 80)];
    const weights = { Tests: 70, Homework: 30 };
    const before = overallGrade(assignments, weights);
    const after = simulateScoreChange(assignments, weights, 'does-not-exist', 0);
    expect(after).toBeCloseTo(before!, 5);
  });
});

describe('predictGradeChange', () => {
  it('anchors the old grade on the official PowerSchool grade and applies the calculated change', () => {
    const a = [hw('Tests', 70), hw('Tests', 90), hw('Homework', 80)];
    const w = { Tests: 70, Homework: 30 };
    const r = predictGradeChange(a, w, a[0].id, 100, 83);
    expect(r.method).toBe('weighted');
    expect(r.oldGrade).toBe(83);
    expect(r.newGrade).toBeCloseTo(83 + 15 * 0.7, 5);
  });

  it('falls back to an equal-weight average when no weights are known', () => {
    const a = [hw('Tests', 70), hw('Homework', 90)];
    const r = predictGradeChange(a, {}, a[0].id, 100);
    expect(r.method).toBe('average');
    expect(r.oldGrade).toBeCloseTo(80, 5);
    expect(r.newGrade).toBeCloseTo(95, 5);
  });

  it('falls back when weight names do not match any assignment category', () => {
    const a = [hw('Tests', 70)];
    const r = predictGradeChange(a, { Quizzes: 100 }, a[0].id, 90);
    expect(r.method).toBe('average');
    expect(r.newGrade).toBeCloseTo(90, 5);
  });

  it('matches category names case/punctuation-insensitively', () => {
    const a = [hw('tests', 80), hw('Homework', 100)];
    expect(overallGrade(a, { Tests: 50, 'HOMEWORK': 50 })).toBeCloseTo(90, 5);
  });
});

describe('category name matching', () => {
  it('matches assignment categories to differently-worded weight names (Quizzes - Short Writes -> Quiz)', () => {
    const a = [hw('Quizzes - Short Writes', 80), hw('Test', 100)];
    expect(overallGrade(a, { Quiz: 25, Test: 75 })).toBeCloseTo(80 * 0.25 + 100 * 0.75, 5);
  });
});

describe('predictGradeChange — points-based classes (no category weights)', () => {
  it('weights by points possible, so a big assignment moves the grade more than a small one', () => {
    const big = { ...hw('Test', 80), score: '80/100' };
    const small = { ...hw('Classwork', 100), score: '5/5' };
    const r = predictGradeChange([big, small], {}, small.id, 0);
    // before: 85/105 = 80.95; after small scores 0: 80/105 = 76.19
    expect(r.oldGrade).toBeCloseTo((85 / 105) * 100, 3);
    expect(r.newGrade).toBeCloseTo((80 / 105) * 100, 3);
  });

  it('can fill in an ungraded assignment using the points possible shown as "--/30"', () => {
    const graded = { ...hw('Test', 100), score: '100/100' };
    const open = { ...hw('Quiz', undefined), score: '--/30' };
    const r = predictGradeChange([graded, open], {}, open.id, 50);
    expect(r.newGrade).toBeCloseTo(((100 + 15) / 130) * 100, 3);
  });
});
