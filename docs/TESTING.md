# Testing

Purpose: how we know the system works before guests touch it: the test strategy per layer (pure scoring, database/RLS, UI, multi-phone end-to-end), the device and browser matrix, the bright-light and projector checks, the load test with simulated phones, and the scripted dry run the day before the event. Phase acceptance criteria in `PHASES.md` point to sections here.

Last updated: 2026-09-26

---

## 1. Strategy

| Layer | Tool | What | When |
|---|---|---|---|
| Pure logic | Vitest | scoring functions, Perfect Circle metric, name cleaning mirror, seeded RNG, trivia draw, plural/i18n helpers | every commit (CI) |
| Content | `check:trivia`, `check:i18n`, `contrast` scripts | trivia schema + strict mode, en/ar key parity, palette contrast | every commit; strict mode before freeze |
| Database | pgTAP via `supabase test db` | RLS for guest/admin/anon, functions' state rules, trigger bounds, name rules | every migration |
| UI components | Vitest + Testing Library | screens render every state in §SCREENS, RTL layout snapshots | per feature |
| End-to-end | Playwright, several browser contexts = several phones + one host | full sessions, reload/late-join/removed edge cases | per phase |
| Load | Node script with supabase-js | 15–60 simulated phones | Phase 6, and after any realtime change |
| Real devices | people + phones | matrix §6, bright light, projector | Phase 5–6, dry run |

## 2. Unit tests (must exist before a game is "done")

- Every worked example and every numbered test case in `docs/games/*.md` §§ "Scoring" and "Test cases" is a unit test with the same numbers.
- `SCORING.md` §6 name test vectors run against the client mirror.
- Trivia draw: TRV-T3 to TRV-T5 (10 000 draws).
- Simon on-time table and `min_playback_ms` (SIM-T6, SIM-T4).
- Perfect Circle synthetic strokes PC-T1 to PC-T10.
- Close the Brackets (ADR-134): CB-T1–T11 (`src/games/close-brackets/*.test.ts*`): worked examples, `S(n)`, the bounds mirror, seeded openers with no identical neighbours, wrong tap keeps the length, 10 s sequence timeout, reload mid-sequence, round ended.
- Color Clash (ADR-134): CC-T1–T10 (`src/games/color-clash/*.test.ts*`): worked examples, the bounds mirror, exactly 3 congruent trials per 10, wrong tap and 3 s timeout, reload mid-trial and mid-gap, round ended.
- How Many? (ADR-136, retuned by ADR-138): HM-T1–T12, T15–T19 (`src/games/how-many/*.test.ts*`): worked examples A–G, the bounds mirror, seeded fields with no overlapping chevrons and every integer of the bands 4–7 / 9–13 / 14–18 drawn, `too_fast`/`formula_band`/`range`/`timeout` (three exact guesses accepted, HM-T8; `answer_ms` 15 000 accepted, 15 001 not), reload during `look`/`flash`, idle player; the fixed schedule (ADR-137 (2)): reload during the intro, a freeze past the round's end closes every overdue step at once, a `locked` resume anchored on `lockedEndEpoch`, a hidden page keeps the schedule and finishes at 58.5 s (HM-T15–T18); a `flash` whose start epoch isn't stored yet is due at the end of its window (`dueEpoch`, HM-T19).
- Swipe Sort (ADR-136, window ADR-139): SS-T1–T12, T15, T16 (`src/games/swipe-sort/*.test.ts*`): worked examples A–F (idle E = 0 / 0 / 30), the bounds mirror (`mean_swipe_ms` ≤ 1100), the item window `I(t)` at t = 0/15 000/30 000 (1100/850/600 ms), the gesture reducer (40 px threshold, vertical/cancel ignored), wrong swipe, idle player, reload mid-item; ADR-137: a mount 5 s late (a hidden 3-2-1) keeps the clock at `roundStartEpoch` + 1.5 s and counts the missed items (SS-T15); a drag held through a miss doesn't move the next item and a swipe past the deadline resets the drag (SS-T16). A press during the 0.15 s gap stays ignored (§3).
- Pairs (ADR-136): PR-T1–T11, T13, T15 (`src/games/pairs/*.test.ts*`): worked examples A–G, the bounds mirror, the 0.7 s flip-back lock and reload during it, idle player, reload before the 8th match; device sleep (PR-T15, ADR-137 (3)): `clear_ms` on the epoch clock under a simulated sleep, `visibilitychange` finishes a board past its end and resolves a passed lock, a timeout turns unfound cards down, a late mount keeps the board clock at `roundStartEpoch` + 1.5 s.
- `src/games/worstCase.test.tsx` runs every registered game (10): idle player inside its worst case, "round ended" finishes at once.
- Player shell (ADR-137 (1), (7)): `src/player/seed.test.ts` (every game but Trivia gets the round id, so two phones draw the same How Many? fields and Pairs layout; Trivia differs per player), `src/player/playerFlow.test.ts` (a round that ended during the 3-2-1 never mounts), `src/player/hooks.test.tsx` (round rows refetched every 5 s while a round is on the phone and not yet submitted, the 3-2-1 included; only the 15 s full refetch otherwise).
- Host reveals (ADR-137 (5), (6)): `src/host/HowManyReveal.test.tsx` (dots within 3.5 s and the average at 4.0 s counted from `ended_at`, a host reloaded late in the step shows everything at once, late rows at once, `slotDelay`), `src/host/howManyStrips.test.ts` (mixed true counts → the mode, a 2-row tie → the higher-ranked row; ADR-138 small counts: a count of 5 puts 4 / 6 at 30 / 70 %, and the top 4 labels on identical exact guesses take 4 different lanes), `src/host/Intermission.test.tsx` (the How Many? reveal layout and its last-round variant).

