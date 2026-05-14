// ============================================================
// Local Server Configuration
// Stores non-database credentials (PowerSchool, Classroom OAuth,
// calendar token). The database connection uses DATABASE_URL from
// the environment, which Vercel sets automatically via the Neon
// integration.
//
// Priority order: config.json / /tmp > cookie > env var.
// In read-only serverless environments (Vercel/Lambda) the primary
// config.json path is not writable, so we fall back to /tmp
// (writable but ephemeral). To survive cold starts we also persist
// the config in an httpOnly cookie — call `getConfigFromRequest`
// in route handlers so the cookie is included as a fallback tier.
// ============================================================
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { NextRequest } from 'next/server';

const CONFIG_PATH = join(process.cwd(), 'config.json');
const TMP_CONFIG_PATH = '/tmp/school-planner-config.json';
export const CONFIG_COOKIE = 'sp-config';

export interface ServerConfig {
  googleClientId?: string;
  googleClientSecret?: string;
  calendarSecretToken?: string;
  powerschoolUrl?: string;
  powerschoolUsername?: string;
  powerschoolPassword?: string;
}

// In-memory cache — survives repeated calls within one Lambda instance.
let memoryConfig: ServerConfig | null = null;

function readConfigFile(): ServerConfig {
  if (memoryConfig) return memoryConfig;
  for (const path of [CONFIG_PATH, TMP_CONFIG_PATH]) {
    try {
      if (existsSync(path)) {
        const parsed = JSON.parse(readFileSync(path, 'utf-8')) as ServerConfig;
        memoryConfig = parsed;
        return parsed;
      }
    } catch {
      // ignore and try next path
    }
  }
  return {};
}

export function writeConfigFile(updates: Partial<ServerConfig>) {
  const current = readConfigFile();
  const merged = { ...current, ...updates };
  memoryConfig = merged;

  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
    return;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EROFS') throw e;
  }

  writeFileSync(TMP_CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
}

// ---- Cookie helpers ----

export function encodeConfigCookie(cfg: ServerConfig): string {
  return Buffer.from(JSON.stringify(cfg)).toString('base64');
}

function decodeConfigCookie(value: string): ServerConfig {
  try {
    return JSON.parse(Buffer.from(value, 'base64').toString('utf-8')) as ServerConfig;
  } catch {
    return {};
  }
}

export function buildConfigCookieHeader(cfg: ServerConfig): string {
  const encoded = encodeConfigCookie(cfg);
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  return `${CONFIG_COOKIE}=${encoded}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}`;
}

// ---- Config resolution ----

function merge(file: ServerConfig, cookie: ServerConfig): ServerConfig {
  return {
    googleClientId:
      file.googleClientId || cookie.googleClientId || process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret:
      file.googleClientSecret || cookie.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET || '',
    calendarSecretToken:
      file.calendarSecretToken || cookie.calendarSecretToken || process.env.CALENDAR_SECRET_TOKEN || '',
    powerschoolUrl:
      file.powerschoolUrl || cookie.powerschoolUrl || process.env.POWERSCHOOL_URL || '',
    powerschoolUsername:
      file.powerschoolUsername || cookie.powerschoolUsername || process.env.POWERSCHOOL_USERNAME || '',
    powerschoolPassword:
      file.powerschoolPassword || cookie.powerschoolPassword || process.env.POWERSCHOOL_PASSWORD || '',
  };
}

export function getConfig(): ServerConfig {
  return merge(readConfigFile(), {});
}

export function getConfigFromRequest(request: NextRequest | Request): ServerConfig {
  const file = readConfigFile();
  let cookieValue: string | undefined;
  if ('cookies' in request && typeof (request as NextRequest).cookies?.get === 'function') {
    cookieValue = (request as NextRequest).cookies.get(CONFIG_COOKIE)?.value;
  } else {
    const header = request.headers.get('cookie') ?? '';
    const match = header.match(new RegExp(`(?:^|;\\s*)${CONFIG_COOKIE}=([^;]*)`));
    cookieValue = match?.[1];
  }
  const cookie = cookieValue ? decodeConfigCookie(cookieValue) : {};
  if (!memoryConfig && Object.keys(cookie).length > 0) {
    memoryConfig = cookie as ServerConfig;
  }
  return merge(file, cookie);
}

/** Check whether the database is connected (DATABASE_URL is set). */
export function isConfigured(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  return { configured: missing.length === 0, missing };
}

export function isConfiguredFromRequest(_request: NextRequest | Request): { configured: boolean; missing: string[] } {
  return isConfigured();
}
