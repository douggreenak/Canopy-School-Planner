// Documentation text for the "Copy documentation" button in Settings. Signed-in
// users only (same as /api/tokens). It contains no secrets — just the public
// API reference — and is built from the live tool definitions so it can't drift.
import { getSessionUserId } from '@/lib/auth';
import { buildDocs } from '@/lib/apiDocs';

export async function GET(request: Request) {
  const userId = await getSessionUserId(request).catch(() => null);
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const kind = new URL(request.url).searchParams.get('kind') === 'mcp' ? 'mcp' : 'api';
  return Response.json({ kind, markdown: buildDocs(kind) }, { headers: { 'Cache-Control': 'no-store' } });
}
