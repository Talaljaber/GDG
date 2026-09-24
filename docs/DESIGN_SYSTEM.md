# Design System

Purpose: the visual and motion rules that make every screen feel like our GDG chapter: colour tokens (sampled from the logo), typography for phones and the projector, spacing, the mosaic shatter effect, iconography, logo use, RTL rules and accessibility. All UI code uses these tokens by name; no raw colours, sizes or durations in components.

Last updated: 2026-09-25

Related: ADR-131, ADR-033, ADR-034, ADR-122, ADR-123, `SCREENS.md`, `COPY.md`.

---

## 0. Visual direction v2: "quiet scoreboard" (ADR-131)

Adopted 2026-09-25 after the first real look at the big screen ("looks childish"). It replaces the loud first pass; the palette, fonts, chevrons and logo rules in §1 are unchanged. Sections 2–4 carry the exact tokens; this section is the brief every screen follows.

### 0.1 Principles
1. **One hero per screen.** Lobby: the code. Boards: the #1 row. Phone result: the player's score. Everything else is at body/label size.
2. **Structure, not decoration.** Screens sit on a grid of flat panels: white `--surface` on `--bg` paper, a 1 px `--line` border, small radii (`--r-panel` 12 px phone / `--proj-radius` projector). No drop shadows, no gradients, no pills, no numbered circles, no emoji, no exclamation-mark jokes.
3. **Few weights.** Roboto / Cairo at 400 (body), 500 (labels, UI, headings), 700 (only hero numbers and the #1 row). `font-variant-numeric: tabular-nums` on every number (codes, scores, ranks, timers).
4. **Colour with restraint.** Ink text on paper. Blue (`--primary`, `--primary-text`) = interactive and "live" (primary buttons, active tab underline, focus, presence dot). Amber = rank 1 / new best / celebrate only. Muted ink for labels and secondary text.
5. **Labels are eyebrows.** Section labels are small, medium weight, muted; Latin labels uppercase with `--tracking-eyebrow`; Arabic never transformed.
6. **Audience vs operator.** On the big screen, what the room reads (code, QR, players, boards) is large; what the host operates (lineup, Start, End round, Next round now, Show day board, New session, settings) lives in one quiet **operator bar** at the bottom, at `--proj-min` size, on `--surface-2`.
7. **Chevrons frame, sparingly.** Facing chevrons (blue `<`, amber `>`) drawn as thin line glyphs frame exactly one hero per screen (the lobby code, the H4 winner, the phone score). Never behind text, never as a pattern.

### 0.2 Big screen (host) layout
- **Header strip** (≈ 9vh, bottom line): logo (transparent PNG, `--logo-proj-height`) · "GDG on Campus · AI Expo Jordan" muted · inline-end: event day label and the player count as eyebrow + tabular number (`Players 12`), not a giant number.
- **Body** on a 12-column grid inside `--big-screen-safe-margin`:
  - **Lobby (H1):** join panel (4 cols: QR in a white panel, the URL under it, three numbered steps "Scan · Enter the code · Type your name" as plain text), code hero (4 cols: eyebrow label, the code at `--proj-code` tabular with `--proj-code-letter-spacing`, framed by the chevrons), players panel (4 cols: eyebrow + count, a 2-column grid of name tags with presence dots; empty state = six dashed placeholder slots and "Waiting for players").
  - **Boards (H2 live round, H3 intermission, H4 results, H5 day boards):** a table, not cards: rank column (muted, tabular; 1–3 in ink), name (`<bdi>`), per-round columns where relevant, total inline-end aligned. 1 px row separators, no zebra. Rank 1 row: `--gdg-amber-tint` background with an amber inline-start rule. Board title = eyebrow + a `--proj-heading` title ("Round 2 · Odd One Out"). Day-board tabs are text tabs with a blue underline.
- **Operator bar** (≈ 10vh, `--surface-2`, top line): inline-start a "Lineup" eyebrow + the ordered game names separated by `→`; editing uses the existing picker as a compact segmented list with small tabular ordinals (no circles); inline-end the one primary action for the state (Start / End round / Next round now / Show day board / New session) as a solid blue button; secondary actions as text buttons. During play the next-session code sits at the inline-end of the header as eyebrow + tabular code.
- **Bilingual labels on the big screen:** one line, the host UI language first in `--text`, the other language after a thin `·` divider in `--text-muted`. Never two stacked lines of the same label.

### 0.3 Phone (player)
- **Top bar** (56 px, bottom line): logo at `--logo-phone-height` inline-start, language toggle as a text button inline-end.
- One column inside `--phone-gutter`; each screen starts with an eyebrow + title.
- **Code entry:** four separate digit cells (tabular, 56 px tall, `--r-control`, line border, blue focus ring) over one real input (keeps the numeric keypad, paste and Arabic-Indic normalisation).
- **Name entry:** label above, field, helper text + counter below; errors in text, never colour alone.
- **Buttons:** full width, `--button-height`, `--r-control`; primary = solid `--primary-text` with `--on-primary`; secondary = outline with `--line-strong`. No pills.
- **Lobby (P3/P3b):** a panel "You're in" with the name tag, the lineup as a numbered list (tabular ordinals), the player count as eyebrow + number.
- **Result (P7) and between screens:** score hero at `--type-score-size` 700 tabular framed by the chevrons; breakdown as a two-column list (label · value); the board uses the same table pattern as the projector at phone size.
- **Games:** every game spec (sizes, timings, colours) stays as is; only the shared chrome (headers, progress labels, buttons, result blocks) follows v2.

### 0.4 Dashboard (`/dashboard`)
A data app, not a poster: left nav (Today, Sessions, Results, Names, Days) on desktop, top tabs on narrow screens; page header with title + actions; filter row; dense tables at `--type-small-size`, sticky header, tabular numbers, row hover `--surface-2`, small buttons; max content width `--dash-max-width`.

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
| `--gdg-blue-tint` | blue at 12 % over paper | Own / new rows, text selection (components use `--primary-tint`) |
| `--gdg-amber-tint` | amber at 18 % over paper | #1 row background (components use `--highlight-tint`) |
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
| `--on-primary` | `#FFFFFF` (any size on `--primary-text`; on `--primary` only ≥ 20 px bold, §2.4) | `--gdg-ink` |
| `--highlight` | `--gdg-amber` | `--gdg-amber` |
| `--on-highlight` | `--gdg-ink` | `--gdg-ink` |
| `--focus` | `--gdg-blue-strong`, 3 px ring | `--gdg-amber` |
| `--surface-2` (v2) | ink at 4 % over paper | white at 4 % over ink |
| `--line` (v2) | `--gdg-line` (ink at 15 %) | paper at 15 % |
| `--line-strong` (v2) | ink at 30 % | paper at 30 % |
| `--primary-hover` (v2) | blue-strong 85 % + ink | blue 85 % + paper |
| `--highlight-tint` (v2) | `--gdg-amber-tint` | amber at 22 % over ink |
| `--primary-tint` (v2) | `--gdg-blue-tint` | blue at 22 % over ink |
| `--scrim` (v2) | ink at 45 % | black at 60 % |

How v2 uses them (§0.1): text is `--text` on `--bg`; panels and boards are `--surface` with a 1 px `--line` border; the operator bar, callouts, badges and hovered rows are `--surface-2`; outline buttons and inputs use `--line-strong`. **Primary buttons are `--primary-text` filled with `--on-primary` labels** (5.86:1, any label size; hover `--primary-hover`), so the old "white on blue only at ≥ 20 px bold" limit no longer shapes buttons. Tinted rows use the semantic tints, never `--gdg-amber-tint` / `--gdg-blue-tint` directly, so the dark theme keeps its text readable: `--highlight-tint` = the #1 row, `--primary-tint` = the own row and H5's new/improved rows. `--scrim` sits behind dialogs.

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

v2 semantic pairs (light theme unless marked; translucent tokens composited on `--bg`):

| Pair | Ratio | Allowed for |
|---|---|---|
| `--on-primary` on `--primary-text` | 5.86 | primary button labels, any size |
| `--on-primary` on `--primary-hover` | 7.04 | hovered primary button |
| `--text` / `--text-muted` on `--surface` | 17.96 / 6.26 | panels, boards (ranks, helper text) |
| `--primary-text` on `--surface` | 5.86 | link buttons on panels |
| `--text` / `--text-muted` on `--surface-2` | 15.52 / 5.41 | operator bar, callouts, badges, hovered rows |
| `--primary-text` on `--surface-2` | 5.06 | link buttons in the operator bar |
| `--text` / `--text-muted` on `--highlight-tint` | 15.04 / 5.24 | #1 row |
| `--text` / `--text-muted` on `--primary-tint` | 14.64 / 5.10 | own row, new/improved rows |
| `--bg` on `--text` | 16.81 | offline banner |
| dark: `--on-primary` on `--primary-text` / `--primary-hover` | 4.70 / 5.74 | primary button |
| dark: `--text` / `--text-muted` on `--surface` | 13.54 / 7.42 | panels, boards |
| dark: `--text-muted` on `--surface-2` | 8.09 | operator bar |
| dark: `--text` on `--highlight-tint` / `--primary-tint` | 10.71 / 12.79 | #1 row / own row |

`npm run contrast` re-checks all of these pairs from `tokens.css` (it resolves `var()` and `color-mix()` for both themes). Add a pair there whenever a component puts text on a new background.

## 3. Typography

- **Latin: Roboto.** **Arabic: Cairo** (Tajawal as fallback if Cairo's Arabic looks too wide in testing). Both from Google Fonts, `display=swap`, subsets `latin` and `arabic` only, weights 400, 500, 700 for both.
- Font stack: `"Roboto", "Cairo", system-ui, sans-serif` in EN; `"Cairo", "Roboto", system-ui, sans-serif` in AR (so Latin brand names inside Arabic text use Roboto).
- Numbers: `font-variant-numeric: tabular-nums` on scores, timers and ranks (utility `.tabular-nums`). Western digits in both languages (ADR-123).
- **Weights (v2, §0.1):** `--weight-regular` 400 for body text, `--weight-medium` 500 for headings, labels, buttons, tabs and names, `--weight-bold` 700 **only** for hero numbers and the #1 board row (global class `.hero`). `base.css` sets h1–h6, `b`, `strong` and `th` to 500, so nothing is bold by default. Cairo is currently requested at 400/600/700 (`index.html`), so Arabic at 500 renders at 400 until 500 is added to the font request.
- **Line heights** (tokens, inherited from `<html>`): body `--leading-body` 1.45 (Arabic `--leading-body-ar` 1.65, because Cairo has tall ascenders), headings and single-line UI (buttons, inputs, board rows) `--leading-tight` 1.2 (Arabic headings `--leading-tight-ar` 1.4).
- Links are `--primary-text` with a 1 px underline (2 px on hover); text selection is `--gdg-blue-tint` with ink text.

### 3.1 Phone scale (CSS px, base 17)

| Token | Size / weight | Use |
|---|---|---|
| `--type-eyebrow-size` / `-weight` | 12 / 500 (Arabic 14), Latin uppercase with `--tracking-eyebrow` 0.08em | section labels (`.eyebrow`) |
| `--type-caption-size` | 14 / 500 | badges, "n of 3" |
| `--type-small-size` | 15 / 400–500 | helper text, field labels, errors, small buttons, dashboard tables |
| `--type-body-size` | 17 / 400 | body text; button labels at 500 |
| `--type-lead-size` | 20 / 400 | dialog message, input text, lead lines; h2 |
| `--type-question-size` | 20 / 500 | trivia questions |
| `--type-heading-size` | 24 / 500 | screen titles (`.title`, h1) |
| `--type-target-size` | 64 / 700 | Stop the Clock target, code input |
| `--type-score-size` | 88 / 700 | own score hero |

Each phone type token is a `-size` / `-weight` pair in `tokens.css` (e.g. `--type-body-size` / `--type-body-weight`, `--type-score-size` / `--type-score-weight`); the projector code also has `--proj-code-weight`. `--type-title-size` / `--type-title-weight` (28 / 700) and `--type-button-size` / `--type-button-weight` (20 / 700) are the v1 values, kept because game internals still use them (their specs don't change); v2 chrome uses `--type-heading-size` at `--weight-medium` for titles and `--type-body-size` at `--weight-medium` for buttons.

Supports the phone's text-size setting up to 130 % without clipping (test in `TESTING.md` §6).

### 3.2 Projector scale (viewport height units; px at 1080p in brackets)

Designed for a ≥ 2 m wide projection read from 6–8 m.

| Token | Size | Use |
|---|---|---|
| `--proj-min` | 3.2vh (35 px) | smallest text allowed on the big screen (operator bar, secondary text) |
| `--proj-eyebrow` | 3.2vh (35 px, = `--proj-min`) / 500, Latin uppercase + tracking (never tracked in Arabic) | section eyebrows (`.eyebrow.eyebrowProj`), table column heads, small icons next to them; readable from across the booth |
| `--proj-row` | 4.6vh (50 px) / 500; #1 row 700 | leaderboard rows (name and score) |
| `--proj-heading` | 7vh (76 px) / 500 | board titles, screen headings |
| `--proj-code` | 20vh (216 px) / 700, letter-spacing 0.08em | session code in the lobby (the hero) |
| `--proj-code-corner` | 6vh (65 px) / 500 | next-session code during play |
| `--proj-qr` | 40vh square, quiet zone ≥ 4 modules, dark modules ink on white | QR |
| `--proj-timer` | 9vh / 500 | round time left |

`--proj-heading-weight` and `--proj-row-weight` (700) are the v1 values; v2 uses `--weight-medium` for headings and rows and `--weight-bold` only for the code, hero numbers and the #1 row.

Layout tokens: `--proj-header-height` 9vh (header strip), `--proj-operator-height` 10vh (operator bar), `--proj-control-height` 5.6vh (operator-bar buttons, never below `--touch-target-floor`), `--proj-rank-rule` 0.6vh (#1 row's inline-start rule), `--proj-row-pad` 0.4vh (board row block padding), `--proj-row-leading` 1.1 (line height of the host's own board tables, so 10 rows fit between the header strip and the operator bar). A board row is ≈ 6.4vh tall (4.6vh × 1.2 + padding + 1 px line), so **10 rows take ≈ 64vh**; leaderboards on the big screen show at most **10 rows** so each row stays ≥ 4.6vh.

## 4. Spacing, shape, layout

- Spacing scale (4 px base): `--s-1: 4`, `--s-2: 8`, `--s-3: 12`, `--s-4: 16`, `--s-5: 24`, `--s-6: 32`, `--s-7: 48`, `--s-8: 64`.
- Phone gutter 16 px; min supported width 320 px; design width 360–430 px; portrait only.
- Radii (v2): `--r-panel` 12 px (panels, boards, dialogs), `--r-control` 10 px (buttons, inputs, code cells), `--r-tag` 8 px (name tags, badges, callouts); projector `--proj-radius` 1.4vh. **No pills:** `--r-chip` (999) is only for true circles (presence dots, spinner); `--r-button` 14 / `--r-card` 20 are v1 values kept for game internals.
- Lines: `--line-width` 1 px (borders, separators), `--line-width-strong` 2 px (tab underline, own-row outline, dashed breaks), `--focus-width` 3 px + `--focus-offset` 2 px (focus ring), `--rank-rule` 3 px (phone #1 / own row inline-start rule).
- Control sizes: `--button-height` 52 px (phone buttons and inputs), `--button-height-small` 36 px (dashboard and dense desktop rows only: below the touch floor), `--code-cell-height` 56 px (join code cells), `--phone-bar-height` 56 px (phone top bar).
- Dashboard: `--dash-max-width` 1200 px, `--dash-nav-width` 240 px (side nav), `--dash-signin-width` 400 px (sign-in panel).
- Touch targets ≥ **48 × 48** CSS px, `--touch-target-min` (hard floor 44 × 44, `--touch-target-floor`, for the densest grid, see Odd One Out). Minimum phone width `--phone-min-width` 320 px.
- Big screen: 16:9 layout, 5vh safe margins (`--big-screen-safe-margin`; projectors crop edges).
- Layout helper tokens in `tokens.css` (added with the Phase 1 screens): `--phone-max-width` 430 px, `--logo-phone-height` 32 px / `--logo-proj-height` 8vh (§5 minimums), `--line-width` 1 px / `--line-width-strong` 2 px / `--focus-width` 3 px, `--dot-size` / `--proj-dot-size` (presence dots), projector spacing `--proj-s-1…4` (1, 2, 3, 5vh) and `--proj-radius`, `--dialog-max-width`, `--qr-light` (QR background, always white), the layers below, and durations `--dur-spin` (busy spinner) and `--dur-countdown` (one 3-2-1 step, §6.3).
- Layers (z-index tokens, lowest first): `--z-shatter` **40** (every shard overlay, `.gdg-shatter-layer`, fixed and click-through) < `--z-shatter-logo` **45** (the logo, class `gdg-shatter-logo-safe` / `SHATTER_LOGO_CLASS`, §5) < `--z-banner` **50** (offline / reconnecting banners) < `--z-dialog` **100** (confirm dialogs). Defined in `tokens.css`; `src/effects/shatter/shatter.css` only references them.

### 4.1 Shared component patterns (v2, `src/components/ui.module.css`)

Import as `ui` from `src/components/ui.module.css`. Flat, no shadows, no gradients, no pills.

| Pattern | Classes | Look |
|---|---|---|
| Primary button | `button` (+ `buttonBlock` for full width) | `--primary-text` fill, `--on-primary` 17 / 500 label, `--button-height`, `--r-control`; hover `--primary-hover`; press scale 0.97; disabled 40 % opacity |
| Secondary button | `button buttonSecondary` | `--surface` with a 1 px `--line-strong` outline, ink label; hover `--surface-2` |
| Text / quiet button | `button buttonText` | no fill or border, ink label, hover `--surface-2`; full touch target |
| Link button | `linkButton` | inline `--primary-text` 500 text, underline on hover |
| Small button | add `buttonSmall` | `--button-height-small`, `--type-small-size` (desktop only) |
| Field | `field` > `label` + `input` + `helper` (with `counter`) | label above (15 / 500), input 52 px with a 1 px `--line-strong` border and `--r-control`, blue border + focus ring on focus, `aria-invalid="true"` turns the border ink; helper 15 muted with the counter at the inline end |
| Error / notice | `error` | a text-first callout: `--surface-2`, 1 px line, 3 px ink inline-start rule, 15 / 500 ink text (no colour-only meaning, no amber) |
| Panel | `panel` (+ `panelProj` on the big screen) | `--surface`, 1 px `--line`, `--r-panel`, padding `--s-5` (projector `--proj-s-3`, `--proj-radius`) |
| Eyebrow | `eyebrow` (+ `eyebrowProj`) | 12 / 500 muted, Latin uppercase + tracking, Arabic 14 and never transformed |
| Title | `title` | `--type-heading-size` 24 / 500 |
| Name tag | `nameTag` > `dot` + `<bdi className={ui.nameTagText}>` | `--surface`, 1 px line, `--r-tag`, 500 name with ellipsis |
| Presence dot | `dot` (+ `dotAway`, `dotProj`) | live = filled `--primary`; away = hollow `--line-strong` ring (shape differs, not only colour) |
| Tabs | `tabs` (+ `tabsProj` on the big screen: `--proj-min` text, `--proj-control-height` targets, `--proj-rank-rule` underline) > `tab` with `aria-selected="true"` / `aria-current="page"` (or `tabActive`) | text tabs on a 1 px bottom line; selected = ink text + 2 px `--primary` underline |
| Badge | `badge` (+ `badgeHighlight` for #1 / new best) | squared `--r-tag`, `--surface-2`, 14 / 500 tabular; highlight = `--highlight-tint` with an amber border, ink text |
| Label · value list | `keyValues` on a `<dl>` | two columns, muted label, 500 tabular value at the inline end, 1 px separators |
| Number-only text | `counter`, `ltrNumber` | `direction: ltr; unicode-bidi: isolate`, so "3 / 12" never reorders under `dir="rtl"` |
| Muted / small text | `muted`, `small` | `--text-muted`; `--type-small-size` |
| Phone top bar | `TopBar` (`topBar`, `logo`, `langToggle`) | `--phone-bar-height`, 1 px bottom line, logo at `--logo-phone-height` sized by height only and never framed (no box, background, padding or border), language toggle as a quiet muted text button inline-end |
| Logo on the big screen | `projLogo` | `--logo-proj-height`, height only, unframed |
| Dialog | `ConfirmDialog` (`backdrop`, `dialog`, `dialogActions`) | `--scrim` backdrop; `--surface` panel, 1 px line, `--r-panel`, padding `--s-6`, message 20 / 400; Cancel (secondary) then Yes (primary) at the inline end |
| System banner | `OfflineBanner` (`banner`, `bannerOk`) | sticky, `--z-banner`; offline = `--text` bar with `--bg` text, 15 / 500; back online = `--primary-text` bar with `--on-primary` text |
| Spinner | `Spinner` | 32 px 2 px ring in `--line` with a `--primary` arc; static under reduced motion |

Global utilities (`src/styles/base.css`): `.hero` (700 + tabular, the only bold), `.tabular-nums`, `.visually-hidden`, `.material-symbols-rounded`. `base.css` also resets buttons (no UA border, background or padding), so a button without a class is plain text.

### 4.2 The board (table) pattern

`Leaderboard` (and any board-like table: H4 session results, dashboard tables) is a table, not cards:

- One `--surface` panel with a 1 px `--line` border and `--r-panel` (projector `--proj-radius`); the board draws its own panel, so don't nest it in `.panel`.
- Columns: rank (3ch, tabular, 400 `--text-muted`; ranks 1–3 in `--text`), name (`<bdi>`, 500, one line with ellipsis, clipped only on the inline axis so Cairo glyphs are never cut), score (tabular, 500, inline-end aligned). Extra per-round columns sit between name and total, also tabular and inline-end aligned.
- Rows are separated by 1 px `--line` lines; no zebra, no gaps. Every row reserves an inline-start rule (`--rank-rule` 3 px, projector `--proj-rank-rule`) so columns stay aligned.
- **#1 row:** `--highlight-tint` background, amber rule, name and score at 700.
- **Own row:** `--primary-tint` background and a blue rule; if it is also #1 it keeps the amber row and gets a 2 px blue outline. The own row appended below the top 10 (`detached`) is set off by a 2 px dashed `--line-strong` separator.
- **New or improved row (H5):** `--primary-tint` with a 2 px dashed `--primary` outline.
- Phone: 17 px rows, `--s-3` / `--s-4` padding. Projector: `--proj-row` text, `--proj-row-pad` / `--proj-s-3` padding (≈ 6.4vh per row, §3.2).

## 5. Chevrons and the logo

- **Logo**: `assets/logo.png` (667 × 406 raster; ask for a vector version for crisp big-screen use, OQ-08). The two chevrons point away from each other (blue `<` left, amber `>` right) and the crystalline mosaic breaks off their **outer** points. Clear space on all sides = the height of one chevron. Minimum size: 32 px tall on phones, 8vh on the big screen. Only on `--bg` paper (or the official dark variant if the logo pack has one). Never animated, never under the shatter layer while it plays (the shatter overlay is always below the logo's z-index, or the logo is hidden for the transition). In code every logo `<img>` (phone top bar, host H0/H1/H4/H5 headers, dashboard) carries `SHATTER_LOGO_CLASS` (z 45 > the shard layer's 40), is never inside an element an effect hides or fades (the merge stage is the board area only), and on the phone sits outside the screen transitions. On the host the logo screens (H1, H4/H5) swap instantly instead of crossfading under reduced motion, so the logo never fades. Always sized by height only (`--logo-phone-height` / `--logo-proj-height`) so it is never stretched.
- **App logo files**: `src/assets/logo.png` / `logo.webp` are a transparent cut of `assets/logo.png` (670 × 281 incl. a 5 px transparent pad): the white is removed by un-matting against white, the mark's pixels and colours are unchanged (the four flat tones are bit-identical).
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

**Shards.** A seeded Delaunay triangulation of a jittered point grid covering the target rectangle: **24 shards on phones, 48 on the big screen** (hard caps). Each shard is filled with one of `--gdg-blue`, `--gdg-blue-deep`, `--gdg-amber`, `--gdg-amber-deep`, `--gdg-blue-tint`, `--gdg-paper`, with a 1 px `--gdg-paper` edge, which gives the crystalline look of the logo's shattered outer points. Weights: blue 25 %, blue-deep 20 %, amber 15 %, amber-deep 10 %, tint 20 %, paper 10 %. Rendered as one fixed, click-through overlay per play holding one small inline `<svg>` polygon per shard, animated with the Web Animations API on `transform` and `opacity` only (compositor-driven, so it keeps 60 fps while the main thread handles Realtime; reasoning in `src/effects/shatter/README.md`). Effects never block input (`pointer-events: none`) and never touch game timing.

| Variant | Where | Timeline | Easing |
|---|---|---|---|
| **Screen transition** | between major screens (join → lobby, round → intermission, intermission → next round, results) | 0–320 ms shards fly in from random directions (distance 30–60 % of viewport, rotation ±40°) and tile the screen; content swaps underneath at 320 ms; 320–700 ms shards burst outward (1.2× distance) and fade | in: emphasized; out: exit |
| **Celebrate (fragment & reassemble)** | new personal best on the phone; #1 of a round on the big screen | 0–450 ms the element's area splits into shards drifting 18–40 px outward with ±25° rotation; 450–1200 ms shards return and fuse; amber glow pulse at 1200 ms | emphasized |
| **Round results shatter-in** | round board and session results appear | rows assemble from shards top to bottom, 60 ms stagger, 500 ms each | emphasized |
| **Day-board merge** | big screen, after **Show day board** | ~15 s: 0–1.5 s session results fragment; 1.5–13.5 s for each of the 3 games in the lineup (4 s each): its day-board tab appears, shards stream to rows that are new or improved, those rows reassemble and slide to their rank; 13.5–15 s settle on the first game's tab (tabs then auto-rotate every 8 s) | standard |
| **Stop the Clock reveal** | big screen intermission | guess dots appear in shatter bursts per strip, 5 s total | emphasized |

**Reduced motion** (`prefers-reduced-motion: reduce`, or the host's **Reduce motion** toggle on the big screen, SCREENS H6): every variant becomes a 200 ms crossfade (board rows and reveal dots: a 200 ms fade-in); celebrate becomes a static amber ring; the day-board merge becomes a crossfade to the day board. Host screens that show the logo (H1, H4/H5) swap instantly instead (§5). The host toggle is remembered on the laptop and also sets `data-motion="reduced"` on `<html>`, which zeroes `--dur-fast/base/slow` like the OS setting.

**Where it's wired** (Phase 5):

| Variant | Phone (density `phone`, ≤ 24 shards) | Big screen (density `projector`, ≤ 48 shards) | Code |
|---|---|---|---|
| Screen transition | join ↔ member flow; lobby → round intro, round → intermission, intermission → next round intro, → results, → day board, removed/ended. **Never into a game**: a round's intro, game and own result share one key; reload/loading swaps are instant; intermission steps don't transition on phones | H1 → H2 (round start), H2 → H3, each H3 step, H3 "Next" → H2, H3 → H4; H4 → H5 is the merge | `src/components/ScreenTransition.tsx`, `src/player/screenKey.ts`, `src/host/screenKey.ts` |
| Celebrate | P7 `new_best` line (after the phone's round is over) | H2: the row that takes #1 (not on first load) | `RevealIn variant="celebrate"`, `useRevealRows({ leaderKey })` |
| Round results shatter-in | none (phones keep plain boards: lighter on low-end phones) | H1 player chips as they join; H2 rows as they appear; H3 round/total boards; H4 session table; H5 boards on each tab rotation | `src/components/useRevealRows.ts` (one budgeted batch per list) |
| Day-board merge | none (P10 gets a screen transition) | H4 → H5 after **Show day board**; the stage is the board area only; a reload onto H5 skips it; New session mid-merge cancels it | `src/host/Results.tsx` |
| Stop the Clock reveal | none | H3 round board of a Stop the Clock round: dots burst in strip by strip within 5 s (`revealSchedule`) | `src/host/StcReveal.tsx` via `RevealIn variant="dot"` |

During a transition's 320 ms fly-in the previous screen stays on screen under the shards, frozen and not clickable; the host's `data-screen` (and anything that says "the current screen") follows the screen actually shown, not the state that triggered the change. Board rows are always in the DOM with their text; the shatter-in only sets their opacity.

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
- A standalone signed number (a leading `+`, e.g. Odd One Out's penalty chip, Trivia's points badge) is wrapped in `<bdi dir="ltr">` so the sign never floats to the wrong side under `dir="rtl"`.

## 9. Accessibility checklist

- [ ] Text contrast ≥ 4.5:1 (≥ 3:1 for large text), using §2.4.
- [ ] No information by colour alone (Simon shapes, Trivia ✓/✗ icons, countdown number + bar, Odd One Out grid 1 differs by lightness too).
- [ ] Touch targets ≥ 48 px (44 px floor in Odd One Out 6 × 6).
- [ ] Reduced motion honoured everywhere (§6.2).
- [ ] Every new text/background pair is in `scripts/contrast.ts` and passes `npm run contrast` (§2.4, both themes).
- [ ] Visible focus ring for keyboard users on the host and dashboard: 3 px `--focus` outline with a 2 px `--focus-offset` (`base.css` `:focus-visible`); inputs add a blue border.
- [ ] Meaning never by colour alone in the v2 primitives: presence = filled vs hollow dot; #1 row = rank "1" + bold + rule; own row = rule (+ outline when also #1); new/improved rows = dashed outline; errors = text in a callout with an ink rule.
- [ ] `lang`/`dir` set; names in `<bdi>`; standalone signed numbers in `<bdi dir="ltr">`; number-only strings ("3 / 12") in `.counter` / `.ltrNumber`.
- [ ] Small buttons (`buttonSmall`, 36 px) only on the dashboard and desktop rows, never on phones.
- [ ] Modal dialogs (`ConfirmDialog`) trap Tab/Shift+Tab, default focus to the safe/cancel action, close on Escape, and return focus to the opener on close.
- [ ] Phone text scaling to 130 % works.
- [ ] Screen-reader labels for game controls (listed in each game doc) and live regions only where specified (never during Stop the Clock's hidden timer).
- [ ] Bright light: phones at max brightness under hall lighting pass the Odd One Out test (`TESTING.md` §6).
