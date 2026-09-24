#!/usr/bin/env -S npx tsx
/**
 * Creates (or repairs) the LOCAL admin user after a `supabase db reset`,
 * which wipes auth users. Local stack only: it refuses any API URL that
 * isn't localhost/127.0.0.1.
 *
 * The local secret key is read at runtime from `supabase status -o env`
 * (the CLI's well-known local key); it is never stored in the repo, .env
 * files or CI (ADR-125, .claude/rules/supabase.md).
 *
 * Email/password: E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD from the environment
 * or .env.local (non-VITE, so never bundled). Idempotent: an existing user
 * gets its password and app_metadata.role = 'admin' re-applied.
 *
 * Run with `npm run dev:admin`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readDotEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function parseStatus(output: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function main() {
  const env = { ...readDotEnv(path.join(root, '.env.local')), ...process.env } as Record<string, string | undefined>;
  const email = env.E2E_ADMIN_EMAIL;
  const password = env.E2E_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD in .env.local (see .env.example).');

  const status = parseStatus(
    execFileSync('npx', ['supabase', 'status', '-o', 'env', '--workdir', '.'], {
      cwd: root,
      encoding: 'utf-8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  );
  const apiUrl = status.API_URL;
  const secret = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
  if (!apiUrl || !secret) throw new Error('Could not read API_URL / SECRET_KEY from `supabase status`. Is the local stack running?');
  const host = new URL(apiUrl).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Refusing to run against a non-local API (${host}).`);
  }

  const admin = createClient(apiUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  let existingId: string | null = null;
  for (let page = 1; page < 50 && !existingId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) existingId = found.id;
    if (data.users.length < 200) break;
  }

  if (existingId) {
    const { error } = await admin.auth.admin.updateUserById(existingId, {
      password,
      email_confirm: true,
      app_metadata: { role: 'admin' },
    });
    if (error) throw error;
    console.log(`Local admin ${email} already existed: password and role=admin re-applied.`);
  } else {
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: 'admin' },
    });
    if (error) throw error;
    console.log(`Created local admin ${email} with app_metadata.role=admin.`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
