import mysql from 'mysql2/promise';
import { getSessionUserId } from '@/lib/auth';

type CacheEntry = { at: number; ok: boolean; error?: string };
let cache: CacheEntry | null = null;

export async function GET(request: Request) {
  const userId = await getSessionUserId(request);
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  if (!force && cache) {
    const age = Date.now() - cache.at;
    const ttl = cache.ok ? 30_000 : 10_000;
    if (age < ttl) {
      return Response.json({ ok: cache.ok, cached: true });
    }
  }

  try {
    const pool = mysql.createPool(process.env.DATABASE_URL ?? '');
    await pool.query('SELECT 1');
    await pool.end();
    cache = { at: Date.now(), ok: true };
    return Response.json({ ok: true });
  } catch {
    cache = { at: Date.now(), ok: false };
    return Response.json({ ok: false });
  }
}
