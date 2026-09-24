/**
 * The game's breakdown under the own score on P7 (`SCREENS.md` P7, each game
 * doc's `result` state), as a label · value list (DESIGN_SYSTEM §0.3):
 * - Stop the Clock: target · guess per try, closest guess amber (`stop-the-clock.md` §6–§7)
 * - Odd One Out: grid · time (with the penalty note)
 * - Simon: length reached · speed bonus
 * - Perfect Circle: roundness · closed
 * - Trivia: correct answers
 * Read-only display of the submitted `raw`; scores are never recomputed here.
 */
import { formatNumber, useT } from '../i18n';
import type { GameId } from '../lib/api';
import type { StopTheClockAttempt } from '../games/stop-the-clock/scoring';
import { OOO_WRONG_TAP_PENALTY_MS, type OddOneOutGrid } from '../games/odd-one-out/scoring';
import { timeBonus, type SimonRaw } from '../games/simon/scoring';
import type { PerfectCircleRaw } from '../games/perfect-circle/scoring';
import { closureFromSweep, roundnessFromEpsilon } from '../games/perfect-circle/metric';
import type { TriviaRaw } from '../games/trivia/scoring';
import { DetailList, type DetailRow } from './chrome';

function seconds(ms: number, digits: number): string {
  return (ms / 1000).toFixed(digits);
}

function isObject(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null;
}

function hasArray<K extends string>(raw: unknown, key: K): raw is Record<K, unknown[]> {
  return isObject(raw) && Array.isArray(raw[key]);
}

export function ResultDetail({ game, raw }: { game: GameId | undefined; raw: unknown }) {
  const t = useT();
  const rows = game ? detailRows(game, raw, t) : null;
  if (!rows || rows.length === 0) return null;
  return <DetailList rows={rows} testId="result-detail" />;
}

type T = ReturnType<typeof useT>;

function detailRows(game: GameId, raw: unknown, t: T): DetailRow[] | null {
  switch (game) {
    case 'stop_the_clock': {
      if (!hasArray(raw, 'attempts')) return null;
      const attempts = raw.attempts as StopTheClockAttempt[];
      const errors = attempts.map((a) =>
        a.measured_ms === null || a.missed_start ? Infinity : Math.abs(a.measured_ms - a.target_ms),
      );
      const best = Math.min(...errors);
      return attempts.map((a, i) => ({
        key: String(i),
        testId: 'result-row',
        label: t('game.stop_the_clock.target', { s: a.target_ms / 1000 }),
        value:
          a.measured_ms === null || a.missed_start
            ? t('game.stop_the_clock.missed')
            : t('game.stop_the_clock.guess', { guess: seconds(a.measured_ms, 2) }),
        best: errors[i] === best && best !== Infinity,
      }));
    }
    case 'odd_one_out': {
      if (!hasArray(raw, 'grids')) return null;
      return (raw.grids as OddOneOutGrid[]).map((g, i) => {
        const penaltyMs = g.wrong_taps * OOO_WRONG_TAP_PENALTY_MS;
        return {
          key: String(i),
          testId: 'result-row',
          label: t('game.odd_one_out.result_label', { n: i + 1 }),
          value: g.timed_out
            ? t('game.odd_one_out.result_timeout')
            : t('game.odd_one_out.result_value', { s: seconds(g.find_ms + penaltyMs, 1) }),
          note: penaltyMs > 0 ? t('game.odd_one_out.penalty_note', { p: penaltyMs / 1000 }) : undefined,
        };
      });
    }
    case 'simon': {
      if (!isObject(raw) || typeof raw.level !== 'number') return null;
      const r = raw as unknown as SimonRaw;
      return [
        { key: 'level', testId: 'result-row', label: t('game.simon.result_length'), value: formatNumber(r.level) },
        {
          key: 'bonus',
          testId: 'result-row',
          label: t('game.simon.result_bonus'),
          value: <bdi dir="ltr">+{formatNumber(timeBonus(r.level, r.avg_gap_ms))}</bdi>,
        },
      ];
    }
    case 'perfect_circle': {
      if (!isObject(raw) || typeof raw.timed_out !== 'boolean') return null;
      const r = raw as unknown as PerfectCircleRaw;
      if (r.timed_out || r.epsilon === null || r.sweep_deg === null) {
        return [
          {
            key: 'timeout',
            testId: 'result-row',
            label: t('game.perfect_circle.name'),
            value: t('game.perfect_circle.result_timeout'),
          },
        ];
      }
      const pct = (x: number) => t('game.perfect_circle.result_pct', { p: Math.round(x * 100) });
      return [
        {
          key: 'roundness',
          testId: 'result-row',
          label: t('game.perfect_circle.result_roundness'),
          value: pct(roundnessFromEpsilon(r.epsilon)),
        },
        {
          key: 'closure',
          testId: 'result-row',
          label: t('game.perfect_circle.result_closure'),
          value: pct(closureFromSweep(r.sweep_deg)),
        },
      ];
    }
    case 'trivia': {
      if (!hasArray(raw, 'questions')) return null;
      const correct = (raw as unknown as TriviaRaw).questions.filter((q) => q.correct).length;
      return [
        {
          key: 'correct',
          testId: 'result-row',
          label: t('game.trivia.result_label'),
          value: t('game.trivia.result_value', { n: correct }),
        },
      ];
    }
    default:
      return null;
  }
}
