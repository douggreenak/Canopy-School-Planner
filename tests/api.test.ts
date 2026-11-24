import { describe, it, expect, beforeAll } from 'vitest';
import { BASE } from './helpers/env';
import { register, client, demoClasses, uniqueName, fakeIp, type Session } from './helpers/api';
import { testDb } from './helpers/db';
import type { ScheduleDisruption } from '@/types';

describe('auth', () => {
  it('rejects weak passwords and duplicate usernames', async () => {
    const short = await fetch(`${BASE}/api/auth`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': fakeIp() }, body: JSON.stringify({ action: 'register', username: uniqueName(), password: 'short' }) });
    expect(short.status).toBe(400);
    const s = await register();
    const dup = await fetch(`${BASE}/api/auth`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': fakeIp() }, body: JSON.stringify({ action: 'register', username: s.username, password: 'another-long-password' }) });
    expect(dup.status).toBe(409);
  });

  it('logs in with the right password only', async () => {
    const s = await register();
    const bad = await fetch(`${BASE}/api/auth`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': fakeIp() }, body: JSON.stringify({ action: 'login', username: s.username, password: 'wrong-password-123' }) });
    expect(bad.status).toBe(401);
    const good = await fetch(`${BASE}/api/auth`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': fakeIp() }, body: JSON.stringify({ action: 'login', username: s.username, password: s.password }) });
    expect(good.status).toBe(200);
    expect(good.headers.get('set-cookie')).toMatch(/HttpOnly/i);
  });

  it('requires a session for data endpoints and never caches API responses', async () => {
    for (const path of ['/api/classes', '/api/disruptions', '/api/tasks', '/api/archive']) {
      const res = await fetch(`${BASE}${path}`);
      expect(res.status, path).toBe(401);
    }
    const s = await register();
    const ok = await fetch(`${BASE}/api/classes`, { headers: { authorization: `Bearer ${s.token}` } });
    expect(ok.headers.get('cache-control')).toMatch(/no-store/);
  });
});

describe('rate limiting', () => {
  it('blocks repeated registrations from one IP', async () => {
    const ip = fakeIp();
    const attempt = () => fetch(`${BASE}/api/auth`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ action: 'register', username: '', password: '' }) });
    let blocked = 0;
    for (let i = 0; i < 14; i++) if ((await attempt()).status === 429) blocked++;
    expect(blocked).toBeGreaterThan(0);
  });
});

describe('privacy: users cannot see each other’s data', () => {
  it('keeps classes, tasks and disruptions private per account', async () => {
    const a = client(await register());
    const b = client(await register());
    const [cls] = demoClasses();
    expect((await a.post('/api/classes', cls)).status).toBe(200);
    expect((await a.post('/api/disruptions', { id: 'priv-1', date: '2026-12-01', type: 'no_school', label: 'A only', periodOverrides: [] })).status).toBe(200);
    expect(await b.get<unknown[]>('/api/classes')).toEqual([]);
    expect(await b.get<unknown[]>('/api/disruptions')).toEqual([]);
    expect((await a.get<{ id: string }[]>('/api/classes')).map((c) => c.id)).toContain(cls.id);
  });
});

describe('Lathrop early out is always the official 1-6 schedule', () => {
  let me: ReturnType<typeof client>;
  let session: Session;
  beforeAll(async () => {
    session = await register();
    me = client(session);
    for (const c of demoClasses()) await me.post('/api/classes', c);
  });

  const stale = [{ period: 2, startTime: '08:13', endTime: '09:26', cancelled: false }, { period: 0, startTime: '10:26', endTime: '10:57', cancelled: false }];
  const byPeriod = (d: ScheduleDisruption) => Object.fromEntries(d.periodOverrides.map((o) => [o.period, o]));

  it('new accounts start in Lathrop Mode', async () => {
    const settings = await me.get<Record<string, unknown>>('/api/settings');
    expect(String(settings.lathropMode)).toBe('true');
  });

  it('replaces stale stored overrides with the official times (all six periods, lunch, ext cancelled)', async () => {
    // 2026-11-25 is a Wednesday.
    expect((await me.post('/api/disruptions', { id: 'eo-1', date: '2026-11-25', type: 'early_out', label: '', periodOverrides: stale })).status).toBe(200);
    const list = await me.get<ScheduleDisruption[]>('/api/disruptions');
    const eo = byPeriod(list.find((d) => d.id === 'eo-1')!);
    const expected: Record<number, [string, string]> = { 1: ['07:30', '08:10'], 2: ['08:15', '08:55'], 3: ['09:00', '09:40'], 4: ['09:50', '10:30'], 5: ['10:35', '11:15'], 6: ['11:20', '12:00'] };
    for (const [p, [s, e]] of Object.entries(expected)) {
      expect(eo[Number(p)], `period ${p}`).toMatchObject({ startTime: s, endTime: e, cancelled: false });
    }
    expect(eo[0]).toMatchObject({ startTime: '12:00', endTime: '12:30', cancelled: false });
    expect(eo[7]?.cancelled).toBe(true); // extension block meets Wednesday → cancelled
  });

  it('does not touch other disruption types', async () => {
    await me.post('/api/disruptions', { id: 'c-1', date: '2026-12-02', type: 'custom', label: '', periodOverrides: stale });
    const list = await me.get<ScheduleDisruption[]>('/api/disruptions');
    expect(list.find((d) => d.id === 'c-1')!.periodOverrides).toEqual(stale);
  });

  it('leaves early outs alone when Lathrop Mode is off', async () => {
    const other = client(await register());
    await other.post('/api/settings', { key: 'lathropMode', value: 'false' });
    await other.post('/api/disruptions', { id: 'eo-2', date: '2026-11-25', type: 'early_out', label: '', periodOverrides: stale });
    const list = await other.get<ScheduleDisruption[]>('/api/disruptions');
    expect(list.find((d) => d.id === 'eo-2')!.periodOverrides).toEqual(stale);
  });
});

describe('account deletion', () => {
  it('removes the user’s rows from every table, including the class archive', async () => {
    const s = await register();
    const me = client(s);
    const [cls] = demoClasses();
    await me.post('/api/classes', cls);
    const db = await testDb();
    try {
      const [[u]] = await db.query<never[]>('SELECT id FROM users WHERE username = ?', [s.username.toLowerCase()]) as unknown as [{ id: string }[]];
      await db.query('INSERT INTO archived_classes (id, user_id, name, teacher, period, school_year) VALUES (?,?,?,?,?,?)', [`arch-${u.id}`, u.id, 'Old', 'T', 1, '2024-25']);
      const res = await me.post('/api/auth', { action: 'deleteAccount', password: s.password });
      expect(res.status).toBe(200);
      for (const t of ['classes', 'archived_classes', 'settings', 'sessions']) {
        const [rows] = await db.query<never[]>(`SELECT 1 FROM \`${t}\` WHERE user_id = ?`, [u.id]);
        expect((rows as unknown[]).length, t).toBe(0);
      }
    } finally { await db.end(); }
  });
});
