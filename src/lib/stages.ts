// ============================================================
// Completion-stage helpers.
//
// Each Task/Homework can optionally carry its own ordered pipeline of
// stages (e.g. "Done" then "Turned In") in its `stages` field — this is
// per-assignment, not a site-wide setting, so a reading log and a group
// project can have completely different pipelines (or none at all). When
// an item's `stages` is empty, it behaves exactly like the classic
// single-checkbox "completed" flag. `completed` always stays in sync as a
// derived flag (true iff stageId is that item's last stage) so every
// existing done/not-done filter, count, and grade calculation keeps
// working unchanged whether or not an item uses stages.
// ============================================================
import type { TaskStage } from '@/types';

/** Parse a `stages` DB/JSON value (JSON string, array, or unset/null). */
export function parseStages(raw: unknown): TaskStage[] {
  if (!raw) return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s): s is TaskStage => !!s && typeof s.id === 'string' && typeof s.label === 'string' && s.label.trim().length > 0)
      .map((s) => ({ id: s.id, label: s.label.trim() }));
  } catch {
    return [];
  }
}

/** Index of `stageId` within `stages`, or -1 for "not started"/unknown. */
export function stageIndex(stages: TaskStage[], stageId: string | undefined): number {
  if (!stageId) return -1;
  return stages.findIndex((s) => s.id === stageId);
}

/** Whether `stageId` is the final stage in the pipeline (i.e. fully done). */
export function isFinalStage(stages: TaskStage[], stageId: string | undefined): boolean {
  if (!stageId || stages.length === 0) return false;
  return stages[stages.length - 1].id === stageId;
}

/** The `completed` flag that should accompany a given stage selection. */
export function completedForStage(stages: TaskStage[], stageId: string | undefined): boolean {
  return isFinalStage(stages, stageId);
}

// ---- "Last used" convenience (client-only, per-browser) ----
// Purely a prefill suggestion for the Add dialog so a user who likes a
// Done -> Turned In pipeline doesn't have to retype it on every new item.
// It is NOT synced, NOT enforced, and every item remains free to use a
// different pipeline or none — this is not a substitute for a real setting.
const LAST_USED_KEY = 'canopy:lastTaskStages';

export function loadLastStageTemplate(): TaskStage[] {
  if (typeof window === 'undefined') return [];
  try {
    return parseStages(window.localStorage.getItem(LAST_USED_KEY));
  } catch {
    return [];
  }
}

export function saveLastStageTemplate(stages: TaskStage[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (stages.length === 0) window.localStorage.removeItem(LAST_USED_KEY);
    else window.localStorage.setItem(LAST_USED_KEY, JSON.stringify(stages));
  } catch {
    // Storage unavailable (private browsing, quota) — the prefill is a nicety, not required.
  }
}
