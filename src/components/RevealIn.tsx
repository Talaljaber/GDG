/**
 * Reveal wrapper for board rows and reveal dots (`DESIGN_SYSTEM.md` §6).
 *
 * SHATTER HOOK (Phase 5): this is the single place where boards, the Stop
 * the Clock guess reveal and the day-board merge ask for an entrance effect.
 * Today it is a simple opacity + scale-in (transform/opacity only; the
 * reduced-motion tokens set the duration to 0). When the mosaic shatter
 * layer in `src/effects/shatter` lands, render its component here instead
 * (keep the `data-reveal` attribute and the `delayMs` stagger); callers
 * don't change. Never apply it to the logo.
 */
import type { CSSProperties, ReactNode } from 'react';
import styles from './ui.module.css';

export type RevealVariant = 'row' | 'dot';

export function RevealIn({
  children,
  delayMs = 0,
  variant = 'row',
  as: Tag = 'div',
  className,
  style,
  ...rest
}: {
  children?: ReactNode;
  delayMs?: number;
  variant?: RevealVariant;
  as?: 'div' | 'li' | 'span';
  className?: string;
  style?: CSSProperties;
  [data: `data-${string}`]: string | number | undefined;
}) {
  return (
    <Tag
      {...rest}
      data-reveal={variant}
      className={[styles.revealIn, className].filter(Boolean).join(' ')}
      style={{ ...style, animationDelay: `${delayMs}ms` }}
    >
      {children}
    </Tag>
  );
}
