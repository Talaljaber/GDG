#!/usr/bin/env -S npx tsx
/**
 * Re-checks the contrast pairs documented in docs/DESIGN_SYSTEM.md §2.4
 * against the actual hex values in src/styles/tokens.css.
 *
 * Fails (non-zero exit) if:
 *  - an "any text" pair drops below 4.5:1, or
 *  - a "large text" pair drops below 3:1.
 *
 * Run with `npm run contrast`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tokensPath = path.resolve(__dirname, '../src/styles/tokens.css');

type Rgb = [number, number, number];

function parseHexVars(css: string): Record<string, Rgb> {
  const vars: Record<string, Rgb> = {};
  const re = /--([\w-]+):\s*#([0-9a-fA-F]{6})\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css))) {
    const [, name, hex] = match;
    vars[name] = [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  return vars;
}

/** WCAG relative luminance. */
function relativeLuminance([r, g, b]: Rgb): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [rl, gl, bl] = [toLinear(r), toLinear(g), toLinear(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/** WCAG 2.x contrast ratio between two sRGB colours. */
function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

const css = readFileSync(tokensPath, 'utf-8');
const vars = parseHexVars(css);
vars['white'] = [255, 255, 255];

type Category = 'any' | 'large' | 'skip';

interface Pair {
  label: string;
  fg: string;
  bg: string;
  category: Category;
  note: string;
}

// Mirrors docs/DESIGN_SYSTEM.md §2.4 exactly.
const pairs: Pair[] = [
  { label: 'ink on paper', fg: 'gdg-ink', bg: 'gdg-paper', category: 'any', note: 'everything' },
  {
    label: 'blue on paper',
    fg: 'gdg-blue',
    bg: 'gdg-paper',
    category: 'large',
    note: 'large text, icons, chevrons, fills',
  },
  {
    label: 'blue-deep on paper',
    fg: 'gdg-blue-deep',
    bg: 'gdg-paper',
    category: 'large',
    note: 'large text, icons',
  },
  {
    label: 'blue-strong on paper',
    fg: 'gdg-blue-strong',
    bg: 'gdg-paper',
    category: 'any',
    note: 'any text',
  },
  {
    label: 'white on blue',
    fg: 'white',
    bg: 'gdg-blue',
    category: 'large',
    note: 'button labels >= 20px bold only',
  },
  {
    label: 'white on blue-deep',
    fg: 'white',
    bg: 'gdg-blue-deep',
    category: 'any',
    note: 'any text on blue-deep',
  },
  { label: 'ink on blue', fg: 'gdg-ink', bg: 'gdg-blue', category: 'any', note: 'any text on blue' },
  {
    label: 'amber on paper',
    fg: 'gdg-amber',
    bg: 'gdg-paper',
    category: 'skip',
    note: 'fills only, never text',
  },
  {
    label: 'ink on amber',
    fg: 'gdg-ink',
    bg: 'gdg-amber',
    category: 'any',
    note: 'any text on amber',
  },
  {
    label: 'ink on amber-deep',
    fg: 'gdg-ink',
    bg: 'gdg-amber-deep',
    category: 'any',
    note: 'any text on amber-deep',
  },
  {
    label: 'blue on ink (dark theme)',
    fg: 'gdg-blue',
    bg: 'gdg-ink',
    category: 'any',
    note: 'any text',
  },
  {
    label: 'ink-muted on paper',
    fg: 'gdg-ink-muted',
    bg: 'gdg-paper',
    category: 'any',
    note: 'secondary text',
  },
  {
    label: 'blue vs amber',
    fg: 'gdg-blue',
    bg: 'gdg-amber',
    category: 'skip',
    note: 'never rely on this pair alone to tell things apart',
  },
  {
    label: 'ink on Simon yellow',
    fg: 'gdg-ink',
    bg: 'simon-yellow',
    category: 'any',
    note: 'Simon labels',
  },
  {
    label: 'white on Simon red',
    fg: 'white',
    bg: 'simon-red',
    category: 'skip',
    note: 'pads carry shapes, not text',
  },
  {
    label: 'white on Simon green',
    fg: 'white',
    bg: 'simon-green',
    category: 'skip',
    note: 'pads carry shapes, not text',
  },
  {
    label: 'white on Simon blue',
    fg: 'white',
    bg: 'simon-blue',
    category: 'skip',
    note: 'pads carry shapes, not text',
  },
];

const THRESHOLD: Record<Exclude<Category, 'skip'>, number> = {
  any: 4.5,
  large: 3,
};

let failed = false;

console.log('Contrast check (docs/DESIGN_SYSTEM.md §2.4)\n');

for (const pair of pairs) {
  const fg = vars[pair.fg];
  const bg = vars[pair.bg];
  if (!fg || !bg) {
    console.error(`✗ ${pair.label}: could not resolve --${pair.fg} or --${pair.bg} in tokens.css`);
    failed = true;
    continue;
  }
  const ratio = contrastRatio(fg, bg);
  const ratioStr = ratio.toFixed(2);

  if (pair.category === 'skip') {
    console.log(`  ${pair.label}: ${ratioStr} (not a text pair — ${pair.note})`);
    continue;
  }

  const threshold = THRESHOLD[pair.category];
  const ok = ratio >= threshold;
  const status = ok ? '✓' : '✗';
  console.log(
    `${status} ${pair.label}: ${ratioStr} (need >= ${threshold} for ${pair.category} text — ${pair.note})`,
  );
  if (!ok) {
    failed = true;
  }
}

console.log('');
if (failed) {
  console.error('Contrast check FAILED.');
  process.exit(1);
} else {
  console.log('Contrast check passed.');
}
