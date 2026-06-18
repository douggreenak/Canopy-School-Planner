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
} from '@/lib/db';
import {
  hashPassword,
  verifyPassword,
  createSession,
  getSessionUserId,
  deleteSession,
  clearSessionCookie,
} from '@/lib/auth';

const MAX_USERNAME_LEN = 128;
const MAX_PASSWORD_LEN = 1024;
const MIN_PASSWORD_LEN = 1;

let dbReady = false;
async function ensureDb() {
  if (!dbReady) {
    await initializeDatabase();
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminPassword) {
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
      const { cookie } = await createSession(id);
      return new Response(
        JSON.stringify({ success: true, user: { id, username: username.trim().toLowerCase(), role: 'user' } }),
        { headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie } },
      );
    }

    if (action === 'login') {
      const { username, password } = body;
      if (!username || !password) {
        return Response.json({ error: 'Username and password are required.' }, { status: 400 });
      }
      if (password.length > MAX_PASSWORD_LEN) {
        return Response.json({ error: 'Invalid username or password.' }, { status: 401 });
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
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
