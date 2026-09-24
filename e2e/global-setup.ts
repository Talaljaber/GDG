import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetToLobby } from './helpers';

/** Ensures the local admin exists (a `supabase db reset` wipes it) and no session is left running. */
export default async function globalSetup(): Promise<void> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  execFileSync('npx', ['tsx', 'scripts/create-local-admin.ts'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  await resetToLobby();
}
