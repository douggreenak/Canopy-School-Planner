import { scrypt, randomBytes, timingSafeEqual, type ScryptOptions } from 'crypto';
import { cookies } from 'next/headers';
import { createDbSession, getDbSession, deleteDbSession, getUserById } from './db';

// util.promisify(scrypt) resolves to the no-options overload, so this wraps
// the options-taking overload directly instead.
function scryptAsync(password: string, salt: string, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err); else resolve(derivedKey);
    });
  });
}

export const SESSION_COOKIE = 'sp-session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const isProduction = process.env.NODE_ENV === 'production';

// Explicit scrypt cost parameters — these are exactly Node's own defaults
// (N=16384, r=8, p=1), so this changes no behavior/output for any existing
// password hash. Pinned explicitly so the cost can't silently drift if a
// future Node version ever changes its defaults (see docs/SECURITY_AUDIT.md
// L2). maxmem is deliberately left unset so Node applies its own default
// (32MB), which is exactly what already comfortably covers these N/r/p
// values — hand-computing it came out too low and broke scrypt outright.
const SCRYPT_OPTIONS: ScryptOptions = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(password, salt, 64, SCRYPT_OPTIONS);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const hashBuffer = Buffer.from(hash, 'hex');
    const derivedHash = await scryptAsync(password, salt, 64, SCRYPT_OPTIONS);
    return timingSafeEqual(hashBuffer, derivedHash);
  } catch {
    return false;
  }
}

export async function createSession(userId: string): Promise<{ cookie: string }> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await createDbSession(token, userId, expiresAt);
  const maxAge = Math.floor(SESSION_DURATION_MS / 1000);
  const secure = isProduction ? '; Secure' : '';
  const cookie = `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}${secure}`;
  return { cookie };
}

export async function getSessionUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const bearerToken = bearerMatch?.[1];

  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookieMatch = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`));
  const cookieToken = cookieMatch?.[1];

  const token = bearerToken || cookieToken;
  if (!token) return null;

  const session = await getDbSession(token);
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await deleteDbSession(token);
    return null;
  }
  return session.userId;
}

/**
 * Server Component-only session lookup — reads the session cookie directly
 * via next/headers `cookies()` instead of a Request object, so a Server
 * Component ancestor (RootLayout) can resolve the logged-in user during the
 * initial render and hand it down as a prop. This is what lets AppShell
 * paint the real page immediately instead of a blank screen while a client
 * `fetch('/api/auth')` round-trip resolves.
 */
export async function getServerSessionUser(): Promise<{ id: string; username: string; role: string } | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await getDbSession(token);
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await deleteDbSession(token);
    return null;
  }
  return getUserById(session.userId);
}

export async function deleteSession(request: Request): Promise<void> {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`));
  const token = match?.[1];
  if (token) await deleteDbSession(token);
}

export function clearSessionCookie(): string {
  const secure = isProduction ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure}`;
}
