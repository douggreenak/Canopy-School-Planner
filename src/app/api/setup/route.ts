import { NextRequest } from 'next/server';
import { getConfigFromRequest, writeConfigFile, isConfigured } from '@/lib/config';
import { encrypt, decrypt } from '@/lib/crypto';
import {
  initializeDatabase,
  getPowerSchoolCredentials,
  setPowerSchoolCredentials,
  clearPowerSchoolCredentials,
  getUserById,
  getSettings,
  setSetting,
} from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';

function unauth() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

function forbidden() {
  return Response.json({ error: 'Forbidden' }, { status: 403 });
}

// googleClientId/googleClientSecret/calendarSecretToken in config.ts are a
// single shared file for the WHOLE deployment, not per-user — unlike every
// other action in this file, which only ever touches the calling user's own
// settings. These four actions read, write, or wipe that shared config, so
// (like export-config just below) they're admin-only. None of them are
// currently called from the app's UI — see docs/SECURITY_AUDIT.md (C2).
async function requireAdmin(userId: string): Promise<boolean> {
  const user = await getUserById(userId);
  return !!user && user.role === 'admin';
}

export async function GET(request: Request) {
  const { configured } = isConfigured();
  const cfg = getConfigFromRequest(request);
  const userId = await getSessionUserId(request);
  const ps = userId
    ? await getPowerSchoolCredentials(userId)
    : { url: '', username: '', password: '' };
  return Response.json({
    configured,
    hasDatabase: configured,
    hasClassroomOAuth: !!cfg.googleClientId,
    hasPowerschool: !!ps.password,
    powerschoolUrl: ps.url || '',
    powerschoolUsername: ps.username || '',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'initialize-db') {
      const userId = await getSessionUserId(request);
      if (!userId) return unauth();
      await initializeDatabase();
      return Response.json({ success: true, message: 'Database tables ready.' });
    }

    if (action === 'save-powerschool') {
      const userId = await getSessionUserId(request);
      if (!userId) return unauth();
      const { url, username, password } = body;
      if (!url || !username || !password) {
        return Response.json({ success: false, error: 'URL, username, and password are all required.' });
      }
      await setPowerSchoolCredentials(userId, url, username, password);
      // Scheduled sync is opt-out: the first time a user connects
      // PowerSchool, turn it on for them rather than leaving it off until
      // they find the toggle in Settings. Only when no explicit choice
      // exists yet — never overwrites a user who previously opted out.
      const existing = await getSettings(userId);
      if (existing.powerschoolAutoSync === undefined) {
        await setSetting('powerschoolAutoSync', JSON.stringify({ enabled: true }), userId);
      }
      return Response.json({ success: true });
    }

    if (action === 'clear-powerschool') {
      const userId = await getSessionUserId(request);
      if (!userId) return unauth();
      await clearPowerSchoolCredentials(userId);
      return Response.json({ success: true });
    }

    if (action === 'save-classroom-oauth') {
      const userId = await getSessionUserId(request);
      if (!userId) return unauth();
      if (!(await requireAdmin(userId))) return forbidden();
      const { clientId, clientSecret } = body;
      writeConfigFile({ googleClientId: clientId, googleClientSecret: clientSecret });
      return Response.json({ success: true });
    }

    if (action === 'generate-setup-code') {
      const userId = await getSessionUserId(request);
      if (!userId) return unauth();
      if (!(await requireAdmin(userId))) return forbidden();
      const { passphrase } = body;
      if (!passphrase || passphrase.length < 1) {
        return Response.json({ success: false, error: 'Passphrase is required.' });
      }
      const cfg = getConfigFromRequest(request);
      const ps = await getPowerSchoolCredentials(userId);
      const payload = JSON.stringify({
        ...(cfg.googleClientId ? { ci: cfg.googleClientId } : {}),
        ...(cfg.googleClientSecret ? { cs: cfg.googleClientSecret } : {}),
        ...(ps.url ? { pu: ps.url } : {}),
        ...(ps.username ? { pn: ps.username } : {}),
        ...(ps.password ? { pp: ps.password } : {}),
      });
      const code = encrypt(payload, passphrase);
      return Response.json({ success: true, setupCode: `SP2-${code}` });
    }

    if (action === 'use-setup-code') {
      const userId = await getSessionUserId(request);
      if (!userId) return unauth();
      if (!(await requireAdmin(userId))) return forbidden();
      const { setupCode, passphrase } = body;
      if (!setupCode || !passphrase) {
        return Response.json({ success: false, error: 'Setup code and passphrase are required.' });
      }
      const raw = setupCode.startsWith('SP2-') ? setupCode.slice(4)
        : setupCode.startsWith('SP1-') ? setupCode.slice(4)
        : setupCode;

      let payload: { ci?: string; cs?: string; pu?: string; pn?: string; pp?: string };
      try {
        payload = JSON.parse(decrypt(raw, passphrase));
      } catch (err) {
        return Response.json({ success: false, error: (err as Error).message || 'Invalid setup code or wrong passphrase.' });
      }

      const configUpdate: Record<string, string> = {};
      if (payload.ci) configUpdate.googleClientId = payload.ci;
      if (payload.cs) configUpdate.googleClientSecret = payload.cs;
      writeConfigFile(configUpdate);

      if (payload.pu || payload.pn || payload.pp) {
        await setPowerSchoolCredentials(userId, payload.pu ?? '', payload.pn ?? '', payload.pp ?? '');
      }

      return Response.json({ success: true, hasClassroomOAuth: !!payload.ci, hasPowerschool: !!payload.pp });
    }

    if (action === 'export-config') {
      const userId = await getSessionUserId(request);
      if (!userId) return unauth();
      if (!(await requireAdmin(userId))) return forbidden();
      const cfg = getConfigFromRequest(request);
      const safe = { googleClientId: cfg.googleClientId };
      return Response.json({ success: true, config: safe });
    }

    if (action === 'logout') {
      const userId = await getSessionUserId(request);
      if (!userId) return unauth();
      if (!(await requireAdmin(userId))) return forbidden();
      writeConfigFile({ googleClientId: '', googleClientSecret: '', calendarSecretToken: '' });
      await clearPowerSchoolCredentials(userId);
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/setup error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
