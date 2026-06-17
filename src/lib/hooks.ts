'use client';
// ============================================================
// Client-side data fetching hooks
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import type { SchoolClass, Homework, Exam, Task, ScheduleDisruption, GradeHistoryEntry, SyncLogEntry } from '@/types';

// Global state to deduplicate ongoing requests and provide a basic cache.
const ongoingRequests = new Map<string, Promise<any>>();
const globalCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5_000; // 5 seconds

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
      return d as T;
    })
    .finally(() => {
      ongoingRequests.delete(url);
    });

  ongoingRequests.set(url, requestPromise);
  return requestPromise;
}

function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => { refetch(); }, [refetch]);

  const mutate = useCallback((next: T | null | ((prev: T | null) => T | null)) => {
    setData((prev) => {
      const updated = typeof next === 'function' ? (next as (p: T | null) => T | null)(prev) : next;
      globalCache.set(url, { data: updated, timestamp: Date.now() });
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
