/**
 * Perfect Circle score ring (docs/games/perfect-circle.md §7-8): a circular
 * progress ring that animates 0 -> score while its colour interpolates
 * blue (0) -> amber (1000), palette tokens only via color-mix(). Under
 * reduced motion it shows the final value at once (§9).
 */
import { useEffect, useState } from 'react';
import styles from './PerfectCircle.module.css';

/** Score count-up duration (docs/DESIGN_SYSTEM.md §6.3: 0 -> value over 800 ms). */
const COUNT_UP_MS = 800;

const VIEW = 120;
const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

export interface ScoreRingProps {
  score: number;
  reducedMotion: boolean;
}

export function ScoreRing({ score, reducedMotion }: ScoreRingProps) {
  const animate = !reducedMotion && typeof window.requestAnimationFrame === 'function';
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      setAnimated(score * easeOut(t));
      if (t < 1) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [score, animate]);

  const value = animate ? animated : score;
  const fraction = Math.max(0, Math.min(1, value / 1000));
  const amberPct = Math.round(fraction * 100);
  const colour = `color-mix(in srgb, var(--gdg-amber) ${amberPct}%, var(--gdg-blue))`;

  return (
    <div className={styles.ring} aria-hidden="true" data-testid="pc-score-ring">
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className={styles.ringSvg}>
        <circle className={styles.ringTrack} cx={VIEW / 2} cy={VIEW / 2} r={RADIUS} />
        <circle
          className={styles.ringProgress}
          cx={VIEW / 2}
          cy={VIEW / 2}
          r={RADIUS}
          style={{
            stroke: colour,
            strokeDasharray: CIRCUMFERENCE,
            strokeDashoffset: CIRCUMFERENCE * (1 - fraction),
          }}
          transform={`rotate(-90 ${VIEW / 2} ${VIEW / 2})`}
        />
      </svg>
      <span className={styles.ringValue} data-testid="pc-ring-value">
        {Math.round(value)}
      </span>
    </div>
  );
}
