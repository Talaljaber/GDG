/**
 * Local stack settings for the e2e tests and the Playwright web server.
 *
 * The e2e suite writes sessions, players and scores, so it must only ever
 * talk to the LOCAL Supabase stack. The API URL and publishable key come from
 * `.env.local` when those point at localhost; otherwise from
 * `supabase status -o env` (the local CLI stack). Any non-local URL is
 * refused. Only the publishable key is read; never a secret key.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readDotEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf-8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

function isLocal(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

let statusCache: Record<string, string> | null = null;

/** `supabase status -o env` of the local stack (API_URL, PUBLISHABLE_KEY, …). */
function localStatus(): Record<string, string> {
  if (statusCache) return statusCache;
  const out = execFileSync('npx', ['supabase', 'status', '-o', 'env', '--workdir', '.'], {
    cwd: root,
    encoding: 'utf-8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const parsed: Record<string, string> = {};
  for (const line of out.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
    if (m) parsed[m[1]] = m[2];
  }
  statusCache = parsed;
  return parsed;
}

let cache: Record<string, string> | null = null;

export function localEnv(): Record<string, string> {
  if (cache) return cache;
  const merged: Record<string, string> = {
    ...readDotEnv(path.join(root, '.env.local')),
    ...(process.env as Record<string, string>),
  };
  if (!isLocal(merged.SUPABASE_URL) || !merged.SUPABASE_PUBLISHABLE_KEY) {
    const status = localStatus();
    merged.SUPABASE_URL = status.API_URL ?? '';
    merged.SUPABASE_PUBLISHABLE_KEY = status.PUBLISHABLE_KEY || status.ANON_KEY || '';
  }
  if (!isLocal(merged.SUPABASE_URL)) {
    throw new Error(`e2e runs against the local Supabase stack only; got "${merged.SUPABASE_URL}". Start it with \`supabase start\`.`);
  }
  // Never hand anything but the publishable key onwards.
  delete merged.SUPABASE_SECRET_KEY;
  cache = merged;
  return merged;
}
