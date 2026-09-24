/**
 * Phase 1 vertical slice, end to end against the local stack
 * (docs/PHASES.md AC1.1, AC1.3–AC1.8; docs/TESTING.md).
 *
 * 1 host context + phone contexts, each its own browser context (own
 * storage, own anonymous user), like separate phones.
 *
 * Sessions are 3 rounds since Phase 3 (ROUNDS_PER_SESSION = 3). These slice
 * tests play round 1 (Stop the Clock) for real, then the host force-ends
 * rounds 2–3 (phones finish them with the timeout rule, score 0), so every
 * Phase 1 assertion about round 1 and the results still holds.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  expectHostScreen,
  hostBoardRow,
  hostFinishSession,
  hostPlayer,
  hostSignIn,
  hostToLobby,
  join,
  joinToLobby,
  newPhone,
  playStc,
  readLocal,
  sql,
  sqlCount,
  stcAttempt,
  stcButton,
  stcScore,
  type StcAttempt,
} from './helpers';

test.describe.configure({ mode: 'serial' });

interface LastResult {
  roundId: string;
  score: number;
  durationMs: number;
  raw: { attempts: StcAttempt[] };
}

async function lastResult(page: Page): Promise<LastResult> {
  const local = await readLocal(page);
  const r = (local?.lastResult ?? null) as LastResult | null;
  expect(r, 'phone kept its last result').not.toBeNull();
  return r as LastResult;
}

test('Phase 1: join, presence, remove, play Stop the Clock on 3 phones, results', async ({ browser }) => {
  const hostCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const host = await hostCtx.newPage();
  await hostSignIn(host);
  const code = await hostToLobby(host);
  await expect(host.getByTestId('host-qr')).toBeVisible();

  // ---- AC1.1: opening the URL creates no auth user, no rows, and sends nothing to Auth/REST
  const usersBefore = sqlCount('select count(*) from auth.users');
  const playersBefore = sqlCount('select count(*) from public.players');
  const a = await newPhone(browser);
  const apiCalls: string[] = [];
  a.page.on('request', (req) => {
    if (/\/(auth|rest)\/v1\//.test(req.url())) apiCalls.push(req.url());
  });
  await a.page.goto('/');
  await expect(a.page.getByTestId('screen-code')).toBeVisible();
  await a.page.waitForTimeout(2000);
  expect(apiCalls, 'no Auth/REST request on page open').toEqual([]);
  expect(sqlCount('select count(*) from auth.users')).toBe(usersBefore);
  expect(sqlCount('select count(*) from public.players')).toBe(playersBefore);

  // ---- wrong code: back to P1 with the "isn't active" message, name kept (E6/E28)
  const wrong = code === '1234' ? '4321' : '1234';
  await join(a.page, wrong, 'Ana');
  await expect(a.page.getByTestId('code-error')).toHaveText("That code isn't active. Check the big screen for the current one.");
  await a.page.getByTestId('code-input').fill(code);
  await expect(a.page.getByTestId('name-input')).toHaveValue('Ana');
  await a.page.getByTestId('name-submit').click();
  await expect(a.page.getByTestId('screen-lobby')).toBeVisible();
  await expect(a.page.getByTestId('lobby-name')).toHaveText('Ana');
  await expect(a.page.getByTestId('lobby-lineup')).toContainText('Stop the Clock');

  // ---- invalid name: inline error, nothing sent (E28), then a valid one
  const b = await newPhone(browser);
  await b.page.goto('/');
  await join(b.page, code, 'Bob!');
  await expect(b.page.getByTestId('name-error')).toHaveText('Letters, numbers and spaces only');
  await expect(b.page.getByTestId('screen-name')).toBeVisible();
  // blocked word (server blocklist, GD003): friendly error, stays on P2
  await b.page.getByTestId('name-input').fill('porn');
  await b.page.getByTestId('name-submit').click();
  await expect(b.page.getByTestId('name-error')).toHaveText("Let's pick a different name");
  // US-G1 AC4: names over 12 characters can't be typed
  await b.page.getByTestId('name-input').fill('');
  await b.page.getByTestId('name-input').pressSequentially('Abcdefghijklmn');
  await expect(b.page.getByTestId('name-input')).toHaveValue('Abcdefghijkl');
  await b.page.getByTestId('name-input').fill('Bob');
  await b.page.getByTestId('name-submit').click();
  await expect(b.page.getByTestId('screen-lobby')).toBeVisible();

  // US-G1 AC5: Arabic-Indic digits in the code field; AC2: on the big screen within 2 s
  const c = await newPhone(browser);
  await c.page.goto('/');
  const arabicIndic = code.replace(/\d/g, (ch) => String.fromCharCode(0x0660 + Number(ch)));
  await join(c.page, arabicIndic, 'Cara');
  const joinClickedAt = Date.now();
  await expect(hostPlayer(host, 'Cara')).toBeVisible({ timeout: 5000 });
  const joinLatency = Date.now() - joinClickedAt;
  console.log(`US-G1 AC2 join visible on the big screen after ${joinLatency} ms`);
  expect(joinLatency).toBeLessThan(2000);
  await expect(c.page.getByTestId('screen-lobby')).toBeVisible();
  const d = await newPhone(browser);
  await joinToLobby(d.page, code, 'Dan');

  // ---- host lobby: all four with presence
  for (const name of ['Ana', 'Bob', 'Cara', 'Dan']) {
    await expect(hostPlayer(host, name)).toHaveAttribute('data-online', 'true', { timeout: 10_000 });
    await expect(hostPlayer(host, name)).toHaveAttribute('data-presence', 'on');
  }
  await expect(host.getByTestId('host-player-count')).toHaveText('4 players');
  await expect(a.page.getByTestId('lobby-count')).toHaveText('4 players', { timeout: 8000 });

  // ---- AC1.4: remove Dan → "Removed by host" within 2 s; rejoin with the same code refused
  await hostPlayer(host, 'Dan').getByTestId('host-remove').click();
  await host.getByTestId('confirm-yes').click();
  const removedAt = Date.now();
  await expect(d.page.getByTestId('screen-removed')).toBeVisible({ timeout: 5000 });
  const removeLatency = Date.now() - removedAt;
  console.log(`AC1.4 removed screen latency: ${removeLatency} ms`);
  expect(removeLatency).toBeLessThan(2000);
  await expect(hostPlayer(host, 'Dan')).toHaveCount(0);
  await d.page.getByTestId('removed-cta').click();
  await join(d.page, code, 'Dan');
  await expect(d.page.getByTestId('screen-removed')).toBeVisible();

  // ---- Start: all three play Stop the Clock with deliberate, different holds (AC1.5)
  await expect(host.getByTestId('host-start')).toBeEnabled();
  await host.getByTestId('host-start').click();
  await expect(host.getByTestId('host-root')).toHaveAttribute('data-screen', 'round');
  await expect(host.getByTestId('host-finished')).toHaveText('0/3 finished');

  for (const p of [a, b, c]) await expect(p.page.getByTestId('screen-intro')).toBeVisible();
  // Language toggle hidden during rounds (E17)
  await expect(a.page.getByTestId('lang-toggle')).toHaveCount(0);

  const plays: Array<[Page, string, [number, number, number]]> = [
    [a.page, 'Ana', [4600, 9500, 7300]],
    [b.page, 'Bob', [5500, 10800, 6400]],
    [c.page, 'Cara', [3800, 11500, 8000]],
  ];
  const results = await Promise.all(
    plays.map(async ([page, name, holds]) => {
      await playStc(page, holds);
      await expect(page.getByTestId('own-score')).toBeVisible();
      const r = await lastResult(page);
      // hand calculation from the phone's own recorded guesses
      expect(r.raw.attempts.map((x) => x.target_ms)).toEqual([5000, 10000, 7000]);
      const expected = stcScore(r.raw.attempts);
      expect(r.score).toBe(expected);
      await expect(page.getByTestId('own-score')).toHaveText(String(expected));
      await expect(page.getByTestId('result-row')).toHaveCount(3);
      await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });
      const savedAt = Date.now();
      // The last finisher ends the round (all_finished) within ~0.5 s; H3 then shows the Stop the
      // Clock guess reveal (dots, no scores), so its row may never reach H2's live board. That case
      // is checked on H3's session total below instead.
      await expect
        .poll(
          async () =>
            (await hostBoardRow(host, name, expected).count()) > 0 ||
            (await host.getByTestId('host-root').getAttribute('data-screen')) === 'intermission',
          { timeout: 5000, intervals: [50] },
        )
        .toBe(true);
      const onH2 = (await hostBoardRow(host, name, expected).count()) > 0;
      const latency = onH2 ? Date.now() - savedAt : null;
      console.log(
        `AC1.5 ${name}: guesses ${r.raw.attempts.map((x) => x.measured_ms).join(', ')} → ${expected}; ` +
          (onH2 ? `host showed it ${latency} ms after the phone's save` : 'round ended first (shown on H3)'),
      );
      return { name, score: expected, latency, roundId: r.roundId };
    }),
  );
  for (const r of results) {
    if (r.latency !== null) expect(r.latency, `${r.name} on the big screen within 1 s`).toBeLessThan(1000);
  }
  expect(results.filter((r) => r.latency !== null).length, 'at least the first two on the live board').toBeGreaterThanOrEqual(2);

  // ---- everyone finished → host ends the round itself (all_finished) → intermission; rounds 2–3 forced
  await expectHostScreen(host, 'intermission', 10_000);
  // H3's session total (after round 1 = the round scores) lists all three
  await expect(host.getByTestId('host-intermission')).toHaveAttribute('data-step', 'session_total', { timeout: 10_000 });
  for (const r of results) await expect(hostBoardRow(host, r.name, r.score)).toBeVisible();
  const roundId = results[0].roundId;
  expect(sql(`select end_reason from public.rounds where id = '${roundId}'`)).toBe('all_finished');
  expect(sqlCount(`select count(*) from public.scores where round_id = '${roundId}'`)).toBe(3);
  for (const r of results) {
    expect(
      sqlCount(`select score from public.scores where round_id = '${roundId}' and name = '${r.name}'`),
      `DB score for ${r.name}`,
    ).toBe(r.score);
  }

  await hostFinishSession(host);
  await expectHostScreen(host, 'results', 30_000);

  // host session board in rank order
  const sorted = [...results].sort((x, y) => y.score - x.score);
  const hostNames = await host.getByTestId('host-session-board').getByTestId('board-name').allTextContents();
  expect(hostNames).toEqual(sorted.map((r) => r.name));

  // phones: P9 with own total and rank
  for (const [page, name] of plays) {
    await expect(page.getByTestId('screen-results')).toBeVisible({ timeout: 10_000 });
    const mine = results.find((r) => r.name === name)!;
    await expect(page.getByTestId('results-total')).toHaveText(String(mine.score));
    const rank = sorted.findIndex((r) => r.name === name) + 1;
    await expect(page.getByTestId('results-rank')).toHaveText(`You placed #${rank} of 3`);
    await expect(page.getByTestId('lang-toggle')).toBeVisible();
  }

  // "Join the next game" goes back to P1
  await a.page.getByTestId('join-next').click();
  await expect(a.page.getByTestId('screen-code')).toBeVisible();

  await hostCtx.close();
  for (const p of [a, b, c, d]) await p.context.close();
});

test('AC1.6: reload mid-attempt resumes the same attempt; a second submit is a success, not a duplicate', async ({
  browser,
}) => {
  const hostCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const host = await hostCtx.newPage();
  await hostSignIn(host);
  const code = await hostToLobby(host);

  const e = await newPhone(browser);
  await joinToLobby(e.page, code, 'Eve');
  await expect(hostPlayer(host, 'Eve')).toBeVisible();
  await host.getByTestId('host-start').click();
  await expect(e.page.getByTestId('screen-game')).toBeVisible({ timeout: 15_000 });

  await stcAttempt(e.page, 5200); // attempt 1
  // attempt 2: start, then reload while the hidden timer runs (STC-T7)
  await stcButton(e.page, 'Start').click({ timeout: 15_000 });
  const startedAt = Date.now();
  await e.page.waitForTimeout(3000);
  const before = await readLocal(e.page);
  const snapBefore = before?.gameSnapshot as { phase: string; attempts: StcAttempt[]; attemptStartEpoch: number };
  expect(snapBefore.phase).toBe('running');
  expect(snapBefore.attempts).toHaveLength(1);

  await e.page.reload();
  await expect(e.page.getByTestId('screen-game')).toBeVisible();
  await expect(e.page.getByTestId('screen-game')).toContainText('Try 2 of 3');
  await expect(stcButton(e.page, 'Stop')).toBeVisible();
  const after = await readLocal(e.page);
  const snapAfter = after?.gameSnapshot as typeof snapBefore;
  expect(snapAfter.attempts).toEqual(snapBefore.attempts); // attempt 1 kept
  expect(snapAfter.attemptStartEpoch).toBe(snapBefore.attemptStartEpoch); // clock not reset

  // stop at ~10.3 s after the original Start: measured spans the reload
  await e.page.waitForTimeout(Math.max(0, 10_300 - (Date.now() - startedAt)));
  await stcButton(e.page, 'Stop').click();
  await stcAttempt(e.page, 6800); // attempt 3
  await expect(e.page.getByTestId('own-score')).toBeVisible({ timeout: 15_000 });
  const r = await lastResult(e.page);
  expect(r.raw.attempts[1].measured_ms).toBeGreaterThanOrEqual(10_000);
  expect(r.raw.attempts[1].measured_ms).toBeLessThan(11_500);
  expect(r.score).toBe(stcScore(r.raw.attempts));

  // host ends the round by itself (1/1 finished) → intermission (P8 on the phone)
  await expectHostScreen(host, 'intermission', 10_000);
  await expect(e.page.getByTestId('screen-intermission')).toBeVisible({ timeout: 10_000 });

  // ---- second submit (within the 15 s late window of round 1) of the same payload (e.g. a retry after a lost ack): 23505 → treated as saved
  const insertStatuses: number[] = [];
  e.page.on('response', (res) => {
    if (res.url().includes('/rest/v1/scores') && res.request().method() === 'POST') insertStatuses.push(res.status());
  });
  await e.page.evaluate((payload) => {
    const cur = JSON.parse(localStorage.getItem('gdg.v1.current') ?? '{}');
    cur.pendingSubmit = payload;
    cur.submittedRounds = [];
    localStorage.setItem('gdg.v1.current', JSON.stringify(cur));
  }, r);
  await e.page.reload();
  await expect.poll(() => insertStatuses.length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(insertStatuses[0]).toBe(409); // unique violation on (round_id, player_id)
  await expect.poll(async () => ((await readLocal(e.page))?.pendingSubmit ?? null), { timeout: 10_000 }).toBeNull();
  const local = await readLocal(e.page);
  expect(local?.submittedRounds).toEqual([r.roundId]);
  expect(local?.saveFailedRound ?? null).toBeNull();
  expect(sqlCount(`select count(*) from public.scores where round_id = '${r.roundId}'`)).toBe(1);

  await hostFinishSession(host);
  await expect(e.page.getByTestId('screen-results')).toBeVisible({ timeout: 30_000 });

  await hostCtx.close();
  await e.context.close();
});

test('AC1.7 + AC1.3 + STC-T8: presence greys out, End round with one phone never playing', async ({ browser }) => {
  const hostCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const host = await hostCtx.newPage();
  await hostSignIn(host);
  const code = await hostToLobby(host);

  const x = await newPhone(browser);
  await joinToLobby(x.page, code, 'Xena');
  const y = await newPhone(browser);
  await joinToLobby(y.page, code, 'Yuri');
  await expect(hostPlayer(host, 'Yuri')).toHaveAttribute('data-online', 'true', { timeout: 10_000 });

  // ---- AC1.3 (approximation): the phone disappears (page closed); its dot greys out
  await y.context.close();
  const goneAt = Date.now();
  await expect(hostPlayer(host, 'Yuri')).toHaveAttribute('data-presence', 'off', { timeout: 20_000 });
  const greyLatency = Date.now() - goneAt;
  console.log(`AC1.3 presence dot grey after ${greyLatency} ms (PRESENCE_GREY_MS = 10000)`);
  expect(greyLatency).toBeLessThan(12_500);
  await expect(hostPlayer(host, 'Xena')).toHaveAttribute('data-presence', 'on');

  await host.getByTestId('host-start').click();
  await expect(x.page.getByTestId('screen-game')).toBeVisible({ timeout: 15_000 });

  await stcAttempt(x.page, 5100);
  // ---- STC-T8: the running screen doesn't change (screenshot every 1 s while the hidden timer runs)
  await stcButton(x.page, 'Start').click({ timeout: 15_000 });
  const t0 = Date.now();
  const frames: Buffer[] = [];
  for (let k = 0; k < 19; k++) {
    const due = t0 + 500 + k * 1000;
    await x.page.waitForTimeout(Math.max(0, due - Date.now()));
    frames.push(await x.page.screenshot());
  }
  console.log(`STC-T8 ${frames.length} frames over ${Date.now() - t0} ms after Start`);
  for (let k = 1; k < frames.length; k++) expect(frames[k].equals(frames[0]), `frame ${k} identical`).toBe(true);
  await stcButton(x.page, 'Stop').click();
  await stcAttempt(x.page, 7100);
  await expect(x.page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved', { timeout: 15_000 });

  // one of two finished: the round keeps waiting for Yuri
  await expect(host.getByTestId('host-finished')).toHaveText('1/2 finished', { timeout: 5000 });
  await host.waitForTimeout(1500);
  await expect(host.getByTestId('host-root')).toHaveAttribute('data-screen', 'round');

  // ---- AC1.7: End round with confirm
  await host.getByTestId('host-end-round').click();
  await expect(host.getByTestId('confirm-dialog')).toContainText('End this round now?');
  await host.getByTestId('confirm-yes').click();
  await expectHostScreen(host, 'intermission', 10_000);
  const r = await lastResult(x.page);
  await hostFinishSession(host);
  await expectHostScreen(host, 'results', 30_000);
  await expect(host.getByTestId('host-session-board').getByTestId('board-row')).toHaveCount(1);
  await expect(host.getByTestId('host-winner')).toContainText('Xena');

  expect(sql(`select end_reason from public.rounds where id = '${r.roundId}'`)).toBe('force_end');
  expect(sqlCount(`select count(*) from public.scores where round_id = '${r.roundId}'`)).toBe(1);
  expect(sqlCount(`select count(*) from public.scores where round_id = '${r.roundId}' and name = 'Yuri'`)).toBe(0);
  await expect(x.page.getByTestId('screen-results')).toBeVisible({ timeout: 10_000 });

  // leave the DB tidy for the next run
  await host.getByTestId('host-new-session').click();
  await expect(host.getByTestId('host-root')).toHaveAttribute('data-screen', 'lobby', { timeout: 10_000 });

  await hostCtx.close();
  await x.context.close();
});
