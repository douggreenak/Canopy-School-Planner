// ============================================================
// Local Server Configuration
// Stores non-credential config (Google OAuth client ID).
// Secrets (OAuth client secret, PowerSchool password) are stored
// in per-user DB settings with encryption — never in cookies or
// config files.
// ============================================================
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { NextRequest } from 'next/server';

const CONFIG_PATH = join(process.cwd(), 'config.json');
const TMP_CONFIG_PATH = '/tmp/school-planner-config.json';

export interface ServerConfig {
  googleClientId?: string;
  googleClientSecret?: string;
  calendarSecretToken?: string;
}

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

function merge(file: ServerConfig): ServerConfig {
  return {
    googleClientId:
      file.googleClientId || process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret:
      file.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET || '',
    calendarSecretToken:
      file.calendarSecretToken || process.env.CALENDAR_SECRET_TOKEN || '',
  };
}

export function getConfig(): ServerConfig {
  return merge(readConfigFile());
}

export function getConfigFromRequest(_request: NextRequest | Request): ServerConfig {
  return merge(readConfigFile());
}

export function isConfigured(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  return { configured: missing.length === 0, missing };
}
