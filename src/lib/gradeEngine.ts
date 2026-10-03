// Pure grade-math functions — no DB/fetch dependencies.
// All percent values are 0–100. Point values from PowerSchool are unreliable,
// so grades use equal-weight-per-assignment within each category.
// Results are labeled "estimated" in the UI to reflect this simplification.

import type { Homework } from '@/types';

/**
 * Whole-letter-grade 4.0-scale GPA points for a percent grade (0-100) — A is
 * 4, B is 3, C is 2, D is 1, F is 0. A +/- modifier changes the displayed
 * letter (see letterFromPercent in grades.ts) but NOT the GPA points: an A-
 * still earns the full 4.0, exactly like a plain A, not a fractional 3.7.
 * This is a deliberate choice, not an oversight — a prior version used the
 * more granular scale some schools do (A=4.0, A-=3.7, B+=3.3, …), which is
 * why an A- used to visibly pull a GPA below 4.0.
 */
export function unweightedGpaPoints(percent: number): number {
  if (percent >= 90) return 4.0; // A, A-
  if (percent >= 80) return 3.0; // B+, B, B-
  if (percent >= 70) return 2.0; // C+, C, C-
  if (percent >= 60) return 1.0; // D+, D, D-
  return 0.0; // F
}

/**
 * Weighted grade points. Standard AP weighting: +1.0 added to the 4.0-scale
 * unweighted points for an AP class (so an AP "A" registers as 5.0 instead
 * of 4.0). Non-AP classes are numerically identical to unweightedGpaPoints —
 * this is the function every "weighted GPA" display should call.
 */
export function weightedGpaPoints(percent: number, isAp?: boolean): number {
  return unweightedGpaPoints(percent) + (isAp ? 1.0 : 0);
}

