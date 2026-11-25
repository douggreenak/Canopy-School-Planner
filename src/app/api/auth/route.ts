import { NextRequest } from 'next/server';
import { v4 as uuid } from 'uuid';
import {
  createUser,
  createOrUpdateAdminUser,
  getUserByUsername,
  getUserById,
  getUserByIdWithHash,
  updateUserPassword,
  deleteUserAndAllData,
  initializeDatabase,
  setSetting,
  deleteOtherSessions,
  revokeAllApiTokens,
} from '@/lib/db';
import {
  hashPassword,
  verifyPassword,
  createSession,
  getSessionUserId,
  deleteSession,
  getSessionToken,
  clearSessionCookie,
} from '@/lib/auth';

const MAX_USERNAME_LEN = 128;
const MAX_PASSWORD_LEN = 1024;
// Applies to NEW passwords only (register / change). Existing accounts with
// shorter passwords can still sign in; they just can't pick a short one again.
const MIN_PASSWORD_LEN = 8;

// A simple per-IP sliding-window limit on login/register attempts — in-
// memory, so it only holds across warm serverless invocations on the same
// instance (resets on cold start), but that's a real, free improvement over
// no limit at all, with no new infra/dependency and nothing a legitimate
// user doing normal sign-in/sign-up would ever notice. See
// docs/SECURITY_AUDIT.md (H2).
const RATE_LIMITS: Record<'login' | 'register', { max: number; windowMs: number }> = {
  login: { max: 10, windowMs: 5 * 60 * 1000 },
  register: { max: 10, windowMs: 60 * 60 * 1000 },
};
// Per-account cap on top of the per-IP one, so an attacker rotating IPs still
// can't hammer a single student's account. Deliberately looser than the IP
// limit so a shared school network can't lock one student out by accident.
const USERNAME_LIMIT = { max: 30, windowMs: 15 * 60 * 1000 };
const attemptLog = new Map<string, number[]>();

function pruneAttemptLog(now: number) {
  // Keep the in-memory map from growing without bound on a long-lived instance.
  if (attemptLog.size < 5000) return;
  for (const [k, v] of attemptLog) {
    if (v.every((t) => now - t > 60 * 60 * 1000)) attemptLog.delete(k);
  }
}

function isUsernameRateLimited(username: string): boolean {
  const now = Date.now();
  pruneAttemptLog(now);
  const key = `login-user:${username.trim().toLowerCase()}`;
  const recent = (attemptLog.get(key) ?? []).filter((t) => now - t < USERNAME_LIMIT.windowMs);
  recent.push(now);
  attemptLog.set(key, recent);
  return recent.length > USERNAME_LIMIT.max;
}

function clientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() || 'unknown';
}

function isRateLimited(request: Request, action: 'login' | 'register'): boolean {
  const { max, windowMs } = RATE_LIMITS[action];
  const key = `${action}:${clientIp(request)}`;
  const now = Date.now();
  const recent = (attemptLog.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  attemptLog.set(key, recent);
  return recent.length > max;
}

let dbReady = false;
async function ensureDb() {
  if (!dbReady) {
    await initializeDatabase();
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminPassword) {
      // This re-applies on every cold start, so a weak/default password left
      // in the env var silently "self-heals" back even after someone
      // manually changes it in the DB — loud enough to not be missed in
      // deploy logs, but never blocks startup (see docs/SECURITY_AUDIT.md M3).
      if (/^(changeme|password|admin)$/i.test(adminPassword)) {
        console.warn('[SECURITY] ADMIN_PASSWORD is set to an example/default value. Change it before — or immediately after — deploying to production.');
      }
      const adminUsername = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
      const hash = await hashPassword(adminPassword);
      await createOrUpdateAdminUser(adminUsername, hash);
    }
    dbReady = true;
  }
}

