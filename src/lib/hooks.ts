'use client';
// ============================================================
// Client-side data fetching hooks
// ============================================================
import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import type { SchoolClass, Homework, Exam, Task, ScheduleDisruption, GradeHistoryEntry, SyncLogEntry, AppSettings } from '@/types';

// Global state to deduplicate ongoing requests and provide a basic cache.
const ongoingRequests = new Map<string, Promise<any>>();
const globalCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5_000; // 5 seconds

// Background refresh cadence — keeps every page's data current without a
// manual reload. Long enough that it never fights with the 5s optimistic
// "undo" windows some pages use (e.g. Tasks' delete-undo snackbar), short
// enough that changes made elsewhere (another tab, a scheduled sync) show up
// within about a minute.
const POLL_MS = 60_000;

// Subscription system so all instances of useFetch(url) see the same data.
const subscribers = new Map<string, Set<() => void>>();
// One interval per URL, ref-counted by subscriber count — only polls URLs
// something on screen is actually showing.
const pollers = new Map<string, ReturnType<typeof setInterval>>();

function notifySubscribers(url: string) {
  const subs = subscribers.get(url);
  if (subs) subs.forEach((cb) => cb());
}

function startPolling(url: string) {
  if (pollers.has(url)) return;
  const id = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    fetchWithDeduplication(url, true).catch(() => {
      // Poll failures are silent — last-good cached data stays on screen and
      // the next tick (or a focus/reconnect revalidation) will retry.
    });
  }, POLL_MS);
  pollers.set(url, id);
}

function stopPolling(url: string) {
  const id = pollers.get(url);
  if (id !== undefined) {
    clearInterval(id);
    pollers.delete(url);
  }
}

function subscribe(url: string, cb: () => void) {
  let subs = subscribers.get(url);
  if (!subs) { subs = new Set(); subscribers.set(url, subs); }
  subs.add(cb);
  if (subs.size === 1) startPolling(url);
  return () => {
    subs!.delete(cb);
    if (subs!.size === 0) {
      subscribers.delete(url);
      stopPolling(url);
    }
  };
}

// Revalidate every URL something is actually showing right now — used on tab
// focus and on network reconnect so data catches up immediately instead of
// waiting up to POLL_MS.
function revalidateAllSubscribed() {
  for (const url of subscribers.keys()) {
    fetchWithDeduplication(url, true).catch(() => {});
  }
}

let globalListenersInstalled = false;
function ensureGlobalListeners() {
  if (globalListenersInstalled || typeof window === 'undefined') return;
  globalListenersInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') revalidateAllSubscribed();
  });
  window.addEventListener('online', revalidateAllSubscribed);
}

function getSnapshot<T>(url: string): T | null {
  return globalCache.get(url)?.data ?? null;
}

/**
 * Clear all client-side cached data and in-flight requests.
 * Call on logout so the next user can't see the previous user's data.
 */
export function clearClientCache() {
  globalCache.clear();
  ongoingRequests.clear();
}

async function fetchWithDeduplication<T>(url: string, forceRefresh = false): Promise<T> {
  if (!forceRefresh) {
    const cached = globalCache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }

  if (ongoingRequests.has(url)) {
    return ongoingRequests.get(url);
  }

  const requestPromise = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((d) => {
      globalCache.set(url, { data: d, timestamp: Date.now() });
      notifySubscribers(url);
      return d as T;
    })
    .finally(() => {
      ongoingRequests.delete(url);
    });

  ongoingRequests.set(url, requestPromise);
  return requestPromise;
}

function useFetch<T>(url: string) {
  ensureGlobalListeners();

  const cached = useSyncExternalStore(
    (cb) => subscribe(url, cb),
    () => getSnapshot<T>(url),
    () => null,
  );

  const [data, setData] = useState<T | null>(cached);
  // `loading` — true only until the FIRST data arrives for this URL, so a
  // page can show a skeleton in place of content that's never been fetched
  // yet. `validating` — true whenever ANY fetch for this URL is in flight,
  // including background polls/refetches after data already exists — for a
  // subtle in-place indicator that never discards what's already rendered.
  const [loading, setLoading] = useState(cached === null);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cached !== null) setData(cached);
  }, [cached]);

  const refetch = useCallback(async (forceRefresh = false): Promise<T> => {
    setValidating(true);
    setError(null);
    try {
      const d = await fetchWithDeduplication<T>(url, forceRefresh);
      setData(d);
      setLoading(false);
      return d;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(errorMessage);
      throw e;
    } finally {
      setValidating(false);
    }
  }, [url]);

  useEffect(() => { if (cached === null) refetch(); }, [refetch, cached]);

  const mutate = useCallback((next: T | null | ((prev: T | null) => T | null)) => {
    setData((prev) => {
      const updated = typeof next === 'function' ? (next as (p: T | null) => T | null)(prev) : next;
      globalCache.set(url, { data: updated, timestamp: Date.now() });
      // Defer to a microtask: notifySubscribers synchronously fires every other
      // useFetch(url) instance's setState (via useSyncExternalStore), and doing
      // that from inside this component's own setState updater — while React is
      // still processing this update — trips "Cannot update a component while
      // rendering a different component". A page that mounts several of these
      // hooks (e.g. Tasks: homework + tasks + classes + settings) and calls
      // mutate() from an event handler hits this every time; deferring one tick
      // lets this update finish first without changing anything mutate() callers
      // observe (they only ever await the follow-up API call, never read the
      // cache synchronously).
      queueMicrotask(() => notifySubscribers(url));
      return updated;
    });
  }, [url]);

  return { data, loading, validating, error, refetch, mutate };
}

export function useClasses() {
  return useFetch<SchoolClass[]>('/api/classes');
}

export function useHomework() {
  return useFetch<Homework[]>('/api/homework');
}

export function useExams() {
  return useFetch<Exam[]>('/api/exams');
}

export function useTasks() {
  return useFetch<Task[]>('/api/tasks');
}

export function useDisruptions() {
  return useFetch<ScheduleDisruption[]>('/api/disruptions');
}

export function useGradeHistory(classId?: string) {
  const url = classId ? `/api/grade-history?classId=${encodeURIComponent(classId)}` : '/api/grade-history';
  return useFetch<GradeHistoryEntry[]>(url);
}

export function useSyncLog(classId?: string, limit = 200) {
  const url = classId
    ? `/api/sync-log?classId=${encodeURIComponent(classId)}&limit=${limit}`
    : `/api/sync-log?limit=${limit}`;
  return useFetch<SyncLogEntry[]>(url);
}

export function useSettings() {
  return useFetch<Partial<AppSettings>>('/api/settings');
}

/**
 * Read-through GET for use outside a hook (e.g. a component that needs a
 * one-off value on mount rather than a live-updating subscription). Shares
 * the same cache + in-flight request dedup as useFetch/useSettings/etc., so
 * a raw fetch('/api/settings') that used to fire independently — and
 * duplicate whatever useSettings() elsewhere on the page just requested —
 * now collapses into that same request when one is already in flight, or
 * returns the still-fresh cached value.
 */
export async function apiGet<T>(url: string, forceRefresh = false): Promise<T> {
  return fetchWithDeduplication<T>(url, forceRefresh);
}

// Mutation helpers
export async function apiPost<T>(url: string, body: T) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiPut<T>(url: string, body: T) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiDelete(url: string) {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