## 3. Database tests (pgTAP)

Run as three identities: `anon` (no JWT), a guest (anonymous JWT), the admin (JWT with `app_metadata.role = 'admin'`).

**RLS (guest):**
- [ ] Can't `select` sessions/rounds/players of a session they didn't join; can for their own.
- [ ] Can't read any session code without having joined.
- [ ] Can update own `progress`, `progress_round`; can't update own `name`, `status`, `removed_at`; can't update another player.
- [ ] Can't insert a player directly; can't delete anything anywhere.
- [ ] Can insert a score only with `player_id = auth.uid()`; second insert for the same round → 23505.
- [ ] Can't update or delete scores (own or others').
- [ ] Can't write sessions, rounds, event_days, hidden_names, blocked_terms; can't read blocked_terms.
- [ ] Calling any admin function raises `GD009` and changes nothing.

**RLS (anon):** can't read or write any table; can call `keepalive()` only.

**Admin:** can run every admin function; still can't delete sessions/scores or update scores.

**Functions:** every transition in `SESSION_LIFECYCLE.md` §2–§3, plus: start with 0 players → `GD010`; remove after start → `GD010`; two joinable sessions impossible (unique index); `join_session` idempotent for the same uid; removed uid → `GD004`; late score within 15 s accepted, after → `GD007`.

**Join throttle (`08_join_throttle.sql`, ADR-130):** wrong and malformed codes come back as `{"error":"GD001"}` (not raised) and are logged; the 6th try after 5 wrong codes returns `{"error":"GD013","retry_after_s":30}` even with the right code and creates no player; locked tries aren't logged; another uid is unaffected; with log rows backdated (no sleeps) the seconds left count down and the right code joins after 30 s; one more wrong code while 5 are inside 60 s locks again; rows older than 60 s don't count; rows older than 10 minutes are purged; `private.join_attempts` has RLS on, no policies and no privileges for anon/authenticated; GD002/GD003/GD012 still raise and log nothing.

**Lineup:** exactly 3 distinct games (`admin_open_lobby`/`admin_set_lineup` with 1, 2, a repeat or a 2-D array → `GD011`; a new or shrunk `sessions` row with other than 3 games → `23514`, constraint `sessions_lineup_three`).

**Boards (`07_boards.sql`):** round board `score desc, created_at asc`; session board totals with `total_duration_ms` then `joined_at` tie-breaks, a guest sees only sessions it joined; day board one row per name key with the best score, the earliest of equal bests, names without suffix, current day only; a hidden key leaves all three (rows kept) and comes back when unhidden.

**Trigger bounds:** one passing and one failing case per bound in `SCORING.md` §4 (reason code asserted): `05_score_bounds.sql` for the five original games, `09_score_bounds_new_games.sql` for Close the Brackets and Color Clash (ADR-134; also checks guests can't execute `private.score_bounds_violation`), `10_score_bounds_how_many.sql` / `11_score_bounds_swipe_sort.sql` / `12_score_bounds_pairs.sql` for How Many?, Swipe Sort and Pairs (ADR-136; `11`'s idle fixture is 30 misses and its `mean_swipe_ms` bound is 1100 (1101 rejected), ADR-139, `SCORING.md` §3.9).

**Names:** the §6 vectors in SQL; blocklist "must pass" list (real names that contain short English terms): `Hassan`, `Assem`, `Anass`, `Cassandra`, `Basem`, plus the Arabic names the blocklist owner adds (OQ-13). "Must block" list: maintained with the blocklist (not in this doc).

## 4. Bounds tuning

