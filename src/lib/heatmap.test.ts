import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { buildHeatmap } from '@/lib/heatmap';
import type { Homework, Task, ScheduleDisruption } from '@/types';

const today = dayjs().startOf('day');
const dateAt = (offset: number) => today.add(offset, 'day').format('YYYY-MM-DD');

function hw(dueDate: string, completed = false): Homework {
  return { id: `hw-${dueDate}-${Math.random()}`, classId: 'c1', title: 'Worksheet', description: '', dueDate, completed, priority: 'medium', source: 'manual' };
}
function task(dueDate: string, completed = false): Task {
  return { id: `t-${dueDate}-${Math.random()}`, title: 'Study', dueDate, completed } as Task;
}

describe('buildHeatmap intensity', () => {
  it('is absolute, not relative to the busiest day in the window — a single lone item is "Light", not "Heavy"', () => {
    // Regression test: the old implementation scaled intensity relative to
    // the busiest day in the 14-day window, so during a quiet stretch where
    // the max was 1, that one day was rated "Heavy" (3/3) — the same rating
    // a genuinely overloaded 8-items day would get. A quiet week should never
    // paint red.
    const days = buildHeatmap([hw(dateAt(3))], []);
    const day = days.find((d) => d.date === dateAt(3))!;
    expect(day.total).toBe(1);
    expect(day.intensity).toBe(1); // Light, not Heavy
  });

  it('bands 0/1-2/3-4/5+ items into None/Light/Moderate/Heavy regardless of other days', () => {
    const days = buildHeatmap(
      [hw(dateAt(1)), hw(dateAt(2)), hw(dateAt(2)), hw(dateAt(3)), hw(dateAt(3)), hw(dateAt(3)), hw(dateAt(3)), hw(dateAt(4)), hw(dateAt(4)), hw(dateAt(4)), hw(dateAt(4)), hw(dateAt(4))],
      [],
    );
    expect(days.find((d) => d.date === dateAt(0))!.intensity).toBe(0); // 0 items — None
    expect(days.find((d) => d.date === dateAt(1))!.intensity).toBe(1); // 1 item — Light
    expect(days.find((d) => d.date === dateAt(2))!.intensity).toBe(1); // 2 items — Light
    expect(days.find((d) => d.date === dateAt(3))!.intensity).toBe(2); // 4 items — Moderate
    expect(days.find((d) => d.date === dateAt(4))!.intensity).toBe(3); // 5 items — Heavy
  });

  it('excludes completed homework/tasks from the count', () => {
    const days = buildHeatmap([hw(dateAt(2), true)], [task(dateAt(2), true)]);
    expect(days.find((d) => d.date === dateAt(2))!.total).toBe(0);
  });

  it('counts homework and tasks together', () => {
    const days = buildHeatmap([hw(dateAt(5)), hw(dateAt(5))], [task(dateAt(5))]);
    const day = days.find((d) => d.date === dateAt(5))!;
    expect(day.hwCount).toBe(2);
    expect(day.taskCount).toBe(1);
    expect(day.total).toBe(3);
  });
});

describe('buildHeatmap disruption-awareness', () => {
  it('flags a day covered by a disruption, using the disruption\'s own label', () => {
    const disruption: ScheduleDisruption = {
      id: 'd1',
      date: dateAt(6),
      type: 'no_school',
      label: 'Teacher In-Service Day',
      periodOverrides: [],
    };
    const days = buildHeatmap([], [], [disruption]);
    const flagged = days.find((d) => d.date === dateAt(6))!;
    expect(flagged.disruption).toEqual({ type: 'no_school', label: 'Teacher In-Service Day' });
    // Every other day in the window is untouched.
    expect(days.filter((d) => d.disruption).map((d) => d.date)).toEqual([dateAt(6)]);
  });

  it('falls back to the type\'s display label when the disruption has no custom label', () => {
    const disruption: ScheduleDisruption = { id: 'd2', date: dateAt(1), type: 'early_out', label: '', periodOverrides: [] };
    const days = buildHeatmap([], [], [disruption]);
    expect(days.find((d) => d.date === dateAt(1))!.disruption).toEqual({ type: 'early_out', label: 'Early Out' });
  });

  it('flags every day in a multi-day disruption range', () => {
    const disruption: ScheduleDisruption = {
      id: 'd3',
      date: dateAt(2),
      endDate: dateAt(4),
      type: 'no_school',
      label: 'Winter Storm Closure',
      periodOverrides: [],
    };
    const days = buildHeatmap([], [], [disruption]);
    expect(days.filter((d) => d.disruption).map((d) => d.date)).toEqual([dateAt(2), dateAt(3), dateAt(4)]);
  });

  it('leaves days with no covering disruption unflagged', () => {
    const days = buildHeatmap([], [], []);
    expect(days.every((d) => d.disruption === undefined)).toBe(true);
  });
});
