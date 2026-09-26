---
paths:
  - "src/games/**"
  - "docs/games/**"
  - "docs/SCORING.md"
---

# Game code rules

Loaded when working on a game. The spec for each game is `docs/games/<game>.md`; shared numbers are in `docs/SCORING.md` (it wins on conflict).

## Scoring contract
- A round yields one integer 0–1000, computed on the phone. `Math.round` once at the end, then clamp.
- The scoring function is pure (`raw → score`), in `scoring.ts`, with no DOM, time or randomness, and a unit test for every worked example and test case in the game doc, using the same numbers.
- The submitted `raw` must match the game doc's JSON Schema exactly (field names, ms integers, `null` rules).
- Never weaken a server bound in `SCORING.md` §4 without test evidence and a new ADR.

## Timing
- Measure with `performance.now()` on `pointerdown`, not `click`. A duration that spans a game clock (e.g. Pairs' `clear_ms`) uses `Date.now()` epochs, the same clock as the game's end, because `performance.now()` stops while a phone sleeps (ADR-137 (3)).
- Persist attempt/round start times as epoch ms (`Date.now()`) through the shell's progress callback after every start and every attempt, so a reload resumes and never resets a clock (ADR-018).
- Every attempt has its documented timeout; the game must also finish immediately with its timeout rule when the shell signals "round ended".
- Anchor every step on stored epochs (`roundStartEpoch` + intro, the previous step's end), never on when a timer happened to fire; on `visibilitychange`/`pageshow` close every step whose epoch passed (ADR-137).
- Never exceed the documented worst-case duration (SCORING §2); the round cap is 120 s.
- All randomness (layouts, sequences, draws, option shuffles) comes from `GameProps.seed`: the round id, shared by every phone in the round (`seedScope: 'round'`, the default). Only Trivia sets `seedScope: 'player'` for its per-player draw and shuffle (ADR-027, ADR-137 (1)).

## Per-game theming (only design tokens)
- Odd One Out: brand chevron SVG (not the logo); blue tiles; amber for grid 1's odd tile and "found" rings.
- Stop the Clock: nothing on screen may change while the hidden timer runs (no animation, number, sound, haptics, live region).
- Simon: the only place Google's four colours are allowed; pads differ by shape + position + flash outline.
- Perfect Circle: mosaic-texture stroke; score ring blue → amber.
- Trivia: amber = correct, ink = wrong (no red); countdown number + bar.
- Close the Brackets: brackets in the chevron stroke style; correct taps flash amber; a wrong tap is an ink shake (no red).
- Color Clash: colour is the game; only the three `--clash-*` inks, each button shows swatch + name; `npm run contrast` guards their colour-blind distance.
- Never animate or distort the logo; celebrations use the shatter layer (`src/effects/shatter`).

## Strings and accessibility
- No literal user-facing text: use `t('game.<game_id>.…')` keys from `docs/COPY.md` §5.
- Touch targets ≥ 48 px (Odd One Out 6 × 6 floor 44 px); honour reduced motion; follow each game doc's accessibility section.
