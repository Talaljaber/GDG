# Design System

Purpose: the visual and motion rules that make every screen feel like our GDG chapter: colour tokens (sampled from the logo), typography for phones and the projector, spacing, the mosaic shatter effect, iconography, logo use, RTL rules and accessibility. All UI code uses these tokens by name; no raw colours, sizes or durations in components.

Last updated: 2026-09-24

Related: ADR-033, ADR-034, ADR-122, ADR-123, `SCREENS.md`, `COPY.md`.

---

## 1. Brand rules (from the brief)

- Palette = **blue** (primary), **amber** (highlight / winner), **near-black**, **off-white**. No other brand colours.
- **One exception:** Simon's pads use Google's four colours.
- **Never distort, recolour, crop or animate the logo mark.** The mosaic shatter is a separate effect layer.
- Two chevrons facing each other = the "versus"/intro frame.
- Google has brand guidelines for community chapters: every visual choice here is subject to chapter-lead approval (OQ-07, checklist in `EVENT_RUNBOOK.md` §1).

## 2. Colour tokens

### 2.1 Brand (sampled from `assets/logo.png` on 2026-09-24)

The logo has **two tones per chevron** (the upper arm is darker than the lower arm). Values are the dominant flat-area pixels of the PNG; confirm against a vector file if the chapter has one (OQ-08).

| Token | Value | Source | Use |
|---|---|---|---|
| `--gdg-blue` | `#1C89CC` | logo, blue lower arm | Primary: buttons, active states, chevrons, large headings |
| `--gdg-blue-deep` | `#1579B4` | logo, blue upper arm | Pressed states, two-tone chevrons, shard variety |
| `--gdg-amber` | `#F8A928` | logo, amber upper arm | Highlight: winner, #1 row, correct answers, "found", celebration |
| `--gdg-amber-deep` | `#E59F26` | logo, amber lower arm | Two-tone chevrons, shard variety |
| `--gdg-ink` | `#15171A` | proposed (the logo has no dark colour) | Near-black: body text, outlines |
| `--gdg-paper` | `#FAF7F2` | proposed (the logo sits on pure white) | Off-white: backgrounds |

Ink and paper are our proposal, pending chapter-lead approval (OQ-07).

### 2.2 Derived (same hues, for legibility; confirm with chapter lead)

| Token | Value | Why |
|---|---|---|
| `--gdg-blue-strong` | `#146A9E` (blue, darker than both logo tones) | Small blue text on paper (logo blues are 3.57:1 and 4.44:1, below 4.5:1 for body text) |
| `--gdg-ink-muted` | `#5B6168` | Secondary text (5.86:1 on paper) |
| `--gdg-blue-tint` | blue at 12 % over paper | Selected row, chip background |
| `--gdg-amber-tint` | amber at 18 % over paper | #1 row background |
| `--gdg-line` | ink at 15 % | Dividers, borders |

### 2.3 Semantic tokens (what components use)

| Token | Light (default, ADR-122) | Dark (big screen option) |
|---|---|---|
| `--bg` | `--gdg-paper` | `--gdg-ink` |
| `--surface` | `#FFFFFF` | ink + 8 % white |
| `--text` | `--gdg-ink` | `--gdg-paper` |
| `--text-muted` | `--gdg-ink-muted` | paper at 70 % |
| `--primary` | `--gdg-blue` | `--gdg-blue` |
| `--primary-text` (blue text) | `--gdg-blue-strong` | `--gdg-blue` |
| `--on-primary` | `#FFFFFF` (only ≥ 20 px bold, see §2.4) | `--gdg-ink` |
| `--highlight` | `--gdg-amber` | `--gdg-amber` |
| `--on-highlight` | `--gdg-ink` | `--gdg-ink` |
| `--focus` | `--gdg-blue-strong`, 3 px ring | `--gdg-amber` |

