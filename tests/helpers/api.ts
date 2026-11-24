import './env';
import { BASE } from './env';

export interface Session { token: string; username: string; password: string }

let counter = 0;
export function uniqueName(prefix = 'e2e'): string {
  return `${prefix}_${Date.now().toString(36)}_${counter++}`;
}

let ipSeq = 0;
/** A distinct fake client IP per call so the (real, unmodified) per-IP rate limiter never trips across tests. */
export function fakeIp(): string {
  const n = (Date.now() + ipSeq++) % 16_000_000;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

export async function register(username = uniqueName(), password = 'correct-horse-battery'): Promise<Session> {
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': fakeIp() },
    body: JSON.stringify({ action: 'register', username, password }),
  });
  if (res.status !== 200) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get('set-cookie') ?? '';
  const token = /sp-session=([^;]+)/.exec(cookie)?.[1];
  if (!token) throw new Error('no session cookie on register');
  return { token, username, password };
}

export function client(session: Session) {
  const call = (path: string, init: RequestInit = {}) => fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}`, ...(init.headers ?? {}) },
  });
  return {
    get: async <T = unknown>(path: string) => (await call(path)).json() as Promise<T>,
    post: (path: string, body: unknown) => call(path, { method: 'POST', body: JSON.stringify(body) }),
    put: (path: string, body: unknown) => call(path, { method: 'PUT', body: JSON.stringify(body) }),
    del: (path: string) => call(path, { method: 'DELETE' }),
    raw: call,
  };
}

import type { SchoolClass } from '@/types';
let classSeq = 0;
export function makeClass(period: number, name: string, days: number[], start = '08:00', end = '09:00', extra: Partial<SchoolClass> = {}): SchoolClass {
  return {
    id: `cls-${Date.now().toString(36)}-${classSeq++}`,
    name, teacher: 'Demo Teacher', room: `${100 + period}`, color: '#4285f4',
    period, startTime: start, endTime: end, days, semester: 'Current', source: 'manual',
    ...extra,
  } as SchoolClass;
}

/** Fictional Lathrop-style class set: P1-P6 plus an extension block. */
export function demoClasses(): SchoolClass[] {
  return [
    makeClass(7, 'Ext Seminar 9-12 169', [2, 3, 4], '07:30', '08:05'),
    makeClass(1, 'AP Pre-Calculus', [1, 4, 5], '07:30', '08:24'),
    makeClass(2, 'AP Literature', [1, 3, 5], '08:31', '09:25'),
    makeClass(3, 'AP US History', [1, 4, 5], '09:32', '10:26'),
    makeClass(4, 'Digital Electronics', [1, 2, 5], '11:04', '11:58'),
    makeClass(5, 'Aerospace Engineering', [1, 3, 5], '12:05', '12:59'),
    makeClass(6, 'AP Physics', [1, 4, 5], '13:06', '14:00'),
  ];
}
