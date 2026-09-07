// Maps homework/task items to the specific class-instance calendar badge
// they belong to (Phase 6: "a small number badge = count of assignments due
// at that specific class instance"). Kept dependency-free (no ical-generator
// etc.) since DayView/WeekView are client components that call this on every
// render of the schedule grid.
import type { Homework, Task } from '@/types';

type DueItem = Pick<Homework | Task, 'dueDate' | 'dueTiming'> & { classId?: string };

function dueCountKey(classId: string, date: string): string {
  return `${classId}::${date}`;
}

/**
 * Builds a classId+date -> count map from homework/task items. An item
 * counts toward a class instance's badge when it has a classId, a dueDate,
 * and its dueTiming isn't explicitly 'after_class' (unset/'in_class' both
 * count — unset is the common case for older rows and manually-added
 * items, see TaskRow/ItemDetailDialog's "no chip when unset" convention).
 * Completed items still count — a badge reflects what's due that day
 * regardless of whether it's already been checked off.
 */
export function buildDueCountMap(items: DueItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    if (!item.classId || !item.dueDate) continue;
    if (item.dueTiming === 'after_class') continue;
    const key = dueCountKey(item.classId, item.dueDate);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

/** Looks up the due-count for one class instance — 0 when there's no entry (never render a "0" badge). */
export function dueCountFor(map: Map<string, number> | undefined, classId: string, date: string): number {
  return map?.get(dueCountKey(classId, date)) ?? 0;
}
