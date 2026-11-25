import { describe, it, expect } from 'vitest';
import { BASE } from './helpers/env';
import { register, client, makeClass, fakeIp, type Session } from './helpers/api';
import { testDb } from './helpers/db';

const ip = () => ({ 'x-forwarded-for': fakeIp() });

async function mint(s: Session, scope: 'read' | 'write' = 'read', name = 'test'): Promise<{ token: string; id: string }> {
  const res = await client(s).post('/api/tokens', { name, scope, password: s.password, expiresInDays: 30 });
  expect(res.status).toBe(201);
  return res.json();
}

const v1 = (token: string, path: string, init: RequestInit = {}) =>
  fetch(`${BASE}/api/v1${path}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...ip(), ...(init.headers ?? {}) } });

async function mcp(token: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${BASE}/api/mcp`, {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...ip(), ...headers },
  });
}
const call = async (token: string, name: string, args: unknown = {}) =>
  (await (await mcp(token, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).json()).result;

describe('token management', () => {
  it('requires a session AND the password; shows the raw token once and stores only a hash', async () => {
    const s = await register();
    expect((await fetch(`${BASE}/api/tokens`)).status).toBe(401);
    const bad = await client(s).post('/api/tokens', { name: 'x', scope: 'read', password: 'wrong-password-1' });
    expect(bad.status).toBe(401);
    const { token, id } = await mint(s);
    expect(token).toMatch(/^spk_[A-Za-z0-9_-]{43}$/);

    const list = await client(s).get<{ tokens: Record<string, unknown>[] }>('/api/tokens');
    expect(list.tokens).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(token);

    const db = await testDb();
    const [rows] = await db.query('SELECT token_hash FROM api_tokens WHERE id = ?', [id]) as unknown as [{ token_hash: string }[]];
    await db.end();
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].token_hash).not.toContain(token);
  });

  it('API tokens cannot manage tokens or reach session-only endpoints; sessions cannot use /api/v1', async () => {
    const s = await register();
    const { token } = await mint(s);
    for (const path of ['/api/tokens', '/api/classes', '/api/tasks']) {
      expect((await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } })).status, path).toBe(401);
    }
    // /api/settings deliberately answers anonymous callers with {} — the token must get no data from it.
    const st = await fetch(`${BASE}/api/settings`, { headers: { authorization: `Bearer ${token}` } });
    expect(await st.json()).toEqual({});
    expect((await v1(s.token, '/classes')).status).toBe(401); // a session token is not an API token
    const cookieOnly = await fetch(`${BASE}/api/v1/classes`, { headers: { cookie: `sp-session=${s.token}`, ...ip() } });
    expect(cookieOnly.status).toBe(401); // cookies are never honoured here
  });

  it('revocation takes effect immediately, and password change revokes all tokens', async () => {
    const s = await register();
    const { token, id } = await mint(s);
    expect((await v1(token, '/classes')).status).toBe(200);
    expect((await client(s).del(`/api/tokens?id=${id}`)).status).toBe(200);
    expect((await v1(token, '/classes')).status).toBe(401);

    const t2 = await mint(s);
    const change = await client(s).post('/api/auth', { action: 'changePassword', currentPassword: s.password, newPassword: 'a-brand-new-password' });
    expect(change.status).toBe(200);
    expect((await v1(t2.token, '/classes')).status).toBe(401);
  });

  it("one user cannot revoke or see another user's tokens", async () => {
    const a = await register(); const b = await register();
    const ta = await mint(a);
    expect((await client(b).del(`/api/tokens?id=${ta.id}`)).status).toBe(404);
    expect((await v1(ta.token, '/classes')).status).toBe(200);
    expect((await client(b).get<{ tokens: unknown[] }>('/api/tokens')).tokens).toEqual([]);
  });

  it('rejects expired tokens', async () => {
    const s = await register();
    const { token, id } = await mint(s);
    const db = await testDb();
    await db.query('UPDATE api_tokens SET expires_at = ? WHERE id = ?', [Date.now() - 1000, id]);
    await db.end();
    expect((await v1(token, '/classes')).status).toBe(401);
  });
});

