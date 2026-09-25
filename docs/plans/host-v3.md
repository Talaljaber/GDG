# Host v3: "Stage and Rail" — professional redesign plan for the big screen

Purpose: the design lead's plan for the third pass over the projected host interface (`/host`, screens H0–H6). v2 "quiet scoreboard" (ADR-131) removed the loud first pass but the team's verdict is still "childish". This document diagnoses why, sets a named direction grounded in the research brief (Kahoot, Jackbox as counter-example, Mentimeter, Gimkit, broadcast scorebugs, Linear/Stripe density, Apple keynote number slides, FLIP, NN/g durations), gives exact tokens and per-screen specs, and splits the work into independent packages with file ownership so several implementers can build it in parallel. It is a plan only: nothing here is implemented yet.

Last updated: 2026-09-25

Related: ADR-008/009/010/015/017/025/033/117/122/129/131 (all stay in force), ADR-135 (proposed below), `DESIGN_SYSTEM.md` §0 (to be replaced by this direction), `SCREENS.md` §2, `SESSION_LIFECYCLE.md` §3, `TESTING.md` §9.

Screenshots referenced below were taken from the `/__preview?f=host.*` fixtures at 1906×880 (laptop browser window) and 1920×1080 (projector), EN and AR, on 2026-09-25 (scratch folder `v3/shots/`, e.g. `lobby-3-1920-en.png`). No fixture overflowed its viewport at either size.

---

## 1. Diagnosis: what still reads as childish or amateur

The v2 screens are already calm (no gradients, no pills, one accent). What remains is a **form-and-dashboard register**: the big screen looks like a settings page shown through a projector, not like a broadcast. Concretely, per screenshot:

