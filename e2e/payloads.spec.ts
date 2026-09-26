/**
 * AC3.3 (accept half): the server accepts each game's valid payload exactly
 * as that game's own `buildRaw` produces it, in a real session run through
 * the real functions and score trigger (docs/PHASES.md Phase 3). The reject
 * half (every bound's failing payload → its reason code) is pgTAP
 * `05_score_bounds.sql`.
 *
 * No browser: one admin client and one anonymous guest client, both with the
 * publishable key only.
 */
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { adminClient, localEnv, resetToLobby, sql } from './helpers';
import * as stc from '../src/games/stop-the-clock/scoring';
import * as ooo from '../src/games/odd-one-out/scoring';
import * as simon from '../src/games/simon/scoring';
import * as pc from '../src/games/perfect-circle/scoring';
import { evaluateStroke, type Point } from '../src/games/perfect-circle/metric';
import * as trivia from '../src/games/trivia/scoring';
import * as cb from '../src/games/close-brackets/scoring';
import * as cc from '../src/games/color-clash/scoring';
import * as hm from '../src/games/how-many/scoring';
import * as ss from '../src/games/swipe-sort/scoring';
import * as pr from '../src/games/pairs/scoring';

test.describe.configure({ mode: 'serial' });

type Game =
  | 'stop_the_clock'
  | 'odd_one_out'
  | 'simon'
  | 'perfect_circle'
  | 'trivia'
  | 'close_brackets'
  | 'color_clash'
  | 'how_many'
  | 'swipe_sort'
  | 'pairs';

interface Built {
  raw: unknown;
  score: number;
  durationMs: number;
  /** The game's own client-side mirror of the server bounds: null = plausible. */
  clientReject: string | null;
}

/** A hand-drawn-looking circle: slight wobble (a perfect one is rejected as scripted, pc.too_perfect). */
function wobblyCircle(): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= 90; i++) {
    const a = (i / 90) * 2 * Math.PI * 1.02;
    const r = 130 * (1 + 0.03 * Math.sin(5 * a));
    pts.push({ x: 200 + r * Math.cos(a), y: 200 + r * Math.sin(a) });
  }
  return pts;
}

function build(game: Game): Built {
  switch (game) {
    case 'stop_the_clock': {
      const raw = stc.buildRaw([
        { target_ms: 5000, measured_ms: 5230, missed_start: false },
        { target_ms: 10000, measured_ms: 9410, missed_start: false },
        { target_ms: 7000, measured_ms: 7120, missed_start: false },
      ]);
      const score = stc.scoreStopTheClock(raw);
      return { raw, score, durationMs: 41_000, clientReject: stc.validateStopTheClockRaw(raw, score) };
    }
    case 'odd_one_out': {
      const raw = ooo.buildRaw([
        { size: 4, find_ms: 1840, wrong_taps: 0, timed_out: false },
        { size: 5, find_ms: 3920, wrong_taps: 1, timed_out: false },
        { size: 6, find_ms: 20000, wrong_taps: 0, timed_out: true },
      ]);
      const score = ooo.scoreOddOneOut(raw);
      return { raw, score, durationMs: 30_000, clientReject: ooo.validateOddOneOutRaw(raw) };
    }
    case 'simon': {
      // lengths 3, 4 and 5 completed (3 + 4 + 5 = 12 gaps), then a wrong tap
      const gaps = [620, 540, 580, 610, 500, 560, 590, 470, 530, 550, 600, 520];
      const raw = simon.buildRaw(5, gaps, 'mistake');
      const score = simon.scoreSimon(raw);
      const durationMs = 25_000;
      return { raw, score, durationMs, clientReject: simon.validateSimonRaw(raw, score, durationMs) };
    }
    case 'perfect_circle': {
      const evaluation = evaluateStroke(wobblyCircle(), 1620, 360);
      if (!evaluation.valid) throw new Error(`synthetic stroke should be valid, got ${JSON.stringify(evaluation)}`);
      const raw = pc.buildRaw(evaluation, 1620, 1);
      const score = pc.scorePerfectCircle(raw);
      return { raw, score, durationMs: 9_000, clientReject: pc.validatePerfectCircleRaw(raw, score) };
    }
    case 'trivia': {
      const raw = trivia.buildRaw([
        { id: 'q01', correct: true, answer_ms: 2400, timed_out: false },
        { id: 'q02', correct: false, answer_ms: 5100, timed_out: false },
        { id: 'q03', correct: true, answer_ms: 7800, timed_out: false },
        { id: 'q04', correct: false, answer_ms: null, timed_out: true },
        { id: 'q05', correct: true, answer_ms: 1300, timed_out: false },
      ]);
      const score = trivia.scoreTrivia(raw);
      return { raw, score, durationMs: 45_000, clientReject: trivia.validateTriviaRaw(raw, score) };
    }
    case 'close_brackets': {
      // worked example A (docs/games/close-brackets.md §4): 9 solved, one wrong closer
      const raw = cb.buildRaw(9, 1, 0, 23_562);
      const score = cb.scoreCloseBrackets(raw);
      return { raw, score, durationMs: 31_600, clientReject: cb.validateCloseBracketsRaw(raw, score) };
    }
    case 'color_clash': {
      // worked example A (docs/games/color-clash.md §4): 32 correct in 20 160 ms of reaction time, one wrong
      const raw = cc.buildRaw(32, 1, 0, 32 * 630);
      const score = cc.scoreColorClash(raw);
      return { raw, score, durationMs: 31_600, clientReject: cc.validateColorClashRaw(raw, score) };
    }
    case 'how_many': {
      // worked example A (docs/games/how-many.md §4, ADR-138): N = [6, 11, 16], guesses 6 / 10 / 14 -> 905
      const raw = hm.buildRaw([
        { true_count: 6, guess: 6, answer_ms: 2400, timed_out: false },
        { true_count: 11, guess: 10, answer_ms: 3100, timed_out: false },
        { true_count: 16, guess: 14, answer_ms: 4200, timed_out: false },
      ]);
      const score = hm.scoreHowMany(raw);
      return { raw, score, durationMs: 23_000, clientReject: hm.validateHowManyRaw(raw, score) };
    }
    case 'swipe_sort': {
      // worked example A (docs/games/swipe-sort.md §2.3): 43 / 1 / 5 at a 450 ms mean
      const raw = ss.buildRaw(43, 1, 5, 43 * 450);
      const score = ss.scoreSwipeSort(raw);
      return { raw, score, durationMs: 31_500, clientReject: ss.validateSwipeSortRaw(raw, score) };
    }
    case 'pairs': {
      // worked example A (docs/games/pairs.md §4): 8 pairs, 5 misses, cleared at 34 200 ms
      const raw = pr.buildRaw(8, 5, 34_200);
      const score = pr.scorePairs(raw);
      return { raw, score, durationMs: 35_700, clientReject: pr.validatePairsRaw(raw, score) };
    }
  }
}

