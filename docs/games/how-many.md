# Game: How Many?

Purpose: the complete spec for How Many?: rules, field layout, flow, timings, difficulty curve, scoring with worked examples, rejection bounds, UI states, theming, accessibility, edge cases and test cases. Shared rules are in `SCORING.md`; if they disagree, `SCORING.md` wins.

Last updated: 2026-09-26

Game id: `how_many` · One-line pitch (COPY `game.how_many.pitch`): "A flash of chevrons. How many did you see?"

Related: ADR-137 (2) (the fixed step schedule, §3/§9), ADR-136 (this game, the reveal and the "true counts only on the big screen" rule), ADR-018 (reload), ADR-025 (the Stop the Clock reveal it extends), `docs/plans/games-v3.md` §1 and §5, `docs/games/newgames.md` (the brief).

---

## 1. Rules

- Three **flashes** with rising counts. Each flash shows a field of brand chevrons (random rotation, blue/amber mix, never overlapping) for exactly **1.0 s**, then hides it.
- The player types how many they saw on an on-screen number pad and taps OK, within **10 s** per flash.
- No feedback on the phone until the end of the round, and **the true counts are never shown on the phone** (everyone in the room shares them). The big screen reveals everyone's guesses against the true counts (§6, `SCREENS.md` H3).
- Each answer has its own 10 s timeout; typed digits at the timeout count as the guess, nothing typed = no answer.

## 2. Field and difficulty curve

