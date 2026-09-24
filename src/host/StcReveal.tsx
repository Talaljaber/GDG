/**
 * Stop the Clock big-screen guess reveal (`games/stop-the-clock.md` §6,
 * ADR-025): the first 7 s of the intermission after a Stop the Clock round.
 * Three horizontal strips (5 s, 10 s, 7 s), a centre line at the target, one
 * dot per player at their guess inside a ±5 s window (dots outside are
 * pinned to the edge); the top 5 of the round board are labelled.
 *
 * The time axis is geometry, not text, so it is never mirrored in Arabic
 * (DESIGN_SYSTEM RTL rules): the strips are always laid out left-to-right.
 */
import { useEffect, useMemo, useState } from 'react';
import { formatNumber, useT } from '../i18n';
import { fetchRoundReveal, type RevealRow } from '../lib/api';
import { STC_TARGETS_MS } from '../games/stop-the-clock/scoring';
import { revealStrips } from './reveal';
import { RevealIn } from '../components/RevealIn';
import styles from './host.module.css';

/** Stagger between strips (5 s, 10 s, 7 s) so they reveal one after another. */
const STRIP_STAGGER_MS = 600;

export function StcReveal({ roundId, version }: { roundId: string; version: number }) {
  const t = useT();
  const [rows, setRows] = useState<RevealRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchRoundReveal(roundId)
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [roundId, version]);

  const strips = useMemo(() => (rows ? revealStrips(rows) : null), [rows]);
  if (!strips) return null;

  return (
    <div className={styles.reveal} data-testid="stc-reveal">
      <h2 className={styles.subheading}>{t('game.stop_the_clock.reveal_title')}</h2>
      {strips.map((dots, i) => {
        const s = STC_TARGETS_MS[i] / 1000;
        return (
          <section key={i} className={styles.strip} data-testid="stc-strip" data-target={STC_TARGETS_MS[i]}>
            <p className={styles.stripLabel}>
              {t('game.stop_the_clock.target', { s: formatNumber(s), count: s })}
            </p>
            <div className={styles.stripTrack} dir="ltr">
              <span className={styles.stripCentre} aria-hidden="true" />
              <span className={styles.stripAxis}>{t('game.stop_the_clock.reveal_axis')}</span>
              {dots.map((d) => (
                <RevealIn
                  key={d.playerRowId}
                  as="span"
                  variant="dot"
                  delayMs={i * STRIP_STAGGER_MS}
                  className={`${styles.revealDot} ${d.pinned ? styles.revealDotPinned : ''}`}
                  style={{ insetInlineStart: `${d.pos}%` }}
                  data-testid="stc-dot"
                  data-player={d.playerRowId}
                >
                  {d.label ? (
                    <bdi className={styles.revealName} data-testid="stc-dot-label">
                      {d.label}
                    </bdi>
                  ) : null}
                </RevealIn>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
