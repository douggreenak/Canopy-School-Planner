import { neon } from '@neondatabase/serverless';
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

  if (!process.env.DATABASE_URL) {
    cache = { at: Date.now(), ok: false };
    return Response.json({ ok: false });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    await sql`SELECT 1`;
    cache = { at: Date.now(), ok: true };
    return Response.json({ ok: true });
  } catch {
    cache = { at: Date.now(), ok: false };
    return Response.json({ ok: false });
  }
}