- Flash `i` draws `N_i` uniformly from its band, **excluding multiples of 10** (round numbers read as placeholders): 8–15 → {8, 9, 11, 12, 13, 14, 15}; 20–35 minus {20, 30}; 40–70 minus {40, 50, 60, 70}.
- The field is a square split into a fixed `g_i × g_i` cell grid, `g = [5, 7, 10]` (25 / 49 / 100 cells ≥ the band maxima 15 / 35 / 70). The grid is fixed per flash, so cell size never hints at `N`.
- `N_i` distinct cells are chosen; each gets one chevron (the Odd One Out glyph, `src/games/odd-one-out/Chevron.tsx`) at **70 %** of the cell, its centre jittered by up to **±15 %** of the cell per axis, rotated 0–359°, blue or amber 50/50. Because 0.7 + 2 × 0.15 = 1.0, a glyph never leaves its cell: chevrons never overlap and never leave the field, whatever the rotation (the glyph's ink stays within 49 % of its box from the centre).
- Seeding: `Rng("<round seed>:hm:round<i>")` (`src/games/how-many/field.ts`, `fieldFor(seed, i)`, pure and memoised) draws, in this order, `N_i`, the cells (`sampleWithoutReplacement`), then per chevron jitter-x, jitter-y, rotation and colour. Everyone in a round sees the same three fields; a reload computes the same ones again.
- Difficulty: counts rise 8–15 → 20–35 → 40–70 while the flash stays 1 s. Flash 1 is near-subitizing (groups of 3–4), flash 2 is estimation, flash 3 is estimation with the known log-compressed underestimate. The tolerance band widens with the flash (`W` below), so a good estimator scores similarly on all three (Weber's law).
- On a 360 px phone the flash-3 glyph is ≈ 23 px: small but distinct (HM-T13 checks it on devices).

## 3. Flow and timings

```mermaid
stateDiagram-v2
    [*] --> intro: round starts (3-2-1 done)
    intro --> look_i: 1.5 s
    look_i --> flash_i: 1.0 s ("Look", empty field frame, fixation dot)
    flash_i --> answer_i: 1.0 s (field hidden in one frame)
    answer_i --> locked_i: OK tapped
    answer_i --> locked_i: 10 s timeout (typed digits count; nothing typed = no answer)
    locked_i --> look_i+1: 0.5 s ("Locked in")
    locked_3 --> done
    done --> [*]: submit
```

| Step | Duration |
|---|---|
| Intro card | 1.5 s |
| `look` (fixation dot, field frame drawn, empty) | 1.0 s |
| `flash` | 1.0 s |
| `answer` | until OK, 10 s timeout |
| `locked` | 0.5 s |
| Worst case total | 1.5 + 3 × (1 + 1 + 10 + 0.5) = **39 s** → `worstCaseMs = 40 000` (inside the 120 s cap) |

- **Fixed schedule** (ADR-137 (2)). The game clock is anchored on `roundStartEpoch` and on the player's own OK taps; every step boundary comes from stored epochs, never from the moment a timer happened to fire:
  - look 1 starts at `roundStartEpoch + 1500`;
  - the flash window is `lookStartEpoch + 1000 … + 2000`; `answerStartEpoch` is the end of the flash (`flashStartEpoch + 1000`, or `lookStartEpoch + 2000` when the flash was skipped);
  - an answer ends at the OK tap, or at `answerStartEpoch + 10 000` on a timeout; `lockedEndEpoch` = that end + 500;
  - look `i+1` starts at `lockedEndEpoch_i`.

  One scheduler applies what is due as a **catch-up loop**: after a reload, a screen lock, a JS freeze or a hidden page whose timers were throttled, every step whose epoch has passed is closed at once with its own rule (a passed flash window is skipped, a passed answer times out with whatever is typed, `null` on a fresh look), and the chain continues from the stored epochs. A phone that comes back late is therefore on whatever step the schedule says, and an idle round always ends at `roundStartEpoch + 39 s` (plus the time to come back, if the phone was frozen past it). **A hidden page never pauses the schedule**: flashes that end while the page is hidden are skipped and their answers time out on schedule (team decision 2026-09-26). The loop runs on each timer, on `visibilitychange` and `pageshow` (back-forward cache), and once at mount before the first paint.
- **The flash is one frame.** The whole field mounts in one commit with all `N_i` chevrons (no per-chevron transition, no fade-in) and nothing in it changes until it unmounts. The `flash` phase is persisted at that commit; `flashStartEpoch` is written by the effect after the paint. Until it is written, the flash is due at the window's end (`lookStartEpoch + 2000`), so it always has a deadline; a paint that lands more than 250 ms after the look's end (the page froze between the commit and the paint) records `flashStartEpoch = lookStartEpoch + 1000`, so the field only stays until the window's end and is hidden at once if that has passed — it never gets a new second after an unlock. The field is **unmounted** at `flashStartEpoch + 1000` (a timer, plus the `visibilitychange` / `pageshow` fallback). Nothing else on the screen changes during the flash: the eyebrow and the "Look" caption stay, only the frame's contents swap from the fixation dot to the chevrons.
- A look whose end is processed more than **250 ms** late (a locked screen, a throttled tab, the catch-up) or while the page is hidden skips the flash, exactly as a reload does (§9): the flash window belongs to the fixed schedule, so a late flash would stretch the round past its worst case.
- `answer_ms` = `performance.now()` at the OK `pointerdown` minus the moment the pad appeared (after a reload: the epoch, measured from the earlier of the answer anchor and the moment the pad appeared on this page load), capped at 10 000. An OK within **300 ms** of the pad appearing is ignored (two taps take longer; the server rejects faster answers, §5). Keys are `pointerdown` with a 60 ms bounce guard.
- Round ended early (`roundEnded`): finish at once. The open flash (look, flash or answer) counts as timed out with whatever is typed; flashes not started count as `guess: null, timed_out: true`. `true_count` always comes from the seed.

## 4. Scoring

For flash `i` with true count `N_i` and guess `g_i` (null → `s_i = 0`):

- `rel_i = |g_i − N_i| / N_i`
- `s_i = clamp(1 − max(0, rel_i − D) / (W_i − D), 0, 1)` with **`D = 0.05`** (dead zone: within 5 % = full marks) and **`W = [0.30, 0.40, 0.50]`** (30 / 40 / 50 % off = 0).
- **`score = clamp(round(1000 × (s_1 + s_2 + s_3) / 3), 0, 1000)`**.

Calibration (`SCORING.md` §3.8 has the assumptions): adult numerosity Weber fractions cluster at 15–25 %; a **strong** booth player is ≈ 8 % off on flash 1, ≈ 11 % on flash 2, ≈ 16 % on flash 3 (bias included) → ≈ 815. Typical ≈ 17 / 19 / 24 % → ≈ 580. **1000** needs all three inside 5 %: exact on flash 1, ±1 on flash 2, ±2–3 on flash 3, from a 1 s flash of 40–70 items; treated as out of reach without luck.

Worked examples (`N = [12, 27, 55]`):

| Player | Guesses | `rel` | `s` | Score |
|---|---|---|---|---|
| A (strong) | 11, 24, 46 | 0.0833, 0.1111, 0.1636 | 0.8667, 0.8254, 0.7475 | round(813.18) = **813** |
| B (typical) | 10, 22, 42 | 0.1667, 0.1852, 0.2364 | 0.5333, 0.6138, 0.5859 | round(577.7) = **578** |
| C (weak) | 9, 18, 30 | 0.25, 0.3333, 0.4545 | 0.2, 0.1905, 0.1010 | round(163.8) = **164** |
| D (idle) | null ×3 | – | 0, 0, 0 | **0** |
| E (one timeout) | 12, null, 50 | 0, –, 0.0909 | 1, 0, 0.9091 | round(636.4) = **636** |
| F (near-perfect) | 12, 27, 53 | 0, 0, 0.0364 | 1, 1, 1 | **1000** |

## 5. Submission and rejection bounds

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "how_many raw",
  "type": "object",
  "required": ["rounds"],
  "additionalProperties": false,
  "properties": {
    "rounds": {
      "type": "array", "minItems": 3, "maxItems": 3,
      "items": {
        "type": "object",
        "required": ["true_count", "guess", "answer_ms", "timed_out"],
        "additionalProperties": false,
        "properties": {
          "true_count": { "type": "integer", "minimum": 8, "maximum": 70 },
          "guess":      { "type": ["integer", "null"], "minimum": 0, "maximum": 999 },
          "answer_ms":  { "type": ["integer", "null"], "minimum": 0, "maximum": 10000 },
          "timed_out":  { "type": "boolean" }
        }
      }
    }
  }
}
```

`answer_ms` is null iff `timed_out`. `guess` may be non-null when timed out (auto-submitted digits); `guess` null ⇒ `timed_out`. The rounds are in flash order; the big-screen reveal reads `rounds[i].true_count` and `rounds[i].guess`.

Database bounds (`SCORING.md` §4, in check order):

| Code | Check |
|---|---|
| `hm.shape` | object; `rounds` an array of exactly 3 objects; `true_count` int, `guess` int or null, `answer_ms` int or null (keys present), `timed_out` bool |
| `hm.range` | `true_count` in the flash's band: 8–15, 20–35, 40–70; `guess` 0–999; `answer_ms` 0–10000 |
| `hm.timeout` | `answer_ms` null iff `timed_out`; `guess` null ⇒ `timed_out` |
| `hm.too_fast` | not timed out ⇒ `answer_ms ≥ 300` |
| `hm.too_perfect` | not all three guesses equal their true counts |
| `hm.formula_band` | `score ≤ round(1000 × Σ s_i / 3) + 1`, `s_i` computed in `numeric` as §4 (0 for a null guess); upper side only |

Why: an answer needs two taps (a digit and OK) after the pad appears, which takes at least 300 ms; three exact counts from 1 s flashes happen to about 1 in 1000 honest players (the target is a script that reads the seed); under-reporting only hurts the sender, so the band has no lower side. `validateHowManyRaw` in `scoring.ts` mirrors these checks for tests.

## 6. UI states (phone, P6)

| State | Shows | Input |
|---|---|---|
| `intro` | Eyebrow `game.how_many.intro`, title `game.how_many.name`, pitch | none |
| `look` | Eyebrow `game.how_many.round` ("Flash n of 3"); the empty field frame (1 px `--line` border, `--surface`) with a small ink fixation dot; caption `game.how_many.look` | none |
| `flash` | The same, with all chevrons in the frame instead of the dot (one frame); no other change | none |
| `answer` | Countdown bar + seconds (10 → 0, amber under 3 s); eyebrow; `game.how_many.question`; the typed number as the hero (or a muted `–`); the pad | pad keys |
| `locked` | `game.how_many.locked`, or `game.how_many.timeout` after a timeout; pad hidden | none |
| `done` | `game.how_many.done` (the shell then shows P7) | none |

Number pad: 3 × 4 grid (1–9, backspace, 0, OK), full width, each key ≥ 56 px tall (`--touch-target-min` + `--s-2`); max 3 digits (digit keys disable at 3); OK and backspace disabled while empty; backspace deletes the last digit. Only digits can be entered: there is no text input, so the keyboard and Arabic-Indic digits never come into it.

P7 breakdown (`SCREENS.md` P7): one row per flash, label `game.how_many.result_round`, value `game.how_many.result_guess` or `game.how_many.result_missed`. **No true counts on the phone** (P7 is visible while others still play); the big screen reveals them.

Big screen (H3, ADR-136): after the round, the reveal shows three strips (one per flash) with the true count at the centre, every player's guess as a dot on a ±50 % relative-error axis and a crowd-average marker (`docs/plans/games-v3.md` §5, `src/host/HowManyReveal.tsx`).

## 7. Theming

- Chevrons: the Odd One Out glyph in `--gdg-blue` / `--gdg-amber` strokes on `--surface`; the field frame `--line`; the fixation dot `--text`.
- The pad: secondary buttons (`--surface`, 1 px `--line-strong`, `--r-control`), digits at `--type-heading-size`; OK = the primary action (`--action`). The typed digits are tabular at `--type-score-size` / `--type-score-weight`: the one hero.
- Countdown bar as in Trivia and Color Clash.
- **Colour carries no information**: blue/amber only break up the field; a colour-blind or monochrome viewer plays exactly the same game. No second cue is needed.

## 8. Accessibility

- Pad keys ≥ 56 px tall and a third of the width each, labelled with their digits; backspace has `aria-label` `game.how_many.backspace`; the typed number is a polite live region. `touch-action: manipulation` on the keys and the field, so a double tap never zooms.
- A 1 s flash cannot be made screen-reader accessible; documented gap, like Perfect Circle.
- Reduced motion: nothing animates anyway (the flash is one frame); the countdown bar steps once per second.
- Direction: the field and the pad are game geometry and keep `direction: ltr` in Arabic (1-2-3 rows as on a phone dialler); the labels follow the page language. Digits are Western in both languages (ADR-123).

## 9. Edge cases

| Case | Behaviour |
|---|---|
| Reload during `look` | Resume `look` until `lookStartEpoch + 1000`; if that has passed, the flash window (`lookStartEpoch + 1000 … + 2000`) has started or passed: **never show the field again**; go to `answer` with `answerStartEpoch = lookStartEpoch + 2000` (the 10 s timeout counts from there). |
| Reload during `flash` | Same rule: the flash happened; straight to `answer` with the deadline `flashStartEpoch + 1000 + 10000`. |
| Reload during `answer` | Same flash, typed digits restored from the snapshot, deadline unchanged. |
| Reload during the intro | Look 1 still starts at `roundStartEpoch + 1500` (the intro is never replayed from the reload); if that has passed, the look/flash rules apply from that epoch (a passed window skips the flash, a passed answer times out). |
| Reload during `locked` | "Locked in" ends at its stored `lockedEndEpoch`, then the next look (or the finish). |
| Reload during `locked` after `lockedEndEpoch` | The next look counts from `lockedEndEpoch`, not from the reload; a passed flash window skips the flash and the answer runs from `lockedEndEpoch + 2000`. |
| Screen lock during the flash | The timer fires late; on return the field is hidden at once (the `visibilitychange` / `pageshow` handler) and `answer` runs with what the schedule leaves of its 10 s. A freeze between the flash's commit and its paint never shows the field for a new second (§3). |
| Screen lock during the look | The late look skips the flash (§3); `answer` runs from `lookStartEpoch + 2000`, on the schedule. |
| Long screen lock / JS freeze | On return every step whose epoch passed is closed with its rule, in order (answers time out with whatever was typed, later looks skip their flash); the player lands on the step the schedule is on. Flashes missed while locked are timed out, never replayed; the round ends by its worst case (or at once, if the lock outlasted it). |
| Page hidden but timers running (background tab, covered or minimised window, an app switch before the browser freezes the page) | The same schedule keeps running: flashes that end while hidden are skipped, their answers time out on schedule, and a returning player is on whatever step the schedule says. The round never pauses and never runs past 39 s. |
| Timeout with digits typed | The typed number is the guess, `timed_out = true`, `answer_ms = null`. |
| Round ended early | Finish now: open flash = timed out with typed digits; unstarted flashes null. |
| Rotation | The shell's portrait overlay covers the game; clocks keep running (E16). |
| Tap during `look` / `flash` / `locked` | Ignored (no pad is shown). |
| Multi-touch / bounce | Only the first `pointerdown` per 60 ms counts. |
| OK within 300 ms of the pad | Ignored. |
| Leading zeros | `007` → 7 (the display shows the digits as typed). |
| Language toggle | Hidden during rounds (E17). |

Snapshot (epochs only, persisted with `onProgress` after every start — including the flash's commit and its start epoch — every key and every answer): `{ phase, roundIndex, lookStartEpoch, flashStartEpoch, answerStartEpoch, lockedEndEpoch, typed, rounds }`.

## 10. Test cases

| # | Input | Expected |
|---|---|---|
| HM-T1 | Example A | 813 |
| HM-T2 | Example B | 578 |
| HM-T3 | Example E (one null) | 636 |
| HM-T4 | Example F | 1000; Example D → 0 |
| HM-T5 | Same seed | same `N_i`, cells, rotations, colours; `N_i` in band and never a multiple of 10; no two chevrons share a cell (`field.test.ts`) |
| HM-T6 | 200 seeds × 3 flashes | every glyph inside the field, pairwise centre distance ≥ 0.7 cell (no overlap) (`field.test.ts`) |
| HM-T7 | `answer_ms` 299 on a non-timed-out flash | `GD008 hm.too_fast`; 300 accepted (`10_score_bounds_how_many.sql`) |
| HM-T8 | Guesses = true counts ×3 | `GD008 hm.too_perfect`; two exact + one off accepted |
| HM-T9 | Example A with score 815 | `GD008 hm.formula_band`; 814 and 700 accepted |
| HM-T10 | `true_count` 16 in flash 1 | `GD008 hm.range`; `guess` null with `timed_out` false → `hm.timeout` |
| HM-T11 | Reload during `flash` (snapshot with `flashStartEpoch` 400 ms ago) | field not rendered; `answer` shown; deadline = `flashStartEpoch + 11000` (`HowMany.test.tsx`) |
| HM-T12 | Idle player | three nulls, score 0, finished by 40 s (`HowMany.test.tsx`, `worstCase.test.tsx`) |
| HM-T13 | Real devices | flash-3 chevrons legible at 360 px; pad keys ≥ 56 px; no zoom on double-tap |
| HM-T14 | Playtest, 5 strong players | median 780–900, nobody 1000 → else retune `D` / `W` (ADR-136) |
| HM-T15 | Reload during the intro (mount at `roundStart + 3.4 s`, no snapshot); and at `roundStart + 1.0 s` | first `lookStartEpoch = roundStart + 1500`; the flash is skipped, the pad shows with the deadline `roundStart + 13 500`; idle finish at 39 s. Early reload: look 1 still at `+1500` (`HowMany.test.tsx`) |
| HM-T16 | Screen lock: answer 1 open at 4 s, clock jumps to 40 s with no timer firing, then `visibilitychange`; and a jump to 20 s | finish at once, flashes 2–3 `guess: null, timed_out: true`, `durationMs ≤ 40 100`. 20 s: on answer 2 from `+16 000` with 6 s left, looks at 1.5 / 14 / 26.5 s (`HowMany.test.tsx`) |
| HM-T17 | Reload in `locked` 3 s after `lockedEndEpoch`; OK tap at `answerStart + 2 s` | next `lookStartEpoch = lockedEndEpoch`, `answer` from `lockedEndEpoch + 2000`; after the tap `lockedEndEpoch = tap + 500` and the next look starts there (`HowMany.test.tsx`) |
| HM-T18 | `document.visibilityState = 'hidden'` from the intro, timers firing | `hm-field` never renders; answers from 3.5 / 16 / 28.5 s time out on schedule; finish at `roundStart + 39 000` (`HowMany.test.tsx`) |
| HM-T19 | `flash` with `flashStartEpoch` null; a 5 s freeze between the flash's commit and its paint | due at `lookStartEpoch + 2000` (`dueEpoch`); after the freeze the field is gone and the answer runs from `lookStartEpoch + 2000` with 6 s left (`HowMany.test.tsx`) |

`HowMany.test.tsx` also asserts the one-frame flash: the chevron count on the first frame equals `N_i`, and no chevron node changes between mount and unmount.
