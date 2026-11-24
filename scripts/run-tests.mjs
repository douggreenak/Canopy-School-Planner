#!/usr/bin/env node
/**
 * Runs the integration + end-to-end suites against a LOCAL throwaway database.
 *
 *   node scripts/run-tests.mjs            # integration + e2e
 *   E2E_SKIP_BUILD=1 node scripts/run-tests.mjs   # reuse the existing .next build
 *
 * Database: if TEST_DATABASE_URL is set (CI sets it to a service container) it
 * is used, otherwise a throwaway MariaDB is started in /tmp (scripts/test-db.sh)
 * and removed afterwards. Either way the URL must point at a local database
 * named canopy_test* — anything else aborts before a single query runs.
 * Production DATABASE_URL / .env.local values are never read or used.
 */
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import net from 'node:net';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Always a port nobody is using, so the tests can never end up talking to some
// other dev server that happens to be running on this machine.
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(String(port))); });
  });
}
let PORT = '';
let BASE = '';

// Mirrors src/lib/testGuard.ts (kept dependency-free so it runs before any TS tooling).
function assertSafe(url) {
  if (!url) throw new Error('no test database URL');
  const u = new URL(url);
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(u.hostname)) throw new Error(`refusing non-local DB host ${u.hostname}`);
  if (!/^canopy_test/i.test(u.pathname.replace(/^\//, ''))) throw new Error('test database must be named canopy_test*');
}

let startedDb = false;
let server = null;
async function cleanup() {
  if (server && !server.killed) server.kill('SIGTERM');
  if (startedDb) spawnSync('bash', [join(root, 'scripts/test-db.sh'), 'stop'], { stdio: 'ignore' });
}
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { await fetch(url); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error(`timed out waiting for ${url}`);
}

(async () => {
  PORT = process.env.E2E_PORT || await freePort();
  BASE = `http://127.0.0.1:${PORT}`;
  let dbUrl = process.env.TEST_DATABASE_URL;
  if (!dbUrl) {
    const r = spawnSync('bash', [join(root, 'scripts/test-db.sh'), 'start'], { encoding: 'utf8' });
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    dbUrl = r.stdout.trim().split('\n').pop();
    startedDb = true;
  }
  assertSafe(dbUrl);

  // A clean slate environment: only what the tests need, nothing inherited
  // from the developer's shell or .env.local that could point at production.
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'production',
    CANOPY_E2E: '1',
    DATABASE_URL: dbUrl,
    TEST_DATABASE_URL: dbUrl,
    E2E_BASE_URL: BASE,
    ADMIN_USERNAME: 'e2e-admin',
    ADMIN_PASSWORD: 'e2e-not-a-real-admin-password',
    CRON_SECRET: 'e2e-cron-secret',
    CREDENTIAL_KEY: 'e2e-credential-key-not-secret',
    NEXT_TELEMETRY_DISABLED: '1',
    CHROME_PATH: process.env.CHROME_PATH || '',
  };

  let code = 1;
  try {
    if (process.env.E2E_SKIP_BUILD !== '1') {
      console.log('› building app…');
      const b = spawnSync('npx', ['next', 'build', '--webpack'], { cwd: root, env: { ...env, NODE_ENV: 'production' }, stdio: 'inherit' });
      if (b.status !== 0) throw new Error('build failed');
    }
    console.log(`› starting app on ${BASE} (database: ${new URL(dbUrl).host}/${new URL(dbUrl).pathname.slice(1)})`);
    server = spawn('npx', ['next', 'start', '-p', PORT, '-H', '127.0.0.1'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', (d) => process.env.E2E_VERBOSE && process.stdout.write(d));
    server.stderr.on('data', (d) => process.env.E2E_VERBOSE && process.stderr.write(d));
    let exited = false;
    server.once('exit', () => { exited = true; });
    await waitFor(`${BASE}/api/settings`, 60_000);
    if (exited) throw new Error('app server exited during startup');
    // Make sure it is OUR app (and not something else) answering.
    const probe = await fetch(`${BASE}/api/settings`);
    if (!probe.ok || !(probe.headers.get('content-type') || '').includes('json')) throw new Error('unexpected response from app server');

    const t = spawnSync('npx', ['vitest', 'run', '-c', 'vitest.e2e.config.ts', ...process.argv.slice(2)], { cwd: root, env, stdio: 'inherit' });
    code = t.status ?? 1;
  } catch (e) {
    console.error(String(e));
  } finally {
    await cleanup();
  }
  process.exit(code);
})();
