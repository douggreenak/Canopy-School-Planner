// ============================================================
// Client-side helper for the background PowerSchool sync flow: kick off a
// sync (returns almost instantly now that the server backgrounds the real
// work via after()), then poll for the result. Used by Settings, Grades,
// and the per-class Grade Detail page so all three "Sync Now" buttons
// behave identically and survive the tab being closed mid-sync — closing
// the tab just stops polling; the sync itself keeps running server-side and
// its result is waiting in /api/powerschool/status next time the page loads.
// ============================================================

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

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const res = await fetch('/api/powerschool/status');
    if (!res.ok) continue;
    const status: SyncStatusResult = await res.json();
    onTick?.(status);
    if (status.status === 'success' || status.status === 'error') return status;
  }

  return { syncId: startData.syncId ?? '', status: 'running', log: [], result: null, error: null };
}
