/**
 * Shared e2e helpers: local env, SQL against the local DB, admin API reset,
 * and page drivers for the host and phones.
 */
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { oddTileIndex } from '../src/games/odd-one-out/grid';
import { generateSimonSequence, type SimonPad } from '../src/games/simon/sequence';
import { scoreStopTheClock } from '../src/games/stop-the-clock/scoring';

import { localEnv } from './env';

export { localEnv };

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
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY;
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

export type GameIdE2E = 'stop_the_clock' | 'odd_one_out' | 'simon' | 'perfect_circle' | 'trivia';

/** The default e2e lineup: three games the tests can drive deterministically. */
export const LINEUP: GameIdE2E[] = ['stop_the_clock', 'odd_one_out', 'simon'];

export async function hostScreen(page: Page): Promise<string> {
  const root = page.getByTestId('host-root');
  await expect(root).not.toHaveAttribute('data-screen', 'loading', { timeout: 15_000 });
  return (await root.getAttribute('data-screen')) ?? 'loading';
}

export async function expectHostScreen(page: Page, screen: string, timeout = 15_000): Promise<void> {
  await expect(page.getByTestId('host-root')).toHaveAttribute('data-screen', screen, { timeout });
}

/**
 * From whatever screen the host reconstructed, drives the running session to
 * `results` as fast as possible: End round (confirm) on every round,
 * "Next round now" in every intermission. Phones that are still in a forced
 * round finish it with the timeout rule.
 */
export async function hostFinishSession(page: Page): Promise<void> {
  const deadline = Date.now() + 150_000;
  for (;;) {
    expect(Date.now(), 'host reached results in time').toBeLessThan(deadline);
    const screen = await hostScreen(page);
    if (screen === 'results' || screen === 'dayboard' || screen === 'lobby') return;
    if (screen === 'round') {
      const end = page.getByTestId('host-end-round');
      if (await end.isEnabled().catch(() => false)) {
        await end.click();
        await page.getByTestId('confirm-yes').click();
        await expect(page.getByTestId('host-root')).not.toHaveAttribute('data-screen', 'round', { timeout: 10_000 });
      }
      continue;
    }
    if (screen === 'intermission') {
      const skip = page.getByTestId('host-skip');
      if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {});
      await page.waitForTimeout(500);
      continue;
    }
    await page.waitForTimeout(300);
  }
}

/** Sets the H1 lineup picker to exactly `lineup` (in order) and waits until it is saved. */
export async function setLobbyLineup(page: Page, lineup: readonly GameIdE2E[], prefix = 'lineup'): Promise<void> {
  const picker = page.getByTestId(`${prefix}-picker`);
  // clear, then pick in order
  const pressed = picker.locator('button[aria-pressed="true"]');
  for (let n = await pressed.count(); n > 0; n = await pressed.count()) {
    await pressed.first().click();
    await expect(pressed).toHaveCount(n - 1);
  }
  for (const g of lineup) await page.getByTestId(`${prefix}-${g}`).click();
  await expect(picker).toHaveAttribute('data-synced', 'true', { timeout: 10_000 });
  await expect(picker).toHaveAttribute('data-valid', 'true');
}

/** Brings the host to H1 from whatever state it reconstructed, sets the lineup, and returns the lobby code. */
export async function hostToLobby(page: Page, lineup: readonly GameIdE2E[] = LINEUP): Promise<string> {
  await hostFinishSession(page);
  const screen = await hostScreen(page);
  if (screen === 'results' || screen === 'dayboard') {
    await page.getByTestId('host-new-session').click();
    await expectHostScreen(page, 'lobby');
  }
  await setLobbyLineup(page, lineup);
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

/**
 * The Stop the Clock score for the phone's recorded guesses (docs/games/stop-the-clock.md §4,
 * ADR-132), from the game's own pure scoring function (unit-tested against the doc's examples).
 */
export function stcScore(attempts: StcAttempt[]): number {
  return scoreStopTheClock({ attempts });
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

/** The phone's per-round seed (`gdg.v1.current.seed`), which drives every layout and sequence. */
export async function readSeed(page: Page): Promise<string> {
  const local = await readLocal(page);
  const seed = local?.seed;
  expect(typeof seed === 'string' && seed.length > 0, 'phone persisted its round seed').toBe(true);
  return seed as string;
}

/**
 * Plays Odd One Out by tapping the seeded odd tile of each grid (grid.ts), after a
 * human-looking pause (the server refuses a find faster than 250 ms, ooo.find_ms).
 */
export async function playOoo(page: Page, pauseMs = 450): Promise<void> {
  await expect(page.getByTestId('screen-game')).toBeVisible({ timeout: 15_000 });
  const seed = await readSeed(page);
  const sizes = [4, 5, 6];
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i];
    const tiles = page.getByTestId('screen-game').locator('button:not([disabled])');
    await expect(tiles).toHaveCount(size * size, { timeout: 15_000 });
    await page.waitForTimeout(pauseMs);
    await tiles.nth(oddTileIndex(seed, i, size)).click();
    if (i < sizes.length - 1) await expect(tiles).not.toHaveCount(size * size, { timeout: 5000 });
  }
  await expect(page.getByTestId('screen-round-result').or(page.getByTestId('screen-intermission'))).toBeVisible({
    timeout: 15_000,
  });
}

const SIMON_LABEL: Record<SimonPad, string> = { up: 'Up', right: 'Right', down: 'Down', left: 'Left' };

/**
 * Plays Simon from the seeded sequence (sequence.ts): repeats every length up to
 * `reach`, then taps a wrong pad on the next one (ended = mistake, level = reach).
 */
export async function playSimon(page: Page, reach = 3, gapMs = 300): Promise<void> {
  await expect(page.getByTestId('screen-game')).toBeVisible({ timeout: 15_000 });
  const seq = generateSimonSequence(await readSeed(page));
  const game = page.getByTestId('screen-game');
  const pad = (p: SimonPad) => game.getByRole('button', { name: SIMON_LABEL[p], exact: true });
  for (let level = 3; level <= reach + 1; level++) {
    await expect(game.getByText(`Length ${level}`, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(game.getByText('Your turn', { exact: true })).toBeVisible({ timeout: 20_000 });
    if (level === reach + 1) {
      const wrong = (['up', 'right', 'down', 'left'] as SimonPad[]).find((p) => p !== seq[0])!;
      await page.waitForTimeout(gapMs);
      await pad(wrong).click();
      break;
    }
    for (let i = 0; i < level; i++) {
      await page.waitForTimeout(gapMs);
      await pad(seq[i]).click();
    }
  }
  await expect(page.getByTestId('screen-round-result').or(page.getByTestId('screen-results'))).toBeVisible({
    timeout: 15_000,
  });
}

/** Names on a board (in order), from a board's `board-name` cells. */
export async function boardNames(scope: Page | ReturnType<Page['getByTestId']>, testId: string): Promise<string[]> {
  return (scope as Page).getByTestId(testId).getByTestId('board-name').allTextContents();
}
