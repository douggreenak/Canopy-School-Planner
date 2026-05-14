// ============================================================
// GET /api/setup/health
// Live database connectivity check. Runs a lightweight query
// against Neon and reports success/failure.
// ============================================================
import { neon } from '@neondatabase/serverless';

type CacheEntry = { at: number; ok: boolean; error?: string };
let cache: CacheEntry | null = null;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  if (!force && cache) {
    const age = Date.now() - cache.at;
    const ttl = cache.ok ? 30_000 : 10_000;
    if (age < ttl) {
      return Response.json({ ...bodyFor(cache), cached: true, ageMs: age });
    }
  }

  if (!process.env.DATABASE_URL) {
    cache = { at: Date.now(), ok: false, error: 'DATABASE_URL is not set' };
    return Response.json({ ...bodyFor(cache), cached: false });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    await sql`SELECT 1`;
    cache = { at: Date.now(), ok: true };
    return Response.json({ ...bodyFor(cache), cached: false });
  } catch (err) {
    const message = (err as Error).message || 'Unknown error';
    cache = { at: Date.now(), ok: false, error: message };
    return Response.json({ ...bodyFor(cache), cached: false });
  }
}

function bodyFor(c: CacheEntry) {
  return { ok: c.ok, error: c.error, checkedAt: c.at };
}
