/**
 * Phase 2: sessions, rounds and leaderboards, end to end against the local
 * stack (docs/PHASES.md AC2.1–AC2.9; docs/TESTING.md §7 E2E-1, -3, -6, -7, -8).
 *
 * Games are driven deterministically from the phone's own round seed:
 * Stop the Clock by timed holds, Odd One Out by tapping the seeded odd tile
 * (grid.ts), Simon by replaying the seeded sequence (sequence.ts).
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  adminClient,
  expectHostScreen,
  hostFinishSession,
  hostPlayer,
  hostSignIn,
  hostToLobby,
  join,
  joinToLobby,
  newPhone,
  playOoo,
  playSimon,
  playStc,
  readLocal,
  setLobbyLineup,
  sql,
  sqlCount,
} from './helpers';

test.describe.configure({ mode: 'serial' });

const HOST_VIEWPORT = { viewport: { width: 1920, height: 1080 } };

async function openHost(browser: Browser) {
  const ctx = await browser.newContext(HOST_VIEWPORT);
  const page = await ctx.newPage();
  await hostSignIn(page);
  return { ctx, page };
}

/** Random lower-case letters: unique names per run (the local day boards keep every run's scores). */
function letters(n: number): string {
  const a = 'abcdefghijklmnopqrstuvwxyz';
  let s = '';
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

async function playerRowId(page: Page): Promise<string> {
  const id = (await readLocal(page))?.playerRowId;
  expect(typeof id).toBe('string');
  return id as string;
}

/** Numbers as the app shows them (Western digits, en-US grouping: formatNumber). */
const fmt = (n: number | string) => new Intl.NumberFormat('en-US').format(Number(n));

function names(scope: Page, testId: string) {
  return scope.getByTestId(testId).getByTestId('board-name');
}

// ---------------------------------------------------------------------------------------------- E2E-1

test('E2E-1: lobby → 3 rounds with 3 different games → intermissions → results → day board → new session', async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const { ctx: hostCtx, page: host } = await openHost(browser);
  const code = await hostToLobby(host, ['stop_the_clock', 'odd_one_out', 'simon']);

  const players = [
    { name: 'Amal', holds: [5100, 9700, 7200] as [number, number, number] },
    { name: 'Basem', holds: [4700, 10400, 6800] as [number, number, number] },
    { name: 'Carim', holds: [5600, 9200, 7700] as [number, number, number] },
  ];
  const phones = await Promise.all(players.map(() => newPhone(browser)));
  for (let i = 0; i < players.length; i++) await joinToLobby(phones[i].page, code, players[i].name);
  // P3: the three games, in order
  await expect(phones[0].page.getByTestId('lobby-lineup').locator('li')).toHaveText([
    /Stop the Clock/,
    /Odd One Out/,
    /Simon/,
  ]);
  for (const p of players) await expect(hostPlayer(host, p.name)).toBeVisible();

  await host.getByTestId('host-start').click();

  // ---- round 1: Stop the Clock
  await expectHostScreen(host, 'round');
  await expect(host.getByTestId('host-round')).toHaveAttribute('data-game', 'stop_the_clock');
  await expect(host.getByTestId('host-round-title')).toHaveText('Round 1 of 3 · Stop the Clock');
  // H2 corner code = the pending session (ADR-015)
  const pendingCode = (await host.getByTestId('host-corner-code').textContent())?.trim() ?? '';
  expect(pendingCode).toMatch(/^[1-9]\d{3}$/);
  expect(pendingCode).not.toBe(code);
  expect(sql(`select status from public.sessions where code = '${pendingCode}' and status in ('pending','lobby')`)).toBe(
    'pending',
  );

  await Promise.all(phones.map((p, i) => playStc(p.page, players[i].holds)));

  // ---- H3 with the Stop the Clock guess reveal; P8 mirrors it (no host action: AC2.1)
  await expectHostScreen(host, 'intermission', 10_000);
  await expect(host.getByTestId('host-intermission')).toHaveAttribute('data-step', 'round_board');
  await expect(host.getByTestId('stc-reveal')).toBeVisible();
  await expect(host.getByTestId('stc-strip')).toHaveCount(3);
  for (const strip of await host.getByTestId('stc-strip').all()) await expect(strip.getByTestId('stc-dot')).toHaveCount(3);
  await expect(host.getByTestId('stc-strip').first().getByTestId('stc-dot-label')).toHaveCount(3); // top 5 labelled
  for (const p of phones) {
    await expect(p.page.getByTestId('screen-intermission')).toHaveAttribute('data-step', 'round_board', { timeout: 5000 });
  }
  await expect(phones[0].page.getByTestId('intermission-round-board').locator('[data-own="true"]')).toBeVisible();
  await expect(phones[0].page.getByTestId('lang-toggle')).toBeVisible(); // toggle back between rounds (E17)

  // ---- AC2.4 / E20: the next-games picker edits the pending session while this one plays
  await host.getByTestId('host-next-games').click();
  await setLobbyLineup(host, ['simon', 'stop_the_clock', 'odd_one_out'], 'next-lineup');
  await host.getByTestId('next-games-done').click();
  expect(sql(`select lineup::text from public.sessions where code = '${pendingCode}' and status = 'pending'`)).toBe(
    '{simon,stop_the_clock,odd_one_out}',
  );

  await expect(host.getByTestId('host-intermission')).toHaveAttribute('data-step', 'session_total', { timeout: 10_000 });
  await expect(names(host, 'host-total-board')).toHaveCount(3);
  await expect(phones[1].page.getByTestId('screen-intermission')).toHaveAttribute('data-step', 'session_total', {
    timeout: 5000,
  });
  await expect(host.getByTestId('host-next-intro')).toHaveAttribute('data-game', 'odd_one_out', { timeout: 10_000 });
  await expect(phones[2].page.getByTestId('intermission-next')).toContainText('Next: Odd One Out', { timeout: 5000 });

  // ---- round 2 starts by itself after 15 s: Odd One Out
  await expectHostScreen(host, 'round', 10_000);
  await expect(host.getByTestId('host-round')).toHaveAttribute('data-game', 'odd_one_out');
  await expect(host.getByTestId('host-corner-code')).toHaveText(pendingCode);
  await Promise.all(phones.map((p) => playOoo(p.page)));

  // ---- intermission, then round 3: Simon
  await expectHostScreen(host, 'intermission', 10_000);
  await expectHostScreen(host, 'round', 25_000);
  await expect(host.getByTestId('host-round')).toHaveAttribute('data-game', 'simon');
  await Promise.all(phones.map((p) => playSimon(p.page, 3)));

  // ---- after the last round: 7 s of round board, then H4
  await expectHostScreen(host, 'intermission', 10_000);
  await expect(host.getByTestId('host-skip')).toHaveCount(0); // nothing to skip to
  await expectHostScreen(host, 'results', 15_000);

  const sessionId = sql(`select id from public.sessions where code = '${code}' and status = 'results'`);
  expect(sql(`select string_agg(game::text || ':' || end_reason::text, ',' order by round_no) from public.rounds where session_id = '${sessionId}'`)).toBe(
    'stop_the_clock:all_finished,odd_one_out:all_finished,simon:all_finished',
  );

  // totals = sums of the three round scores (0–3000), on H4 and every P9
  const rowIds = await Promise.all(phones.map((p) => playerRowId(p.page)));
  const totals = rowIds.map((id) => Number(sql(`select coalesce(sum(score), 0) from public.scores where player_row_id = '${id}'`)));
  expect(rowIds.map((id) => sqlCount(`select count(*) from public.scores where player_row_id = '${id}'`))).toEqual([3, 3, 3]);
  const board = host.getByTestId('host-session-board');
  await expect(board.getByTestId('board-row')).toHaveCount(3);
  for (let i = 0; i < players.length; i++) {
    const row = board.getByTestId('board-row').filter({ has: host.getByText(players[i].name, { exact: true }) });
    await expect(row.getByTestId('board-score')).toHaveText(fmt(totals[i]));
    // every round played: three numbers, no "–"
    await expect(row.getByTestId('board-round-score')).toHaveText([/^[\d,]+$/, /^[\d,]+$/, /^[\d,]+$/]);
  }
  const best = Math.max(...totals);
  await expect(host.getByTestId('host-winner')).toContainText(fmt(best));
  for (let i = 0; i < phones.length; i++) {
    const page = phones[i].page;
    await expect(page.getByTestId('screen-results')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('results-total')).toHaveText(fmt(totals[i]));
    await expect(page.getByTestId('breakdown-row')).toHaveCount(3);
    await expect(page.getByTestId('results-rank')).toContainText('of 3');
  }

  // ---- Show day board: H5 tabs; phones follow day_board_shown_at (P10)
  await host.getByTestId('host-show-day-board').click();
  await expectHostScreen(host, 'dayboard');
  for (const g of ['stop_the_clock', 'odd_one_out', 'simon']) await expect(host.getByTestId(`dayboard-tab-${g}`)).toBeVisible();
  for (const p of phones) await expect(p.page.getByTestId('screen-dayboard')).toBeVisible({ timeout: 5000 });
  await expect(phones[0].page.getByTestId('day-board').locator('[data-own="true"]')).toHaveCount(1, { timeout: 12_000 });
  // tabs rotate every 8 s on the big screen
  const firstGame = await host.getByTestId('host-dayboard').getAttribute('data-game');
  await expect(host.getByTestId('host-dayboard')).not.toHaveAttribute('data-game', firstGame ?? '', { timeout: 10_000 });

  // AC2.5 (e2e half): one day-board row per name key with that key's best score
  for (const p of players) {
    for (const g of ['stop_the_clock', 'odd_one_out', 'simon']) {
      const key = p.name.toLowerCase();
      expect(sqlCount(`select count(*) from public.v_day_board where name_key = '${key}' and game = '${g}' and event_day_id = private.current_event_day_id()`)).toBe(1);
      expect(
        sql(`select score from public.v_day_board where name_key = '${key}' and game = '${g}' and event_day_id = private.current_event_day_id()`),
      ).toBe(sql(`select max(score) from public.scores where name_key = '${key}' and game = '${g}' and event_day_id = private.current_event_day_id()`));
    }
  }

  // ---- New session: the pending session becomes the lobby with the lineup the picker shows (AC2.4)
  await host.getByTestId('host-new-session').click();
  await expectHostScreen(host, 'lobby');
  await expect(host.getByTestId('host-code')).toHaveText(pendingCode);
  for (const [g, n] of [['simon', 1], ['stop_the_clock', 2], ['odd_one_out', 3]] as const) {
    await expect(host.getByTestId(`lineup-${g}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(host.getByTestId(`lineup-${g}`)).toHaveText(new RegExp(`^${n}`));
  }
  expect(sql(`select lineup::text from public.sessions where code = '${pendingCode}' and status = 'lobby'`)).toBe(
    '{simon,stop_the_clock,odd_one_out}',
  );
  // the finished session's phones keep their frozen day board
  await expect(phones[0].page.getByTestId('screen-dayboard')).toBeVisible();
  await phones[0].page.getByTestId('join-next').click();
  await expect(phones[0].page.getByTestId('screen-code')).toBeVisible();

  await hostCtx.close();
  for (const p of phones) await p.context.close();
});

// ---------------------------------------------------------------------------------------------- E2E-3

test('E2E-3: a latecomer joins the pending session via the corner code and is in the lobby after New session', async ({
  browser,
}) => {
  const { ctx: hostCtx, page: host } = await openHost(browser);
  const code = await hostToLobby(host, ['odd_one_out', 'stop_the_clock', 'simon']);
  const p = await newPhone(browser);
  await joinToLobby(p.page, code, 'Rana');
  await host.getByTestId('host-start').click();
  await expectHostScreen(host, 'round');
  const cornerCode = (await host.getByTestId('host-corner-code').textContent())?.trim() ?? '';
  await expect(host.getByTestId('host-corner')).toHaveAttribute('data-count', '0');

  // E16: turned to landscape during the round, the phone asks to turn back; the round keeps going
  await expect(p.page.getByTestId('screen-intro').or(p.page.getByTestId('screen-game'))).toBeVisible();
  await expect(p.page.getByTestId('rotate-overlay')).toBeHidden();
  await p.page.setViewportSize({ width: 844, height: 390 });
  await expect(p.page.getByTestId('rotate-overlay')).toBeVisible();
  await expect(p.page.getByTestId('rotate-overlay')).toHaveText('Turn your phone back upright');
  await p.page.setViewportSize({ width: 390, height: 844 });
  await expect(p.page.getByTestId('rotate-overlay')).toBeHidden();
  await expect(p.page.getByTestId('screen-game')).toBeVisible({ timeout: 5000 });

  // E6: the running session's code is refused with the "isn't active" message; the corner code works
  const late = await newPhone(browser);
  await late.page.goto('/');
  await join(late.page, code, 'Lateo');
  await expect(late.page.getByTestId('code-error')).toHaveText("That code isn't active. Check the big screen for the current one.");
  await late.page.getByTestId('code-input').fill(cornerCode);
  await expect(late.page.getByTestId('name-input')).toHaveValue('Lateo');
  await late.page.getByTestId('name-submit').click();
  // P3b
  await expect(late.page.getByTestId('screen-lobby')).toBeVisible();
  await expect(late.page.getByRole('heading', { level: 1 })).toHaveText("You're in the next round");
  await expect(late.page.getByTestId('lobby-lineup').locator('li')).toHaveCount(3);
  await expect(host.getByTestId('host-corner')).toHaveAttribute('data-count', '1', { timeout: 5000 });
  // the running round isn't affected: still 0/1 finished
  await expect(host.getByTestId('host-finished')).toHaveText('0/1 finished');

  await hostFinishSession(host);
  await expectHostScreen(host, 'results', 30_000);
  await host.getByTestId('host-new-session').click();
  await expectHostScreen(host, 'lobby');
  await expect(host.getByTestId('host-code')).toHaveText(cornerCode);
  await expect(hostPlayer(host, 'Lateo')).toBeVisible();
  await expect(late.page.getByRole('heading', { level: 1 })).toHaveText("You're in!", { timeout: 5000 });
  await expect(late.page.getByText('Waiting for the host to start…')).toBeVisible();
  // Rana (from the finished session) isn't carried over
  await expect(hostPlayer(host, 'Rana')).toHaveCount(0);

  await hostCtx.close();
  await p.context.close();
  await late.context.close();
});

// ---------------------------------------------------------------------------------------------- E2E-6

test('E2E-6: host tab closed mid-round and reopened: overdue round ends (time_cap), intermission resumes (E8)', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ctx: hostCtx, page: host0 } = await openHost(browser);
  const code = await hostToLobby(host0, ['stop_the_clock', 'odd_one_out', 'simon']);
  const a = await newPhone(browser);
  await joinToLobby(a.page, code, 'Nadia');
  const b = await newPhone(browser);
  await joinToLobby(b.page, code, 'Omar');
  await host0.getByTestId('host-start').click();
  await expectHostScreen(host0, 'round');
  const sessionId = sql(`select id from public.sessions where code = '${code}' and status = 'playing'`);
  const round1 = sql(`select id from public.rounds where session_id = '${sessionId}' and round_no = 1`);

  // ---- the laptop closes mid-round; phones keep playing and submitting
  await host0.close();
  await playStc(a.page, [5000, 10000, 7000]);
  await expect(a.page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });
  expect(sql(`select status from public.rounds where id = '${round1}'`)).toBe('playing'); // nothing advances
  // Omar's phone is idle. Simulate the host staying away past the 128 s deadline.
  sql(`update public.rounds set started_at = started_at - interval '130 seconds' where id = '${round1}'`);

  // ---- reopen: the host reconstructs, ends the overdue round at once with time_cap, runs the intermission
  const host1 = await hostCtx.newPage();
  await host1.goto('/host');
  const reopenedAt = Date.now();
  await expectHostScreen(host1, 'intermission', 15_000);
  console.log(`E2E-6 overdue round ended ${Date.now() - reopenedAt} ms after reopening`);
  expect(sql(`select end_reason from public.rounds where id = '${round1}'`)).toBe('time_cap');
  await expect(host1.getByTestId('host-intermission')).toHaveAttribute('data-round', '1');
  await expect(a.page.getByTestId('screen-intermission')).toBeVisible({ timeout: 5000 });
  // the idle phone was told the round ended and finished with the timeout rule (E27)
  await expect(b.page.getByTestId('screen-intermission').or(b.page.getByTestId('screen-round-result'))).toBeVisible({
    timeout: 10_000,
  });

  // ---- closed again during the intermission, for longer than the intermission
  await host1.close();
  await a.page.waitForTimeout(17_000);
  expect(sql(`select status from public.rounds where session_id = '${sessionId}' and round_no = 2`)).toBe('upcoming');
  const host2 = await hostCtx.newPage();
  await host2.goto('/host');
  // a late resume shows the 3 s "Next" heads-up, then starts round 2
  await expect(host2.getByTestId('host-next-intro')).toHaveAttribute('data-game', 'odd_one_out', { timeout: 15_000 });
  await expectHostScreen(host2, 'round', 10_000);
  await expect(host2.getByTestId('host-round')).toHaveAttribute('data-game', 'odd_one_out');
  await expect(a.page.getByTestId('screen-intro').or(a.page.getByTestId('screen-game'))).toBeVisible({ timeout: 10_000 });

  await hostFinishSession(host2);
  await expectHostScreen(host2, 'results', 30_000);
  expect(sql(`select string_agg(status::text, ',' order by round_no) from public.rounds where session_id = '${sessionId}'`)).toBe(
    'done,done,done',
  );
  await hostCtx.close();
  await a.context.close();
  await b.context.close();
});

// ---------------------------------------------------------------------------------------------- E2E-7

test('E2E-7: hiding a name during the intermission clears it from the host within 1 s and phones within 3 s', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const hidden = `Hid${letters(6)}`;
  const viewer = `View${letters(5)}`;
  const admin = await adminClient();
  try {
    const { ctx: hostCtx, page: host } = await openHost(browser);
    const code = await hostToLobby(host, ['odd_one_out', 'stop_the_clock', 'simon']);
    const h = await newPhone(browser);
    await joinToLobby(h.page, code, hidden);
    const v = await newPhone(browser);
    await joinToLobby(v.page, code, viewer);
    await host.getByTestId('host-start').click();
    await expectHostScreen(host, 'round');
    await Promise.all([playOoo(h.page, 400), playOoo(v.page, 700)]);

    // both on the intermission round board
    await expectHostScreen(host, 'intermission', 10_000);
    await expect(names(host, 'host-round-board').filter({ hasText: hidden })).toHaveCount(1);
    await expect(v.page.getByTestId('screen-intermission')).toHaveAttribute('data-step', 'round_board', { timeout: 5000 });
    await expect(names(v.page, 'intermission-round-board').filter({ hasText: hidden })).toHaveCount(1, { timeout: 4000 });

    // ---- hide (the dashboard calls the same function)
    const { error } = await admin.rpc('admin_hide_name', { p_name_key: hidden, p_note: 'e2e' });
    expect(error).toBeNull();
    const hiddenAt = Date.now();
    // a fixed 50 ms poll (expect's own retries back off to 1 s, which would blur the timing)
    const goneAfter = (loc: ReturnType<typeof names>, timeout: number) =>
      expect
        .poll(() => loc.filter({ hasText: hidden }).count(), { timeout, intervals: [50] })
        .toBe(0)
        .then(() => Date.now() - hiddenAt);
    const onHost = goneAfter(names(host, 'host-round-board'), 5000);
    const onPhone = goneAfter(names(v.page, 'intermission-round-board'), 6000);
    const [hostMs, phoneMs] = await Promise.all([onHost, onPhone]);
    console.log(`AC2.9 hidden name gone from the host after ${hostMs} ms, from a phone after ${phoneMs} ms`);
    expect(hostMs).toBeLessThan(1000);
    expect(phoneMs).toBeLessThan(3500); // phones poll every 3 s (ADR-112); + one request
    await expect(names(host, 'host-round-board')).toHaveText([viewer]);

    // the session total and results never show it either; the hidden player's own phone still shows its own total
    await expect(host.getByTestId('host-intermission')).toHaveAttribute('data-step', 'session_total', { timeout: 10_000 });
    await expect(names(host, 'host-total-board')).toHaveText([viewer]);
    await hostFinishSession(host);
    await expectHostScreen(host, 'results', 30_000);
    await expect(names(host, 'host-session-board')).toHaveText([viewer]);
    await expect(h.page.getByTestId('screen-results')).toBeVisible({ timeout: 15_000 });
    await expect(h.page.getByTestId('results-total')).toBeVisible();
    await expect(h.page.getByTestId('results-rank')).toHaveCount(0);
    await expect(names(h.page, 'session-board')).toHaveText([viewer]);

    await hostCtx.close();
    await h.context.close();
    await v.context.close();
  } finally {
    await admin.rpc('admin_unhide_name', { p_name_key: hidden });
    await admin.auth.signOut();
  }
});

// ---------------------------------------------------------------------------------------------- E2E-8

test('E2E-8: duplicate names ×3 get suffixes 2 and 3 on session boards and share one day-board row', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const base = `Sara${letters(5)}`;
  const typed = [base, base, base.toUpperCase()];
  const shown = [base, `${base} 2`, `${base.toUpperCase()} 3`];
  const key = base.toLowerCase();

  const { ctx: hostCtx, page: host } = await openHost(browser);
  const code = await hostToLobby(host, ['odd_one_out', 'simon', 'stop_the_clock']);
  const phones = await Promise.all(typed.map(() => newPhone(browser)));
  for (let i = 0; i < typed.length; i++) {
    await joinToLobby(phones[i].page, code, typed[i]);
    await expect(phones[i].page.getByTestId('lobby-name')).toHaveText(shown[i]);
  }
  for (const name of shown) await expect(hostPlayer(host, name)).toBeVisible(); // AC2.6
  await host.getByTestId('host-start').click();
  await expectHostScreen(host, 'round');
  await Promise.all(phones.map((p, i) => playOoo(p.page, 400 + i * 500)));

  // round board (host and phone) with the suffixes
  await expectHostScreen(host, 'intermission', 10_000);
  await expect(names(host, 'host-round-board')).toHaveText(shown); // faster pause first
  await expect(names(phones[1].page, 'intermission-round-board')).toHaveText(shown, { timeout: 5000 });

  await hostFinishSession(host);
  await expectHostScreen(host, 'results', 30_000);
  await expect(names(host, 'host-session-board')).toHaveText(shown);

  // day board: one row for the shared name key, with its best score and no suffix (ADR-105)
  await host.getByTestId('host-show-day-board').click();
  await expectHostScreen(host, 'dayboard');
  expect(
    sqlCount(`select count(*) from public.v_day_board where name_key = '${key}' and game = 'odd_one_out' and event_day_id = private.current_event_day_id()`),
  ).toBe(1);
  const bestScore = sql(`select max(score) from public.scores where name_key = '${key}' and game = 'odd_one_out'`);
  expect(sql(`select score || ':' || name from public.v_day_board where name_key = '${key}' and game = 'odd_one_out'`)).toBe(
    `${bestScore}:${base}`,
  );
  const phone = phones[2].page; // "SARA… 3": its day board row is the shared key's best
  await expect(phone.getByTestId('screen-dayboard')).toBeVisible({ timeout: 5000 });
  await expect(phone.getByTestId('dayboard-panel')).toHaveAttribute('data-game', 'odd_one_out');
  const ownRows = phone.getByTestId('day-board').locator('[data-own="true"]');
  await expect(ownRows).toHaveCount(1, { timeout: 12_000 });
  await expect(ownRows.getByTestId('board-name')).toHaveText(base);
  await expect(ownRows.getByTestId('board-score')).toHaveText(fmt(bestScore));
  await expect(
    phone.getByTestId('day-board').getByTestId('board-name').filter({ hasText: new RegExp(`^${base}`, 'i') }),
  ).toHaveCount(1);

  await host.getByTestId('host-new-session').click();
  await expectHostScreen(host, 'lobby');
  await hostCtx.close();
  for (const p of phones) await p.context.close();
});
