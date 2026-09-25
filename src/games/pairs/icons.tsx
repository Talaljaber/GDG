/**
 * The eight Pairs icons (docs/games/pairs.md §7, DESIGN_SYSTEM §7): hand-drawn
 * inline SVG in the brand line style of the chevrons: 24 x 24 viewBox,
 * stroke = currentColor, width 2, round caps and joins, no fills, no external
 * assets. Generic developer motifs only; none is a product logo. Colour
 * carries nothing: every icon is drawn in one ink and the silhouettes differ
 * (bug: oval + legs; coffee: cup + handle; terminal: framed ">_"; branch:
 * three nodes + a fork; cloud: lobed outline; bulb: bulb + base lines + a glint;
 * rocket: upright body + fins + window; gear: toothed ring).
 */
import { memo, type ReactNode } from 'react';
import type { IconId } from './layout';

/** A gear outline: 8 teeth on a toothed ring (computed once; plain path data). */
function gearPath(): string {
  const cx = 12;
  const cy = 12;
  const tip = 9.5;
  const root = 7.2;
  const teeth = 8;
  const pt = (r: number, deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  };
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const c = (360 / teeth) * i;
    d += `${i === 0 ? 'M' : 'L'}${pt(root, c - 13)} L${pt(tip, c - 8)} L${pt(tip, c + 8)} L${pt(root, c + 13)} `;
    d += `A${root} ${root} 0 0 1 ${pt(root, c + 360 / teeth - 13)} `;
  }
  return `${d.trim()} Z`;
}

const GEAR = gearPath();

const SHAPES: Record<IconId, ReactNode> = {
  bug: (
    <>
      <ellipse cx="12" cy="14.5" rx="5" ry="6" />
      <path d="M9.2 8.9a2.8 2.8 0 0 1 5.6 0" />
      <path d="M12 10.5v10" />
      <path d="M10.4 6.6 8.6 3.6M13.6 6.6l1.8-3" />
      <path d="M7.2 11.8 4.2 10.3M7 15H3.6M7.6 18.2l-2.8 2" />
      <path d="m16.8 11.8 3-1.5M17 15h3.4M16.4 18.2l2.8 2" />
    </>
  ),
  coffee: (
    <>
      <path d="M4.5 9.5h11.5v5a4.5 4.5 0 0 1-4.5 4.5H9a4.5 4.5 0 0 1-4.5-4.5z" />
      <path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M3.5 21.5h14" />
      <path d="M8.5 3c-1 1 1 2 0 3.5M12.5 3c-1 1 1 2 0 3.5" />
    </>
  ),
  terminal: (
    <>
      <rect x="2.5" y="4" width="19" height="16" rx="2.5" />
      <path d="M2.5 8h19" />
      <path d="m6.5 11.5 3 2.5-3 2.5" />
      <path d="M12 16.5h5" />
    </>
  ),
  branch: (
    <>
      <circle cx="7" cy="5" r="2" />
      <circle cx="7" cy="19" r="2" />
      <circle cx="17" cy="7" r="2" />
      <path d="M7 7v10" />
      <path d="M17 9c0 5-10 3.5-10 8" />
    </>
  ),
  cloud: <path d="M7 18.5a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 9.5a4.5 4.5 0 0 1 .5 9z" />,
  bulb: (
    <>
      <path d="M9 16.5v-1.2C9 13.8 6 12.5 6 8.8a6 6 0 0 1 12 0c0 3.7-3 5-3 6.5v1.2z" />
      <path d="M9.5 19.2h5M10.5 22h3" />
      <path d="M9 9a3 3 0 0 1 3-3" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 2.5c3.5 2.5 4.5 7 3.5 13.5h-7C7.5 9.5 8.5 5 12 2.5z" />
      <circle cx="12" cy="9.5" r="1.8" />
      <path d="M8.3 11.5 5 14.8V19l3.5-3M15.7 11.5l3.3 3.3V19l-3.5-3" />
      <path d="m10.3 18.5 1.7 3 1.7-3" />
    </>
  ),
  gear: (
    <>
      <path d={GEAR} />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
};

export interface PairsIconProps {
  id: IconId;
  className?: string;
}

/** One icon, decorative (the tile button carries the name as its aria-label). */
export const PairsIcon = memo(function PairsIcon({ id, className }: PairsIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={id}
    >
      {SHAPES[id]}
    </svg>
  );
});
