/**
 * The game-specific detail line under the own score on P7 (`SCREENS.md` P7,
 * "game detail line"). Stop the Clock: the three guesses vs targets
 * ("5.00 → 5.40 s"), closest guess highlighted amber
 * (`docs/games/stop-the-clock.md` §6–§7).
 */
import { useT } from '../i18n';
import type { GameId } from '../lib/api';
import type { StopTheClockAttempt } from '../games/stop-the-clock/scoring';
import styles from './player.module.css';

function seconds(ms: number): string {
  return (ms / 1000).toFixed(2);
}

function isStcRaw(raw: unknown): raw is { attempts: StopTheClockAttempt[] } {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    Array.isArray((raw as { attempts?: unknown }).attempts)
  );
}

export function ResultDetail({ game, raw }: { game: GameId | undefined; raw: unknown }) {
  const t = useT();
  if (game !== 'stop_the_clock' || !isStcRaw(raw)) return null;
  const errors = raw.attempts.map((a) =>
    a.measured_ms === null || a.missed_start ? Infinity : Math.abs(a.measured_ms - a.target_ms),
  );
  const best = Math.min(...errors);
  return (
    <ul className={styles.detail} data-testid="result-detail">
      {raw.attempts.map((a, i) => (
        <li key={i}>
          <span
            className={`${styles.detailRow} ${errors[i] === best && best !== Infinity ? styles.detailBest : ''}`}
            data-testid="result-row"
          >
            {a.measured_ms === null || a.missed_start
              ? t('game.stop_the_clock.missed')
              : t('game.stop_the_clock.result_row', { target: seconds(a.target_ms), guess: seconds(a.measured_ms) })}
          </span>
        </li>
      ))}
    </ul>
  );
}
