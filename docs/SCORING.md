# Scoring

Purpose: the one place that defines how every game turns play into a number: the shared 0–1000 contract, each game's formula, what happens on timeouts, the impossible-value bounds the database enforces, tie-breaking, session totals, day boards, and name normalisation for "best per name". The per-game docs in `docs/games/` repeat their own formula with worked examples; if they ever disagree with this file, this file wins and the game doc is fixed.

Last updated: 2026-09-26

Related: ADR-021, ADR-022, ADR-105, ADR-113, ADR-134, ADR-136.

---

## 1. The contract

1. Every round produces exactly one **integer from 0 to 1000**, computed **on the phone**.
2. The phone submits it once per round as `{round_id, player_id, score, duration_ms, raw, client_version}` (insert into `scores`). `raw` is the per-game evidence object in §4; `duration_ms` is the time from the end of the 3-2-1 countdown to the submit, capped at 120 000.
3. Rounding: compute in floating point, then `Math.round` once at the end (half away from zero for positives). Clamp to [0, 1000] after rounding.
4. The server **never recomputes** a score. It only refuses submissions outside the bounds in §4 (ADR-113).
5. A player who plays no part of a round has **no score row**, not a 0 (ADR-014). A player who starts and then times out on every attempt gets a real 0.
6. Higher is better for every game.

## 2. Round time budget

Every game fits inside the 120 s round cap even in the worst case.

| Game | Attempts | Per-attempt timeout | Worst-case round length (incl. transitions) |
|---|---|---|---|
| Odd One Out | 3 grids | 20 s per grid | 1.5 intro + 3 × 20 + 3 × 0.6 ≈ **64 s** |
| Stop the Clock | 3 guesses | 10 s to tap Start; auto-stop at target + 10 s | (10 + 15) + (10 + 20) + (10 + 17) + 2 × 1.5 ≈ **85 s** |
| Simon | sequences of length 3…15 | 5 s per tap | capped by the 120 s round cap (a perfect run to length 15 takes ~117 s) |
| Perfect Circle | 1 scored stroke (+ ≤ 3 invalid) | 30 s for the whole attempt; 10 s per stroke | 1.5 intro + 30 ≈ **32 s** |
| Trivia | 5 questions | 10 s per question | 1.5 intro + 5 × (10 + 1.5 feedback) ≈ **59 s** |
| Close the Brackets | sequences of length 2…8 inside a 30 s game clock | 10 s per sequence | 1.5 intro + 30 ≈ **32 s** (transitions run inside the 30 s) |
| Color Clash | trials inside a 30 s game clock | 3 s per trial | 1.5 intro + 30 ≈ **32 s** (the 0.3 s gaps run inside the 30 s) |
| How Many? | 3 flashes | 10 s per answer | 1.5 intro + 3 × (1 look + 1 flash + 10 + 0.5 locked) ≈ **39 s** (`worstCaseMs` 40 000); a fixed schedule from `roundStartEpoch`, so a lock or hidden page never extends it (ADR-137 (2)) |
| Swipe Sort | items inside a 30 s game clock | item window `I(t)` 900 → 450 ms | 1.5 intro + 30 ≈ **32 s** (the 0.15 s gaps run inside the 30 s); the clock starts at `roundStartEpoch` + 1.5 s whatever the mount time (ADR-137 (3)) |
| Pairs | one 4 × 4 board | 60 s game clock | 1.5 intro + 60 ≈ **62 s** (the 0.7 s mismatch locks run inside the 60 s); the clock starts at `roundStartEpoch` + 1.5 s whatever the mount time (ADR-137 (3)) |

## 3. Formulas

Symbols: `clamp(x, lo, hi)`, all times in milliseconds.

### 3.1 Odd One Out

- Per grid `i`: `t_i = min(20000, find_ms_i + 2000 × wrong_taps_i)`; a timed-out grid has `t_i = 20000`.
- `T = t_1 + t_2 + t_3`
- **`score = round(1000 × clamp((30000 − T) / 28500, 0, 1))`**
- Full marks at `T ≤ 1500`; zero at `T ≥ 30000`.

### 3.2 Stop the Clock

