import { memo } from 'react';

/**
 * The brand chevron, drawn as a plain SVG shape from the logo's proportions
 * (rounded, thick arms) but WITHOUT the mosaic — never the logo image
 * itself (docs/DESIGN_SYSTEM.md §5, .claude/rules/games.md). Reusable for
 * grid tiles now and the versus intro framing later.
 */
export interface ChevronProps {
  /** Brand colour token to draw with. Amber is a fill-only colour (never text). */
  color?: 'blue' | 'amber';
  /** Rotates the glyph in place, in degrees. */
  rotationDeg?: number;
  /** Mirrors the glyph horizontally (turns `<` into `>`). */
  mirrored?: boolean;
  className?: string;
}

/**
 * A single `<`, rounded caps/joins, thick stroke (~28% of the glyph) for glare and small sizes.
 * Memoised (primitive props): a grid re-renders on every tap and phase change, its tiles don't.
 */
export const Chevron = memo(function Chevron({ color = 'blue', rotationDeg = 0, mirrored = false, className }: ChevronProps) {
  const stroke = color === 'amber' ? 'var(--gdg-amber)' : 'var(--gdg-blue)';
  const transforms: string[] = [];
  if (mirrored) transforms.push('scaleX(-1)');
  if (rotationDeg) transforms.push(`rotate(${rotationDeg}deg)`);

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={transforms.length ? { transform: transforms.join(' '), transformOrigin: '50% 50%' } : undefined}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M 68 20 L 28 50 L 68 80"
        fill="none"
        stroke={stroke}
        strokeWidth={28}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});
