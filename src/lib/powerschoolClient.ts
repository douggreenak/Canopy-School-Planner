// ============================================================
// Client-side helper for the background PowerSchool sync flow: kick off a
// sync (returns almost instantly now that the server backgrounds the real
// work via after()), then poll for the result. Used by Settings, Grades,
// and the per-class Grade Detail page so all three "Sync Now" buttons
// behave identically and survive the tab being closed mid-sync — closing
// the tab just stops polling; the sync itself keeps running server-side and
// its result is waiting in /api/powerschool/status next time the page loads.
// ============================================================
import { pokePowerSchoolStatus } from '@/lib/powerschoolStatusStore';

export interface SyncStatusResult {
  syncId: string;
  status: 'idle' | 'running' | 'success' | 'error';
  startedAt?: string;
  finishedAt?: string;
  log: string[];
  result: Record<string, unknown> | null;
  error: string | null;
}

const POLL_MS = 2000;
const MAX_POLLS = 150; // ~5 minutes of polling before giving up client-side (the server-side job keeps going regardless — see vercel.json maxDuration)

/**
 * Polls /api/powerschool/status until it reaches a terminal state
 * (success/error), or the poll budget runs out. Does NOT start anything —
 * use this to resume watching a sync that's already running (e.g. one
 * discovered on page mount), or call syncPowerSchoolAndWait below to also
 * kick one off first.
 */
export async function waitForPowerSchoolSync(
  onTick?: (status: SyncStatusResult) => void,
): Promise<SyncStatusResult> {
  for (let i = 0; i < MAX_POLLS; i++) {
    const res = await fetch('/api/powerschool/status');
    if (res.ok) {
      const status: SyncStatusResult = await res.json();
      onTick?.(status);
      if (status.status === 'success' || status.status === 'error') return status;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return { syncId: '', status: 'running', log: [], result: null, error: null };
}

/**
 * Starts a PowerSchool sync (optionally with fresh credentials) and polls
 * until it reaches a terminal state (success/error), or the poll budget
 * runs out. `onTick` fires on every poll so callers can show live progress.
 */
export async function syncPowerSchoolAndWait(
  creds?: { url: string; username: string; password: string },
  onTick?: (status: SyncStatusResult) => void,
): Promise<SyncStatusResult> {
  const startRes = await fetch('/api/powerschool', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds ?? {}),
  });
  const startData = await startRes.json();
  if (!startRes.ok || startData.success === false) {
    return {
      syncId: '', status: 'error', log: startData.log ?? [],
      result: null, error: startData.error || 'Sync failed to start.',
    };
  }

  // Nudge the global status store to reflect "running" right away in THIS
  // tab too, rather than waiting for its own (possibly slow, backed-off)
  // poll cadence to happen to fire next.
  pokePowerSchoolStatus();

  return waitForPowerSchoolSync(onTick);
}