| # | Symptom | Where (screenshot) | Why it reads as amateur (research ref) |
|---|---|---|---|
| D1 | **No hero.** The code is 216 px tall against a 380 px QR and a 600 px tall empty players panel; three columns of equal visual weight. | `lobby-3-1920-en`, `lobby-empty-1906-ar` | Kahoot/Jackbox: the code is "impossible to overlook", the QR at ~half its weight; Apple: one number so large it needs no decoration (brief §2 "big number rule"). |
| D2 | **Panels and boxes everywhere.** White bordered panel for players, bordered name chips, bordered lineup slots, bordered popovers, bordered QR, bordered STC tracks. | `lobby-30-1920-en`, `round-next-games-1906-en`, `intermission-stc-1920-en` | Linear/Stripe: density from typography and hairlines, never from card chrome; boxed rows per item is the "kids' app" pattern (brief §3). |
| D3 | **A grey admin band across the bottom of every screen** (10 vh `--surface-2` operator bar + 5 vh margin = 15 % of the projection), with the unpicked games as grey "+ Perfect Circle + Trivia + …" text that looks like disabled junk. | every screenshot; worst `lobby-3-1920-en`, `lobby-settings-1906-en` | Mentimeter/Gimkit: controls are edge-anchored, recessive and visually "not part of the show". The band is currently the second-heaviest element on screen. |
| D4 | **Spreadsheet boards.** Column headers `# · Player · Score`, a 1.9-em rank column, header rule, and a beige highlight row = Excel. Ten rows never fill the stage (25 % empty below the table on H2/H3). | `round-1920-en`, `intermission-board-1920-en`, `intermission-total-1906-ar` | Broadcast scorebug hierarchy: rank, name, number; no labels the room already understands (brief ref 6, 9, 15). |
| D5 | **Undersized moments.** "Next: Odd One Out" at 76 px with a blue "2" under it in an otherwise empty 1080p frame; the winner name and total at the same 76 px as the table text; no podium. | `intermission-next-1920-en`, `results-1920-en`, `results-1906-ar` | Kahoot saves all spectacle for the podium; Apple makes the winning number the largest thing on screen. Our biggest moment is the same size as row 4. |
| D6 | **Blue used as "link colour".** Corner code in blue, step numerals in blue, lineup ordinals in blue, current game in blue, countdown in blue, primary buttons blue: blue means five different things. | `round-1920-en`, `lobby-3-1920-en`, `intermission-next-1920-en` | One accent, one meaning per screen (brief §2 "restraint in color"). |
| D7 | **Bilingual doubling on every label** ("Scan to play · امسح الرمز لتلعب", three steps × two languages, "Game code · رمز الجلسة") makes the lobby read as a form with helper text. | `lobby-3-1920-en`, `lobby-empty-1906-ar` | ≤ 7–10 words visible at once (Apple). |
| D8 | **Stats stack with mixed sizes**: "68 s left" (97 px number + 35 px unit), "12/18 finished" with a slash in a different size, then the lineup wrapping onto two lines. | `round-1920-en` | Scorebug: time and progress are one small, fixed element; the board is the main event. |
| D9 | **STC reveal**: half-transparent light-blue dots, rounded white tracks, names colliding with the next track's border ("Sara" over the 10 s strip). | `intermission-stc-1920-en` | Contrast and "understand within two seconds" (brief ref 7). |
| D10 | **Day boards**: two tints (amber #1 + blue "from this session") compete; the vertical tab list leaves 60 % of the side column empty; "Today's best" as a header title in the logo strip. | `dayboard-1920-en` | One accent per screen; tabs belong with the content they switch. |
| D11 | **Motion register**: every joining chip, every board row, every screen change and every new #1 plays a shard effect; the signature fires 20–40 times per session, so the day-board merge is one animation among many. | live behaviour (`DESIGN_SYSTEM.md` §6.2 "where it's wired") | Reserve the spectacle for one point (brief §2, ref 1–2, 11). |
| D12 | **Sign-in** is a floating 400 px card with a 32 px logo in a 1080p frame: fine functionally, but it is the first thing the team sees and it looks like a template. | `signin-1920-en` | Keynote quality starts at the first screen. |

What is already right and stays: ink on paper, Roboto/Cairo, tabular numerals, the logo untouched, one amber row, the flows and timings.

## 2. The concept: "Stage and Rail"

**Name:** Stage and Rail (host v3). A broadcast scoreboard with a keynote's typography: the projected **stage** is chrome-free and built from type and hairlines only; the host's controls live on a thin **rail** at the bottom edge that reads as "not part of the show".

### 2.1 Principles

1. **Stage and rail.** 100 vh = 5 vh safe margin · 9 vh brand strip · **stage** · 7 vh rail (12 vh on H1 for the lineup tray) · 5 vh safe margin. The stage never contains a control; the rail never contains content for the room. The rail has no fill: a hairline on top, muted type, one ink-filled action button. (Mentimeter/Gimkit two-surface model, brief ref 4–5.)
2. **One hero, and it is huge.** Every screen has exactly one element larger than everything else, on the modular scale in §3.1: H1 the code at 30 vh, H2 the board (the timer is a scorebug, not a hero), H3 the board / the "Next" game name, H4 the winner's total at 20 vh, H5 the #1 row. Nothing else on the screen exceeds 10 vh.
3. **Type, hairlines, tints. No boxes.** Panels, chips and bordered slots disappear from the stage. Structure comes from a 12-column grid, 1 px `--line` rules, and at most one tinted row. The only box left on the stage is the QR's white quiet zone.
4. **Colour has one meaning each.** Ink = content and actions. **Blue = live** (presence dots, the current round in the lineup, the active tab underline, the join pulse, the progress bar). **Amber = rank 1** (the #1 row; the winner's total gets an amber rule). Muted ink = labels and secondary numbers. Blue is never text on the stage, never a button fill, never a numeral. Primary actions are **ink-filled** buttons (`--action` / `--on-action`), so the rail adds no colour.
5. **Boards are broadcast tables.** Rank · name · score, no visible column headers (kept for screen readers), fixed 10-slot height that fills the stage, tabular numbers at the inline end, hairline separators, #1 on the amber tint. Rows FLIP to new positions (400 ms) and a moved row pulses once; totals count up; entries fade and settle. No shards on rows.
6. **Motion says "this changed", once.** Micro 120–200 ms, entries 240 ms, reorders 400 ms, pulses 500 ms, count-ups 1.2–1.6 s, step crossfades 300 ms, dwell 7/5/3 s (ADR-117 unchanged). The mosaic shatter stays the signature but fires at **three** places only: the screen transitions between major screens (ADR-033: it is the transition motif; each one is ~0.7 s), the winner reveal on H4 (celebrate, once per session) and the ~15 s day-board merge. It no longer fires on joining names, on board rows, or on every new #1.
7. **Bilingual with hierarchy.** On H1 the other language is a second, muted line under the eyebrow (not inline "·"), once per block, never per step. Everything else follows the screen language. Numbers, the code and the QR are never mirrored; the rail, grid and rank column mirror (logical properties).
8. **Same shell, reconfigured.** H2 → H3 steps → H2 keep the same grid (side column + board) so the audience keeps continuity; the intermission is the scorebug "temporarily reconfiguring" (brief ref 6), not a new page each step.

### 2.2 How it differs from v2 "quiet scoreboard"

| v2 (ADR-131) | v3 (ADR-135) |
|---|---|
| Header strip + 12-col body + 10 vh grey operator bar | Brand strip + stage + 7 vh unfilled rail |
| White panels with 1 px borders, chips, bordered slots | No panels on the stage; hairlines and tints only |
| Code 20 vh, winner 7 vh, "Next" 7 vh | Code 30 vh, winner total 20 vh, "Next" game name 10 vh |
| Blue for interactive **and** live | Blue = live only; actions are ink |
| Boards with visible column headers, rows as tall as content | 10 fixed slots filling the stage, headers visually hidden |
| Shatter on chips, rows, new #1, every step | Shatter on screen transitions, winner reveal, merge; rows FLIP/fade/pulse |
| Bilingual labels inline on one line, on every step | One muted second line per block on H1 only |
| Lineup: 3 bordered slots + a scrolling "+ add" row | Lineup tray: 3 ordered slots + all remaining games as a wrapped segmented list (scales to 10) |

Why it will read as professional: it applies the four things every reference in the brief shares (one job per screen; a modular type scale with two weights; one accent with one meaning; edge-anchored recessive controls), and it moves energy from colour and shards into **rhythm** (cascading count-ups, FLIP reorders, a single reserved spectacle), which is how calm brands (Apple, Stripe, a broadcast scorebug) feel alive without looking like a party game.

## 3. Exact token changes (`src/styles/tokens.css`)

Only tokens are listed; components reference them by name. Values in vh are the projector scale; px in brackets at 1080p. Old names are kept as aliases where code still uses them so no game or phone style changes.

### 3.1 Projector type scale (modular, ratio ≈ 1.35)

| Token | Value | Weight | Use |
|---|---|---|---|
| `--proj-t1` | 3.2vh (35) | 500 | labels, rail text, column heads (hidden), step lines. **= `--proj-min`, `--proj-eyebrow`** (aliases stay) |
| `--proj-t2` | 4.2vh (45) | 400/500 | secondary numbers (round scores in H4, rank numbers, "Next: Simon", 2nd/3rd lines, deltas) |
| `--proj-t3` | 5vh (54) | 500 | board row name + score, player names on H1, tab labels. **`--proj-row` becomes 5vh** |
| `--proj-t4` | 7.2vh (78) | 500 | screen titles (game name on H2/H3), H1 player count number. **`--proj-heading` becomes 7.2vh** |
| `--proj-t5` | 10vh (108) | 500 | sub-hero: "Next: <game>" name, H4 winner name. New: `--proj-subhero` |
| `--proj-t6` | 14vh (151) | 700 | stat hero: H2 time left. **`--proj-timer` becomes 14vh** |
| `--proj-t7` | 20vh (216) | 700 | hero number: H4 winner total, H3 countdown digit. New: `--proj-hero` |
| `--proj-code` | **30vh** (324) | 700, `--proj-code-letter-spacing` 0.06em | the lobby code |
| `--proj-code-corner` | 5vh (54) | 500 | pending code in the brand strip (= t3) |
| `--proj-qr` | **24vh** | – | QR side on H1 (was 40vh) |

Weights stay 400/500/700 (`--weight-regular/medium/bold`). Line heights: `--proj-leading-hero` 0.95 (new; hero digits), `--leading-tight` 1.2 elsewhere, Arabic `--leading-tight-ar` 1.4. `font-variant-numeric: tabular-nums` on every number.

### 3.2 Projector layout

| Token | Value | Note |
|---|---|---|
| `--proj-header-height` | 9vh | unchanged (logo minimum 8vh, §5) |
| `--proj-rail-height` | **7vh** | new; `--proj-operator-height` becomes an alias of it |
| `--proj-rail-height-lobby` | 12vh | H1 only (lineup tray, two lines) |
| `--proj-control-height` | 5.6vh | unchanged (≥ `--touch-target-floor`) |
| `--proj-row-height` | **6.6vh** | new: fixed board slot height (10 slots = 66vh) |
| `--proj-row-pad` | 0 | rows are sized by `--proj-row-height`, not padding |
| `--proj-row-leading` | 1.1 | unchanged |
| `--proj-rank-rule` | 0.6vh | unchanged (the #1 / live rule) |
| `--proj-stage-gap` | 3vh | column gap of the stage grid (= `--proj-s-3`) |
| `--proj-radius` | **1vh** | was 1.4vh; only the QR box and dialogs use it on the stage |
| `--proj-r-control` | 0.8vh | new: rail buttons and lineup slots (replaces `--r-control` 10px on the projector) |
| `--proj-bar-height` | 0.8vh | new: thin progress bars (H2 finished, H5 tab rotation) |
| `--proj-dot-size` | 2.4vh | unchanged |
| `--big-screen-safe-margin` | 5vh | unchanged |
| `--proj-s-1…4` | 1 / 2 / 3 / 5vh | unchanged |

### 3.3 Colour roles (semantic, both themes)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--action` | `--text` (ink) | `--text` (paper) | primary rail button fill |
| `--on-action` | `--bg` | `--bg` | its label (16.8:1) |
| `--action-hover` | ink 85 % + blue-strong | paper 85 % + blue | hover |
| `--live` | `--primary` | `--primary` | presence dots, current-round mark, active tab underline, progress fill |
| `--live-tint` | `--primary-tint` | `--primary-tint` | join pulse, moved-row pulse, "from this session" rows |
| `--rank1-tint` | `--highlight-tint` | `--highlight-tint` | the #1 row (alias, so intent is readable in CSS) |
| `--rank1-rule` | `--highlight` | `--highlight` | #1 rule, the winner total's underline |
| `--slot-line` | ink 8 % | paper 8 % | empty board slots and lobby placeholder rows (lighter than `--line`) |
| `--rail-text` | `--text-muted` | `--text-muted` | rail labels |

`--primary-text` (blue-strong) remains for the dashboard and phones; on the host it is used **only** for the focus ring. Add to `scripts/contrast.ts`: `--on-action` on `--action` and `--action-hover` (both themes), `--text` on `--live-tint`, `--text-muted` on `--slot-line`-backed rows (must stay ≥ 4.5:1).

### 3.4 Motion

| Token | Value | Use |
|---|---|---|
| `--dur-fast` / `--dur-base` / `--dur-slow` | 120 / 200 / 360 ms | unchanged (press, small state, chevron frame) |
| `--dur-enter` | 240ms | row / name entry: opacity 0→1 + translateY(8px→0) |
| `--dur-reorder` | 400ms | FLIP transform to rest |
| `--dur-pulse` | 500ms | one-shot tint pulse on a moved row / newest name |
| `--dur-step` | 300ms | crossfade between intermission panels inside the same shell |
| `--dur-countup` | 1200ms | board totals |
| `--dur-countup-hero` | 1600ms | H4 winner total |
| `--stagger-row` | 60ms | cascade between rows (top to bottom) |
| `--dur-countdown` | 1000ms | unchanged (3-2-1) |
| `--ease-standard` / `--ease-emphasized` / `--ease-exit` | unchanged | **no overshoot/elastic curves anywhere on the host** |

Reduced motion (OS or host toggle, `data-motion="reduced"`): all new durations become 0 ms like the existing ones; count-ups render the final value at once; FLIP applies no transform.

## 4. Screen-by-screen specs

Common to every screen (the **shell**, owned by WP2):

- Grid: `.host` is a column flex of `brand strip (9vh) · stage (flex 1) · rail`. The stage is a 12-column grid with `--proj-stage-gap`, inside the 5 vh safe margins. Heights above assume 16:9; at `max-aspect-ratio: 17/10` the side column narrows to 3 cols and the board takes 9 (as today).
- **Brand strip:** logo (8 vh, `SHATTER_LOGO_CLASS`, unframed, floating on H2/H3 as now) at inline-start; the tagline `host.header.tagline` at t1 muted after a 1 px vertical rule **on H1 only**; on H2–H5 the strip's inline-end holds the **corner code**: `host.corner.late` at t1 muted, then the code at `--proj-code-corner` 700 **ink** tabular (not blue), `dir="ltr"`, testids `host-corner`, `host-corner-code` unchanged. No screen title in the strip (H4/H5 titles move into the stage as eyebrows).
- **Rail:** `min-block-size: var(--proj-rail-height)`, `border-block-start: 1px solid var(--line)`, `background: var(--bg)`, `align-items: center`. Inline-start: the context (H1 lineup tray; H2–H5 the `host-next-games` text button: `host.lineup.next_title` eyebrow + `A → B → C` at t1 muted, arrows as today). Inline-end: `host-settings` (gear + `host.settings.title`, t1 muted text button), then secondary text buttons, then the one primary action as an **ink button** (`--action` fill, `--on-action` label, t1 500, `--proj-control-height`, `--proj-r-control`, hover `--action-hover`, press scale 0.97; disabled = transparent fill, 1 px `--line-strong` outline, `--rail-text`). Popovers (settings strip, next-games picker) open above the rail as today: `--surface`, 1 px `--line-strong`, `--proj-radius`, z `--z-dialog`.
- **Focus:** 3 px `--focus` ring, offset 2 px, on every rail control and tab.
- **RTL:** logical properties only; the rail mirrors (primary action at the inline end, i.e. left in Arabic); hero numbers, codes, the QR and the STC tracks keep `dir="ltr"`.
- **Empty stage never blank:** every board/list state below defines its waiting state.
- **Render budget:** idle H1/H4/H5 commit 0 renders over 30 s (`TESTING.md` §9); every clock/pulse/count-up runs in a leaf or via DOM/WAAPI in a ref, never via per-frame React state.

### 4.1 H0 Sign-in (laptop scale, not projected)

- Layout: a single 400 px column centred on `--bg`; **no card**. Logo at 48 px (height only), 24 px below it the title `host.signin.title` at `--type-heading-size` 500, then the two fields (`ui.field` pattern), then the submit as an ink button (`--action`, full width, `--button-height`). Error/notice as `ui.error` under the fields. Under the button a muted 15 px line `host.signin.hint` (new string, see §7.2: "Sign in before connecting the projector.").
- States: idle, busy (button disabled, label unchanged), error, not_admin. Testids `host-signin`, `signin-email`, `signin-password`, `signin-submit`, `signin-error`, `logo` unchanged.
- Motion: none.

### 4.2 H1 Lobby

```
brand strip:  [logo] | GDG on Campus · AI Expo Jordan
stage (12 cols, 74vh):
  cols 1–7  "join"                                   cols 8–12 "players"
  Game code                       (t1, muted)        Players  12          (t1 muted + t4 number)
  رمز الجلسة                      (t1, muted line 2)  ● Sara                ● Maximilian R
  ‹  4 8 2 1  ›                   (30vh, ink, 700)   ● عبدالرحمن سا        ○ Adam
  [QR 24vh]  gdg-booth.example    (t3 500 ink)       ● …                   (2 cols, 12 rows visible,
             1 Scan the QR        (t1, muted)          hairline rows, scrolls)
             2 Enter the code
             3 Type your name
rail (12vh):
  Lineup · pick 3  |  1 Stop the Clock  ›  2 Odd One Out  ›  3 Simon            ⚙ Settings   [ Start ]
  Perfect Circle · Trivia · Close the Brackets · Color Clash · How Many · Swipe Sort · Pairs
```

- **Join block (cols 1–7):** eyebrow `host.lobby.code_label` at t1 muted, with the other language on a second muted t1 line (`Bilingual` renders two lines here, `stacked` prop). The code: `--proj-code` 30 vh, 700, ink, tabular, `dir="ltr"`, framed by the thin facing chevrons (`Framed`), chevron height = 60 % of the code's cap height, stroke 2, blue `<` at inline-start and amber `>` at inline-end (mirrored in RTL as today). Below, one row: the QR (24 vh square, white `--qr-light` box, 1 px `--line`, `--proj-radius`, quiet zone ≥ 4 modules, testid `host-qr`) at inline-start; beside it the URL (`host.lobby.or_visit` at t1 muted with the URL span at t3 500 ink, `dir="ltr"`) and the three steps as an `<ol>` at t1 muted with **ink** tabular numerals (not blue), one language only (the screen language). The code hero is centred on the block's width; the QR row is aligned to the block's inline-start.
- **Players (cols 8–12):** head line = `host.lobby.players` with the number at t4 700 ink and the word at t1 muted (testid `host-player-count`, text unchanged: "3 players"). Below: `<ul data-testid="host-players">` as a **two-column list of hairline rows**, no borders, no panel: each `<li data-testid="host-player" data-name data-presence data-online>` is `--proj-row-height` tall, presence dot (filled `--live` / hollow `--line-strong` ring, `--proj-dot-size` × 0.6) + `<bdi>` name at t3 500 (muted when away), 1 px `--line` bottom rule; the remove `×` (`host-remove`) appears on hover/focus at the row's inline end (44 px target). **Newest first**; the list scrolls inside its area (`overflow-y: auto`, thin scrollbar) when > 24 names. The newest row plays one `--dur-pulse` `--live-tint` background pulse on arrival, plus the `--dur-enter` fade + settle. **No shards on names.**
- **Empty state:** the head line reads "0 players" (existing plural), and the list area shows six placeholder rows (2 cols × 3, `--slot-line` rules, no text) with `host.lobby.empty` at t3 ink and `host.lobby.empty_hint` at t1 muted centred over them.
- **Rail (12 vh on H1 = the lineup tray):** line 1: `host.lineup.title` (or `host.lineup.need` in ink while invalid, `role="status"`) at t1 muted, a 1 px vertical rule, then the three ordered slots; inline-end: `host-settings`, the `host.start_disabled_hint` (t1 muted, only when 0 players), and `host-start` as the ink button. Line 2: the segmented list of every unpicked registered game (§5). Start is disabled until ≥ 1 player and a valid, synced lineup (unchanged logic).
- **Confirm remove:** `ConfirmDialog` unchanged (`confirm-dialog`, `confirm-yes`).
- Motion: names as above; the code does not animate; the chevrons play their 360 ms slide-in once on mount. The H1 → H2 screen transition is the shatter (unchanged).
- AR: the join block is at the inline-start (right), players at the left; the steps' numerals stay Western; the URL keeps `dir="ltr"`.

### 4.3 H2 Round live

```
brand strip:  [logo]                                        Late? Join the next session  5307
stage:
  cols 1–4 (scorebug)                cols 5–12 (board, 10 slots × 6.6vh = 66vh)
  Round 2 of 3            (t1 muted)  1  عبدالرحمن سا                                940   ← amber tint + rule, 700
  Odd One Out             (t4)        2  Maximilian R                                 903
                                      3  Sara                                         866
  68                      (t6 700)    …
  s left                  (t1 muted)  7  ─────────────── (empty slot, --slot-line)
  ▮▮▮▮▮▮▮▮▮▮▮▮░░░░░░ 12 / 18 finished (bar --proj-bar-height, --live fill; t2 numbers, t1 label)
  Stop the Clock → Odd One Out → Simon   (t1, current in ink with a --live underline, done muted)
rail:  Next session  Simon → Perfect Circle → Odd One Out            ⚙ Settings   [ End round ]
```

- **Scorebug (side):** `<h1 data-testid="host-round-title">` keeps the text "Round 2 of 3 · Odd One Out" (eyebrow span at t1, hidden ` · ` span, title span at t4, `text-wrap: balance`, max 2 lines). Time left (`host-time-left`): the number at t6 700 tabular in its own leaf (`TimeLeft`, unchanged), the unit at t1 muted on the next line; the whole block `dir="ltr"`. Finished (`host-finished`, text "12/18 finished" unchanged): a thin progress bar (`--proj-bar-height`, `--slot-line` track, `--live` fill = done/total, fills toward inline-end) above the numbers at t2 tabular + the word at t1 muted. `LineupSummary`: t1, the current game in ink with a 2 px `--live` underline (not blue text), done games muted.
- **Board (cols 5–12):** `BoardTable` with `slots={10}`: exactly ten `--proj-row-height` rows are always drawn; filled rows from the top (rank t2 muted, 1–3 in ink; name `<bdi>` t3 500; score t3 500 tabular at the inline end; 1 px `--line` bottom rule; #1 row `--rank1-tint` + `--proj-rank-rule` inline-start `--rank1-rule` + 700), empty slots are hairline rows in `--slot-line` with no text. Column heads exist as `<th>` with `.visually-hidden`. Before the first score the ten empty slots show, with `host.round.no_scores_yet` (`emptyBoard`) at t2 muted centred over slots 4–6.
- Motion: a new row enters with `--dur-enter` fade + 8 px settle; a rank change FLIPs (`--dur-reorder`) and the moved rows pulse `--live-tint` for `--dur-pulse`; a new #1 gets the same pulse (no celebrate shatter, no shard-in). `celebrateLeader` becomes a no-op alias of the pulse.
- Rail: `host-next-games` (popover picker with `next-lineup-*` and `next-games-done`), `host-settings`, `host-end-round` as the ink button → `ConfirmDialog` text "End this round now? Scores so far count." unchanged.

### 4.4 H3 Intermission (same shell as H2; the scorebug reconfigures)

Steps and dwell times are ADR-117/129 (7 s board → 5 s total → 3 s next; only the board after the last round). Each step is a `--dur-step` crossfade **inside** the stage; the screen-level shatter transition between steps is removed (`hostScreenKey` returns one key per intermission round; the step is `data-step` on `host-intermission`). H2 → H3 and H3 → H2 keep the shatter screen transition.

- **Step 1, round board:** side: eyebrow `intermission.round_board` ("Round 2 results") t1 muted, game name t4 (`host-intermission-title` text unchanged), `intermission.next` at t2 muted, `LineupSummary` with the next round marked. Board: `host-round-board`, 10 slots, final order, rows enter as a cascade (fade + settle, `--stagger-row`), scores **count up** from 0 over `--dur-countup` with the same stagger (odometer-style integer steps, ease-out). No shards.
- **Step 1 for Stop the Clock (guess reveal, `stc-reveal`):** full-width stage (12 cols), header line = eyebrow + game name at t4 inline-start and `intermission.next` at t2 muted inline-end. Three **flat tracks** (no boxes): each track block is 22 vh: label `game.stop_the_clock.target` at t3 500 inline-start (4 cols), the track in the remaining 8 cols: a 1 px `--line` baseline with 1 s ticks (1 vh tall, `--line`), the centre target line 2 px ink with a `game.stop_the_clock.reveal_axis` tag at t1 muted above it (once, on the first track), and the ±5 s ends marked. Dots: `--proj-dot-size`, solid `--live` with a 1 px `--bg` edge (no 55 % alpha), pinned dots hollow (2 px `--live` ring). Top-5 labels at t1 500 ink in lanes: two lanes above, two below, lane pitch 3.6 vh, the block reserving that space so labels never cross another track. Dots keep their shatter-burst reveal (`RevealIn variant="dot"`, `revealSchedule`, 5 s) — this is a data reveal, allowed. Reduced motion: 200 ms fades. Testids `stc-strip`, `stc-dot`, `stc-dot-label`, `data-target` unchanged; `dir="ltr"` tracks.
- **Step 2, total so far:** side eyebrow `round.label`, title `intermission.session_total` at t4, `LineupSummary`. Board `host-total-board`: rows FLIP from the round-board order to the total order when the step starts (the same `BoardTable` instance stays mounted across steps 1 → 2 with a new `rows` prop, so `data-reveal-key` = `playerRowId` positions can be measured), totals count up from the previous displayed value, moved rows pulse, and a delta glyph (`▲ 2` / `▼ 1`, t1 muted, inline after the name, `<bdi dir="ltr">`) fades out after 1 s. New string `host.board.delta_up` / `delta_down` are not needed: the glyph is drawn as an inline SVG chevron + the number.
- **Step 3, Next:** full stage, centred column: `round.label` at t2 muted; the game name (`intermission.next` = "Next: Odd One Out") at **t5 10 vh** 500, framed by the chevrons at 14 vh (versus frame slide-in 360 ms); the countdown digit at **t7 20 vh 700 ink** (not blue), each second: scale 1.06 → 1 and opacity 0 → 1 over 300 ms (no 1.4× pop). Testids `host-next-intro`, `data-game` unchanged.
- Rail: `host-skip` ("Next round now") as the ink button on steps 1–2 only (unchanged rule), next-games, settings.
- Empty boards: ten slots + `round.no_scores` / `results.no_scores` at t2 muted.

### 4.5 H4 Session results (the podium moment)

```
brand strip:  [logo]                                        Late? Join the next session  5307
stage:
  cols 1–5 (podium)                         cols 6–12 (session table)
  Session complete          (t1 muted)       1  عبدالرحمن سا     946   963   980   2,890  ← amber
  Winner                    (t1 muted)       2  Maximilian R     934   951   968   2,853
  ‹ عبدالرحمن سا ›          (t5, 700)        3  Sara             934   951   968   2,853
    2,890                   (t7 20vh 700, amber rule under)   …  (10 rows; round scores t2 muted, total t3 ink)
  ─────────────
  2  Maximilian R   2,853   (t2)
  3  Sara           2,853   (t2)
rail:  Next session  …            ⚙ Settings   New session   [ Show day board ]
```

- **Podium (side, `host-winner`):** eyebrows `results.eyebrow` ("Session complete", reuse of the existing key) and `host.results.winner`; the winner name `<bdi>` at t5 700 (`overflow-wrap: anywhere`, max 2 lines) framed by the chevrons (chevron height 24 vh spanning name + total); the total at t7 700 tabular ink with a `--proj-rank-rule`-thick `--rank1-rule` underline the width of the digits (amber as a rule, never as text, §2.4). Ranks 2 and 3 as two plain lines at t2 (rank muted, name 500, score tabular) under a 1 px rule. With one player only the 2/3 lines are omitted; with no scores the side shows `results.no_scores` at t2 and the table area the ten empty slots (`host-no-scores` stays on the table area).
- **Table (`host-session-board`):** 10 fixed slots; columns rank (t2), name (t3), one column per round with the game name as a **visible** `<th>` at t1 muted (`text-wrap: balance`, up to 2 lines — needed to read the columns), `results.breakdown_missing` "–" for a missing round, total (t3 500 ink; `host.results.total` head). Round columns `--proj-t3 × 3.2` wide, the total column `× 3.8`. `board-row`, `board-name`, `board-round-score[data-game]`, `board-score` unchanged.
- Motion (once, when H4 appears; a reload onto H4 or a 3 s poll refresh never replays): the table rows cascade in (fade + settle) and their totals count up (`--dur-countup`, `--stagger-row`); the winner total counts up over `--dur-countup-hero` starting 300 ms after the rows; at the end of the hero count-up the **celebrate shatter** plays on the winner block (`RevealIn variant="celebrate"` semantics: fragment & reassemble + amber pulse, ≤ 48 shards). This is the session's one celebration. Late scores (E22) update values in place (count from the old value).
- Rail: `host-new-session` as a text button, `host-show-day-board` as the ink button.

### 4.6 H5 Day boards

```
stage:
  Today's best   (t1 muted eyebrow, inline-start)
  Stop the Clock   Odd One Out   Simon      (t3 text tabs, active: ink + 0.6vh --live underline that fills over 8 s)
  ────────────────────────────────────────
  1  عبدالرحمن سا                     990   ← amber
  2  Maximilian R                     949   ← from this session: --live rule only, no tint
  …  (10 slots)
rail:  Next session  …                           ⚙ Settings   [ New session ]
```

- Tabs (`host-dayboard-tabs`, `dayboard-tab-<game>`, `role="tab"`, `aria-selected`) are **horizontal** across the top of the board area, t3 500, muted; the active tab in ink with a `--proj-rank-rule` `--live` underline whose width animates 0 → 100 % over `DAYBOARD_ROTATE_MS` (a WAAPI animation restarted on each rotation, none under reduced motion) so the room sees the board will change. The board takes all 12 columns below the tabs (`dayboard.title` becomes the eyebrow above the tabs, not a header title).
- Rows: 10 slots, best per name, names without suffix; **rows from this session** (`data-highlight="true"`) get the `--live` inline-start rule only (no blue tint) for the first rotation; #1 keeps the amber tint. Empty game: ten slots + `host.dayboard.empty` at t2 muted.
- Merge (ADR-010, `DayBoardMerge`, unchanged mechanics and ~15 s timeline): stage = the board area only; the tabs switch as the merge walks the games; tiles target `[data-highlight="true"]` rows. `BoardTable reveal={false}` keeps its meaning: rows render at opacity 0 and no entry animation while the merge owns them. Tab change after the merge: the outgoing board crossfades (`--dur-step`) into the incoming one, rows cascade in.
- Rail: `host-new-session` as the ink button.

### 4.7 The operator rail, settings and the corner code (summary)

- Rail contents per screen: H1 lineup tray + Start · H2 next-games + End round · H3 next-games + Next round now (steps 1–2) · H4 next-games + New session (text) + Show day board · H5 next-games + New session. Settings on every screen.
- Settings strip (`host-settings` → one-row popover above the button, aligned to its inline-end): `host-reduced-motion` (checkbox glyph + `host.settings.reduced_motion`, `aria-pressed`), the language toggle (`common.lang_toggle`, `lang` attribute), `host.settings.theme` as a new third toggle (**Dark screen**, `data-theme="dark"` on `<html>`, remembered under `gdg.v1.host-theme`; the string exists), `host.signout`. Menu items at t1, 44 px targets.
- Corner code: as in the shell section: t1 muted label + t3 700 ink code, on H2–H5, `data-count` unchanged.
- Banners (`host-banner`): unchanged position (`--z-banner`), ink bar with paper text at t1.

## 5. The lineup picker at 10 games

The picker must show up to 10 registered games (7 today: stop_the_clock, odd_one_out, simon, perfect_circle, trivia, close_brackets, color_clash; how_many, swipe_sort, pairs planned), keep one button `lineup-<game>` / `next-lineup-<game>` per game with `aria-pressed` = picked, a picked button's text starting with its ordinal (e2e: `toHaveText(/^1/)`), `data-valid` / `data-synced` on `lineup-picker`, and never scroll off-screen.

- **Line 1 (picks):** `host.lineup.title` ("Lineup · pick 3") or `host.lineup.need` in ink while incomplete; a 1 px vertical rule; three ordered slots separated by a thin `›` arrow glyph (mirrored in RTL). A filled slot is a text button at t1 500 ink: ordinal (tabular, muted) + game name + a `×` that appears on hover/focus, no border, a 2 px `--line-strong` underline. An empty slot is its ordinal in `--rail-text` over a 2 px `--slot-line` underline `--proj-t3 × 3` wide.
- **Line 2 (the pool):** every unpicked registered game as a quiet text button (`+` glyph 0.8 em + name, t1, `--rail-text`, hover ink + `--surface-2` background, `--proj-r-control`), laid out as a **wrapping row** (`flex-wrap: wrap`, row gap `--proj-s-1`, column gap `--proj-s-3`); the rail grows with a third line when needed and the stage shrinks (the lobby stage tolerates 10 vh less). Never `overflow-x: auto`. Disabled (lineup full) = 45 % opacity, `cursor: not-allowed`. Width check: 7 unpicked EN names at t1 ≈ 1,750 px ≥ the 1,728 px available at 1920 wide, so wrapping must be verified with 10 registered games in the fixture `host.lobby-10-games` (§8, WP1).
- **Popover variant (H2–H5, `next-games-dialog`):** the same component inside a popover above the rail, `max-inline-size: calc(100vw − 2 × safe margin)`, with `next-games-done` as an ink button; line 2 wraps into at most 2 rows there.
- Order and saving: unchanged (`toggleLineup`, `adminSetLineup` on a valid change, `onSyncedChange`).
- AR: the arrows mirror; names in Arabic are shorter, so the pool fits on one line.

## 6. Work packages

Six packages. WP1 is small and lands first; WP2–WP5 run in parallel against the token and class names fixed in this plan; WP6 runs last. **File ownership is exclusive**: a package edits only its files. `host.module.css` is split into four modules so no two packages touch one stylesheet; `screens.tsx` is owned by WP2 (H1 and the H2 layout), the board inside H2 comes from WP3's `BoardTable`.

Shared contracts (agreed here, so parallel work composes):

- Tokens: names and values in §3 (WP1 lands them; until then the others reference the names; nothing else adds to `tokens.css`).
- `BoardTable` props (WP3): `rows`, `testId`, `highlightIds`, `reveal`, `celebrateLeader` (kept; now = pulse), new `slots?: number` (default 10), `countUp?: boolean`, `columns?: { key: string; head: ReactNode; value(row): ReactNode; className?: string }[]` (extra numeric columns between name and total, for H4's per-round scores), `emptyText?: string` (rendered over the empty slots). Class contract in `src/host/board.module.css`: `.board .row .rank .name .score .extra .first .podium .highlight .slot .delta .empty`.
- Count-up and FLIP (WP3): `src/host/countUp.ts` exports `useCountUp(ref: RefObject<HTMLElement>, value: number, opts: { duration: number; delay?: number; enabled: boolean })` (writes `textContent` via rAF with `formatNumber`, no React state; ends exactly on `formatNumber(value)`); `src/host/flip.ts` exports `useFlipRows(listRef, keys: readonly string[], opts: { duration; pulseClass; enabled })` (measures `[data-reveal-key]` rects in `useLayoutEffect`, inverts with `transform`, plays with WAAPI, adds `pulseClass` to moved rows for `--dur-pulse`).
- Bilingual (WP2): `Bilingual` gains `stacked?: boolean` (two lines) and keeps the inline default for anything still using it.
- Screen keys (WP4): `hostScreenKey` returns `intermission:<roundId>` for every step (steps crossfade inside the stage); `screenKey.test.ts` is updated by WP4.

### WP1 Foundations and fixtures — **sonnet**, first (≈ half a day)

Owns: `src/styles/tokens.css`, `scripts/contrast.ts`, `docs/DESIGN_SYSTEM.md` (§0 replaced by the v3 brief = §2–§3 of this plan, §3.2/§4/§6 tables updated), `docs/DECISIONS.md` (append ADR-135 from §7.1), `docs/COPY.md` §6 + `src/i18n/en.json` + `src/i18n/ar.json` (the new strings in §7.2 only), `src/dev/fixtures/host.tsx`.
Build: the tokens (§3) with the aliases; the contrast pairs (§3.3) — `npm run contrast` green in both themes; the ADR; the strings (`npm run check:i18n` green); new fixtures: `host.lobby-1` (one player), `host.lobby-10-games` (10 registered games via a fixture-only registry override, 3 picked), `host.round-empty` (no scores yet), `host.round-3` (3 of 18 scored), `host.intermission-total-moved` (rows whose ranks differ from the round board, to exercise FLIP), `host.results-1` (one player), `host.results-empty`, `host.dayboard-empty`, plus `&theme=dark` works for all.
Acceptance: `npm run typecheck`, `npm run contrast`, `npm run check:i18n` green; every existing fixture still renders (the old token names resolve); the plan's token table and `tokens.css` match line by line.

### WP2 Shell, rail, lobby, sign-in — **opus**

Owns: `src/host/common.tsx`, `src/host/screens.tsx`, `src/host/HostApp.tsx`, `src/host/host.module.css` (shell, brand strip, rail, lineup tray, H1, H2 layout, H0, popovers, dialogs; the board, intermission and results styles move out to the other modules), `src/host/lineup.ts` (unchanged unless needed), `src/host/presence.ts`.
Build: §4 common shell, §4.1 H0, §4.2 H1 (join block, players list with pulse and placeholder rows, no `useRevealRows` on names), §4.3 H2 layout (scorebug + `<BoardTable slots={10}>` from WP3; until WP3 lands, the existing `BoardTable` renders inside the new grid), §4.7 rail/settings/dark toggle/corner code, §5 lineup tray + popover.
Acceptance: screenshots of `host.signin`, `host.lobby-empty/-1/-3/-30/-10-games/-invalid/-settings`, `host.round`, `host.round-next-games` at 1906×880, 1920×1080 and 1280×720, EN + AR, light + dark: no horizontal/vertical overflow (`document.documentElement.scrollWidth ≤ innerWidth`, same for height), no text clipped, the rail never taller than 12 vh on H1 / 7 vh elsewhere except when the 10-game pool wraps; `src/host/presence.test.tsx` green (idle lobby 0 renders over 30 s); `e2e/phase1.spec.ts` + `phase2.spec.ts` lobby/round parts green on the local stack; every testid in §9 present.

### WP3 Board engine: BoardTable, FLIP, count-up — **opus**

Owns: `src/host/BoardTable.tsx`, new `src/host/board.module.css`, new `src/host/flip.ts` + `flip.test.ts`, new `src/host/countUp.ts` + `countUp.test.ts`, new `src/host/BoardTable.test.tsx`.
Build: the 10-slot board (§4.3 board, class contract above), entry cascade (fade + settle, `--stagger-row`), FLIP reorder with pulse and delta glyph, count-up (odometer-style integer steps, ease-out, ends exactly on the formatted value, reduced motion = instant), the `columns` API for H4, `emptyText` over slots, `reveal={false}` = rows at opacity 0 with no animation (merge contract), `celebrateLeader` = pulse on a new #1 (no shards; `useRevealRows` is no longer imported by the host). `<th>` visually hidden by default, visible when `columns` are given (H4).
Acceptance: unit tests: FLIP measures and inverts (jsdom: assert the transform is set then cleared; WAAPI mocked as in `RevealIn.test.tsx`); count-up ends on `formatNumber(value)` and renders instantly under reduced motion; no React commit during a count-up (assert with a render counter around a 1.2 s fake-timer run); the board with 3 rows draws 10 `.row/.slot` elements; rendering the same `rows` array twice commits once. Manual: `host.round-3`, `host.intermission-total-moved` at 1920×1080 EN/AR show the cascade, the FLIP and the pulse at 60 fps (Chrome performance panel, no layout thrash: transform/opacity only).

### WP4 Intermission, STC reveal, Next intro — **opus**

Owns: `src/host/Intermission.tsx`, `src/host/StcReveal.tsx`, `src/host/reveal.ts`, `src/host/screenKey.ts` + `screenKey.test.ts`, `src/host/schedule.ts` only if a step-change hook is needed (timings must not change; `schedule.test.ts` stays green), new `src/host/intermission.module.css`.
Build: §4.4: one mounted shell across steps 1 → 2 with a `--dur-step` crossfade of the side texts and the board's `rows` prop swap (so WP3's FLIP runs), the flat STC tracks with lanes and solid dots, the Next step at t5/t7 with the calm countdown; `hostScreenKey` one key per intermission round.
Acceptance: `screenKey.test.ts`, `schedule.test.ts`, `hostLoop.test.ts` green; screenshots `host.intermission-board/-stc/-total/-total-moved/-next` at the three sizes, EN + AR, light + dark: no label crosses a track, no overflow, dots ≥ 4.5:1 against paper (solid blue is 3.57:1 as a fill — acceptable for non-text, but the 1 px paper edge must be present); the intermission render budget ≤ 23 commits / 131 renders over the 15 s scenario (`TESTING.md` §9, measured with `window.__gdgRenders` on the local stack); e2e intermission assertions (`host-intermission`, `data-step`, `host-total-board` names, `stc-strip` count, `host-next-intro`, `host-skip`) green.

### WP5 Results podium and day boards — **opus**

Owns: `src/host/Results.tsx`, `src/host/Results.test.tsx`, new `src/host/results.module.css`.
Build: §4.5 podium (winner block, ranks 2–3 lines, hero count-up, the single celebrate), the session table via `<BoardTable columns=…>` (WP3) with visible round heads, §4.6 horizontal tabs with the 8 s underline, rule-only highlight rows, the crossfade on tab change, the merge wiring unchanged (`DayBoardMerge`, stage = board area, tiles target `[data-highlight="true"]`, once per tap, reload skips it).
Acceptance: `Results.test.tsx` green (all existing cases: merge once, reduced motion crossfade, reload skips, slow data, logo never covered, reduce-motion toggle) plus new cases: the celebrate plays once per H4 mount and not on a poll refresh; the hero count-up ends on the winner's formatted total; screenshots `host.results/-1/-empty`, `host.dayboard/-empty`, `host.merge`, `host.merge-staged` (mid-merge frame at ~5 s) at the three sizes, EN + AR, light + dark; H4/H5 idle = 0 commits over 15 s; e2e results/day-board assertions (`host-winner` contains the name and `fmt(best)`, `host-session-board` names, `board-round-score` regex, `dayboard-tab-*`, `host-new-session`) green.

### WP6 QA, consistency and docs sync — **sonnet**, last

Owns: `docs/SCREENS.md` §2, `docs/PROGRESS.md`, `docs/TESTING.md` §9 (re-measured numbers) and §6 (projector checklist additions from §8), `docs/EVENT_RUNBOOK.md` (dark-screen setting note), scratch screenshot script; may open small fix-up edits in any host file **only after WP2–WP5 have merged**, one commit per fix, naming the package it corrects.
Do: run the full screenshot matrix (every `host.*` fixture × 1906×880 / 1920×1080 / 1280×720 / 1280×960 × EN/AR × light/dark) and review each against §4 (hierarchy, one accent, no boxes, no overflow, no clipped Cairo ascenders, rail height, RTL mirroring, numbers LTR); run `npm run typecheck && npm run lint && npm run test && npm run contrast && npm run check:i18n && npm run build`, `npm run e2e` on the local stack, the render-budget scenarios (`TESTING.md` §9) and record the new numbers; grep `dist/` for `__gdgRenders` (must be absent); confirm no raw colours/sizes/durations in the four host CSS modules (`rg -n "#[0-9a-f]{3,6}|[0-9]+px|[0-9]+ms" src/host/*.css` returns only token definitions' comments); update SCREENS §2 wireframes and string lists to match the built screens; write the PROGRESS session note.
Acceptance: all commands green; the screenshot set attached to the PR; a checklist in the PR body mapping D1–D12 (§1) to the screenshot that shows each one resolved.

Suggested order: WP1 (day 1 morning) → WP2, WP3, WP4, WP5 in parallel (days 1–3; WP2 and WP4/WP5 integrate WP3's `BoardTable` when it lands, keeping the old one until then) → WP6 (day 4).

## 7. Decisions and strings to add

### 7.1 ADR-135 (WP1 appends this to `DECISIONS.md` §B)

> ### ADR-135 Host v3 visual direction: "Stage and Rail"
> **Proposed** · requested in chat 2026-09-25 (the v2 big screen still looked childish; plan in `docs/plans/host-v3.md`)
> Context: v2 (ADR-131) removed the loud first pass but kept a form-and-dashboard register on the projector: panels and chips, a grey operator band, spreadsheet boards, small hero moments, blue with five meanings, shard effects on every row. Decision: the **host screens only** (H0–H6) follow the v3 direction; ADR-131 stays in force for phones and the dashboard, and its host parts are superseded. (1) Layout = brand strip · chrome-free **stage** · a 7 vh unfilled **rail** for every host control (12 vh on H1 for the lineup tray); no control on the stage, no content on the rail. (2) One hero per screen on a modular projector type scale (`--proj-t1…t7`, `--proj-code` 30 vh): the code, the board, the winner's total (20 vh). (3) No panels or chips on the stage; hairlines, tints and type only; boards are fixed 10-slot tables with visually hidden column heads. (4) Colour roles: ink = content and actions (primary actions are ink-filled `--action` buttons); **blue = live** (presence, current round, active tab, progress, pulses); **amber = rank 1** (row tint; the winner's total gets an amber rule, never amber text). (5) Motion: entries 240 ms, FLIP reorders 400 ms with a 500 ms pulse, count-ups 1.2/1.6 s, step crossfades 300 ms, no overshoot easing; the mosaic shatter fires only on major screen transitions, the H4 winner reveal and the day-board merge — never on joining names, board rows or a new #1 during a round. (6) The lineup picker is a two-line tray that wraps and scales to 10 games. (7) H1 bilingual labels are one muted second line per block, not inline per step. (8) A "Dark screen" toggle in Settings applies the existing dark tokens (ADR-122 default stays light; compared at the dry run). Consequences: visual-only; flows, timings (ADR-117/129), test ids and e2e texts are unchanged; `DESIGN_SYSTEM.md` §0 is replaced for the host; brand approval (OQ-07) still applies; `useRevealRows` is no longer used by the host.

### 7.2 New strings (WP1: `COPY.md` §6 + both JSON files)

| Key | English | العربية | Where |
|---|---|---|---|
| `host.signin.hint` | Sign in before connecting the projector. | سجّل الدخول قبل توصيل جهاز العرض. | H0 |
| `host.board.delta` | {n} places | {n} مراكز (plural: one/two/few/many/other) | H3 total step, `aria-label` of the delta glyph |
| `host.dayboard.next_in` | Next board in {s} s | اللوحة التالية خلال {s} ث | H5, `aria-label` of the tab underline progress |

Everything else reuses existing keys (`results.eyebrow` "Session complete" is reused on H4; `host.settings.theme` "Dark screen" already exists). No existing string changes, so every e2e text stays.

## 8. Risks and what needs a real projector check

| Risk | Mitigation / check |
|---|---|
| **Projector contrast and crop.** Hairlines (`--line` ink 15 %, `--slot-line` ink 8 %) and `--live-tint` pulses may vanish on a washed-out projector; 5 vh safe margins may still crop the rail. | Dry-run checklist (WP6 adds to `TESTING.md` §6): view H1, H2 with 3 scores, H3 total, H4, H5 from 6 m; hairlines and slot rules must be visible, the rail fully on screen; if not, raise `--slot-line` to 12 % and `--line` to 20 % (token change only). Compare light vs "Dark screen" on the real projector and record the choice (ADR-122). |
| **Bright hall legibility of muted text** (`--text-muted` 5.86:1). | Same check; fallback token `--text-muted` → ink 70 %. |
| **Cairo ascenders in 6.6 vh slots** (Arabic names at t3 with 1.4 leading = 7 vh > slot). | Row text uses `--proj-row-leading` 1.1 with `overflow: visible` on the block axis; WP3 verifies with «عبدالرحمن سا» and a name with «لإ» in the fixture; AR screenshots at all sizes in WP6. |
| **10-game pool width** on the H1 rail at 1280 wide or in Arabic + English mixed names. | Wrapping tray (§5); fixture `host.lobby-10-games` at 1280×720 in WP2's acceptance. |
| **FLIP across the round → total step** needs one mounted `BoardTable` with stable `playerRowId` keys; the boards come from two different queries. | WP4 keeps one instance and swaps `rows`; `mergeBoard` keys are `playerRowId` in both; if a player is missing from one board the row simply enters/leaves (no FLIP). |
| **Count-ups vs e2e timing**: assertions read `board-score` while a count-up runs. | Playwright's `toHaveText` retries up to 10 s; count-ups end ≤ 1.6 s + stagger ≤ 0.6 s. The winner `toContainText(fmt(best))` likewise. |
| **Render budget**: count-ups, pulses and the tab progress must not add commits. | All via rAF/WAAPI on refs (contracts in §6); WP6 re-measures §9. |
| **Merge coupling**: `DayBoardMerge` reads `tbody tr` sources and `[data-highlight]` targets; the 10-slot board adds empty `tr.slot` rows. | Empty slots carry `data-slot="empty"` and WP5 filters sources to `tr:not([data-slot])`; `host.merge`/`host.merge-staged` fixtures + `Results.test.tsx` guard it. |
| **Shatter policy change** (no shards on names/rows) removes visible feedback the team may have liked. | The pulse + cascade replaces it; the three remaining shatter moments are listed in ADR-135; revert is a one-line change per site. |
| **Brand approval (OQ-07)**: ink-filled buttons and the amber rule are new brand usages. | Screenshots to the chapter lead with the PR; both are token-level and reversible. |
| **Laptop window vs projector** (1906×880 has 28 px per vh vs 35 px): everything scales, but the QR at 24 vh is 211 px in the window — still scannable at booth distance? | QR check at 1080p projection from 2 m with three phones at the dry run; if marginal, `--proj-qr` 28 vh (token only; the join block has room). |

## 9. E2E-sensitive ids and texts (must stay exactly)

From `rg getByTestId e2e/*.ts` and the text assertions there (2026-09-25):

- Host ids: `host-root` (+ `data-screen` = lobby/round/intermission/results/dayboard, following the shown screen), `host-signin`, `signin-email`, `signin-password`, `signin-submit`, `signin-error`, `logo`, `host-lobby`, `host-code`, `host-qr`, `host-player-count`, `host-players`, `host-player` (+ `data-name`, `data-presence`, `data-online`), `host-remove`, `host-lineup`, `lineup-picker` (+ `data-valid`, `data-synced`), `lineup-<game>` (+ `aria-pressed`; picked text starts with the ordinal), `host-start`, `host-settings`, `host-reduced-motion`, `host-round` (+ `data-round`, `data-game`), `host-round-title`, `host-time-left`, `host-finished`, `host-round-board`, `host-end-round`, `host-corner` (+ `data-count`), `host-corner-code`, `host-next-games`, `next-games-dialog`, `next-lineup-picker`, `next-lineup-<game>`, `next-games-done`, `host-intermission` (+ `data-step`, `data-round`), `host-intermission-title`, `host-total-board`, `host-skip`, `host-next-intro` (+ `data-game`), `stc-reveal`, `stc-strip` (+ `data-target`), `stc-dot`, `stc-dot-label`, `host-results`, `host-winner`, `host-session-board`, `host-no-scores`, `host-show-day-board`, `host-new-session`, `host-dayboard` (+ `data-game`), `host-dayboard-tabs`, `dayboard-tab-<game>`, `host-day-board`, `host-merge-stage`, `board-row` (+ `data-highlight`, `data-own`), `board-name`, `board-score`, `board-round-score` (+ `data-game`), `confirm-dialog`, `confirm-yes`, `host-banner`.
- Exact texts: `host-player-count` "4 players"; `host-finished` "0/3 finished" / "1/2 finished" / "0/1 finished"; `host-round-title` "Round 1 of 3 · Stop the Clock"; confirm dialog contains "End this round now?"; `host-winner` contains the winner name and the formatted total; `host-code` / `host-corner-code` = the 4-digit code; board names via `board-name` exact match and `board-score` exact formatted score; `board-round-score` matches `/^[\d,]+$/`.

## 10. WP6 PR checklist: D1–D12 resolved

Screenshots from the WP6 screenshot matrix (`/__preview?f=host.*`, every fixture × 1920×1080 / 1906×880 / 1536×730 / 1280×720 × EN/AR × light/dark; scratch folder, not committed — attach the ones below to the PR). Each diagnosis from §1 maps to the fixture that shows it resolved:

| # | Diagnosis (§1) | Resolved in | Screenshot |
|---|---|---|---|
| D1 | No hero: the code was 216 px against a 380 px QR | H1: the code is the one 30 vh hero, the QR at 24 vh | `lobby-3-1920x1080-en(.png)`, `lobby-empty-1906x880-ar` |
| D2 | Panels and boxes everywhere | No panels on the stage anywhere; hairlines and tints only | `lobby-30-1920x1080-en`, `round-next-games-1906x880-en` |
| D3 | Grey admin band, 15 % of the projection | 7 vh unfilled rail (12 vh on H1), no fill, a hairline top border | every fixture; compare `lobby-3-1280x720-en` (narrowest) |
| D4 | Spreadsheet boards, visible headers, 25 % empty below | `BoardTable slots=10`, headers visually hidden, ten fixed rows always fill the stage | `round-1920x1080-en`, `intermission-board-1920x1080-en` |
| D5 | Undersized moments: "Next" at 76 px, winner at 7 vh | "Next: <game>" at 10 vh, H4 winner total at 20 vh (the screen's hero) | `intermission-next-1920x1080-en`, `results-1-1920x1080-en` |
| D6 | Blue as "link colour" for five different things | Blue = live only (presence, current round, tab underline, progress); actions are ink-filled | `round-1920x1080-en`, `dayboard-1920x1080-en` |
| D7 | Bilingual doubling on every label | One muted second line on H1 only, once per block | `lobby-3-1920x1080-en` vs `lobby-3-1920x1080-ar` |
| D8 | Mixed-size stats stack | Time left is one scorebug leaf (14 vh number, muted unit), finished is a thin progress bar | `round-3-1920x1080-en` |
| D9 | STC reveal: translucent dots, colliding labels | Solid dots with a 1 px paper edge, labelled lanes above/below that never cross | `intermission-stc-1920x1080-en`, `intermission-stc-1920x1080-ar` |
| D10 | Day boards: two competing tints, empty tab column | One amber tint (#1 only); rows from this session get a rule, not a tint; horizontal tabs | `dayboard-1920x1080-en` |
| D11 | Shatter on every joining name/row/step (20–40× a session) | Two shatter moments left on the host: the screen transition and the H4 celebrate. **Updated 2026-09-25 (user feedback): the day-board merge, the third moment this plan named, is also removed** — Show day board is one 300 ms crossfade, and every board's rows now render together in one frame (`--stagger-row: 0`) instead of cascading in | `results-1-1920x1080-en` (cascade removed), `dayboard-1920x1080-en` (no merge) |
| D12 | Sign-in: a floating 400 px card, template-looking | No card: one centred column, logo, title, fields, full-width ink submit | `signin-1920x1080-en` |

Also checked and green in this pass: no horizontal/vertical page overflow at any of the four sizes (DOM `scrollWidth`/`scrollHeight` vs `innerWidth`/`innerHeight`); nothing renders under the rail (`data-testid` bounding boxes vs the rail's); no visibly clipped Cairo text; `npm run typecheck/lint/test/check:i18n/check:trivia/contrast/build`, `supabase migration up --local`, `supabase test db` and `npm run e2e` all green; render budget on fixtures (`window.__gdgRenders`): `host.lobby-3` and `host.results-1` idle 30 s → 0 commits; `host.dayboard` 30 s → 3 commits (rotation only).