async function guestClient(): Promise<SupabaseClient> {
  const env = localEnv();
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInAnonymously();
  if (error) throw error;
  return client;
}

test('AC3.3: every game’s own buildRaw payload is accepted by the score trigger', async () => {
  await resetToLobby();
  const admin = await adminClient();
  const lineups: Game[][] = [
    ['stop_the_clock', 'odd_one_out', 'simon'],
    ['perfect_circle', 'trivia', 'stop_the_clock'],
    ['close_brackets', 'color_clash', 'odd_one_out'],
    ['how_many', 'swipe_sort', 'pairs'],
  ];
  const accepted = new Set<Game>();

  for (const lineup of lineups) {
    const { data: lobby, error: openErr } = await admin.rpc('admin_open_lobby', { p_lineup: lineup });
    expect(openErr).toBeNull();
    const { error: lineupErr } = await admin.rpc('admin_set_lineup', { p_session: lobby.id, p_lineup: lineup });
    expect(lineupErr).toBeNull();

    const guest = await guestClient();
    const { data: joined, error: joinErr } = await guest.rpc('join_session', { p_code: lobby.code, p_name: 'Payload' });
    expect(joinErr).toBeNull();
    const { data: userData } = await guest.auth.getUser();
    const uid = userData.user!.id;

    const { error: startErr } = await admin.rpc('admin_start_session', { p_session: lobby.id });
    expect(startErr).toBeNull();
    const { data: rounds } = await admin.from('rounds').select('*').eq('session_id', lobby.id).order('round_no');
    expect(rounds?.map((r) => r.game)).toEqual(lineup);

    for (const round of rounds ?? []) {
      if (round.round_no > 1) {
        const { error } = await admin.rpc('admin_start_round', { p_round: round.id });
        expect(error).toBeNull();
      }
      const b = build(round.game as Game);
      expect(b.clientReject, `${round.game}: the game's own bounds mirror accepts it`).toBeNull();
      expect(Number.isInteger(b.score) && b.score >= 0 && b.score <= 1000).toBe(true);
      const { error } = await guest.from('scores').insert({
        round_id: round.id,
        player_id: uid,
        score: b.score,
        duration_ms: b.durationMs,
        raw: b.raw,
        client_version: 'e2e-payloads',
      } as never);
      expect(error, `${round.game}: ${error?.message} ${error?.details ?? ''}`).toBeNull();
      expect(
        Number(sql(`select score from public.scores where round_id = '${round.id}' and player_id = '${uid}'`)),
        `${round.game}: stored as sent (the server never recomputes)`,
      ).toBe(b.score);
      console.log(`AC3.3 ${round.game}: score ${b.score} accepted`);
      accepted.add(round.game as Game);
      const { error: endErr } = await admin.rpc('admin_end_round', { p_round: round.id, p_reason: 'all_finished' });
      expect(endErr).toBeNull();
    }
    expect(sql(`select status from public.sessions where id = '${lobby.id}'`)).toBe('results');
    expect(Number(sql(`select total from public.v_session_board where player_row_id = '${joined.player_row_id}'`))).toBe(
      rounds!.reduce((sum, r) => sum + build(r.game as Game).score, 0),
    );
    const { error: newErr } = await admin.rpc('admin_new_session');
    expect(newErr).toBeNull();
    await guest.auth.signOut();
  }

  expect([...accepted].sort()).toEqual([
    'close_brackets',
    'color_clash',
    'how_many',
    'odd_one_out',
    'pairs',
    'perfect_circle',
    'simon',
    'stop_the_clock',
    'swipe_sort',
    'trivia',
  ]);
  await admin.auth.signOut();
});