export async function GET(request: Request) {
  try {
    await ensureDb();
    const userId = await getSessionUserId(request);
    if (!userId) return Response.json({ user: null });
    const user = await getUserById(userId);
    return Response.json({ user });
  } catch {
    return Response.json({ user: null });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDb();
    const body = await request.json();
    const { action } = body;

    if (action === 'register') {
      if (isRateLimited(request, 'register')) {
        return Response.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
      }
      const { username, password } = body;
      if (!username || !password) {
        return Response.json({ error: 'Username and password are required.' }, { status: 400 });
      }
      if (username.trim().length < 2 || username.trim().length > MAX_USERNAME_LEN) {
        return Response.json({ error: `Username must be 2–${MAX_USERNAME_LEN} characters.` }, { status: 400 });
      }
      if (password.length < MIN_PASSWORD_LEN || password.length > MAX_PASSWORD_LEN) {
        return Response.json({ error: `Password must be ${MIN_PASSWORD_LEN}–${MAX_PASSWORD_LEN} characters.` }, { status: 400 });
      }
      const existing = await getUserByUsername(username.trim());
      if (existing) {
        return Response.json({ error: 'That username is already taken.' }, { status: 409 });
      }
      const id = uuid();
      const passwordHash = await hashPassword(password);
      await createUser(id, username.trim(), passwordHash);
      // Lathrop Mode defaults ON for every new account — this app's bell
      // schedule/early-out defaults are all built around Lathrop High
      // School, so a fresh install should already reflect that rather than
      // needing an extra opt-in click. Stored as a real setting (not left
      // to an implicit "undefined means on" client guess) so it's a single
      // source of truth every consumer — Settings, the setup wizard, the
      // server-side post-sync auto-schedule — can rely on identically.
      await setSetting('lathropMode', 'true', id).catch(() => {});
      const { cookie } = await createSession(id);
      return new Response(
        JSON.stringify({ success: true, user: { id, username: username.trim().toLowerCase(), role: 'user' } }),
        { headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie } },
      );
    }

    if (action === 'login') {
      if (isRateLimited(request, 'login')) {
        return Response.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
      }
      const { username, password } = body;
      if (!username || !password) {
        return Response.json({ error: 'Username and password are required.' }, { status: 400 });
      }
      if (password.length > MAX_PASSWORD_LEN) {
        return Response.json({ error: 'Invalid username or password.' }, { status: 401 });
      }
      if (isUsernameRateLimited(String(username))) {
        return Response.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
      }
      const user = await getUserByUsername(username.trim());
      if (!user) {
        return Response.json({ error: 'Invalid username or password.' }, { status: 401 });
      }
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return Response.json({ error: 'Invalid username or password.' }, { status: 401 });
      }
      const { cookie } = await createSession(user.id);
      return new Response(
        JSON.stringify({ success: true, user: { id: user.id, username: user.username, role: user.role } }),
        { headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie } },
      );
    }

    if (action === 'logout') {
      await deleteSession(request);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie() },
      });
    }

    if (action === 'changePassword') {
      const userId = await getSessionUserId(request);
      if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const { currentPassword, newPassword } = body;
      if (!currentPassword || !newPassword) {
        return Response.json({ error: 'Current and new password are required.' }, { status: 400 });
      }
      if (newPassword.length < MIN_PASSWORD_LEN || newPassword.length > MAX_PASSWORD_LEN) {
        return Response.json({ error: `New password must be ${MIN_PASSWORD_LEN}–${MAX_PASSWORD_LEN} characters.` }, { status: 400 });
      }
      const user = await getUserByIdWithHash(userId);
      if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });
      const valid = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) return Response.json({ error: 'Current password is incorrect.' }, { status: 401 });
      const newHash = await hashPassword(newPassword);
      await updateUserPassword(userId, newHash);
      // A password change should sign out every OTHER device (a stolen or
      // forgotten session shouldn't survive it) while keeping this one.
      await deleteOtherSessions(userId, getSessionToken(request) ?? undefined).catch(() => {});
      // ...and every API/MCP token, which are equally long-lived credentials.
      await revokeAllApiTokens(userId).catch(() => {});
      return Response.json({ success: true });
    }

    if (action === 'deleteAccount') {
      const userId = await getSessionUserId(request);
      if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const { password } = body;
      if (!password) {
        return Response.json({ error: 'Password is required to delete your account.' }, { status: 400 });
      }
      const user = await getUserByIdWithHash(userId);
      if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) return Response.json({ error: 'Incorrect password.' }, { status: 401 });
      await deleteUserAndAllData(userId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie() },
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    // Log the failure (message/code only — never request bodies or secrets).
    const e = err as { code?: string; message?: string };
    console.error('[auth] unhandled error:', e?.code ?? '', e?.message ?? String(err));
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
