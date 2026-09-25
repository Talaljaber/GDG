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
type Rgba = [number, number, number, number];
type Theme = 'light' | 'dark';

/** Custom-property declarations of one top-level block (`:root {` or `:root[data-theme='dark'] {`). */
function declarations(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return {};
  const body = css.slice(start, css.indexOf('}', start));
  const out: Record<string, string> = {};
  const re = /--([\w-]+):\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) out[match[1]] = match[2].trim();
  return out;
}

/**
 * Resolves a token to sRGB + alpha: hex values, white/black/transparent, var() references and
 * `color-mix(in srgb, A p%, B)` (premultiplied, as CSS mixes), so the v2 tints and surfaces
 * (--surface-2, --gdg-amber-tint, ...) are checked from tokens.css too.
 */
function makeResolver(css: string) {
  const light = declarations(css, ':root');
  const dark = declarations(css, ":root[data-theme='dark']");
  const parse = (value: string, theme: Theme, depth: number): Rgba => {
    if (depth > 20) throw new Error(`token cycle at ${value}`);
    const v = value.trim();
    const hex = /^#([0-9a-fA-F]{6})$/.exec(v);
    if (hex) {
      const h = hex[1];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
    }
    if (v === 'white') return [255, 255, 255, 1];
    if (v === 'black') return [0, 0, 0, 1];
    if (v === 'transparent') return [0, 0, 0, 0];
    const ref = /^var\(--([\w-]+)\)$/.exec(v);
    if (ref) return resolve(ref[1], theme, depth + 1);
    const mix = /^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%\s*,\s*(.+)\)$/.exec(v);
    if (mix) {
      const p = Number(mix[2]) / 100;
      const a = parse(mix[1], theme, depth + 1);
      const b = parse(mix[3], theme, depth + 1);
      const alpha = a[3] * p + b[3] * (1 - p);
      if (alpha === 0) return [0, 0, 0, 0];
      const ch = (i: number) => (a[i] * a[3] * p + b[i] * b[3] * (1 - p)) / alpha;
      return [ch(0), ch(1), ch(2), alpha];
    }
    throw new Error(`can't resolve colour value "${v}"`);
  };
  const resolve = (name: string, theme: Theme, depth = 0): Rgba => {
    if (name === 'white') return [255, 255, 255, 1];
    const raw = (theme === 'dark' ? dark[name] : undefined) ?? light[name];
    if (raw === undefined) throw new Error(`--${name} is not defined in tokens.css`);
    return parse(raw, theme, depth);
  };
  return resolve;
}

/** Composites a (possibly translucent) colour over an opaque one. */
function over([r, g, b, a]: Rgba, [br, bg, bb]: Rgb): Rgb {
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];
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
const resolve = makeResolver(css);

type Category = 'any' | 'large' | 'skip';

interface Pair {
  label: string;
  fg: string;
  bg: string;
  category: Category;
  note: string;
  /** Theme whose token values are used (default light). */
  theme?: Theme;
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
  // v2 "quiet scoreboard" pairs (DESIGN_SYSTEM §2.4, ADR-131): semantic tokens as components use them.
  { label: 'on-primary on primary-text (primary button)', fg: 'on-primary', bg: 'primary-text', category: 'any', note: 'button labels at any size' },
  { label: 'on-primary on primary-hover', fg: 'on-primary', bg: 'primary-hover', category: 'any', note: 'hovered primary button' },
  { label: 'text on surface', fg: 'text', bg: 'surface', category: 'any', note: 'panels, boards' },
  { label: 'text-muted on surface', fg: 'text-muted', bg: 'surface', category: 'any', note: 'ranks, helper text on panels' },
  { label: 'primary-text on surface', fg: 'primary-text', bg: 'surface', category: 'any', note: 'link buttons on panels' },
  { label: 'text on surface-2', fg: 'text', bg: 'surface-2', category: 'any', note: 'operator bar, callouts, badges' },
  { label: 'text-muted on surface-2', fg: 'text-muted', bg: 'surface-2', category: 'any', note: 'operator-bar eyebrows, hovered rows' },
  { label: 'primary-text on surface-2', fg: 'primary-text', bg: 'surface-2', category: 'any', note: 'link buttons in the operator bar' },
  { label: 'text on highlight-tint', fg: 'text', bg: 'highlight-tint', category: 'any', note: '#1 row' },
  { label: 'text-muted on highlight-tint', fg: 'text-muted', bg: 'highlight-tint', category: 'any', note: 'muted text inside the #1 row' },
  { label: 'text on primary-tint', fg: 'text', bg: 'primary-tint', category: 'any', note: 'own row, new/improved row' },
  { label: 'text-muted on primary-tint', fg: 'text-muted', bg: 'primary-tint', category: 'any', note: 'rank in the own row' },
  { label: 'bg on text (offline banner)', fg: 'bg', bg: 'text', category: 'any', note: 'system banner' },
  { label: 'dark: on-primary on primary-text', fg: 'on-primary', bg: 'primary-text', category: 'any', note: 'primary button', theme: 'dark' },
  { label: 'dark: on-primary on primary-hover', fg: 'on-primary', bg: 'primary-hover', category: 'any', note: 'hovered primary button', theme: 'dark' },
  { label: 'dark: text on surface', fg: 'text', bg: 'surface', category: 'any', note: 'panels, boards', theme: 'dark' },
  { label: 'dark: text-muted on surface', fg: 'text-muted', bg: 'surface', category: 'any', note: 'ranks, helper text', theme: 'dark' },
  { label: 'dark: text-muted on surface-2', fg: 'text-muted', bg: 'surface-2', category: 'any', note: 'operator bar', theme: 'dark' },
  { label: 'dark: text on highlight-tint', fg: 'text', bg: 'highlight-tint', category: 'any', note: '#1 row', theme: 'dark' },
  { label: 'dark: text on primary-tint', fg: 'text', bg: 'primary-tint', category: 'any', note: 'own row', theme: 'dark' },
];

