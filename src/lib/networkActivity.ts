'use client';
// ============================================================
// Shared network-activity tracker.
// Patches window.fetch ONCE for the whole app and classifies every request
// as a mutation (POST/PUT/DELETE) or a read (GET). Mutations drive the
// Saved/Saving/offline indicator near the logged-in user in AppShell.
// Deliberately does NOT block the UI (no full-screen overlay) — see
// SaveStatusIndicator.tsx for the small, non-blocking presentational chip.
// ============================================================
import { useSyncExternalStore } from 'react';

export type SaveState = 'offline' | 'saving' | 'saved' | 'error';

interface Snapshot {
  state: SaveState;
  lastSavedAt: number | null;
  lastError: string | null;
}

let mutationsInFlight = 0;
let online = true; // assume online until proven otherwise (avoids an SSR/first-paint flash)
let lastSavedAt: number | null = null;
let lastError: string | null = null;

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((cb) => cb());
}

function computeState(): SaveState {
  if (!online) return 'offline';
  if (mutationsInFlight > 0) return 'saving';
  if (lastError) return 'error';
  return 'saved';
}

let snapshot: Snapshot = { state: computeState(), lastSavedAt, lastError };
function refreshSnapshot() {
  snapshot = { state: computeState(), lastSavedAt, lastError };
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return snapshot;
}
// Must be referentially stable across calls (useSyncExternalStore requirement) —
// a fresh object literal here trips React's "should be cached" warning/loop.
const SERVER_SNAPSHOT: Snapshot = { state: 'saved', lastSavedAt: null, lastError: null };
function getServerSnapshot(): Snapshot {
  return SERVER_SNAPSHOT;
}

let installed = false;
export function installNetworkActivityTracking() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  online = navigator.onLine;

  const origFetch = window.fetch.bind(window);
  window.fetch = ((...args: Parameters<typeof fetch>) => {
    const init = args[1];
    const method = (init?.method || 'GET').toUpperCase();
    const isMutation = method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH';

    if (isMutation) {
      mutationsInFlight++;
      refreshSnapshot();
      emit();
    }

    const settle = (ok: boolean, errMessage?: string) => {
      if (!isMutation) return;
      mutationsInFlight = Math.max(0, mutationsInFlight - 1);
      if (ok) {
        lastSavedAt = Date.now();
        lastError = null;
      } else {
        lastError = errMessage || 'Save failed';
      }
      refreshSnapshot();
      emit();
    };

    return origFetch(...args).then(
      (res) => { settle(res.ok, res.ok ? undefined : `HTTP ${res.status}`); return res; },
      (err) => { settle(false, err instanceof Error ? err.message : 'Network error'); throw err; },
    );
  }) as typeof fetch;

  const goOnline = () => { online = true; refreshSnapshot(); emit(); };
  const goOffline = () => { online = false; refreshSnapshot(); emit(); };
  window.addEventListener('online', goOnline);
  window.addEventListener('offline', goOffline);
}

export function useSaveStatus(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
