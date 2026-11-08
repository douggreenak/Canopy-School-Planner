import type { Homework } from '@/types';
import { homeworkPercent } from '@/lib/grades';

// Zero-grade warnings. A synced PowerSchool assignment that scored 0 raises
// a dismissible banner; dismissing is permanent per assignment and stored in
// the `dismissedZeroAssignments` setting so it follows the user across web,
// iPhone, iPad, Mac, and Watch.

// Identity that survives re-syncs: PowerSchool's own id when present (the
// local row id is regenerated if the assignment is ever re-imported).
export function zeroKey(h: Pick<Homework, 'id' | 'sourceId'>): string {
  return h.sourceId || h.id;
}

export function parseDismissedZeros(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function isZeroGrade(h: Homework): boolean {
  if (h.source !== 'powerschool') return false;
  if (h.flags && /exempt|collected/i.test(h.flags)) return false;
  const pct = homeworkPercent(h);
  return pct !== null && pct === 0;
}

export function activeZeroAssignments(homework: Homework[], dismissed: string[]): Homework[] {
  const hidden = new Set(dismissed);
  return homework
    .filter((h) => isZeroGrade(h) && !hidden.has(zeroKey(h)))
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
}

// The setting is capped at 10,000 chars server-side; keep the newest keys.
export function serializeDismissedZeros(keys: string[]): string {
  const unique = Array.from(new Set(keys));
  return JSON.stringify(unique.slice(-150));
}
