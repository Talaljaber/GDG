# Scoring

Purpose: the one place that defines how every game turns play into a number: the shared 0–1000 contract, each game's formula, what happens on timeouts, the impossible-value bounds the database enforces, tie-breaking, session totals, day boards, and name normalisation for "best per name". The per-game docs in `docs/games/` repeat their own formula with worked examples; if they ever disagree with this file, this file wins and the game doc is fixed.

Last updated: 2026-09-25

Related: ADR-021, ADR-022, ADR-105, ADR-113, ADR-134.

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

Why these numbers: 250 ms is below realistic visual-search-plus-tap and read-plus-tap times on a phone; a 60 ms total error across three hidden-timer guesses (20 ms each) is below touch-latency jitter; ε < 0.005 means the radius varied by less than 0.5 %, which fingers don't do; 120 ms mean gap is faster than sustained phone tapping; 150 ms per bracket *including reading the sequence* is faster than anyone closes brackets; a 250 ms mean on a Stroop choice is below human choice-reaction time, and the 0.3 s gap after every trial caps how many trials fit in 30 s. They reject scripted submissions, not lucky humans. Tune only with test evidence (`TESTING.md` §4) and record the change in `DECISIONS.md`.

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
