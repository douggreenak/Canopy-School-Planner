// Workload heatmap + rebalancing — pure functions, no DB/fetch.
import dayjs from 'dayjs';
import type { Homework, Task } from '@/types';

export type HeatmapDay = {
  date: string; // ISO YYYY-MM-DD
  hwCount: number;
  taskCount: number;
  total: number;
  // 0 = no load, 1 = light, 2 = moderate, 3 = heavy
  intensity: 0 | 1 | 2 | 3;
};

/**
 * Build a 14-day forward-looking workload heatmap from today (inclusive).
 * Counts homework + tasks due on each day. Intensity is relative to the peak.
 */
export function buildHeatmap(homework: Homework[], tasks: Task[], days = 14): HeatmapDay[] {
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

  const entries = Array.from(counts.entries()).map(([date, { hw, task }]) => ({
    date,
    hwCount: hw,
    taskCount: task,
    total: hw + task,
  }));

  const max = Math.max(...entries.map((e) => e.total), 1);

  return entries.map((e) => ({
    ...e,
    intensity: (e.total === 0 ? 0 : e.total / max <= 0.33 ? 1 : e.total / max <= 0.66 ? 2 : 3) as 0 | 1 | 2 | 3,
  }));
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