const THRESHOLD: Record<Exclude<Category, 'skip'>, number> = {
  any: 4.5,
  large: 3,
};

let failed = false;

console.log('Contrast check (docs/DESIGN_SYSTEM.md §2.4)\n');

for (const pair of pairs) {
  const theme = pair.theme ?? 'light';
  let fg: Rgb;
  let bg: Rgb;
  try {
    // Translucent tokens sit on the page background (--bg) of their theme.
    const page = over(resolve('bg', theme), [255, 255, 255]);
    bg = over(resolve(pair.bg, theme), page);
    fg = over(resolve(pair.fg, theme), bg);
  } catch (e) {
    console.error(`✗ ${pair.label}: ${(e as Error).message}`);
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

// ---- Color Clash inks under colour-vision deficiencies (DESIGN_SYSTEM §2.5, docs/games/color-clash.md §7) ----
// Colour is the game there, so the three inks must stay apart for red-green deficiencies.
// Machado, Oliveira & Fernandes (2009) full-severity matrices, applied in linear sRGB; distance =
// CIE76 ΔE in CIELAB (D65). Fails if any pair drops below ΔE 40 for deuteranopia or protanopia
// (tritanopia is printed for information).
{
  type Mat = [number, number, number][];
  const CVD: Record<string, { m: Mat; gate: boolean }> = {
    normal: { m: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], gate: true },
    deuteranopia: { m: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]], gate: true },
    protanopia: { m: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]], gate: true },
    tritanopia: { m: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]], gate: false },
  };
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const simulate = (rgb: Rgb, m: Mat): Rgb => {
    const l = rgb.map(toLin);
    const lin = m.map((row) => Math.min(1, Math.max(0, row[0] * l[0] + row[1] * l[1] + row[2] * l[2])));
    const toSrgb = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
    return [toSrgb(lin[0]), toSrgb(lin[1]), toSrgb(lin[2])];
  };
  const lab = (rgb: Rgb): Rgb => {
    const [r, g, b] = rgb.map(toLin);
    const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };
  const deltaE = (a: Rgb, b: Rgb) => {
    const [la, lb] = [lab(a), lab(b)];
    return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
  };
  const MIN_DELTA_E = 40;
  const inkNames = ['clash-blue', 'clash-amber', 'clash-charcoal'];
  const page = over(resolve('bg', 'light'), [255, 255, 255]);
  const inks = inkNames.map((n) => over(resolve(n, 'light'), page));
  console.log('\nColor Clash inks (docs/games/color-clash.md §7): contrast · ΔE between simulated inks\n');
  for (const [name, { m, gate }] of Object.entries(CVD)) {
    const sim = inks.map((c) => simulate(c, m));
    const parts: string[] = [];
    let worst = Infinity;
    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        const dE = deltaE(sim[i], sim[j]);
        worst = Math.min(worst, dE);
        parts.push(`${inkNames[i].slice(6)}/${inkNames[j].slice(6)} ${contrastRatio(sim[i], sim[j]).toFixed(2)} · ${dE.toFixed(0)}`);
      }
    }
    const ok = !gate || worst >= MIN_DELTA_E;
    console.log(`${ok ? '✓' : '✗'} ${name}: ${parts.join(' | ')}${gate ? ` (need ΔE >= ${MIN_DELTA_E})` : ' (info)'}`);
    if (!ok) failed = true;
  }
}

console.log('');
if (failed) {
  console.error('Contrast check FAILED.');
  process.exit(1);
} else {
  console.log('Contrast check passed.');
}
