/**
 * How Many? big-screen count reveal (`docs/plans/games-v3.md` §5, ADR-136):
 * the 7 s round-board step after a How Many? round. It extends the Stop the
 * Clock reveal (StcReveal.tsx, ADR-025) to a count axis: three flat tracks,
 * one per flash, centred on the true count (the most common `true_count`
 * across rows), the ends at ±50 % relative error (`HM_REVEAL_WINDOW`), ticks
 * every 10 %; one dot per guess (beyond the window: pinned, hollow), the top 5
 * of the round board labelled in lanes. The phones never show the true
 * counts; this is where the room learns them.
 *
 * Timing inside the step, all measured from the round's `ended_at` (the
 * step's own anchor, ADR-129 (1), ADR-137 (5)), never from the mount: the
 * dots burst in track by track within 3.5 s (`HM_REVEAL_DOTS_MS`,
 * `revealSchedule`, the data-reveal shatter; 200 ms fades with reduced
 * motion), then at 4.0 s (`HM_REVEAL_MEAN_MS`) the amber crowd-average
 * marker and its legend fade in (no shards), so the "wisdom of the crowd"
 * beat lands last and the whole picture stays up for ≥ 3 s of the 7 s step.
 * Whatever is already due when it mounts (a late mount, a host reload
 * mid-step, a late score's dots, a flash whose first guess arrives late)
 * shows at once without a burst. Each strip keeps the count it first showed,
 * so a later refetch never moves dots already on screen. The axis is
 * geometry and never mirrors in Arabic.
 */
import { useMemo, useRef } from 'react';
import { HM_REVEAL_DOTS_MS, HM_REVEAL_MEAN_MS } from '../config';
import { formatNumber, useT } from '../i18n';
import { RevealIn } from '../components/RevealIn';
import { Trans } from '../components/Trans';
import { revealSchedule } from '../effects/shatter';
import { howManyStrips } from './howManyStrips';
import { slotDelay, useRoundReveal, type RevealProps } from './reveal';
import { RevealTrack } from './StcReveal';
import s from './intermission.module.css';

const DOT_IDS = { dot: 'hm-dot', label: 'hm-dot-label' };

export function HowManyReveal({ roundId, version, rows: previewRows, anchorMs = null }: RevealProps) {
  const t = useT();
  const rows = useRoundReveal(roundId, version, previewRows);
  // The count each strip first showed (per round): a later row can't re-centre the axis.
  const shown = useRef<{ roundId: string; counts: (number | null)[] }>({ roundId, counts: [] });
  const strips = useMemo(() => {
    if (!rows) return null;
    if (shown.current.roundId !== roundId) shown.current = { roundId, counts: [] };
    const next = howManyStrips(rows, undefined, undefined, shown.current.counts);
    shown.current.counts = next.map((x) => x.count);
    return next;
  }, [rows, roundId]);
  const plan = useMemo(
    () => (strips ? revealSchedule(strips.map((x) => x.dots.length), { totalMs: HM_REVEAL_DOTS_MS }) : null),
    [strips],
  );
  if (!strips || !plan) return null;
  // Read once per render; each marker takes it when it mounts (a rerender never replays it).
  const meanDelay = slotDelay(anchorMs, HM_REVEAL_MEAN_MS);

  return (
    <div className={s.strips} data-testid="hm-reveal">
      <div className={s.scale}>
        <h2 className={s.scaleTitle}>{t('game.how_many.reveal_title')}</h2>
        <span className={s.scaleAxis} dir="ltr">
          <span className={s.axisTag}>{t('game.how_many.reveal_axis')}</span>
        </span>
      </div>
      {strips.map((strip, i) => (
        <section key={i} className={s.strip} data-testid="hm-strip" data-count={strip.count ?? undefined}>
          <div className={s.stripLabel}>
            <p>
              <Trans
                k="game.how_many.reveal_round"
                params={{ n: formatNumber(i + 1) }}
                nodes={{
                  count: (
                    <span className={s.countHero} dir="ltr">
                      {strip.count === null ? t('results.breakdown_missing') : formatNumber(strip.count)}
                    </span>
                  ),
                }}
              />
            </p>
            {strip.mean !== null ? (
              <RevealIn as="span" variant="dot" delayMs={meanDelay} shards={0} className={s.meanLine}>
                <span className={s.meanKey} aria-hidden="true" />
                {t('game.how_many.reveal_mean', { n: formatNumber(strip.mean) })}
              </RevealIn>
            ) : null}
          </div>
          <RevealTrack
            dots={strip.dots}
            slots={plan[i]}
            testIds={DOT_IDS}
            anchorMs={anchorMs}
            before={
              strip.meanPos !== null ? (
                <RevealIn
                  as="span"
                  variant="dot"
                  delayMs={meanDelay}
                  shards={0}
                  className={s.mean}
                  style={{ insetInlineStart: `${strip.meanPos}%` }}
                  data-testid="hm-mean"
                  data-mean={strip.mean ?? undefined}
                />
              ) : null
            }
          />
        </section>
      ))}
    </div>
  );
}