/** Category names compare case/punctuation-insensitively ("Tests" == "tests", "Quizzes/Labs" == "quizzes labs"). */
function normCat(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Assignment category names rarely match the weight table's names exactly
 * ("Quizzes - Short Writes" scores into the "Quiz" weight, "Tests" into
 * "Test"), so one name matching the start of the other counts as a match.
 */
function categoriesMatch(a: string, b: string): boolean {
  const x = normCat(a);
  const y = normCat(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 3 && long.startsWith(short);
}

/** Equal-weight mean of scorePercent for graded assignments in one category. */
export function categoryAverage(assignments: Homework[], category: string): number | undefined {
  const graded = assignments.filter((h) => categoriesMatch(h.category ?? '', category) && h.scorePercent !== undefined);
  if (graded.length === 0) return undefined;
  return graded.reduce((sum, h) => sum + (h.scorePercent ?? 0), 0) / graded.length;
}

/**
 * Weighted overall grade. Renormalizes weights over only the categories that
 * have at least one graded item, so an empty Quizzes bucket doesn't drag the grade.
 */
export function overallGrade(
  assignments: Homework[],
  weights: Record<string, number>,
): number | undefined {
  const active: { weight: number; avg: number }[] = [];
  for (const [cat, weight] of Object.entries(weights)) {
    const avg = categoryAverage(assignments, cat);
    if (avg !== undefined) active.push({ weight, avg });
  }
  if (active.length === 0) return undefined;
  const total = active.reduce((s, { weight }) => s + weight, 0);
  if (total === 0) return undefined;
  return active.reduce((s, { weight, avg }) => s + (weight / total) * avg, 0);
}

/**
 * What-if projection: inject a hypothetical assignment into the given category
 * and return the projected overall grade.
 */
export function simulateWhatIf(
  assignments: Homework[],
  weights: Record<string, number>,
  hypothesis: { category: string; percent: number },
): number | undefined {
  const fake: Homework = {
    id: '__whatif__',
    classId: '',
    title: 'Hypothetical',
    description: '',
    dueDate: '',
    completed: false,
    priority: 'medium',
    source: 'manual',
    scorePercent: hypothesis.percent,
    category: hypothesis.category,
  };
  return overallGrade([...assignments, fake], weights);
}

/**
 * What-if projection for ONE SPECIFIC existing assignment: swap its score
 * for a hypothetical one (rather than injecting a new item, like
 * simulateWhatIf above) and return the projected overall grade. Works just
 * as well on an already-graded assignment ("what if I'd gotten an 85
 * instead of a 70") as on a still-ungraded one ("what if I get a 95 on
 * this") — either way the target assignment's category average, and
 * therefore the overall grade, recomputes with that one score swapped in.
 * Every other assignment (including other ungraded ones) is left exactly
 * as-is.
 */
export function simulateScoreChange(
  assignments: Homework[],
  weights: Record<string, number>,
  assignmentId: string,
  percent: number,
): number | undefined {
  const updated = assignments.map((h) =>
    h.id === assignmentId ? { ...h, scorePercent: percent } : h,
  );
  return overallGrade(updated, weights);
}

/**
 * Find which assignment most moved the overall grade between two snapshots.
 * Compares "after" against "before" by sourceId/id. Returns the largest
 * contributor and the approximate grade delta it caused.
 */
export function mostImpactfulAssignment(
  after: Homework[],
  before: Homework[],
  weights: Record<string, number>,
): { assignment: Homework; delta: number } | undefined {
  const beforeById = new Map(before.map((h) => [h.sourceId ?? h.id, h]));
  const current = calcGrade(after, weights);
  if (current.grade === undefined) return undefined;

  // Each changed assignment is judged by what the class grade would be with
  // ONLY that assignment put back to its old score, using the same grade
  // model as everything else (category weights when the class has them,
  // total points when it doesn't). That makes a test in a 40% category — or
  // a 100-point test in a points-based class — outweigh a small extra-credit
  // item, instead of every item counting the same within its category.
  const candidates: { assignment: Homework; delta: number }[] = [];
  for (const hw of after) {
    const old = beforeById.get(hw.sourceId ?? hw.id);
    if (!old || hw.scorePercent === old.scorePercent) continue;
    if (hw.scorePercent !== undefined && old.scorePercent !== undefined && Math.abs(hw.scorePercent - old.scorePercent) < 0.01) continue;

    const reverted = after.map((h) => (h.id === hw.id ? { ...h, scorePercent: old.scorePercent } : h));
    const without = calcGrade(reverted, weights);
    if (without.grade === undefined || without.method !== current.method) continue;
    const delta = current.grade - without.grade;
    if (Math.abs(delta) < 0.001) continue;
    candidates.push({ assignment: hw, delta });
  }

  if (candidates.length === 0) return undefined;
  return candidates.reduce((best, c) => Math.abs(c.delta) > Math.abs(best.delta) ? c : best);
}

/**
 * Rank "Missing"-flagged assignments by the grade hit of scoring a 0 vs. not
 * being there at all. Largest potential hit first. Skips already-scored items.
 */
export function missingWorkImpact(
  assignments: Homework[],
  weights: Record<string, number>,
): { homework: Homework; gradeImpactPercent: number }[] {
  const missing = assignments.filter(
    (h) => h.flags && /missing/i.test(h.flags) && h.scorePercent === undefined,
  );
  if (missing.length === 0) return [];

  const baseGrade = overallGrade(assignments, weights) ?? 100;

  const results = missing.map((hw) => {
    const withZero: Homework = { ...hw, scorePercent: 0 };
    const projected = overallGrade(
      [...assignments.filter((h) => h.id !== hw.id), withZero],
      weights,
    ) ?? baseGrade;
    return { homework: hw, gradeImpactPercent: Math.max(0, baseGrade - projected) };
  });

  return results.sort((a, b) => b.gradeImpactPercent - a.gradeImpactPercent);
}

export interface GradePrediction {
  /** The class grade today — PowerSchool's own when we have it, else our calculation. */
  oldGrade?: number;
  /** The class grade if the assignment scored the simulated percent. */
  newGrade?: number;
  /** 'weighted' = real category weights were applied; 'average' = no usable category weights, so it's computed from total points (or an equal-weight mean when points are unknown) — an estimate. */
  method: 'weighted' | 'average';
}

function calcGrade(assignments: Homework[], weights: Record<string, number>): { grade?: number; method: 'weighted' | 'average' } {
  const weighted = overallGrade(assignments, weights);
  if (weighted !== undefined) return { grade: weighted, method: 'weighted' };
  const scored = assignments.filter((h) => h.scorePercent !== undefined);
  if (scored.length === 0) return { grade: undefined, method: 'average' };
  // No category weights usually means a points-based class (PowerSchool shows
  // an empty weight table): the grade is total points earned / total points
  // possible, so a 100-point test moves it far more than a 5-point worksheet.
  // Points possible come from the score text ("15/15", or "--/100" while
  // still ungraded). Falls back to a plain mean when any count is unknown.
  const possible = scored.map((h) => {
    const m = (h.score ?? '').match(/\/\s*(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : 0;
  });
  if (possible.every((p) => p > 0)) {
    const total = possible.reduce((a, b) => a + b, 0);
    const earned = scored.reduce((sum, h, i) => sum + ((h.scorePercent ?? 0) / 100) * possible[i], 0);
    return { grade: (earned / total) * 100, method: 'average' };
  }
  return { grade: scored.reduce((s, h) => s + (h.scorePercent ?? 0), 0) / scored.length, method: 'average' };
}

/**
 * Predicts the class grade if ONE assignment scored `percent`. Computes the
 * grade with and without that change and applies the difference to
 * PowerSchool's own reported grade (when known), so the "old grade" shown
 * is exactly what the student sees in PowerSchool rather than our slightly
 * different re-calculation.
 */
export function predictGradeChange(
  assignments: Homework[],
  weights: Record<string, number>,
  assignmentId: string,
  percent: number,
  officialGrade?: number | null,
): GradePrediction {
  const before = calcGrade(assignments, weights);
  const updated = assignments.map((h) => (h.id === assignmentId ? { ...h, scorePercent: percent } : h));
  const after = calcGrade(updated, weights);
  // Weighted-before but average-after (or vice versa) can't be compared fairly.
  const method = after.method;
  if (officialGrade != null && before.grade !== undefined && after.grade !== undefined && before.method === after.method) {
    return { oldGrade: officialGrade, newGrade: Math.max(0, officialGrade + (after.grade - before.grade)), method };
  }
  return { oldGrade: officialGrade ?? before.grade, newGrade: after.grade, method };
}
