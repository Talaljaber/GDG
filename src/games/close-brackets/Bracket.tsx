import { memo } from 'react';
import type { BracketKind } from './sequence';

/**
 * One bracket glyph in the chevron style (docs/games/close-brackets.md §7,
 * DESIGN_SYSTEM §5): thick rounded strokes, round caps and joins; the angle
 * bracket is the brand chevron shape. Drawn as SVG so an Arabic (RTL) page
 * never bidi-mirrors `(` into `)`. Not the logo.
 */
export interface BracketProps {
  kind: BracketKind;
  /** true = the closer (`)` `]` `}` `>`), drawn as the mirrored opener. */
  closer?: boolean;
  className?: string;
}

// Openers in a 60 x 100 box; closers mirror them around x = 30.
const PATHS: Record<BracketKind, string> = {
  round: 'M 40 10 Q 12 50 40 90',
  square: 'M 42 12 L 22 12 L 22 88 L 42 88',
  curly: 'M 44 10 Q 28 10 28 26 L 28 40 Q 28 50 16 50 Q 28 50 28 60 L 28 74 Q 28 90 44 90',
  angle: 'M 42 16 L 18 50 L 42 84',
};

export const Bracket = memo(function Bracket({ kind, closer = false, className }: BracketProps) {
  return (
    <svg viewBox="0 0 60 100" className={className} aria-hidden="true" focusable="false">
      <path
        d={PATHS[kind]}
        transform={closer ? 'matrix(-1 0 0 1 60 0)' : undefined}
        fill="none"
        stroke="currentColor"
        strokeWidth={11}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});
