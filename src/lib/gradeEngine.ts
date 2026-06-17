// Pure grade-math functions — no DB/fetch dependencies.
// All percent values are 0–100. Point values from PowerSchool are unreliable,
// so grades use equal-weight-per-assignment within each category.
// Results are labeled "estimated" in the UI to reflect this simplification.

import type { Homework } from '@/types';

/** Equal-weight mean of scorePercent for graded assignments in one category. */
export function categoryAverage(assignments: Homework[], category: string): number | undefined {
  const graded = assignments.filter((h) => h.category === category && h.scorePercent !== undefined);
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
  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0);
  if (totalWeight === 0) return undefined;

  const candidates: { assignment: Homework; delta: number }[] = [];
  for (const hw of after) {
    const old = beforeById.get(hw.sourceId ?? hw.id);
    if (!old || hw.scorePercent === undefined || old.scorePercent === undefined) continue;
    const diff = hw.scorePercent - old.scorePercent;
    if (Math.abs(diff) < 0.01) continue;

    const catWeight = weights[hw.category ?? ''] ?? 0;
    const catItemCount = after.filter((h) => h.category === hw.category && h.scorePercent !== undefined).length;
    if (catItemCount === 0) continue;
    const delta = diff * (catWeight / totalWeight) * (1 / catItemCount);
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
