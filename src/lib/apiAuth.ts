// ============================================================
// Personal API tokens — auth for /api/v1/* and /api/mcp.
//
// Security properties (see docs/API.md):
//  - Tokens are 256-bit random, shown once, stored only as SHA-256.
//  - Bearer header ONLY. Cookies are never honoured on these endpoints, so a
//    browser can't be tricked into making an authenticated call (no CSRF),
//    and session tokens are rejected here just as API tokens are rejected on
//    the rest of /api/*.
//  - Every token belongs to exactly one user; every query downstream is
//    scoped to that user id. There is no admin/cross-user mode.
//  - Tokens expire, carry a scope (read | write), and can be revoked.
// ============================================================
import crypto from 'crypto';
import { initializeDatabase, findApiTokenByHash, touchApiToken } from './db';
import { hit, peek } from './rateLimit';
import { ApiError } from './plannerApi';

export const TOKEN_PREFIX = 'spk_';
const TOKEN_RE = /^spk_[A-Za-z0-9_-]{43}$/;

export type ApiScope = 'read' | 'write';
export interface ApiPrincipal { userId: string; tokenId: string; scope: ApiScope }

export const MAX_TOKENS_PER_USER = 10;
export const MAX_TOKEN_DAYS = 365;
export const DEFAULT_TOKEN_DAYS = 90;

export function generateApiToken(): { token: string; hash: string; hint: string } {
  const token = TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashApiToken(token), hint: token.slice(-4) };
}

export function hashApiToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function scopeAllows(have: ApiScope, need: ApiScope): boolean {
  return need === 'read' || have === 'write';
}

let dbReady: Promise<void> | null = null;
/** api_tokens may not exist yet on a freshly deployed instance — create it once per cold start. */
export function ensureApiDb(): Promise<void> {
  if (!dbReady) dbReady = initializeDatabase().catch((e) => { dbReady = null; throw e; });
  return dbReady;
}

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

const JSON_NOSTORE = { 'Cache-Control': 'no-store' };

export function jsonError(status: number, error: string, extra: Record<string, string> = {}): Response {
  return Response.json({ error }, { status, headers: { ...JSON_NOSTORE, ...extra } });
}

const FAIL_LIMIT = { max: 30, windowMs: 5 * 60 * 1000 };
const TOKEN_LIMIT = { max: 120, windowMs: 60 * 1000 };
// Don't write last_used_at on every call — once a minute is plenty for "last used".
const TOUCH_INTERVAL_MS = 60 * 1000;

/**
 * Authenticate a request by bearer API token. Returns the principal, or a
 * ready-to-return error Response. The caller must still check scope.
 */
export async function authenticateApiRequest(request: Request): Promise<ApiPrincipal | Response> {
  const ip = clientIp(request);
  const failKey = `api-fail:${ip}`;
  const wait = peek(failKey, FAIL_LIMIT.max, FAIL_LIMIT.windowMs);
  if (wait) return jsonError(429, 'Too many failed attempts.', { 'Retry-After': String(Math.ceil(wait / 1000)) });

  const unauthorized = (): Response => {
    hit(failKey, FAIL_LIMIT.max, FAIL_LIMIT.windowMs);
    return jsonError(401, 'Invalid or missing API token.', {
      'WWW-Authenticate': 'Bearer realm="canopy", error="invalid_token"',
    });
  };

  const m = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)$/i);
  const token = m?.[1];
  if (!token || !TOKEN_RE.test(token)) return unauthorized();

  await ensureApiDb();
  const row = await findApiTokenByHash(hashApiToken(token));
  if (!row) return unauthorized();

  const limited = hit(`api-token:${row.id}`, TOKEN_LIMIT.max, TOKEN_LIMIT.windowMs);
  if (limited) return jsonError(429, 'Rate limit exceeded.', { 'Retry-After': String(Math.ceil(limited / 1000)) });

  if (row.lastUsedAt === null || Date.now() - row.lastUsedAt > TOUCH_INTERVAL_MS) {
    touchApiToken(row.id).catch(() => {});
  }
  return { userId: row.userId, tokenId: row.id, scope: row.scope };
}

/** Wraps a /api/v1 handler: auth + scope check + uniform error handling that never leaks internals. */
export async function withApiAuth(
  request: Request,
  scope: ApiScope,
  handler: (p: ApiPrincipal) => Promise<Response>,
): Promise<Response> {
  try {
    const auth = await authenticateApiRequest(request);
    if (auth instanceof Response) return auth;
    if (!scopeAllows(auth.scope, scope)) {
      return jsonError(403, 'This token is read-only. Create a token with write access to make changes.');
    }
    return await handler(auth);
  } catch (err) {
    if (err instanceof ApiError) return jsonError(err.status, err.message);
    console.error('[api/v1] unhandled error:', (err as { code?: string })?.code ?? '', (err as Error)?.message ?? '');
    return jsonError(500, 'Internal server error');
  }
}

export const MAX_BODY_BYTES = 64 * 1024;

/** Parse a small JSON object body; rejects oversized or non-object payloads. */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiError(413, 'Request body too large.');
  let v: unknown;
  try { v = JSON.parse(text); } catch { throw new ApiError(400, 'Body must be valid JSON.'); }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ApiError(400, 'Body must be a JSON object.');
  return v as Record<string, unknown>;
}