The impossible-value bounds (250 ms, 60 ms total error, ε 0.005, 120 ms gap, 150 ms per bracket, Color Clash's 250 ms mean and 0.3 s-gap fit) must never reject a real player. During Phase 6, log every rejected submission (`GD008` reason) on dev devices; if a real human is rejected, widen the bound and record it in `DECISIONS.md`.

## 5. Load test (simulated phones)

Script `scripts/loadtest/`: N headless "phones" using supabase-js against the **dev** project.

By default it runs against the local stack, even when `.env.local` points at a cloud project. The cloud project is also the event database (ADR-127), so full-scale runs (L3–L5) against it happen only before the dry run, never on event days: `npm run loadtest -- --scenario L3 --target <SUPABASE_URL>`, and afterwards "Start new event day". Any URL other than `SUPABASE_URL` is refused, so the load test never hits the cloud by accident.

Each simulated phone: anonymous sign-in → `join_session` → subscribe like a real phone (§8 of `DATA_MODEL.md`) and `track` presence → on round start wait a random 5–60 s → insert a plausible score → poll boards every 3 s → repeat for 3 rounds. A real host view (browser) runs the session.

Note: all simulated sign-ins come from one IP, so the anonymous rate limit (§2.3 of `DEPLOYMENT.md`) must be ≥ N per hour on dev.

| Run | N | Pass criteria |
|---|---|---|
| L1 | 15 | no errors; every phone sees round start within 1.5 s of the host; host board updates within 1 s of each insert |
| L2 | 30 | same as L1 |
| L3 | 60 | no disconnects (`tenant_events`), no `too_many_*` errors; round start latency p95 < 2 s |
| L4 | 30, all submit within the same 2 s | no dropped scores; host board complete within 3 s |
| L5 | 30, all phones drop the network for 10 s and reconnect | presence recovers within 15 s; no duplicate scores |

Record results in `PROGRESS.md`. If L3 fails, note the ceiling in `OPEN_QUESTIONS.md` (OQ-16) and in the runbook; if L1/L2 fail, switch state events to database Broadcast (ADR-112 upgrade path).

Note: each run measures **round 1 only** (the game the scenarios care about); the toolkit then force-ends rounds 2–3 so the 3-round session (ADR-012) reaches `results` and a clean lobby is left for the next run. `run.ts` also force-sets the lineup after opening the lobby (`admin_set_lineup`), since `admin_open_lobby` reuses an existing joinable session's lineup as-is and a leftover session from an earlier run could otherwise carry forward a different game order.

The local stack doesn't enforce the cloud Realtime Free-plan quotas (100 msg/s total, 20 presence msg/s, `ARCHITECTURE.md` §6), so each run also reports an **estimated burst rate**: the largest number of messages landing in any 1 s window, from the actual timestamps each phone/host observed, for (a) the round-start state fan-out (one `rounds` UPDATE fanned to every subscribed phone), (b) presence `track()` on join, (c) the scores INSERT fan-out to the host's one subscription, and for L5 (d) presence re-`track()` after the mass reconnect. This is informational only — it is not one of the pass/fail criteria above.

### Results — 2026-09-24, local stack (`supabase start`, API `http://127.0.0.1:56321`)

All four runs below used the current toolkit (after two tooling fixes made during this session, see below). L2 was previously run and passed (round-start p95 319 ms); not re-run this session.

| Scenario | Phones | Round start ms (p50/p95/max) | Submit ms (p50/p95) | Board-visible / host-complete | Errors | Est. msg/s (limit) | Result |
|---|---|---|---|---|---|---|---|
| L1 (smoke) | 15 | 306 / 328 / 328 | 24 / 44 | worst 568 ms | 0 | round-start 15/100, presence-join 15/20, scores→host 6/100 | **PASS** |
| L3 | 60 | 463 / 539 / 549 | 24 / 39 | n/a (host board only tracked for L1/L4) | 0 disconnects, 0 `too_many_*` | round-start 60/100, presence-join **38/20 (over)**, scores→host 5/100 | **PASS** (p95 539 ms < 2 s) |
| L4 | 30, submit within 2 s | 182 / 216 / 218 | 19 / 30 | complete within 521 ms | 0 dropped | round-start 30/100, presence-join **26/20 (over)**, scores→host 22/100 | **PASS** |
| L5 | 30, 10 s socket drop | 139 / 163 / 165 | 24 / 184 | presence recovered 30/30, worst 340 ms | 0 dropped, 0 duplicates | round-start 30/100, presence-join **29/20 (over)**, scores→host 3/100, **reconnect re-track 30/20 (over)** | **PASS** |

All four scenarios met their `docs/TESTING.md` §5 pass criteria on the local stack. The presence-track burst (join, and L5's mass reconnect) estimates over the cloud's 20 msg/s Free-plan limit from 30–60 phones onward; this matches `ARCHITECTURE.md` §6's own prediction ("a mass reconnect can be throttled briefly; dots recover") and is not itself a pass/fail criterion, but it is the one place where a cloud run could see brief throttling that the local stack can't reproduce (see risks below). The round-start fan-out and the scores→host rate stayed comfortably under the 100 msg/s limit even at 60 phones.

**Tooling fixes made this session** (`scripts/loadtest/`):
- `run.ts` never called the already-written `SimHost.finishRemainingRounds`, so after a run's measured round 1 ended, the session stayed `playing` (rounds 2–3 `upcoming`) and blocked every later `admin_start_session`/`admin_new_session` call (ADR-108: at most one running session). Fixed by calling it before the end-of-run cleanup, and added `SimHost.closeLeftoverRunningSession()` (called at the start of a run) to recover a session left stuck this way by an earlier aborted run.
- `SimHost.openLobby` now also calls `admin_set_lineup` after `admin_open_lobby`, because `admin_open_lobby` intentionally reuses an existing joinable session's lineup unchanged (ADR-108's "last lineup if untouched" is meant for the real host UI) — without this, a leftover session from an earlier run could hand round 1 a different game than Stop the Clock, which is what the score payload builder assumes.
- `sim-phone.ts`'s `join()` now checks for `{error, retry_after_s?}` in `join_session`'s successful return, per ADR-130 (migration `20260925000400_join_throttle.sql`, applied mid-session): a wrong or throttled code no longer raises, it returns as ordinary data, so treating any non-error RPC response as a successful join would have silently "succeeded" with `session_id`/`player_row_id` both undefined. The load test only ever uses a freshly-opened real code, so this path isn't expected to fire in a run, but a phone now fails its join loudly (once, not retried) if it ever does.
- Score-insert failure logs now include the Postgres `detail`/`hint` (e.g. `stc.range`, `ooo.shape`), which is what made the lineup-order bug (above) diagnosable in the first place.
- Added a realtime message-rate estimate (see above) to both the console summary and the JSON report (`aggregates` → new `realtimeRates` array).

**App-side risk found, not changed** (per this task's scope — reported, not fixed): none. The one score-shape rejection seen (`GD008 impossible_score`, detail `ooo.shape`) during triage was caused by the load test submitting a Stop the Clock payload for a round whose actual game was Odd One Out (the lineup-order tooling bug above), not by an app/database bug — once the tooling fix landed, all four scenarios ran with zero `errorsByCode` and zero `realtimeErrorsByType`.

## 6. Device and environment matrix

| Device class | Browser | Must pass |
|---|---|---|
| iPhone (iOS 17+) | Safari | full session, all ten games, reload mid-round, screen lock, rotation overlay |
| iPhone | Camera-app QR → Safari | QR opens the site directly |
| Mid-range Android (Android 12+) | Chrome | full session, all ten games |
| **Low-end Android** (≤ 3 GB RAM, e.g. a 2020 budget phone) | Chrome | 60 fps target for games and shatter; at least 45 fps measured; no dropped taps in Simon; Odd One Out 6 × 6 usable |
| Android | Samsung Internet | join + one full session |
| Android QR scanner app | in-app browser | join works; note that it's a separate identity (E10) |
| Admin laptop | latest Chrome, 1080p projector | host view full session, fullscreen, no sleep |
| Admin phone | any | dashboard: hide name, export CSV (opens correctly in Excel/Sheets with Arabic) |

Settings to cover: Arabic device language (RTL auto), English; text size 130 %; reduced motion on; dark mode on the OS (our light theme must stay light and legible); low-power mode (iOS) during a round.

**Bright-light check (Odd One Out and all games):** 5 testers, phones at max brightness, under the brightest light available (outdoors in daylight or directly under hall-style lighting). Pass: OOO-T7 (grid 3 median ≤ 8 s, no timeouts); every screen's text readable at arm's length; Simon flashes distinguishable. Tune the grid 3 rotation within 10°–25° and record the value in `games/odd-one-out.md`.

**New games (ADR-134, Phase 7 AC7.7–AC7.8):**
- Close the Brackets on iPhone Safari and Android Chrome: four keys ≥ 48 px (≈ 76 px at 360 px wide); fast two-thumb tapping registers every tap (60 ms bounce window only); no double-tap zoom on the keys; in Arabic the brackets and the key order are **not** mirrored; rotation overlay and screen lock keep the 30 s clock running.
- Color Clash: the three inks and the amber word are readable at max brightness under hall light; test with one colour-blind volunteer if possible (the simulation in `npm run contrast` is the baseline, CC-T11); the Arabic words fit on one line at 320 px and 130 % text size.
- Calibration playtest (CB-T13, CC-T12): ≥ 5 strong players, 2 runs each after one practice run; record the scores in `PROGRESS.md`. Pass: median 780–900, nobody at 1000, nobody rejected by a bound. Otherwise retune the constants (`SCORING.md` §3.6–§3.7) and note it in ADR-134.

**New games (ADR-136, Phase 8 AC8.9–AC8.10):**
- How Many? (HM-T13): iPhone Safari and Android Chrome, flash-3 chevrons (14–18 items on a 6 × 6 grid, ≈ 38 px, ADR-138) legible at 360 px under hall light and countable in the 2.5 s flash; digit pad keys ≥ 56 px; no double-tap zoom on the pad; the true count never shown on the phone (only the big screen reveal, §5).
- Swipe Sort (SS-T13): iPhone Safari and iOS Chrome (WKWebView), 20 swipes from the surface centre: 0 navigations, 0 pull-to-refresh triggers; a swipe started within 24 px of either viewport edge never registers (iOS edge-swipe-back).
- Calibration playtest (HM-T14, SS-T14, PR-T14): ≥ 5 strong players, 2 runs each after one practice run; record the scores in `PROGRESS.md`. Pass for Swipe Sort and Pairs: median 780–900, nobody at 1000; otherwise retune the constants (22/60/the 1100 → 600 ms window, 6/12/80) and note it in ADR-136 (Swipe Sort: ADR-139, whose model puts strong players at 1000, so the 22 per net is the first candidate). How Many? (ADR-138): 1000 (three exact counts) is reachable by design; record the spread and retune `D`/`W` or the bands only with evidence (e.g. most strong players at 1000, or typical players below ≈ 500), with a note in ADR-138.

**Projector check:** real projector (or the venue's if accessible), lights on. From 6 m: code, QR scan (from 3 m with 3 different phones), leaderboard names and scores all readable/scannable. Compare light and dark big-screen themes (ADR-122) and pick one; record in `DECISIONS.md`.

**Host v3 "Stage and Rail" checklist** (added from `docs/plans/host-v3.md` §8, real-projector risks that a laptop screen can't confirm):
- [ ] From 6 m: H1 hairline player rows and `--slot-line` empty rows are visible, not washed out; if not, raise `--slot-line`/`--line` (token change only).
- [ ] From 6 m: the rail (7 vh / 12 vh on H1) sits fully inside the projected image; nothing crops at the safe margin.
- [ ] `--text-muted` labels (eyebrows, rail text) stay legible under hall lighting; fallback is `--text-muted` → ink 70 % if not.
- [ ] Arabic names on H2–H5 boards: no clipped ascenders/descenders in the 6.6 vh row height (try «عبدالرحمن سا», «لإ»).
- [ ] The QR (24 vh) scans from 3 m at 1080p projection with three different phones; if marginal, raise `--proj-qr` to 28 vh.
- [ ] H1 with 10 registered games: the lineup tray's unpicked-games line wraps onto a second/third line without pushing the rail off the safe margin, in English and Arabic.
- [ ] Show day board reads as one quick crossfade (~300 ms), not a jump cut or a leftover animation; compare with the host's Reduce motion toggle on (should be instant either way; see 2026-09-25 ADR-010 update below).

Day-board note (2026-09-25): the ~15 s shatter merge between H4 and H5 was removed after review feedback ("so bad"); Show day board now crossfades the whole stage once. The dry run no longer needs a "merge timing" check, only the one line above.

## 7. End-to-end scenarios (Playwright)

| # | Scenario | Checks |
|---|---|---|
| E2E-1 | 3 phones + host: lobby → 3 rounds → results → day board → new session | every screen of `SCREENS.md` §1–§2 reached; totals = sums |
| E2E-2 | Reload every phone mid-round in each game | resume, no clock reset, one score each |
| E2E-3 | Late joiner via corner code | lands in pending; in lobby after New session |
| E2E-4 | Remove in lobby, rejoin same code | `Removed by host` |
| E2E-5 | One phone closes mid-round | round ends at deadline or force-end; that phone has no score |
| E2E-6 | Host tab closed mid-round, reopened after 60 s | round ends on reopen if past deadline; intermission resumes |
| E2E-7 | Hide a name during intermission | name gone from host within 1 s, from phones within 3 s |
| E2E-8 | Duplicate names ×3 | "Sara", "Sara 2", "Sara 3"; one day-board row |
| E2E-9 | Language switch AR↔EN on every non-game screen | no untranslated keys (missing-key detector throws in test builds) |
| E2E-10 | Offline phone submits after reconnect within 15 s | accepted; after 15 s → `sys.save_failed` |

**Phase 1 slice (`e2e/phase1.spec.ts`, `npm run e2e`).** Runs against the local stack (`.env.local`), chromium only, one worker; the Playwright config starts its own Vite server on port 5199 and `e2e/global-setup.ts` re-creates the local admin (`npm run dev:admin`) and force-ends any leftover running session. Three tests:
1. Join + lobby + play: AC1.1 (no Auth/REST request and no new `auth.users`/`players` row on page open, checked by SQL on the local DB), wrong code (GD001, name kept), invalid name (inline) and blocked name (GD003), 12-character cap, Arabic-Indic code digits, join visible on the big screen < 2 s, presence on, remove + "Removed by host" < 2 s + rejoin refused (GD004), Start, 3 phones play Stop the Clock with timed holds, each phone's score = hand calculation from its recorded guesses = DB row = big-screen row (< 1.5 s after the phone's save), host ends the round by itself (`all_finished`), host and phone results in rank order, "Join the next game" → P1.
2. AC1.6 / STC-T7: reload during running attempt 2 resumes attempt 2 with the same `attemptStartEpoch` and attempt 1 kept; a re-sent submit returns 409/23505 and is treated as saved; exactly one score row.
3. AC1.7 + AC1.3 + STC-T8: a closed phone's presence dot greys after `PRESENCE_GREY_MS`; 19 screenshots 1 s apart during a running attempt are byte-identical; End round (confirm) with one phone that never played → `force_end`, no score row for it.

Since Phase 3 sessions are 3 rounds: the slice tests play round 1 (Stop the Clock) for real and the host force-ends rounds 2–3 (`hostFinishSession` in `e2e/helpers.ts`; phones finish those with the timeout rule, score 0).

**Phase 2 (`e2e/phase2.spec.ts`).** Games are driven from each phone's persisted round seed: Stop the Clock by timed holds, Odd One Out by tapping the seeded odd tile (`grid.ts`, after a 400+ ms pause because of `ooo.find_ms`), Simon by replaying the seeded sequence (`sequence.ts`) to length 3 and then a wrong pad.
- E2E-1: 3 phones, lineup Stop the Clock → Odd One Out → Simon; no host action after Start (AC2.1): the Stop the Clock reveal (3 strips × 3 dots, labels), P8 steps on the phones, the next-games picker edits the pending session (E20), rounds 2–3 start by themselves, the last round's 7 s board, then H4 (3 round columns, totals = SQL sums, P9 totals and breakdowns), Show day board → H5 tabs rotating + P10 on every phone, best-per-name rows = SQL `max(score)` per key (AC2.5), New session → the pending code becomes the lobby with the picked lineup (AC2.4).
- E2E-3: the running code is refused (GD001), the corner code lands in P3b, the host's corner shows 1 late joiner, and after New session the latecomer is in the lobby (AC2.3).
- E2E-6: the host page is closed mid-round; the phone keeps playing and saves; the round's `started_at` is moved back 130 s by SQL (instead of waiting 128 s); on reopen the host ends it with `time_cap` at once and runs the intermission; closed again for 17 s (longer than the intermission), the reopened host shows the 3 s "Next" heads-up and starts round 2 (AC2.2, AC2.7, E8).
- E2E-7: `admin_hide_name` (the dashboard's call) during the intermission: gone from the host round board < 1 s, from a phone's P8 board < 3.5 s (3 s poll + one request), never on the totals or results; the hidden player's phone still shows its own total (AC2.9, E24). Unhidden in `finally`.
- E2E-8: "Sara…", "Sara…", "SARA…" → suffixes 2 and 3 on the lobby, round and session boards; one day-board row for the key with its best score and no suffix, on P10 and in SQL (AC2.6).

**Payloads (`e2e/payloads.spec.ts`, AC3.3).** No browser: an admin client and an anonymous guest client (publishable key) run four real sessions covering all ten games (the third is `close_brackets, color_clash, odd_one_out`, ADR-134; the fourth is `how_many, swipe_sort, pairs`, ADR-136); each round's score is built by that game's own `buildRaw` + scorer, passes the game's client-side bounds mirror, is accepted by the trigger and stored as sent. The reject side is pgTAP `05_score_bounds.sql`, `09_score_bounds_new_games.sql` and `10_score_bounds_how_many.sql`/`11_score_bounds_swipe_sort.sql`/`12_score_bounds_pairs.sql`.

The e2e web server runs with `E2E_NO_HMR=1` (no hot reload), so a file saved during a run can't reload the test pages. `e2e/env.ts` refuses any non-local Supabase URL: e2e always runs on the local stack.

Every row in `SESSION_LIFECYCLE.md` §6 (E1–E29) maps to a unit, pgTAP or e2e test, or to a manual step in the dry run; the mapping table is in `PROGRESS.md`.

## 8. Day-before dry run (script)

Run by two people: host + tester, with **at least five real phones** covering the matrix (≥ 1 iPhone, ≥ 1 low-end Android). Use the **prod** project and the **final** production deploy. Tick each box; anything failing blocks the event build and goes to `PROGRESS.md`.

**A. Setup (15 min)**
- [ ] Keepalive last run green; `keepalive.pinged_at` < 6 h old; project status "Active".
- [ ] Netlify: production deploy = the tagged release; ≥ 100 credits remaining; auto publishing **locked** afterwards.
- [ ] Admin sign-in on the laptop; projector connected; browser fullscreen; laptop sleep and notifications off.
- [ ] Current event day is the right one (dashboard D6).

**B. Join (10 min)**
- [ ] QR scan from 3 m on every phone opens the site (camera apps).
- [ ] Short URL typed manually works.
- [ ] 5 phones join with the code; one with an Arabic name, one duplicate name, one invalid name (error shown), one blocked word (error shown).
- [ ] Presence: turn one phone's data off → dot greys within 10 s → back on → dot returns.
- [ ] Remove one player → "Removed by host" → same code refused → rejoin later with the next code works.

**C. Full session ×2 (20 min)**
- [ ] Session 1 lineup: Stop the Clock, Odd One Out, Trivia. Session 2: Simon, Perfect Circle, and one of the first three.
- [ ] Each round: 3-2-1 in sync (±1 s); scores appear on the big screen as phones finish; intermission shows round board → total → next game.
- [ ] Stop the Clock reveal shows all guesses.
- [ ] During session 1, a latecomer joins via the corner code and is in session 2's lobby.
- [ ] One phone reloads mid-round (resumes), one locks its screen for 20 s (continues), one goes offline during submit (retries).
- [ ] Force-end once.
- [ ] Results → Show day board (instant crossfade to the day boards, no merge animation) → New session.

**D. Admin (10 min)**
- [ ] Hide a name from the dashboard on the admin phone while it's on the big screen.
- [ ] Add a blocked word live; a new join with it fails.
- [ ] Export CSV; open in a spreadsheet; Arabic names display correctly.

**E. Failure drills (10 min)**: rehearse runbook §5.3 (a phone can't load) and §5.5 (host laptop crash: close the tab mid-round and reopen).

**F. Readability (5 min)**: from 6 m, read the code and the top 3 names; from arm's length in bright light, read a phone's result screen.

**G. Sign-off**: team lead writes "Dry run passed" with the release tag in `PROGRESS.md`. No code changes after this.

## 9. Render budget

How many times each component commits a render over fixed scenarios, so unnecessary re-renders are caught by tests. Counters are dev-only and absent from production builds (checked by grepping `dist/`).

### Dashboard

Counter: `useRenderCount(name)` (`src/dashboard/renderCount.ts`, one count per commit in which the component rendered; `window.__dashRenderCounts` in the dev server). Guarded by `src/dashboard/renderBudget.test.tsx` through the `/__preview` dashboard fixtures' fake api (no database); 40 result rows. Measured 2026-09-25, before → after the render audit:

| Scenario | Before | After |
|---|---|---|
| Idle on Today, 30 s | 0 | 0 (no polling, timers or listeners) |
| Switch every tab (5 clicks) | shell 5; `HideNameField` 4 | shell 5; `HideNameField` 2 (each page: mount + one render per load) |
| Sort Results, 4 header clicks | `ResultRow` 160 | `ResultRow` 0 |
| Filter Results, game then day | `ResultsPanel` 6, `ResultRow` 160 | `ResultsPanel` 4, `ResultRow` 80 (fresh rows only) |
| Best-per-name on + off | `ResultRow` 50 | `ResultRow` 30 (only dropped rows remount) |
| Open a session detail | detail 2, shell 1 | same |
| Language toggle on Results | every component once (`ResultRow` 40) | same: one commit, not two |
| Type 6 chars, blocked-word field | panel 6, hide field 6, each list 6 | panel 6, hide field 0, lists 0 |
| Type 6 chars, new-day label | panel 6, table 6 | panel 6, table 0 |
| Hide a name on Today (preview + confirm) | `TodayPanel` 1 | `TodayPanel` 0 (unchanged reload kept) |

In the dev server, StrictMode runs each render function twice, but that isn't a second commit: the language toggle still commits once per component. Its mount-time effect replay does add one count per newly mounted component, so browser runs reset the counts after load.

### Host and phones

Counter: `src/dev/renderCount.ts`, imported first in `main.tsx`. It wraps React's DevTools hook (`onCommitFiberRoot`) and counts, per component name, every component whose render function ran in a committed update (a same-value `setState` that React bails out of isn't counted). Nothing is added to components. In the dev server: `window.__gdgRenders.reset()`, then `.snapshot()` / `.commits()`. It is guarded by `import.meta.env.DEV`, so the build drops it (`grep __gdgRenders dist/assets/*.js` finds nothing).

Measured 2026-09-25 on the local stack: dev server with HMR off, 1 host (1920 × 1080) and 3 phones driven by Playwright. Sessions: Stop the Clock → Odd One Out → Simon, then Perfect Circle → Trivia → Odd One Out. P1 plays fastest; P2 and P3 play slower. Cells show commits / component renders on the host or on P1. "Game idle" = the game on screen, untouched, for 4 s.

| Scenario | Length | Before | After |
|---|---|---|---|
| Host lobby idle, 3 phones joined | 30 s | 60 / 960 | 0 / 0 |
| Phone lobby idle | 30 s | 12 / 78 | 0 / 0 |
| Phone game idle: Stop the Clock · Odd One Out · Simon · Perfect Circle · Trivia | 4 s | 99 · 293 · 183 · 105 · 117 renders | 4 · 21 · 15 · 4 · 16 renders |
| Phone plays Stop the Clock / Odd One Out / Simon / Perfect Circle / Trivia | 3–14 s | 354 / 675 / 336 / 439 / 485 | 101 / 67 / 55 / 157 / 137 |
| Phone on its result while others play (Stop the Clock, Trivia) | 9 s, 12 s | 44 / 526, 58 / 730 | 7 / 46, 5 / 38 |
| Host full round: Stop the Clock | 25 s | 151 / 2169 | 59 / 400 |
| Host full round: Trivia | 34 s | 187 / 2745 | 59 / 329 |
| Host intermission (round board → total → Next) | 15 s | 78 / 1475 (Stop the Clock reveal), 77 / 1070 | 23 / 131 |
| Phone intermission | 15 s | 76 / 532 | 8–14 / 29–67 |
| Host results idle / phone results idle | 15 s | 5 / 60, 11 / 102 | 0 / 0, 0 / 0 |
| Host day board (rotation only, no merge) / phone day board | 25 s | 11 / 140, 15 / 58 | 11 / 85, 6 / 17 |

**Re-measured 2026-09-25 on the `/__preview` fixtures** (`window.__gdgRenders`, dev server, 1920×1080, no phones — a quick regression check after the day-board merge was removed and every board's row cascade was set to fire at once, `--stagger-row: 0`; see `DECISIONS.md` ADR-010 update): `host.lobby-3` idle 30 s → **0 commits**; `host.results-1` idle 30 s (podium settled, celebrate already played) → **0 commits**; `host.dayboard` 30 s (auto-rotating every `DAYBOARD_ROTATE_MS` = 8 s, no merge to add commits) → **3 commits** (one per rotation, as the table above already expected). Both idle budgets hold; the fixture numbers match the driven-by-Playwright scenarios above.

What made the difference:
- **Clocks at the top of a tree.** The host lobby re-rendered twice a second for its presence dots, H2 four times a second for "time left", H3 four times a second for the intermission step, and the phone's member flow four times a second for the whole session (game screen included). They now use `useSteppedNow` (`src/components/useSteppedNow.ts`): it still checks on the same interval, but sets state only when the value on screen changes. The H2 time and the H3 3-2-1 are their own leaves (`TimeLeft`, `StepCountdown`). The lobby dots use `usePresenceDots` (`src/host/presence.ts`), which keeps last-seen times in a ref and re-renders when a dot flips. Grey-out timing is unchanged. Games still measure with `performance.now()` and stored epochs; no display clock feeds a measurement.
- **Polls storing new objects.** Phone boards and player counts (every 3 s), the phone's state refetch (15 s and on every change event), the host's reloads, H4's 3 s poll and every host board refetch now go through `replaceEqualDeep` (`src/lib/equal.ts`), which keeps the old object when the data is identical. The host's presence set and score count are also kept when unchanged.
- **Heavy leaves.** `BoardTable`, `Leaderboard`, `LineupSummary` and the Odd One Out / Simon chevron glyphs are memoised; their callers pass stable arrays.

Guards: `src/player/boardHooks.test.tsx` (identical polls don't re-render the board or the lobby count; a changed poll re-renders once), `src/host/presence.test.tsx` (an idle lobby doesn't re-render for 30 s; one re-render when a dot greys), `src/components/useSteppedNow.test.tsx`, `src/lib/equal.test.ts`. The Stop the Clock DOM-stability test (STC-T8) is unchanged.