- Targets: `T_1 = 5000`, `T_2 = 10000`, `T_3 = 7000` (fixed, same for everyone).
- Per attempt: `e_i = min(10000, |measured_i − T_i|)`; a missed start (no tap on Start within 10 s) or an auto-stop has `e_i = 10000`.
- Per attempt share: `s_i = max(0, 1 − e_i / 2000)` (0 at 2 s off or more).
- **`score = round(1000 × (s_1 + s_2 + s_3) / 3)`** (ADR-132)
- When every attempt is within 2 s this equals `round(1000 × (1 − E / 6000))` with `E = e_1 + e_2 + e_3`; one bad attempt costs at most a third of the round.
- Examples: all within 2 s with total error 1.5 s → 750; 0.6 s → 900; 3 s → 500. Two attempts 200 ms off and one 6 s off → 600; one missed start, the others perfect → 667; all three 2 s off or more → 0.

### 3.3 Simon

- `L` = the length of the longest sequence reproduced correctly (0 if the first, length-3 sequence fails). Max 15; completing 15 ends the game as a win.
- `g` = mean input gap in ms over all taps of completed sequences (time from the end of a playback to the first tap, and between consecutive taps).
- Time bonus `B = round(40 × clamp((1200 − g) / 950, 0, 1))` when `L ≥ 3`, else `B = 0`.
- **`score = 64 × L + B`** (max 64 × 15 + 40 = 1000).
- The bonus (≤ 40) is always smaller than one level (64), so it only breaks ties between equal lengths.

### 3.4 Perfect Circle

- From one valid stroke (validity rules in `games/perfect-circle.md` §3): resample to 64 points at the midpoints of equal arc-length intervals over the first 360° swept (or the whole stroke if it swept less), centroid `c` = mean of the samples, radii `r_k = |p_k − c|`, mean `r̄`, population standard deviation `σ_r`.
- Roundness error `ε = σ_r / r̄`; roundness `R = clamp(1 − ε / 0.20, 0, 1)`.
- Closure `C = min(sweep_deg, 360) / 360` (a valid stroke sweeps ≥ 300°).
- **`score = round(1000 × R × C)`**
- No valid stroke before the attempt times out → `score = 0`.

### 3.5 Trivia

- Per question `q`: if correct, `points_q = 100 + 100 × remaining_ms_q / 10000`, where `remaining_ms_q = 10000 − answer_ms_q`; if wrong or timed out, `points_q = 0`.
- **`score = round(Σ points_q)`** over the 5 questions (max 5 × 200 = 1000).

### 3.6 Close the Brackets

- `n` = sequences solved. Lengths go 2, 3, …, 8, 8, … (+1 per solve, cap 8; a fail or timeout keeps the length), so the sum of solved lengths is **`S(n) = n(n + 3)/2` for `n ≤ 7`, `35 + 8(n − 7)` above** (S(7) = 35, S(9) = 51, S(11) = 67).
- `g = solve_ms / S` = mean ms per correct closer, reading included (`solve_ms` sums, over solved sequences, the time from the sequence appearing to its last correct tap).
- Speed bonus `B = 100 × clamp((900 − g) / 600, 0, 1)` when `n ≥ 1`, else 0.
- **`score = round(min(1000, 15 × S + B))`**; `n = 0` → 0.
- The bonus (≤ 100) is smaller than one length-8 sequence (120), so it mostly breaks ties.
- Calibration assumptions (ADR-134; re-check at the playtest, `TESTING.md` §4): a **strong** player reads a sequence in ≈ 350 ms + 60 ms per bracket, taps a closer every ≈ 340 ms and slips on ≈ 5 % of sequences → n ≈ 9, S = 51, g ≈ 460 → **≈ 840** (modelled p10–p90: 770–900). Typical (600 ms + 110 ms/bracket read, 520 ms/tap, 12 % slips) → S ≈ 27 → ≈ 430. **1000** needs `15 S + B ≥ 999.5`, i.e. S ≥ 60 at full bonus: 11 clean solves (S = 67) in 30 s, ≤ 380 ms per bracket including reading, which we treat as out of human reach; a scripted client is stopped by `cb.too_fast`.

### 3.7 Color Clash

