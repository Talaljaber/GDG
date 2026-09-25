/**
 * Stop the Clock big-screen guess reveal (`games/stop-the-clock.md` §6,
 * ADR-025): the first 7 s of the intermission after a Stop the Clock round.
 * Three horizontal strips (5 s, 10 s, 7 s), a centre line at the target, one
 * dot per player at their guess inside a ±5 s window (dots outside are
 * pinned to the edge); the top 5 of the round board are labelled.
 *
 * The time axis is geometry, not text, so it is never mirrored in Arabic
 * (DESIGN_SYSTEM RTL rules): the strips are always laid out left-to-right.
 *
 * Dots appear in shatter bursts, strip after strip, within 5 s
 * (DESIGN_SYSTEM §6.2 "Stop the Clock reveal"): `revealSchedule` spaces
 * them and sizes each burst so no more than 48 shards are alive at once.
 * Reduced motion: each dot fades in (200 ms) at its slot.
 */
import { useEffect, useMemo, useState } from 'react';
import { formatNumber, useT } from '../i18n';
import { fetchRoundReveal, type RevealRow } from '../lib/api';
import { STC_TARGETS_MS } from '../games/stop-the-clock/scoring';
import { revealStrips, type RevealDot } from './reveal';
import { replaceEqualDeep } from '../lib/equal';
import { RevealIn } from '../components/RevealIn';
import { revealSchedule } from '../effects/shatter';
import styles from './host.module.css';

/**
 * Which labels go below the track: greedy in position order, each label on the
 * side whose previous label ends before it starts (label widths estimated from
 * the text length; the track is about three quarters of the screen wide).
 */
type Lane = 'above' | 'below' | 'above2' | 'below2';
const LANES: Lane[] = ['above', 'below', 'above2', 'below2'];

function labelLanes(dots: readonly RevealDot[]): Map<string, Lane> {
  const vh = window.innerHeight / 100;
  const trackPx = window.innerWidth * 0.75;
  const widthPct = (label: string) => ((label.length * 0.55 * 3.2 * vh + 2 * vh) / trackPx) * 100;
  const end: Record<Lane, number> = {
    above: -Infinity,
    below: -Infinity,
    above2: -Infinity,
    below2: -Infinity,
  };
  const lanes = new Map<string, Lane>();
  for (const d of [...dots].filter((x) => x.label).sort((a, b) => a.pos - b.pos)) {
    const w = widthPct(d.label ?? '');
    const start = d.pos - w / 2;
    const lane =
      LANES.find((l) => end[l] <= start) ?? LANES.reduce((a, b) => (end[b] < end[a] ? b : a));
    end[lane] = d.pos + w / 2;
    lanes.set(d.playerRowId, lane);
  }
  return lanes;
}

const LANE_CLASS: Record<Lane, string> = {
  above: '',
  below: styles.revealNameBelow,
  above2: styles.revealNameAbove2,
  below2: `${styles.revealNameBelow} ${styles.revealNameBelow2}`,
};

/** One tick per second across the ±5 s window (geometry, never mirrored). */
const TICKS = [10, 20, 30, 40, 60, 70, 80, 90];

export function StcReveal({
  roundId,
  version,
  rows: previewRows,
}: {
  roundId: string;
  version: number;
  /** Dev preview only: fixed rows instead of the database query. */
  rows?: RevealRow[];
}) {
  const t = useT();
  const [fetched, setRows] = useState<RevealRow[] | null>(null);
  const live = !previewRows;
  useEffect(() => {
    if (!live) return;
    let alive = true;
    void fetchRoundReveal(roundId)
      .then((r) => {
        // Re-queried on every late score / hidden name: keep the rows (and the dots) when nothing changed.
        if (alive) setRows((prev) => replaceEqualDeep(prev, r));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [roundId, version, live]);
  const rows = previewRows ?? fetched;

  const strips = useMemo(() => (rows ? revealStrips(rows) : null), [rows]);
  const plan = useMemo(
    () => (strips ? revealSchedule(strips.map((dots) => dots.length)) : null),
    [strips],
  );
  if (!strips || !plan) return null;

  return (
    <div className={styles.reveal} data-testid="stc-reveal">
      <div className={styles.strip}>
        <span />
        <div className={styles.stripScale}>
          <h2 className={styles.eyebrow}>{t('game.stop_the_clock.reveal_title')}</h2>
          <span className={styles.stripScaleAxis} dir="ltr">
            <span className={styles.stripAxis}>{t('game.stop_the_clock.reveal_axis')}</span>
          </span>
        </div>
      </div>
      {strips.map((dots, i) => {
        const s = STC_TARGETS_MS[i] / 1000;
        const lanes = labelLanes(dots);
        return (
          <section
            key={i}
            className={styles.strip}
            data-testid="stc-strip"
            data-target={STC_TARGETS_MS[i]}
          >
            <p className={styles.stripLabel}>
              {t('game.stop_the_clock.target', { s: formatNumber(s), count: s })}
            </p>
            <div className={styles.stripTrack} dir="ltr">
              {TICKS.map((p) => (
                <span
                  key={p}
                  className={styles.stripTick}
                  style={{ insetInlineStart: `${p}%` }}
                  aria-hidden="true"
                />
              ))}
              <span className={styles.stripCentre} aria-hidden="true" />
              {dots.map((d, j) => {
                return (
                  <RevealIn
                    key={d.playerRowId}
                    as="span"
                    variant="dot"
                    delayMs={plan[i][j].delayMs}
                    shards={plan[i][j].shards}
                    className={`${styles.revealDot} ${d.pinned ? styles.revealDotPinned : ''} ${d.label ? styles.revealDotLabelled : ''}`}
                    style={{ insetInlineStart: `${d.pos}%` }}
                    data-testid="stc-dot"
                    data-player={d.playerRowId}
                  >
                    {d.label ? (
                      <span
                        className={`${styles.revealName} ${LANE_CLASS[lanes.get(d.playerRowId) ?? 'above']}`}
                      >
                        {/* The positioned span keeps the track's LTR geometry; the name keeps its own direction. */}
                        <bdi data-testid="stc-dot-label">{d.label}</bdi>
                      </span>
                    ) : null}
                  </RevealIn>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