describe('REST /api/v1', () => {
  it('only ever returns the token owner\'s data', async () => {
    const a = await register(); const b = await register();
    await client(a).post('/api/classes', makeClass(1, 'A-Secret-Class', [1]));
    await client(a).post('/api/tasks', { id: 't-a', title: 'A private task', description: '', dueDate: '2026-12-01', completed: false, priority: 'low', category: 'General' });
    const tb = await mint(b); const ta = await mint(a);

    const bClasses = await (await v1(tb.token, '/classes')).json();
    expect(bClasses.classes).toEqual([]);
    expect(JSON.stringify(await (await v1(tb.token, '/tasks')).json())).not.toContain('A private task');
    expect(JSON.stringify(await (await v1(ta.token, '/classes')).json())).toContain('A-Secret-Class');
    expect((await v1(tb.token, '/tasks/t-a', { method: 'DELETE' })).status).toBe(403); // read-only token
  });

  it('read tokens cannot write; write tokens can, but only on their own rows', async () => {
    const a = await register(); const b = await register();
    const ra = await mint(a, 'read'); const wa = await mint(a, 'write'); const wb = await mint(b, 'write');

    expect((await v1(ra.token, '/tasks', { method: 'POST', body: JSON.stringify({ title: 'nope' }) })).status).toBe(403);
    const created = await v1(wa.token, '/tasks', { method: 'POST', body: JSON.stringify({ title: 'Study', dueDate: '2026-12-05' }) });
    expect(created.status).toBe(201);
    const { task } = await created.json();

    // user B's write token can neither modify nor delete A's task
    expect((await v1(wb.token, `/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ completed: true }) })).status).toBe(404);
    expect((await v1(wb.token, `/tasks/${task.id}`, { method: 'DELETE' })).status).toBe(404);
    const done = await v1(wa.token, `/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ completed: true }) });
    expect((await done.json()).task.completed).toBe(true);

    // can't attach a task to someone else's class
    const aClass = makeClass(1, 'Mine', [1]);
    await client(a).post('/api/classes', aClass);
    const cross = await v1(wb.token, '/tasks', { method: 'POST', body: JSON.stringify({ title: 'x', classId: aClass.id }) });
    expect(cross.status).toBe(400);
  });

  it('validates input and never exposes credentials/settings', async () => {
    const s = await register();
    const w = await mint(s, 'write');
    expect((await v1(w.token, '/tasks', { method: 'POST', body: JSON.stringify({ title: '' }) })).status).toBe(400);
    expect((await v1(w.token, '/tasks', { method: 'POST', body: JSON.stringify({ title: 'x', dueDate: 'tomorrow' }) })).status).toBe(400);
    expect((await v1(w.token, '/tasks', { method: 'POST', body: 'not json' })).status).toBe(400);
    expect((await v1(w.token, '/assignments?from=garbage')).status).toBe(400);
    expect((await v1(w.token, '/settings')).status).toBe(404);
    const up = await v1(w.token, '/upcoming?days=7');
    expect(up.status).toBe(200);
    expect(up.headers.get('cache-control')).toMatch(/no-store/);
  });

  it('401s with a challenge for missing/garbage tokens', async () => {
    for (const h of [{} as Record<string, string>, { authorization: 'Bearer nope' }, { authorization: 'Bearer spk_' + 'a'.repeat(43) }]) {
      const r = await fetch(`${BASE}/api/v1/classes`, { headers: { ...ip(), ...h } });
      expect(r.status).toBe(401);
      expect(r.headers.get('www-authenticate')).toMatch(/Bearer/);
    }
  });
});

describe('MCP /api/mcp', () => {
  it('rejects unauthenticated requests and cross-site browser origins', async () => {
    const r = await fetch(`${BASE}/api/mcp`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', ...ip() } });
    expect(r.status).toBe(401);
    const s = await register(); const { token } = await mint(s);
    const evil = await mcp(token, { jsonrpc: '2.0', id: 1, method: 'ping' }, { origin: 'https://evil.example' });
    expect(evil.status).toBe(403);
    expect((await fetch(`${BASE}/api/mcp`, { method: 'GET', headers: { authorization: `Bearer ${token}` } })).status).toBe(405);
  });

  it('initializes, lists only the tools the token scope allows, and answers notifications with 202', async () => {
    const s = await register();
    const r = await mint(s, 'read'); const w = await mint(s, 'write');
    const init = await (await mcp(r.token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })).json();
    expect(init.result.protocolVersion).toBe('2025-06-18');
    expect(init.result.serverInfo.name).toBe('canopy-school-planner');
    expect((await mcp(r.token, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);

    const names = async (t: string) => (await (await mcp(t, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json()).result.tools.map((x: { name: string }) => x.name);
    const readNames = await names(r.token); const writeNames = await names(w.token);
    expect(readNames).toContain('list_classes');
    expect(readNames).not.toContain('create_task');
    expect(writeNames).toContain('create_task');
  });

  it('enforces scope and per-user isolation on tool calls', async () => {
    const a = await register(); const b = await register();
    await client(a).post('/api/classes', makeClass(2, 'MCP-Secret-Class', [1]));
    const ra = await mint(a, 'read'); const wb = await mint(b, 'write');

    expect(JSON.stringify(await call(ra.token, 'list_classes'))).toContain('MCP-Secret-Class');
    expect(JSON.stringify(await call(wb.token, 'list_classes'))).not.toContain('MCP-Secret-Class');

    const denied = await call(ra.token, 'create_task', { title: 'x' });
    expect(denied.isError).toBe(true);

    const made = await call(wb.token, 'create_task', { title: 'From MCP' });
    expect(made.isError).toBeUndefined();
    const id = JSON.parse(made.content[0].text).task.id;
    expect((await call(wb.token, 'update_task', { id, completed: true })).isError).toBeUndefined();
    const wa = await mint(a, 'write');
    expect((await call(wa.token, 'delete_task', { id })).isError).toBe(true); // not A's task
    expect((await call(wb.token, 'delete_task', { id })).isError).toBeUndefined();
    expect((await call(wb.token, 'bogus_tool'))).toBeUndefined(); // JSON-RPC error, no result
  });
});
