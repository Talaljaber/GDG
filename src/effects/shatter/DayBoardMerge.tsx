import { useRef, type ReactNode } from 'react';
import { playDayBoardMerge, type DayBoardMergeGame, type MergeTarget } from './merge';
import type { Density } from './geometry';
import { useLatest, useReplay } from './hooks';
import { useDensity, useReducedMotion } from './settings';

export interface DayBoardMergeProps {
  /** Plays whenever this changes (e.g. bump a counter on "Show day board"). */
  trigger: unknown;
  /** Also play on mount (default false). */
  playOnMount?: boolean;
  /** One entry per game in the lineup, in tab order. */
  games: readonly DayBoardMergeGame[];
  density?: Density;
  reducedMotion?: boolean;
  seed?: string | number;
  className?: string;
  'data-testid'?: string;
  onFragmented?: () => void;
  onGameStart?: (game: DayBoardMergeGame, index: number) => void;
  onRowsReassemble?: (game: DayBoardMergeGame, index: number, targets: readonly MergeTarget[]) => void;
  onGameEnd?: (game: DayBoardMergeGame, index: number) => void;
  onSettle?: () => void;
  onDone?: () => void;
  /** The stage: session results before onFragmented, the day board after. */
  children?: ReactNode;
}

/**
 * The ~15 s session-results → day-board choreography (§6.2). The component
 * is the stage container; the host swaps what it renders inside from the
 * callbacks. See dayBoardMerge.ts for the exact timeline.
 */
export function DayBoardMerge({
  trigger,
  playOnMount = false,
  games,
  density,
  reducedMotion,
  seed,
  className,
  'data-testid': testId,
  children,
  ...callbacks
}: DayBoardMergeProps) {
  const stage = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion(reducedMotion);
  const effectiveDensity = useDensity(density ?? 'projector');
  const latest = useLatest({ ...callbacks, games });
  useReplay(trigger, playOnMount, () => {
    if (!stage.current) return null;
    return playDayBoardMerge({
      stage: stage.current,
      // targets() always reads the latest render's getter (it runs seconds later).
      games: latest.current.games.map((g, idx) => ({
        ...g,
        targets: () => latest.current.games[idx]?.targets?.() ?? g.targets?.() ?? [],
      })),
      density: effectiveDensity,
      seed,
      reducedMotion: reduced,
      onFragmented: () => latest.current.onFragmented?.(),
      onGameStart: (g, i) => latest.current.onGameStart?.(g, i),
      onRowsReassemble: (g, i, t) => latest.current.onRowsReassemble?.(g, i, t),
      onGameEnd: (g, i) => latest.current.onGameEnd?.(g, i),
      onSettle: () => latest.current.onSettle?.(),
      onDone: () => latest.current.onDone?.(),
    });
  });
  return (
    <div ref={stage} className={className} data-testid={testId} data-shatter="merge">
      {children}
    </div>
  );
}
