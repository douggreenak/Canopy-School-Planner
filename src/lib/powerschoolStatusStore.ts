'use client';
// ============================================================
// Global PowerSchool sync status — a small subscribable store, independent
// of whichever page/component kicked off (or is watching) a sync.
//
// Why this exists: the sync itself already survives navigation (it runs
// server-side via after() — see src/lib/powerschoolSync.ts). But the
// PAGE-LEVEL "syncing" button state that was tracking it lived in that
// page's local React state, so navigating away (or the settings/grades
// page unmounting) made it LOOK like the sync had stopped, even though it
// was still running. This store polls the status endpoint independent of
// any one page, so:
//   - the save-status bubble can show "Syncing PowerSchool…" from anywhere
//   - any page that cares (Settings, Grades, Grade Detail) can ask "is a
//     sync already in flight?" on mount and resume showing it correctly
// ============================================================
import { useSyncExternalStore } from 'react';

export interface PowerSchoolStatus {
  syncId: string;
  status: 'idle' | 'running' | 'success' | 'error';
  startedAt?: string;
  finishedAt?: string;
  log: string[];
  result: Record<string, unknown> | null;
  error: string | null;
}

const IDLE_STATUS: PowerSchoolStatus = { syncId: '', status: 'idle', log: [], result: null, error: null };

let current: PowerSchoolStatus = IDLE_STATUS;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((cb) => cb());
}

// Poll fast while a sync is actually running (so the UI feels live), slower
// otherwise (just enough to notice a scheduled/cron sync starting without
// anyone clicking anything in this tab).
const RUNNING_POLL_MS = 2500;
const IDLE_POLL_MS = 15000;

let timer: ReturnType<typeof setTimeout> | null = null;
let refCount = 0;
// Shared in-flight promise (rather than a plain boolean) so a concurrent
// caller — e.g. a page's own mount-time fetchPowerSchoolStatusNow() firing
// in the same tick as the store's own subscribe-triggered poll() — awaits
// the SAME request instead of firing a second, redundant one.
let inFlightRequest: Promise<PowerSchoolStatus> | null = null;

async function fetchStatus(): Promise<PowerSchoolStatus> {
  if (inFlightRequest) return inFlightRequest;
  inFlightRequest = (async () => {
    try {
      const res = await fetch('/api/powerschool/status');
      if (res.ok) {
        const data: PowerSchoolStatus = await res.json();
        current = data;
        emit();
      }
    } catch {
      // Transient failure — keep last known status, try again next tick.
    } finally {
      inFlightRequest = null;
    }
    return current;
  })();
  return inFlightRequest;
}

async function poll() {
  await fetchStatus();
  if (refCount > 0) {
    timer = setTimeout(poll, current.status === 'running' ? RUNNING_POLL_MS : IDLE_POLL_MS);
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  refCount++;
  if (refCount === 1) {
    poll(); // kick off immediately on first subscriber
  }
  return () => {
    listeners.delete(cb);
    refCount--;
    if (refCount === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

function getSnapshot() {
  return current;
}
function getServerSnapshot() {
  return IDLE_STATUS;
}

export function usePowerSchoolSyncStatus(): PowerSchoolStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Forces an immediate poll, bypassing whatever cadence is currently
 * scheduled. Without this, a tab that's been sitting idle (so the store
 * backed off to the slow IDLE_POLL_MS cadence) wouldn't reflect a sync
 * IT ITSELF just started for up to IDLE_POLL_MS — the save-status bubble
 * would look stale in the very tab where the user clicked "Sync Now" until
 * that slow timer happened to fire. Call this right after kicking off a
 * sync (see powerschoolClient.ts).
 */
export function pokePowerSchoolStatus() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  poll();
}

/** One-off check outside the hook — used on mount to decide whether to resume a "syncing" UI state, without waiting for the poll cadence. */
export async function fetchPowerSchoolStatusNow(): Promise<PowerSchoolStatus> {
  return fetchStatus();
}