- `c` correct, `w` wrong, `t` timed-out trials; `net = c − w − t`; `r̄ = mean_rt_ms`, the rounded mean reaction time over correct trials.
- Speed bonus `B = 75 × clamp((1000 − r̄) / 600, 0, 1)` when `c ≥ 1`, else 0.
- **`score = clamp(round(25 × net + B), 0, 1000)`**; `c = 0` → 0.
- Every trial is followed by a 0.3 s gap, so the number of trials is bounded by pace: `trials ≈ 30000 / (rt + 300)`. Random tapping (⅓ right) has a negative `net` and scores 0.
- Calibration assumptions (ADR-134): a **strong** player answers in ≈ 620 ms on average (SD 120 ms) with ≈ 3 % errors → ≈ 32 correct, 1 wrong → **≈ 820** (modelled p10–p90: 750–880). Typical (850 ms, 8 % errors) → ≈ 590; weak (1150 ms, 15 %) → ≈ 380. **1000** needs about 38 correct without a slip at ≤ ≈ 480 ms mean on a Stroop task that is 70 % incongruent, which we treat as out of human reach; faster-than-human clients are stopped by `cc.too_fast` / `cc.too_many`.

### 3.8 How Many?

- Three flashes, true counts `N_i` from the bands 8–15, 20–35, 40–70 (never a multiple of 10), guesses `g_i` (null = no answer).
- Per flash: `rel_i = |g_i − N_i| / N_i`; `s_i = clamp(1 − max(0, rel_i − D) / (W_i − D), 0, 1)` with **`D = 0.05`** (within 5 % = full marks) and **`W = [0.30, 0.40, 0.50]`** (30 / 40 / 50 % off = 0); a null guess has `s_i = 0`.
- **`score = round(1000 × (s_1 + s_2 + s_3) / 3)`**, then clamp.
- The band widens with the flash (Weber's law), so a good estimator scores similarly on all three.
- Examples (`N = [12, 27, 55]`): guesses 11, 24, 46 → 813; 10, 22, 42 → 578; 9, 18, 30 → 164; 12, null, 50 → 636; 12, 27, 53 → 1000; no answers → 0.
- Calibration assumptions (ADR-136; re-check at the playtest, `TESTING.md` §4): adult numerosity Weber fractions cluster at 15–25 %; a **strong** booth player is ≈ 8 % off on flash 1, ≈ 11 % on flash 2, ≈ 16 % on flash 3 (bias included) → **≈ 815**. Typical ≈ 17 / 19 / 24 % → ≈ 580. **1000** needs all three inside 5 % (exact on flash 1, ±1 on flash 2, ±2–3 on flash 3, from a 1 s flash of 40–70 items), which we treat as out of reach without luck.

### 3.9 Swipe Sort

- `c` correct, `w` wrong direction, `m` missed items; `net = c − w − m`; `r̄ = mean_swipe_ms`, the rounded mean time from an item's onset to the swipe registering, over correct items.
- Item window `I(t) = round(900 − 450 × t / 30000)` ms for an item whose onset is at `t` on the 30 s game clock (900 → 450 ms); a 0.15 s gap follows every item.
- Speed bonus `B = 60 × clamp((700 − r̄) / 300, 0, 1) × clamp(net / 20, 0, 1)` when `c ≥ 1`, else 0 (full at ≤ 400 ms mean and net ≥ 20; 0 at ≥ 700 ms). The `net / 20` factor keeps a random swiper (expected net 0) at ≈ 0.
- **`score = clamp(round(22 × net + B), 0, 1000)`**; `c = 0` → 0.
- Examples: 43 / 1 / 5 at 450 ms → 864; 33 / 3 / 8 at 550 ms → 514; 22 / 5 / 12 at 640 ms → 113; a random spammer 30 / 33 / 0 → 0; idle (0 / 0 / 37) → 0; 46 / 1 / 2 at 430 ms → 1000.
- Calibration assumptions (ADR-136): a **strong** player registers swipes at ≈ 450 ms (SD 80) with 2 % wrong: ≈ 49 items, misses concentrated in the last third where `I(t) < 550` → ≈ 43 / 1 / 5 → **≈ 864**. Typical (550 ms, 5 %) ≈ 33 / 3 / 8 → ≈ 514. **1000** needs `net ≥ 43` with a ≤ 430 ms mean (e.g. 46 / 1 / 2): out of reach at a 450 ms floor.

### 3.10 Pairs

- `p` = pairs found (0–8), `m` = mismatched flip-pairs, `clear_ms` = game-clock time at the eighth match (null unless `p = 8`), measured on the epoch clock: `Date.now()` at the eighth match − `gameStartEpoch`, so a device sleep never shortens it (ADR-137 (3)).
- Cleared (`p = 8`): `base = 1000 − 6 × max(0, clear_ms − 15000) / 1000`.
- Not cleared: `base = 730 − 80 × (8 − p)` (continuous with clearing at exactly 60 s: 1000 − 270 = 730).
- **`score = clamp(round(base − 12 × m), 0, 1000)`**; `p = 0` → 0.
- Examples: 8 pairs, 5 misses, clear at 34 200 ms → 825; 6 pairs, 9 misses → 462; 3 pairs, 12 misses → 186; 8 pairs, 3 misses, 21 500 ms → 925; 8 pairs, 0 misses, 14 000 ms → 1000; 0 pairs (with or without misses) → 0.
- Calibration assumptions (ADR-136): **strong** = clear in ≈ 34 s with 5 misses → **≈ 825**; typical = 6 pairs, 9 misses → 462; **1000** needs a clear in ≤ 15 s with 0 misses (16 taps at ≈ 0.9 s each with no forced miss): out of reach.

## 4. Rejection bounds (enforced by `score_bounds_violation`)

Common to all games: `score` integer 0–1000 (CHECK), `duration_ms` 0–130 000 (CHECK), `raw` must be a JSON object of the game's shape. Per game, in the order the function checks them (reason codes in brackets):

| Game | `raw` shape | Bounds (any failure → `GD008`) |
|---|---|---|
| Odd One Out | `{"grids":[{"size":4,"find_ms":int,"wrong_taps":int,"timed_out":bool}, …×3]}` | exactly 3 grids with sizes `[4,5,6]` [`ooo.shape`]; `wrong_taps` 0–50 [`ooo.taps`]; if not timed out, `find_ms` 250–20000 [`ooo.find_ms`]; if timed out, `find_ms` = 20000 [`ooo.timeout`] |
| Stop the Clock | `{"attempts":[{"target_ms":5000,"measured_ms":int\|null,"missed_start":bool}, …×3]}` | exactly 3 attempts with targets `[5000,10000,7000]` [`stc.shape`]; `measured_ms` null iff `missed_start` [`stc.missed`]; `measured_ms` 0–`target_ms + 10000` [`stc.range`]; `score ≤ 990` (i.e. total error ≥ 60 ms, below human timing precision) [`stc.score_above_990`] |
| Simon | `{"level":int,"avg_gap_ms":int\|null,"taps":int,"ended":"mistake"\|"timeout"\|"cap"\|"won"}` | malformed object/types [`simon.shape`]; `level` is 0 or 3–15 [`simon.level`]; `level = 0` ⇒ `score = 0` [`simon.zero`]; `level ≥ 3` ⇒ `avg_gap_ms ≥ 120` [`simon.gap`] and `0 ≤ score − 64 × level ≤ 40` [`simon.formula_band`]; `ended = 'won'` ⇔ `level = 15` [`simon.won`]; `duration_ms ≥ min_playback_ms(level)` [`simon.too_fast`], where `min_playback_ms(L) = Σ_{k=3..L} k × (max(250, 450 − 20 × (k − 3)) + 150)` |
| Perfect Circle | `{"epsilon":num\|null,"sweep_deg":num\|null,"diameter_px":num\|null,"stroke_ms":int\|null,"invalid_strokes":int,"timed_out":bool}` | malformed object/types [`pc.shape`]; `invalid_strokes` 0–4, and 0–3 unless `timed_out` [`pc.invalid`]; if `timed_out`: `score = 0` [`pc.timeout`]; else `epsilon ≥ 0.005` [`pc.too_perfect`], `sweep_deg` 300–450 [`pc.sweep`], `stroke_ms` 300–10000 [`pc.stroke_ms`], `score ≤ 975` [`pc.score_above_975`] |
| Trivia | `{"questions":[{"id":"q07","correct":bool,"answer_ms":int\|null,"timed_out":bool}, …×5]}` | exactly 5 entries with distinct ids [`trivia.shape`]; `answer_ms` null iff timed out [`trivia.timeout`]; `answer_ms` 0–10000 [`trivia.range`]; correct ⇒ `answer_ms ≥ 250` [`trivia.too_fast`]; no correct answers ⇒ `score = 0` [`trivia.zero`]; `score ≤ 988` [`trivia.score_above_988`] |
| Close the Brackets | `{"solved":int,"failed":int,"timeouts":int,"solve_ms":int\|null}` | malformed object/types [`cb.shape`]; `solved` 0–30, `failed` 0–50, `timeouts` 0–3, `solve_ms` 0–30000 [`cb.range`]; `solve_ms` null iff `solved = 0` [`cb.solve_ms`]; `solved = 0` ⇒ `score = 0` [`cb.zero`]; `solve_ms ≥ 150 × S(solved)` [`cb.too_fast`]; `min(1000, 15 S) ≤ score ≤ min(1000, 15 S + 100)` [`cb.formula_band`] |
| Color Clash | `{"correct":int,"wrong":int,"timeouts":int,"mean_rt_ms":int\|null}` | malformed object/types [`cc.shape`]; `correct` 0–100, `wrong` 0–100, `timeouts` 0–10, `mean_rt_ms` 0–3000 [`cc.range`]; `mean_rt_ms` null iff `correct = 0` [`cc.rt`]; `correct = 0` ⇒ `score = 0` [`cc.zero`]; `mean_rt_ms ≥ 250` [`cc.too_fast`]; `correct × (mean_rt_ms + 300) ≤ 30300` [`cc.too_many`]; `clamp(25 net, 0, 1000) ≤ score ≤ clamp(25 net + 75, 0, 1000)` with `net = correct − wrong − timeouts` [`cc.formula_band`] |
| How Many? | `{"rounds":[{"true_count":int,"guess":int\|null,"answer_ms":int\|null,"timed_out":bool}, …×3]}` | exactly 3 rounds with those types [`hm.shape`]; `true_count` in the flash's band 8–15, 20–35, 40–70, `guess` 0–999, `answer_ms` 0–10000 [`hm.range`]; `answer_ms` null iff `timed_out`, and `guess` null ⇒ `timed_out` [`hm.timeout`]; not timed out ⇒ `answer_ms ≥ 300` [`hm.too_fast`]; not all three guesses equal their true counts [`hm.too_perfect`]; `score ≤ round(1000 × Σ s_i / 3) + 1` with `s_i` as §3.8 (0 for a null guess; upper side only, under-reporting only hurts the sender) [`hm.formula_band`] |
| Swipe Sort | `{"correct":int,"wrong":int,"missed":int,"mean_swipe_ms":int\|null}` | malformed object/types [`ss.shape`]; `correct` 0–120, `wrong` 0–120, `missed` 0–80, `mean_swipe_ms` 0–900 [`ss.range`]; `mean_swipe_ms` null iff `correct = 0` [`ss.rt`]; `correct = 0` ⇒ `score = 0` [`ss.zero`]; `mean_swipe_ms ≥ 200` [`ss.too_fast`]; `correct × (mean_swipe_ms + 150) ≤ 30150` [`ss.too_many`]; `clamp(22 net, 0, 1000) ≤ score ≤ clamp(22 net + 60, 0, 1000)` with `net = correct − wrong − missed` [`ss.formula_band`] |
| Pairs | `{"matched":int,"misses":int,"clear_ms":int\|null}` | malformed object/types [`pr.shape`]; `matched` 0–8, `misses` 0–200, `clear_ms` 0–60000 [`pr.range`]; `clear_ms` null iff `matched < 8` [`pr.clear`]; `matched = 0` ⇒ `score = 0` [`pr.zero`]; cleared ⇒ `clear_ms ≥ 4000 + 700 × misses` [`pr.too_fast`]; `\|score − clamp(round(base − 12 × misses), 0, 1000)\| ≤ 1` with `base` as §3.10 (the ±1 covers rounding) [`pr.formula_band`] |

Why these numbers: 250 ms is below realistic visual-search-plus-tap and read-plus-tap times on a phone; a 60 ms total error across three hidden-timer guesses (20 ms each) is below touch-latency jitter; ε < 0.005 means the radius varied by less than 0.5 %, which fingers don't do; 120 ms mean gap is faster than sustained phone tapping; 150 ms per bracket *including reading the sequence* is faster than anyone closes brackets; a 250 ms mean on a Stroop choice is below human choice-reaction time, and the 0.3 s gap after every trial caps how many trials fit in 30 s; a How Many? answer needs two taps (a digit and OK) after the pad appears, which takes at least 300 ms, and three exact counts from 1 s flashes happen to about 1 in 1000 honest players (the target is a script that reads the seed); a 200 ms mean to register a Swipe Sort swipe is below choice-reaction time plus 40 px of finger travel, and the 0.15 s gap after every item caps how many fit in 30 s; a Pairs clear needs 16 taps at ≥ 250 ms (4000 ms) plus the 0.7 s lock after every miss (`4000 + 700 × misses`). They reject scripted submissions, not lucky humans. Tune only with test evidence (`TESTING.md` §4) and record the change in `DECISIONS.md`.

## 5. Leaderboards and tie-breaking

All boards exclude hidden name keys (ADR-115). "Earlier" means earlier `created_at` (server time of the insert).

| Board | Rows | Order |
|---|---|---|
| **Round board** (live, during the round and its intermission) | one per player with a score in that round | `score desc`, then `created_at asc` |
| **Session board** (running total in intermissions, final at results) | one per player with ≥ 1 score in the session | `total desc`, then `total_duration_ms asc` (faster overall), then `joined_at asc` |
| **Day board** (per game tab) | one per name key: best score of that key that day in that game | `score desc`, then `achieved_at asc` |
| **Combined results** (dashboard) | every score row, or best per name key per game when the toggle is on | user-selected column; default `score desc, created_at asc` |

Ranks use competition ranking only for display ties that survive all tie-breaks (1, 2, 2, 4), which in practice never happens because `created_at` differs.

Session total = sum of the player's round scores in that session (0–3000). Missing rounds count as 0 in the sum but show as "–" in the breakdown.

## 6. Names: cleaning, validation, keys

Implemented in SQL (`clean_name`, `name_key` in `DATA_MODEL.md` §3) and mirrored in the client only for instant UX feedback; the server is authoritative.

1. **Clean**: Unicode NFKC → remove Arabic diacritics U+064B–U+065F, U+0670 and tatweel U+0640 → collapse runs of whitespace to one space → trim.
2. **Validate** the cleaned name: length 1–12 **characters (Unicode code points)**; allowed characters: Latin letters A–Z a–z and Latin-1 letters (U+00C0–U+00D6, U+00D8–U+00F6, U+00F8–U+00FF), Arabic letters U+0621–U+063A and U+0641–U+064A, digits 0–9, Arabic-Indic digits U+0660–U+0669 and U+06F0–U+06F9, and the space. No emoji, punctuation, or symbols.
3. **Blocklist**: see `DATA_MODEL.md` §6 (whole-word by default).
4. **Key** = lower-case(cleaned) with أ إ آ ٱ → ا, ى → ي, ة → ه, ؤ → و, ئ → ي, and all digits → ASCII.
5. **Display suffix**: the n-th player (n ≥ 2) in a session whose key already exists there shows as `name + " " + n` (e.g. "Sara 2"). The suffix may exceed 12 characters on display. Day boards show the name without suffix.

Test vectors (must pass in both SQL and client tests):

| Input | Cleaned | Valid | Key |
|---|---|---|---|
| `"  Sara  "` | `Sara` | ✅ | `sara` |
| `"SARA"` | `SARA` | ✅ | `sara` |
| `"أحمد"` | `أحمد` | ✅ | `احمد` |
| `"احمد"` | `احمد` | ✅ | `احمد` |
| `"مُحَمَّد"` | `محمد` | ✅ | `محمد` |
| `"Zé 99"` | `Zé 99` | ✅ | `zé 99` |
| `"Lina٣"` | `Lina٣` | ✅ | `lina3` |
| `"Abdulrahmann1"` (13) | — | ❌ too long | — |
| `"Sam!"` | — | ❌ character | — |
| `"🔥Ali"` | — | ❌ character | — |
| `"Hassan"` | `Hassan` | ✅ (must not hit short-term blocklist) | `hassan` |
