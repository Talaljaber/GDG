/**
 * Shared e2e helpers: local env, SQL against the local DB, admin API reset,
 * and page drivers for the host and phones.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function localEnv(): Record<string, string> {
  const file = path.join(root, '.env.local');
  const out: Record<string, string> = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf-8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return { ...out, ...(process.env as Record<string, string>) };
}

const env = localEnv();
export const ADMIN_EMAIL = env.E2E_ADMIN_EMAIL ?? '';
export const ADMIN_PASSWORD = env.E2E_ADMIN_PASSWORD ?? '';
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD in .env.local (see .env.example).');
}

/** Runs SQL on the local DB container (local stack only) and returns trimmed stdout. */
export function sql(query: string): string {
  const out = execFileSync('docker', ['exec', 'supabase_db_gdg-booth', 'psql', '-U', 'postgres', '-tAc', query], {
    encoding: 'utf-8',
  });
  return out.trim();
}

export function sqlCount(query: string): number {
  return Number(sql(query));
}

/** Admin client (publishable key + admin password; no secret key). */
export async function adminClient() {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (error) throw error;
  return client;
}

/** Leaves the DB with no running session: force-ends playing rounds, then New session. */
export async function resetToLobby(): Promise<void> {
  const client = await adminClient();
  const { data: running } = await client.from('sessions').select('*').in('status', ['playing', 'results']);
  for (const s of running ?? []) {
    if (s.status === 'playing') {
      const { data: rounds } = await client.from('rounds').select('*').eq('session_id', s.id).eq('status', 'playing');
      for (const r of rounds ?? []) await client.rpc('admin_end_round', { p_round: r.id, p_reason: 'force_end' });
      // a session can have upcoming rounds left (multi-round): end them in order
      const { data: rest } = await client.from('rounds').select('*').eq('session_id', s.id).order('round_no');
      for (const r of rest ?? []) {
        if (r.status === 'upcoming') {
          await client.rpc('admin_start_round', { p_round: r.id });
          await client.rpc('admin_end_round', { p_round: r.id, p_reason: 'force_end' });
        }
      }
    }
    await client.rpc('admin_new_session');
  }
  await client.auth.signOut();
}

export const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'en-US',
};

export async function newPhone(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  return { context, page };
}

export async function hostSignIn(page: Page): Promise<void> {
  await page.goto('/host');
  await page.getByTestId('signin-email').fill(ADMIN_EMAIL);
  await page.getByTestId('signin-password').fill(ADMIN_PASSWORD);
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('host-root')).toBeVisible();
}

async function hostScreen(page: Page): Promise<string> {
  const root = page.getByTestId('host-root');
  await expect(root).not.toHaveAttribute('data-screen', 'loading', { timeout: 15_000 });
  return (await root.getAttribute('data-screen')) ?? 'loading';
}

/** Brings the host to H1 from whatever state it reconstructed, and returns the lobby code. */
export async function hostToLobby(page: Page): Promise<string> {
  let screen = await hostScreen(page);
  if (screen === 'round') {
    await page.getByTestId('host-end-round').click();
    await page.getByTestId('confirm-yes').click();
    await expect(page.getByTestId('host-root')).toHaveAttribute('data-screen', 'results', { timeout: 15_000 });
    screen = 'results';
  }
  if (screen === 'results') {
    await page.getByTestId('host-new-session').click();
    await expect(page.getByTestId('host-root')).toHaveAttribute('data-screen', 'lobby', { timeout: 15_000 });
  }
  // The slice plays Stop the Clock: make sure it's the (only) game picked.
  const stc = page.getByTestId('lineup-stop_the_clock');
  if ((await stc.getAttribute('aria-pressed')) !== 'true') {
    for (const other of await page.locator('[data-testid^="lineup-"][aria-pressed="true"]').all()) await other.click();
    await stc.click();
  }
  await expect(stc).toHaveAttribute('aria-pressed', 'true');
  const code = (await page.getByTestId('host-code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^[1-9]\d{3}$/);
  return code;
}

export async function enterCode(page: Page, code: string): Promise<void> {
  await expect(page.getByTestId('screen-code')).toBeVisible();
  await page.getByTestId('code-input').fill(code);
}

/** P1 → P2 → submit. Leaves the page wherever the join lands. */
export async function join(page: Page, code: string, name: string): Promise<void> {
  await enterCode(page, code);
  await expect(page.getByTestId('screen-name')).toBeVisible();
  await page.getByTestId('name-input').fill(name);
  await page.getByTestId('name-submit').click();
}

export async function joinToLobby(page: Page, code: string, name: string): Promise<void> {
  await page.goto('/');
  await join(page, code, name);
  await expect(page.getByTestId('screen-lobby')).toBeVisible({ timeout: 15_000 });
}

export interface StcAttempt {
  target_ms: number;
  measured_ms: number | null;
  missed_start: boolean;
}

/** Hand calculation of the Stop the Clock score (docs/games/stop-the-clock.md §4). */
export function stcScore(attempts: StcAttempt[]): number {
  const E = attempts.reduce(
    (sum, a) => sum + (a.measured_ms === null ? 10000 : Math.min(10000, Math.abs(a.measured_ms - a.target_ms))),
    0,
  );
  return Math.round(1000 * Math.max(0, 1 - E / 6000));
}

export function stcButton(page: Page, label: 'Start' | 'Stop') {
  return page.getByTestId('screen-game').getByRole('button', { name: label, exact: true });
}

/** Plays one attempt: Start, hold for `ms` (real time), Stop. */
export async function stcAttempt(page: Page, ms: number): Promise<void> {
  await stcButton(page, 'Start').click({ timeout: 15_000 });
  await page.waitForTimeout(ms);
  await stcButton(page, 'Stop').click();
}

export async function playStc(page: Page, holds: [number, number, number]): Promise<void> {
  await expect(page.getByTestId('screen-game')).toBeVisible({ timeout: 15_000 });
  for (const ms of holds) await stcAttempt(page, ms);
  await expect(page.getByTestId('screen-round-result').or(page.getByTestId('screen-results'))).toBeVisible({
    timeout: 15_000,
  });
}

export async function readLocal(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('gdg.v1.current');
    return raw ? JSON.parse(raw) : null;
  });
}

export function hostPlayer(host: Page, name: string) {
  return host.locator(`[data-testid="host-player"][data-name="${name}"]`);
}

export function hostBoardRow(host: Page, name: string, score: number) {
  return host
    .getByTestId('host-root')
    .getByTestId('board-row')
    .filter({ has: host.getByTestId('board-name').getByText(name, { exact: true }) })
    .filter({ has: host.getByTestId('board-score').getByText(String(score), { exact: true }) });
}
