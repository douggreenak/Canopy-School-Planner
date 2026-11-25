// Manage your own API tokens. Session-authenticated ONLY (the signed-in web
// app) — an API token can never mint, list or revoke tokens, so a leaked
// token can't be used to create a longer-lived one. Creating a token also
// requires the account password again (step-up), like deleting an account.
import { v4 as uuid } from 'uuid';
import { getSessionUserId, verifyPassword } from '@/lib/auth';
import { createApiToken, listApiTokens, revokeApiToken, getUserByIdWithHash } from '@/lib/db';
import {
  generateApiToken, ensureApiDb, MAX_TOKENS_PER_USER, MAX_TOKEN_DAYS, DEFAULT_TOKEN_DAYS, readJsonBody,
} from '@/lib/apiAuth';
import { ApiError } from '@/lib/plannerApi';
import { hit, peek } from '@/lib/rateLimit';

const NO_STORE = { 'Cache-Control': 'no-store' };

function fail(err: unknown): Response {
  if (err instanceof ApiError) return Response.json({ error: err.message }, { status: err.status });
  console.error('[tokens] unhandled error:', (err as Error)?.message ?? '');
  return Response.json({ error: 'Internal server error' }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await ensureApiDb();
    const userId = await getSessionUserId(request);
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ tokens: await listApiTokens(userId), max: MAX_TOKENS_PER_USER, maxDays: MAX_TOKEN_DAYS });
  } catch (e) { return fail(e); }
}

export async function POST(request: Request) {
  try {
    await ensureApiDb();
    const userId = await getSessionUserId(request);
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await readJsonBody(request);

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 100) throw new ApiError(400, 'Give the token a name (max 100 characters).');
    if (body.scope !== 'read' && body.scope !== 'write') throw new ApiError(400, 'scope must be "read" or "write".');
    // Omitted kind = 'api' so older clients (the shipped iOS build) keep working.
    const rawKind = body.kind ?? 'api';
    if (rawKind !== 'api' && rawKind !== 'mcp') throw new ApiError(400, 'kind must be "api" or "mcp".');
    const kind: 'api' | 'mcp' = rawKind;
    const maxDays = MAX_TOKEN_DAYS[kind];
    const days = body.expiresInDays === undefined ? DEFAULT_TOKEN_DAYS : Number(body.expiresInDays);
    if (!Number.isInteger(days) || days < 1 || days > maxDays) throw new ApiError(400, `expiresInDays must be 1–${maxDays} for ${kind} tokens.`);
    if (typeof body.password !== 'string' || !body.password) throw new ApiError(400, 'Enter your password to create a token.');

    // Brute-force guard on the password re-check (a stolen session shouldn't be able to grind it).
    // Only FAILED attempts count, so normal use isn't throttled.
    const pwKey = `token-pw:${userId}`;
    if (peek(pwKey, 5, 15 * 60 * 1000)) throw new ApiError(429, 'Too many attempts. Try again later.');
    const user = await getUserByIdWithHash(userId);
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      hit(pwKey, 5, 15 * 60 * 1000);
      throw new ApiError(401, 'Incorrect password.');
    }

    if ((await listApiTokens(userId)).length >= MAX_TOKENS_PER_USER) {
      throw new ApiError(409, `You can have at most ${MAX_TOKENS_PER_USER} active tokens. Revoke one first.`);
    }

    const { token, hash, hint } = generateApiToken(kind);
    const now = Date.now();
    const id = uuid();
    await createApiToken({ id, userId, name, tokenHash: hash, hint, scope: body.scope, kind, createdAt: now, expiresAt: now + days * 86_400_000 });
    // The raw token is returned exactly once, here, and is never retrievable again.
    return Response.json({ id, name, scope: body.scope, kind, expiresAt: now + days * 86_400_000, token }, { status: 201, headers: NO_STORE });
  } catch (e) { return fail(e); }
}

export async function DELETE(request: Request) {
  try {
    await ensureApiDb();
    const userId = await getSessionUserId(request);
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw new ApiError(400, 'Missing id.');
    if (!(await revokeApiToken(userId, id))) throw new ApiError(404, 'Token not found.');
    return Response.json({ success: true });
  } catch (e) { return fail(e); }
}
