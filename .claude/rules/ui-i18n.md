---
paths:
  - "src/**/*.tsx"
  - "src/**/*.css"
  - "src/i18n/**"
  - "src/styles/**"
  - "src/effects/**"
  - "docs/COPY.md"
  - "docs/SCREENS.md"
  - "docs/DESIGN_SYSTEM.md"
---

# UI, i18n and theming rules

Loaded when working on screens, styles or strings. Specs: `docs/SCREENS.md`, `docs/DESIGN_SYSTEM.md`, `docs/COPY.md`.

## Strings
- **No hard-coded user-facing strings.** Every string is a key in `src/i18n/en.json` and `src/i18n/ar.json`, taken from `docs/COPY.md`. New string → add it to COPY.md (EN + AR) first, then both JSON files.
- Both JSON files must have identical keys and placeholders (`npm run check:i18n`).
- Plurals go through `Intl.PluralRules`: Arabic needs zero/one/two/few/many/other.
- Western digits for scores, codes and timers in both languages; inputs accept Arabic-Indic digits.

## RTL
- Set `lang` and `dir` on `<html>`. CSS logical properties only (`margin-inline-start`, `inset-inline-end`, `text-align: start`); never `left`/`right` in component CSS.
- Don't mirror numbers, the code, the QR, game geometry or the logo. Wrap player names in `<bdi>`.
- The language toggle is hidden during rounds.

## Theming
- Colours, sizes, spacing, radii, durations and easings come only from tokens in `src/styles/tokens.css` (DESIGN_SYSTEM §2–§6). No raw hex values in components. Brand colours are sampled from `assets/logo.png` (DESIGN_SYSTEM §2.1).
- Palette: blue, amber, near-black, off-white (+ derived tints). Amber is never text on light backgrounds. Google's four colours only in Simon.
- Fonts: Roboto (Latin), Cairo (Arabic), from Google Fonts.
- Big screen uses the projector scale (vh units; nothing smaller than `--proj-min`; max 10 leaderboard rows).
- **Never animate, distort or recolour the logo.** Transitions and celebrations use the shatter layer only; always provide the reduced-motion fallback (200 ms crossfade).
- Animate only `transform` and `opacity`.

## Accessibility
- Touch targets ≥ 48 px; contrast per DESIGN_SYSTEM §2.4; no meaning by colour alone; visible focus on host and dashboard; text scaling to 130 % on phones.
