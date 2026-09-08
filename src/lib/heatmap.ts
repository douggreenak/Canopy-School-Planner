// Workload heatmap + rebalancing — pure functions, no DB/fetch.
import dayjs from 'dayjs';
import type { Homework, Task, ScheduleDisruption } from '@/types';
import { disruptionCoversDate } from './calendar';
import { disruptionTypeLabel } from './disruptionTypes';

export type HeatmapDay = {
  date: string; // ISO YYYY-MM-DD
  hwCount: number;
  taskCount: number;
  total: number;
  // 0 = no load, 1 = light, 2 = moderate, 3 = heavy
  intensity: 0 | 1 | 2 | 3;
  // Present when a schedule disruption (no-school day, early out, etc.)
  // covers this date — lets the UI flag it alongside the workload count
  // instead of showing a plain, context-free number.
  disruption?: { type: ScheduleDisruption['type']; label: string };
};

// Absolute item-count bands, not relative-to-the-busiest-day-in-window.
// Relative scaling always paints the single busiest day of any 14-day
// window red/"Heavy", even during a genuinely quiet stretch where that day
// only has one thing due — the opposite of what "Heavy" should signal.
// These fixed thresholds are calibrated to a typical high-school day's
// combined homework + task load.
function intensityFor(total: number): 0 | 1 | 2 | 3 {
  if (total === 0) return 0;
  if (total <= 2) return 1; // Light
  if (total <= 4) return 2; // Moderate
  return 3; // Heavy
}

/**
 * Build a 14-day forward-looking workload heatmap from today (inclusive).
 * Counts homework + tasks due on each day, and flags any day a schedule
 * disruption (no-school, early-out, 1-6, etc.) covers so the UI can surface
 * that context next to the workload count.
 */
export function buildHeatmap(
  homework: Homework[],
  tasks: Task[],
  disruptions: ScheduleDisruption[] = [],
  days = 14,
): HeatmapDay[] {
  const today = dayjs().startOf('day');
  const counts = new Map<string, { hw: number; task: number }>();

  for (let i = 0; i < days; i++) {
    const d = today.add(i, 'day').format('YYYY-MM-DD');
    counts.set(d, { hw: 0, task: 0 });
  }

  for (const h of homework) {
    if (!h.dueDate || h.completed) continue;
    if (counts.has(h.dueDate)) {
      counts.get(h.dueDate)!.hw++;
    }
  }
  for (const t of tasks) {
    if (!t.dueDate || t.completed) continue;
    if (counts.has(t.dueDate)) {
      counts.get(t.dueDate)!.task++;
    }
  }

  return Array.from(counts.entries()).map(([date, { hw, task }]) => {
    const total = hw + task;
    const disruption = disruptions.find((d) => disruptionCoversDate(d, date));
    return {
      date,
      hwCount: hw,
      taskCount: task,
      total,
      intensity: intensityFor(total),
      disruption: disruption ? { type: disruption.type, label: disruption.label || disruptionTypeLabel(disruption.type) } : undefined,
    };
  });
}

export type RebalanceSuggestion = {
  homework: Homework;
  currentDue: string;
  clusterSize: number;
  // Recommended "start by" date (day before due, adjusted for clusters)
  startBy: string;
  reason: string;
};

/**
 * Suggest starting earlier for homework items whose due dates cluster with
 * 2+ other items in a ±1-day window. Computed on-the-fly, never persisted.
 */
export function suggestRebalancing(homework: Homework[]): RebalanceSuggestion[] {
  const today = dayjs().startOf('day');
  const upcoming = homework.filter(
    (h) => !h.completed && h.dueDate && dayjs(h.dueDate).diff(today, 'day') >= 0,
  );

  // Count items per due date (±1 day window for cluster detection)
  const dueCounts = new Map<string, number>();
  for (const h of upcoming) {
    const d = h.dueDate;
    dueCounts.set(d, (dueCounts.get(d) ?? 0) + 1);
  }

  const suggestions: RebalanceSuggestion[] = [];
  for (const hw of upcoming) {
    // Cluster = items due same day ± 1 day
    let cluster = 0;
    for (const [d, count] of dueCounts) {
      if (Math.abs(dayjs(d).diff(dayjs(hw.dueDate), 'day')) <= 1) cluster += count;
    }
    if (cluster < 3) continue; // not crowded enough to warrant a suggestion

    const daysUntil = dayjs(hw.dueDate).diff(today, 'day');
    if (daysUntil < 2) continue; // need at least 2 days of runway to meaningfully suggest starting earlier

    const startBy = dayjs(hw.dueDate).subtract(Math.min(2, daysUntil - 1), 'day').format('YYYY-MM-DD');
    if (startBy <= today.format('YYYY-MM-DD')) continue;

    suggestions.push({
      homework: hw,
      currentDue: hw.dueDate,
      clusterSize: cluster,
      startBy,
      reason: `Clusters with ${cluster - 1} other item${cluster - 1 === 1 ? '' : 's'} around ${dayjs(hw.dueDate).format('MMM D')}`,
    });
  }

  // Deduplicate and limit output
  return suggestions.slice(0, 10);
}
