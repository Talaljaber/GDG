# Testing

Purpose: how we know the system works before guests touch it: the test strategy per layer (pure scoring, database/RLS, UI, multi-phone end-to-end), the device and browser matrix, the bright-light and projector checks, the load test with simulated phones, and the scripted dry run the day before the event. Phase acceptance criteria in `PHASES.md` point to sections here.

Last updated: 2026-09-24

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

**Trigger bounds:** one passing and one failing case per bound in `SCORING.md` §4 (reason code asserted).

**Names:** the §6 vectors in SQL; blocklist "must pass" list (real names that contain short English terms): `Hassan`, `Assem`, `Anass`, `Cassandra`, `Basem`, plus the Arabic names the blocklist owner adds (OQ-13). "Must block" list: maintained with the blocklist (not in this doc).

## 4. Bounds tuning

The impossible-value bounds (250 ms, 60 ms total error, ε 0.005, 120 ms gap) must never reject a real player. During Phase 6, log every rejected submission (`GD008` reason) on dev devices; if a real human is rejected, widen the bound and record it in `DECISIONS.md`.

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
| iPhone (iOS 17+) | Safari | full session, all five games, reload mid-round, screen lock, rotation overlay |
| iPhone | Camera-app QR → Safari | QR opens the site directly |
| Mid-range Android (Android 12+) | Chrome | full session, all five games |
| **Low-end Android** (≤ 3 GB RAM, e.g. a 2020 budget phone) | Chrome | 60 fps target for games and shatter; at least 45 fps measured; no dropped taps in Simon; Odd One Out 6 × 6 usable |
| Android | Samsung Internet | join + one full session |
| Android QR scanner app | in-app browser | join works; note that it's a separate identity (E10) |
| Admin laptop | latest Chrome, 1080p projector | host view full session, fullscreen, no sleep |
| Admin phone | any | dashboard: hide name, export CSV (opens correctly in Excel/Sheets with Arabic) |

Settings to cover: Arabic device language (RTL auto), English; text size 130 %; reduced motion on; dark mode on the OS (our light theme must stay light and legible); low-power mode (iOS) during a round.

**Bright-light check (Odd One Out and all games):** 5 testers, phones at max brightness, under the brightest light available (outdoors in daylight or directly under hall-style lighting). Pass: OOO-T7 (grid 3 median ≤ 8 s, no timeouts); every screen's text readable at arm's length; Simon flashes distinguishable. Tune the grid 3 rotation within 10°–25° and record the value in `games/odd-one-out.md`.

**Projector check:** real projector (or the venue's if accessible), lights on. From 6 m: code, QR scan (from 3 m with 3 different phones), leaderboard names and scores all readable/scannable. Compare light and dark big-screen themes (ADR-122) and pick one; record in `DECISIONS.md`.

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

**Payloads (`e2e/payloads.spec.ts`, AC3.3).** No browser: an admin client and an anonymous guest client (publishable key) run two real sessions covering all five games; each round's score is built by that game's own `buildRaw` + scorer, passes the game's client-side bounds mirror, is accepted by the trigger and stored as sent. The reject side is pgTAP `05_score_bounds.sql`.

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
- [ ] Results → Show day board (merge animation) → New session.

**D. Admin (10 min)**
- [ ] Hide a name from the dashboard on the admin phone while it's on the big screen.
- [ ] Add a blocked word live; a new join with it fails.
- [ ] Export CSV; open in a spreadsheet; Arabic names display correctly.

**E. Failure drills (10 min)**: rehearse runbook §5.3 (a phone can't load) and §5.5 (host laptop crash: close the tab mid-round and reopen).

**F. Readability (5 min)**: from 6 m, read the code and the top 3 names; from arm's length in bright light, read a phone's result screen.

**G. Sign-off**: team lead writes "Dry run passed" with the release tag in `PROGRESS.md`. No code changes after this.