Simon only: `--simon-blue #4285F4`, `--simon-red #EA4335`, `--simon-yellow #FBBC05`, `--simon-green #34A853` (commonly used Google values; confirm against Google's brand resources with the chapter lead).

### 2.4 Contrast (computed with the WCAG 2.x formula on the sampled values)

| Pair | Ratio | Allowed for |
|---|---|---|
| ink on paper | 16.81 | everything |
| blue on paper | 3.57 | large text (≥ 24 px, or ≥ 18.66 px bold), icons, chevrons, fills |
| blue-deep on paper | 4.44 | large text, icons |
| blue-strong on paper | 5.48 | any text |
| white on blue | 3.82 | button labels ≥ 20 px bold only |
| white on blue-deep | 4.74 | any text on blue-deep (use for primary buttons with smaller labels) |
| ink on blue | 4.70 | any text on blue |
| amber on paper | 1.84 | **fills only, never text**, always with an ink outline or ink text on it |
| ink on amber / amber-deep | 9.15 / 7.97 | any text on amber |
| blue on ink (dark theme) | 4.70 | any text |
| ink-muted on paper | 5.86 | secondary text |
| blue vs amber | 1.95 | never rely on this pair alone to tell things apart |
| ink on Simon yellow | 10.52 | Simon labels |
| white on Simon red / green / blue | 3.92 / 3.06 / 3.56 | pads carry shapes, not text |

`npm run contrast` re-checks these pairs from `tokens.css`.

## 3. Typography

- **Latin: Roboto.** **Arabic: Cairo** (Tajawal as fallback if Cairo's Arabic looks too wide in testing). Both from Google Fonts, `display=swap`, subsets `latin` and `arabic` only, weights 400, 500, 700 (Cairo 400, 600, 700).
- Font stack: `"Roboto", "Cairo", system-ui, sans-serif` in EN; `"Cairo", "Roboto", system-ui, sans-serif` in AR (so Latin brand names inside Arabic text use Roboto).
- Numbers: `font-variant-numeric: tabular-nums` on scores, timers and ranks. Western digits in both languages (ADR-123).
- Arabic line height is larger (Cairo has tall ascenders): Latin 1.3, Arabic 1.6.

### 3.1 Phone scale (CSS px, base 17)

| Token | Size / weight | Use |
|---|---|---|
| `--type-caption` | 14 / 500 | chips, "n of 3" |
| `--type-body` | 17 / 400 | body text |
| `--type-button` | 20 / 700 | buttons |
| `--type-question` | 20 / 500 | trivia questions |
| `--type-title` | 28 / 700 | screen titles |
| `--type-target` | 64 / 700 | Stop the Clock target, code input |
| `--type-score` | 88 / 700 | own score hero |

Supports the phone's text-size setting up to 130 % without clipping (test in `TESTING.md` §6).

### 3.2 Projector scale (viewport height units; px at 1080p in brackets)

Designed for a ≥ 2 m wide projection read from 6–8 m.

| Token | Size | Use |
|---|---|---|
| `--proj-min` | 3.2vh (35 px) | smallest text allowed on the big screen |
| `--proj-row` | 4.6vh (50 px) / 700 for scores | leaderboard rows |
| `--proj-heading` | 7vh (76 px) / 700 | screen headings |
| `--proj-code` | 20vh (216 px) / 700, letter-spacing 0.08em | session code in the lobby |
| `--proj-code-corner` | 6vh (65 px) | next-session code during play |
| `--proj-qr` | 40vh square, quiet zone ≥ 4 modules, dark modules ink on white | QR |
| `--proj-timer` | 9vh | round time left |

Leaderboards on the big screen show at most **10 rows** so each row stays ≥ 4.6vh.

## 4. Spacing, shape, layout

- Spacing scale (4 px base): `--s-1: 4`, `--s-2: 8`, `--s-3: 12`, `--s-4: 16`, `--s-5: 24`, `--s-6: 32`, `--s-7: 48`, `--s-8: 64`.
- Phone gutter 16 px; min supported width 320 px; design width 360–430 px; portrait only.
- Radii: `--r-button: 14`, `--r-card: 20`, `--r-chip: 999`.
- Touch targets ≥ **48 × 48** CSS px (hard floor 44 × 44 for the densest grid, see Odd One Out).
- Big screen: 16:9 layout, 5vh safe margins (projectors crop edges).
- Layout helper tokens in `tokens.css` (added with the Phase 1 screens): `--phone-max-width` 430 px, `--logo-phone-height` 32 px / `--logo-proj-height` 8vh (§5 minimums), `--line-width` 1 px / `--line-width-strong` 2 px / `--focus-width` 3 px, `--dot-size` / `--proj-dot-size` (presence dots), projector spacing `--proj-s-1…4` (1, 2, 3, 5vh) and `--proj-radius`, `--dialog-max-width`, `--qr-light` (QR background, always white), layers `--z-banner` / `--z-dialog`, and durations `--dur-spin` (busy spinner) and `--dur-countdown` (one 3-2-1 step, §6.3).

## 5. Chevrons and the logo

- **Logo**: `assets/logo.png` (667 × 406 raster; ask for a vector version for crisp big-screen use, OQ-08). The two chevrons point away from each other (blue `<` left, amber `>` right) and the crystalline mosaic breaks off their **outer** points. Clear space on all sides = the height of one chevron. Minimum size: 32 px tall on phones, 8vh on the big screen. Only on `--bg` paper (or the official dark variant if the logo pack has one). Never animated, never under the shatter layer while it plays (the shatter overlay is always below the logo's z-index, or the logo is hidden for the transition).
- **Chevron shape** (for game tiles, buttons, pads, versus framing): a separate simple SVG path of one chevron, drawn from the logo's proportions but without the mosaic, in `--gdg-blue` or `--gdg-amber`.
- **Versus frame**: the blue `<` enters from the inline-start edge and the amber `>` from the inline-end, meeting around the content (round intro "Next: Simon", player cards). 400 ms, emphasized easing.

## 6. Motion

### 6.1 Tokens

| Token | Value |
|---|---|
| `--dur-fast` | 120 ms (press feedback) |
| `--dur-base` | 200 ms (small state changes) |
| `--dur-slow` | 360 ms (panels, versus frame halves) |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--ease-emphasized` | `cubic-bezier(0.05, 0.7, 0.1, 1)` |
| `--ease-exit` | `cubic-bezier(0.3, 0, 1, 1)` |

Animate only `transform` and `opacity`. Target 60 fps on a low-end Android (`TESTING.md` §6).

### 6.2 The mosaic shatter (signature effect)

A standalone effect layer, never applied to the logo.

**Shards.** A seeded Delaunay triangulation of a jittered point grid covering the target rectangle: **24 shards on phones, 48 on the big screen** (hard caps). Each shard is filled with one of `--gdg-blue`, `--gdg-blue-deep`, `--gdg-amber`, `--gdg-amber-deep`, `--gdg-blue-tint`, `--gdg-paper`, with a 1 px `--gdg-paper` edge, which gives the crystalline look of the logo's shattered outer points. Weights: blue 25 %, blue-deep 20 %, amber 15 %, amber-deep 10 %, tint 20 %, paper 10 %. Rendered on one `<canvas>` overlay or as absolutely positioned `clip-path: polygon()` elements; the implementation picks whichever holds 60 fps.

| Variant | Where | Timeline | Easing |
|---|---|---|---|
| **Screen transition** | between major screens (join → lobby, round → intermission, intermission → next round, results) | 0–320 ms shards fly in from random directions (distance 30–60 % of viewport, rotation ±40°) and tile the screen; content swaps underneath at 320 ms; 320–700 ms shards burst outward (1.2× distance) and fade | in: emphasized; out: exit |
| **Celebrate (fragment & reassemble)** | new personal best on the phone; #1 of a round on the big screen | 0–450 ms the element's area splits into shards drifting 18–40 px outward with ±25° rotation; 450–1200 ms shards return and fuse; amber glow pulse at 1200 ms | emphasized |
| **Round results shatter-in** | round board and session results appear | rows assemble from shards top to bottom, 60 ms stagger, 500 ms each | emphasized |
| **Day-board merge** | big screen, after **Show day board** | ~15 s: 0–1.5 s session results fragment; 1.5–13.5 s for each of the 3 games in the lineup (4 s each): its day-board tab appears, shards stream to rows that are new or improved, those rows reassemble and slide to their rank; 13.5–15 s settle on the first game's tab (tabs then auto-rotate every 8 s) | standard |
| **Stop the Clock reveal** | big screen intermission | guess dots appear in shatter bursts per strip, 5 s total | emphasized |

**Reduced motion** (`prefers-reduced-motion: reduce`, or the host's toggle on the big screen): every variant becomes a 200 ms crossfade; celebrate becomes a static amber ring; the day-board merge becomes a crossfade to the day board.

### 6.3 Other motion

- Button press: scale 0.97, `--dur-fast`.
- Score count-up: 0 → value over 800 ms, standard easing (skipped with reduced motion).
- Leaderboard reorder: rows slide to new positions, 360 ms.
- Countdown 3-2-1: numbers scale 1.4 → 1 and fade, 1 s each, inside the versus frame.

## 7. Iconography

- **Material Symbols Rounded** (Google Fonts), weight 500, fill 0, sized to the text they sit with. Only the icons we use are subset: `check`, `close`, `translate`, `timer`, `person`, `emoji_events`, `wifi_off`, `refresh`, `qr_code_2`, `visibility_off`, `download`, `logout`.
- Icons never carry meaning alone: always with a label (or an `aria-label` where space is tight).
- Directional icons mirror in RTL; `check`, `close`, `timer` don't.

## 8. RTL rules

- `<html lang="ar" dir="rtl">` in Arabic, `lang="en" dir="ltr"` in English, switched at runtime.
- Use CSS logical properties only (`margin-inline-start`, `padding-inline`, `inset-inline-end`, `text-align: start`). No `left`/`right` in component CSS.
- **Mirror**: layout, lists, rank column (inline-start), progress/countdown bars (fill toward inline-end), back/next arrows, versus frame entry sides.
- **Don't mirror**: numbers, scores, timers, the session code, the QR, game geometry (Odd One Out grids, Simon pad positions, Perfect Circle canvas), the logo.
- Player names are wrapped in `<bdi>` so an Arabic name in an English board (or the reverse) keeps its own direction and doesn't reorder the score next to it.
- Mixed strings (e.g. «Google» inside Arabic) rely on the Unicode bidi algorithm; COPY strings that embed Latin terms are checked in the RTL pass (Phase 5).

## 9. Accessibility checklist

- [ ] Text contrast ≥ 4.5:1 (≥ 3:1 for large text), using §2.4.
- [ ] No information by colour alone (Simon shapes, Trivia ✓/✗ icons, countdown number + bar, Odd One Out grid 1 differs by lightness too).
- [ ] Touch targets ≥ 48 px (44 px floor in Odd One Out 6 × 6).
- [ ] Reduced motion honoured everywhere (§6.2).
- [ ] Visible focus ring (`--focus`) for keyboard users on the host and dashboard.
- [ ] `lang`/`dir` set; names in `<bdi>`.
- [ ] Phone text scaling to 130 % works.
- [ ] Screen-reader labels for game controls (listed in each game doc) and live regions only where specified (never during Stop the Clock's hidden timer).
- [ ] Bright light: phones at max brightness under hall lighting pass the Odd One Out test (`TESTING.md` §6).
