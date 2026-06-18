'use client';
// ============================================================
// Client-side data fetching hooks
// ============================================================
import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import type { SchoolClass, Homework, Exam, Task, ScheduleDisruption, GradeHistoryEntry, SyncLogEntry } from '@/types';

// Global state to deduplicate ongoing requests and provide a basic cache.
const ongoingRequests = new Map<string, Promise<any>>();
const globalCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5_000; // 5 seconds

// Subscription system so all instances of useFetch(url) see the same data.
const subscribers = new Map<string, Set<() => void>>();

function notifySubscribers(url: string) {
  const subs = subscribers.get(url);
  if (subs) subs.forEach((cb) => cb());
}

function subscribe(url: string, cb: () => void) {
  let subs = subscribers.get(url);
  if (!subs) { subs = new Set(); subscribers.set(url, subs); }
  subs.add(cb);
  return () => { subs!.delete(cb); if (subs!.size === 0) subscribers.delete(url); };
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
  const cached = useSyncExternalStore(
    (cb) => subscribe(url, cb),
    () => getSnapshot<T>(url),
    () => null,
  );

  const [data, setData] = useState<T | null>(cached);
  const [loading, setLoading] = useState(cached === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cached !== null) setData(cached);
  }, [cached]);

  const refetch = useCallback(async (forceRefresh = false): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchWithDeduplication<T>(url, forceRefresh);
      setData(d);
      return d;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(errorMessage);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { if (cached === null) refetch(); }, [refetch, cached]);

  const mutate = useCallback((next: T | null | ((prev: T | null) => T | null)) => {
    setData((prev) => {
      const updated = typeof next === 'function' ? (next as (p: T | null) => T | null)(prev) : next;
      globalCache.set(url, { data: updated, timestamp: Date.now() });
      notifySubscribers(url);
      return updated;
    });
  }, [url]);

  return { data, loading, error, refetch, mutate };
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
