/**
 * H3 Intermission (`SCREENS.md` H3, ADR-117/129, host-v3 §4.4): round board
 * 7 s (for Stop the Clock and How Many?: the guess reveal) → session total
 * 5 s → "Next: <game>" 3 s with 3-2-1, then the host loop starts the next
 * round. After the last round only the round board shows, then H4. "Next
 * round now" skips to the "Next" step. The step timing lives in schedule.ts
 * and useHost.ts and is unchanged here; this file is presentation only.
 *
 * One mounted shell for the whole intermission (hostScreenKey gives the
 * round one key, so no screen shatter between steps): the steps crossfade
 * inside the stage (`--dur-step`, StepFade), and the board keeps one
 * `BoardTable` instance from the round board to the total, so its rows FLIP
 * to the new order and their totals count on from the shown values. The
 * only shatter here is the reveals' dot bursts (a data reveal). The whole
 * screen re-renders only when the step changes (useHost's stepped clock);
 * the 3-2-1 is its own leaf.
 */
import {
  Component,
  createRef,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { formatNumber, useT } from '../i18n';
import { fetchRoundBoard, fetchSessionBoard, type RevealRow } from '../lib/api';
import { mergeBoard, type RankedRow } from '../lib/boards';
import { replaceEqualDeep } from '../lib/equal';
import type { GameId } from '../games/types';
import { Spinner } from '../components/Spinner';
import { useSteppedNow } from '../components/useSteppedNow';
import hostStyles from './host.module.css';
import s from './intermission.module.css';
import { BoardTable } from './BoardTable';
import { CornerCode, Framed, HostHeader, LineupSummary, NextGamesButton, Rail } from './common';
import { motionReducedNow, tokenEasing, tokenMs } from './flip';
import { HowManyReveal } from './HowManyReveal';
import type { RevealProps } from './reveal';
import { StcReveal } from './StcReveal';
import type { HostController, HostData } from './useHost';

/** Games whose round-board step is a guess reveal instead of the board (same props). */
const REVEALS: Partial<Record<GameId, ComponentType<RevealProps>>> = {
  stop_the_clock: StcReveal,
  how_many: HowManyReveal,
};

const NO_ROWS: readonly RankedRow[] = [];

type Layout = 'next' | 'reveal' | 'split';
const LAYOUT_CLASS: Record<Layout, string> = { next: s.nextLayout, reveal: s.reveal, split: s.split };

function useBoard(fetcher: (() => Promise<RankedRow[]>) | null, deps: unknown[]): RankedRow[] | null {
  const [rows, setRows] = useState<RankedRow[] | null>(null);
  useEffect(() => {
    if (!fetcher) return;
    let alive = true;
    void fetcher()
      .then((r) => {
        if (alive) setRows((prev) => replaceEqualDeep(prev, r));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return rows;
}

/**
 * The 3-2-1 of the "Next" step. Its own leaf with its own clock, so the second ticking over
 * re-renders this number only, not the whole intermission (`TESTING.md` §9). Each digit
 * settles in calmly (opacity + scale 1.06 → 1 over `--dur-step`).
 */
function StepCountdown({ endsAtMs, offset }: { endsAtMs: number; offset: number }) {
  const secondsAt = (localNow: number) => Math.max(1, Math.ceil((endsAtMs - (localNow + offset)) / 1000));
  const secondsLeft = secondsAt(useSteppedNow(secondsAt, COUNTDOWN_TICK_MS));
  return (
    <p key={secondsLeft} className={s.countdown} dir="ltr" aria-live="polite">
      {formatNumber(secondsLeft)}
    </p>
  );
}

const COUNTDOWN_TICK_MS = 250;

/**
 * A crossfade between intermission steps inside the same shell. On a `stepKey` change the
 * outgoing content is snapshotted just before React commits (`getSnapshotBeforeUpdate`),
 * laid over the new content and faded out while the new one fades in, both over
 * `--dur-step` (WAAPI, no React state, so no extra commit). Reduced motion (OS or the
 * host's toggle): an instant swap. The snapshot is inert, hidden from assistive tech and
 * carries no test ids.
 */
class StepFade extends Component<{
  stepKey: string;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}> {
  private box = createRef<HTMLDivElement>();
  private inner = createRef<HTMLDivElement>();
  private ghost: HTMLElement | null = null;
  private anims: Animation[] = [];

  getSnapshotBeforeUpdate(prev: Readonly<{ stepKey: string }>): HTMLElement | null {
    const inner = this.inner.current;
    if (prev.stepKey === this.props.stepKey || !inner || typeof inner.animate !== 'function') return null;
    if (motionReducedNow() || tokenMs('--dur-step', 300) <= 0) return null;
    const ghost = inner.cloneNode(true) as HTMLElement;
    for (const el of [ghost, ...ghost.querySelectorAll<HTMLElement>('[data-testid], [id]')]) {
      el.removeAttribute('data-testid');
      el.removeAttribute('id');
    }
    ghost.classList.add(s.fadeOut);
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('inert', '');
    return ghost;
  }

  componentDidUpdate(_prev: unknown, _state: unknown, ghost: HTMLElement | null): void {
    if (!ghost) return;
    this.clear();
    const box = this.box.current;
    const inner = this.inner.current;
    if (!box || !inner) return;
    box.appendChild(ghost);
    this.ghost = ghost;
    const timing = { duration: tokenMs('--dur-step', 300), easing: tokenEasing('--ease-standard', 'ease') };
    const out = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, fill: 'forwards' });
    out.onfinish = () => this.clear();
    this.anims = [out, inner.animate([{ opacity: 0 }, { opacity: 1 }], timing)];
  }

  componentWillUnmount(): void {
    this.clear();
  }

  private clear(): void {
    for (const a of this.anims) a.cancel();
    this.anims = [];
    this.ghost?.remove();
    this.ghost = null;
  }

  render() {
    return (
      <div ref={this.box} className={`${s.fadeBox} ${this.props.className ?? ''}`}>
        <div ref={this.inner} className={this.props.innerClassName}>
          {this.props.children}
        </div>
      </div>
    );
  }
}

/** Dev preview only: fixed boards / reveal rows instead of the database queries. */
export interface IntermissionPreview {
  roundBoard?: RankedRow[] | null;
  totalBoard?: RankedRow[] | null;
  reveal?: RevealRow[];
}

export function HostIntermission({
  host,
  data,
  preview,
}: {
  host: HostController;
  data: HostData;
  preview?: IntermissionPreview;
}) {
  const t = useT();
  const info = host.intermission;
  const roundId = info?.round.id ?? null;
  const step = info?.state.step ?? null;
  const hasNext = !!info?.next;
  const showsRound = step === 'round_board' || (step === 'done' && !hasNext);
  const showsTotal = step === 'session_total';
  const Reveal = info ? REVEALS[info.round.game] : undefined;
  const live = !preview;

  // Late scores (≤ 15 s after ended_at, E22) and hidden names re-query via scoresVersion.
  // A reveal game shows no round board, so it isn't fetched.
  const fetchedRound = useBoard(
    live && roundId && showsRound && !Reveal
      ? async () => mergeBoard((await fetchRoundBoard(roundId)).top, null, null)
      : null,
    [roundId, showsRound, !Reveal, host.scoresVersion, live],
  );
  // The total is fetched from the round-board step on, so it is there when its step starts
  // and the board can FLIP straight away.
  const wantsTotal = showsTotal || (showsRound && hasNext);
  const fetchedTotal = useBoard(
    live && wantsTotal ? async () => mergeBoard((await fetchSessionBoard(data.session.id)).top, null, null) : null,
    [data.session.id, wantsTotal, host.scoresVersion, live],
  );
  const roundBoard = preview ? (preview.roundBoard ?? null) : fetchedRound;
  const totalBoard = preview ? (preview.totalBoard ?? null) : fetchedTotal;

  const lineup = useMemo(() => [...data.rounds].sort((a, b) => a.round_no - b.round_no).map((r) => r.game), [data.rounds]);

  if (!info) return <Spinner />;
  const { round, next, state } = info;
  const total = data.rounds.length;

  const header = <HostHeader withLogo={false} end={<CornerCode pending={data.pending} joined={data.pendingPlayers} />} />;
  const skip =
    next && state.step !== 'next_intro' && state.step !== 'done' ? (
      <button type="button" className={hostStyles.primary} onClick={host.skipIntermission} data-testid="host-skip">
        {t('intermission.skip')}
      </button>
    ) : null;
  const rail = <Rail start={<NextGamesButton host={host} pending={data.pending} />}>{skip}</Rail>;

  // 'done' with a next round keeps the "Next" step until the round has started (no flash of the
  // round board, and one screen transition "Next" → H2).
  const isNext = (state.step === 'next_intro' || state.step === 'done') && !!next;
  const isTotal = state.step === 'session_total';
  const layout: Layout = isNext ? 'next' : !isTotal && Reveal ? 'reveal' : 'split';

  const upNext = next ? <p className={s.upNext}>{t('intermission.next', { game: t(`game.${next.game}.name`) })}</p> : null;
  const roundTitle = (
    <h1 className={s.titleBlock} data-testid="host-intermission-title">
      <span className={s.eyebrow}>{isTotal ? t('round.label', { n: round.round_no, total }) : t('intermission.round_board', { n: round.round_no })}</span>
      <span className={s.titleSep}>{' · '}</span>
      <span className={s.title}>{isTotal ? t('intermission.session_total') : t(`game.${round.game}.name`)}</span>
    </h1>
  );

  let content: ReactNode;
  if (isNext && next) {
    content = (
      <div className={s.next} data-testid="host-next-intro" data-game={next.game}>
        <p className={s.nextLabel}>{t('round.label', { n: next.round_no, total })}</p>
        <Framed className={s.nextFrame}>
          <h1 className={s.nextGame}>{t('intermission.next', { game: t(`game.${next.game}.name`) })}</h1>
        </Framed>
        <StepCountdown endsAtMs={state.stepEndsAtMs} offset={host.offset ?? 0} />
      </div>
    );
  } else if (layout === 'reveal' && Reveal) {
    content = (
      <>
        <div className={s.revealHead}>
          {roundTitle}
          {upNext}
        </div>
        {preview?.reveal ? (
          <Reveal roundId={round.id} version={host.scoresVersion} rows={preview.reveal} />
        ) : (
          <Reveal roundId={round.id} version={host.scoresVersion} />
        )}
      </>
    );
  } else {
    const rows = isTotal ? totalBoard : roundBoard;
    const emptyText = rows && rows.length === 0 ? t(isTotal ? 'results.no_scores' : 'round.no_scores') : undefined;
    content = (
      <>
        <StepFade stepKey={isTotal ? 'total' : 'board'} className={s.side} innerClassName={s.sideInner}>
          {roundTitle}
          {isTotal ? null : upNext}
          {lineup.length > 1 ? (
            <p className={s.summary}>
              <LineupSummary games={lineup} current={next ? next.round_no : round.round_no + 1} />
            </p>
          ) : null}
        </StepFade>
        {/* One BoardTable across both steps (same position in the tree): its rows FLIP. */}
        <section className={s.boardArea}>
          <BoardTable
            rows={rows ?? NO_ROWS}
            testId={isTotal ? 'host-total-board' : 'host-round-board'}
            emptyText={emptyText}
            countUp
          />
        </section>
      </>
    );
  }

  return (
    <>
      {header}
      <main
        className={`${hostStyles.body} ${s.stage}`}
        data-testid="host-intermission"
        data-step={state.step}
        data-round={round.round_no}
        data-layout={layout}
      >
        <StepFade stepKey={layout} className={s.stageFade} innerClassName={LAYOUT_CLASS[layout]}>
          {content}
        </StepFade>
      </main>
      {rail}
    </>
  );
}
