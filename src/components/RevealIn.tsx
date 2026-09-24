/**
 * Entrance effects for boards, the Stop the Clock guess reveal and the
 * new-best line (`DESIGN_SYSTEM.md` §6.2). This file and its row hook
 * (`useRevealRows.ts`) are the single place where screens ask for the
 * mosaic shatter (`src/effects/shatter`) for these.
 *
 * - `useRevealRows` (useRevealRows.ts): list rows assemble from shards top to bottom when the
 *   list mounts (one budgeted batch: at most 48 shards alive on the
 *   projector), rows that appear later assemble as a new batch, and an
 *   optional "new #1" celebrate on the first row (H2).
 * - `<RevealIn variant="dot">`: a Stop the Clock guess dot that appears in a
 *   small shard burst after `delayMs` (projector density).
 * - `<RevealIn variant="celebrate">`: fragment & reassemble with an amber
 *   glow (P7 new best, phone density).
 *
 * Reduced motion (OS setting, or the host's toggle via <ShatterProvider>):
 * rows and dots fade in over 200 ms, celebrate becomes a static amber ring.
 * Never use these on the logo or on anything that contains it: they set
 * inline `opacity` on their element. Never use them on a game screen
 * during an attempt (games.md: nothing may change while a timer runs).
 */
import type { CSSProperties, ReactNode } from 'react';
import { Celebrate, ShatterBurst } from '../effects/shatter';

export type RevealVariant = 'dot' | 'celebrate';

/**
 * One element with an entrance: a guess dot (`dot`, after `delayMs`, with
 * `shards` from `revealSchedule`) or a celebrated line (`celebrate`, on mount).
 */
export function RevealIn({
  children,
  delayMs = 0,
  shards,
  variant,
  as: Tag = 'span',
  className,
  style,
  ...rest
}: {
  children?: ReactNode;
  delayMs?: number;
  shards?: number;
  variant: RevealVariant;
  as?: 'div' | 'li' | 'span';
  className?: string;
  style?: CSSProperties;
  [data: `data-${string}`]: string | number | undefined;
}) {
  const el = (
    <Tag {...rest} data-reveal={variant} className={className} style={style}>
      {children}
    </Tag>
  );
  if (variant === 'dot') {
    return (
      <ShatterBurst delay={delayMs} shards={shards}>
        {el}
      </ShatterBurst>
    );
  }
  return (
    <Celebrate trigger={0} playOnMount>
      {el}
    </Celebrate>
  );
}
