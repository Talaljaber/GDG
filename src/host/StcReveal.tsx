/**
 * Stop the Clock big-screen guess reveal (`games/stop-the-clock.md` §6,
 * ADR-025, host-v3 §4.4): the first 7 s of the intermission after a Stop the
 * Clock round. Three flat tracks (5 s, 10 s, 7 s): a hairline baseline with
 * 1 s ticks, the ±5 s ends marked, the target line in ink; one solid dot per
 * player at their guess (dots outside the window are pinned to the edge,
 * hollow); the top 5 of the round board are labelled in lanes (two above,
 * two below), and the block reserves those lanes so no name crosses another
 * track.
 *
 * The time axis is geometry, not text, so it is never mirrored in Arabic
 * (DESIGN_SYSTEM RTL rules): the tracks are always laid out left-to-right.
 *
 * Dots appear in shatter bursts, track after track, within 5 s of the
 * round's `ended_at` (a data reveal, one of the places the shatter is
 * allowed, host-v3 §2.1 rule 6): `revealSchedule` spaces them and sizes each
 * burst so no more than 48 shards are alive at once. The slots count from
 * `ended_at` (the step's own anchor, ADR-129 (1)), not from the mount: a dot
 * that is already due when it mounts (a late score, a host reload mid-step)
 * appears at once without a burst. Reduced motion: each dot fades in
 * (200 ms) at its slot.
 */
import { useMemo, type ReactNode } from 'react';
import { formatNumber, useT } from '../i18n';
import { STC_TARGETS_MS } from '../games/stop-the-clock/scoring';
import {
  anchoredSlot,
  labelLanes,
  projectorLabelWidth,
  revealStrips,
  useRoundReveal,
  type LabelPlace,
  type RevealDot,
  type RevealProps,
} from './reveal';
import { RevealIn } from '../components/RevealIn';
import { revealSchedule, type RevealSlot } from '../effects/shatter';
import s from './intermission.module.css';

const LANE_CLASS: Record<LabelPlace['lane'], string> = {
  above: s.above,
  below: s.below,
  above2: s.above2,
  below2: s.below2,
};

const ALIGN_CLASS: Record<LabelPlace['align'], string> = { centre: '', start: s.alignStart, end: s.alignEnd };

/** One second per tick across the ±5 s window, and the window's two ends. */
const TICKS = [10, 20, 30, 40, 60, 70, 80, 90];
const ENDS = [0, 100];

/**
 * A flat track with its dots (shared with the How Many? reveal). `before`
 * renders under the dots (e.g. the crowd-average marker), so names always
 * stay on top. `anchorMs` (the round's `ended_at`, local clock) makes every
 * slot count from the step start; each dot reads its delay once, when it
 * mounts, so a rerender never replays it.
 */
export function RevealTrack({
  dots,
  slots,
  testIds,
  before,
  anchorMs = null,
}: {
  dots: readonly RevealDot[];
  slots: readonly RevealSlot[];
  testIds: { dot: string; label: string };
  before?: ReactNode;
  anchorMs?: number | null;
}) {
  const nowMs = Date.now();
  const places = labelLanes(dots, projectorLabelWidth());
  return (
    <div className={s.track} dir="ltr">
      <span className={s.baseline} aria-hidden="true" />
      {TICKS.map((p) => (
        <span key={p} className={s.tick} style={{ insetInlineStart: `${p}%` }} aria-hidden="true" />
      ))}
      {ENDS.map((p) => (
        <span key={p} className={s.end} style={{ insetInlineStart: `${p}%` }} aria-hidden="true" />
      ))}
      <span className={s.centre} aria-hidden="true" />
      {before}
      {dots.map((d, j) => {
        const place = places.get(d.playerRowId);
        const slot = anchoredSlot(anchorMs, slots[j], nowMs);
        return (
          <RevealIn
            key={d.playerRowId}
            as="span"
            variant="dot"
            delayMs={slot.delayMs}
            shards={slot.shards}
            className={`${s.dot} ${d.pinned ? s.dotPinned : ''}`}
            style={{ insetInlineStart: `${d.pos}%` }}
            data-testid={testIds.dot}
            data-player={d.playerRowId}
          >
            {d.label && place ? (
              <span className={`${s.name} ${LANE_CLASS[place.lane]} ${ALIGN_CLASS[place.align]}`}>
                {/* The positioned span keeps the track's LTR geometry; the name keeps its own direction. */}
                <bdi data-testid={testIds.label}>{d.label}</bdi>
              </span>
            ) : null}
          </RevealIn>
        );
      })}
    </div>
  );
}

export function StcReveal({ roundId, version, rows: previewRows, anchorMs = null }: RevealProps) {
  const t = useT();
  const rows = useRoundReveal(roundId, version, previewRows);
  const strips = useMemo(() => (rows ? revealStrips(rows) : null), [rows]);
  const plan = useMemo(() => (strips ? revealSchedule(strips.map((dots) => dots.length)) : null), [strips]);
  if (!strips || !plan) return null;

  return (
    <div className={s.strips} data-testid="stc-reveal">
      <div className={s.scale}>
        <h2 className={s.scaleTitle}>{t('game.stop_the_clock.reveal_title')}</h2>
        <span className={s.scaleAxis} dir="ltr">
          <span className={s.axisTag}>{t('game.stop_the_clock.reveal_axis')}</span>
        </span>
      </div>
      {strips.map((dots, i) => {
        const sec = STC_TARGETS_MS[i] / 1000;
        return (
          <section key={i} className={s.strip} data-testid="stc-strip" data-target={STC_TARGETS_MS[i]}>
            <p className={s.stripLabel}>{t('game.stop_the_clock.target', { s: formatNumber(sec), count: sec })}</p>
            <RevealTrack
              dots={dots}
              slots={plan[i]}
              testIds={{ dot: 'stc-dot', label: 'stc-dot-label' }}
              anchorMs={anchorMs}
            />
          </section>
        );
      })}
    </div>
  );
}
