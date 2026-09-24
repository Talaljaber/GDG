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

**Trigger bounds:** one passing and one failing case per bound in `SCORING.md` §4 (reason code asserted).

**Names:** the §6 vectors in SQL; blocklist "must pass" list (real names that contain short English terms): `Hassan`, `Assem`, `Anass`, `Cassandra`, `Basem`, plus the Arabic names the blocklist owner adds (OQ-13). "Must block" list: maintained with the blocklist (not in this doc).

## 4. Bounds tuning

The impossible-value bounds (250 ms, 60 ms total error, ε 0.005, 120 ms gap) must never reject a real player. During Phase 6, log every rejected submission (`GD008` reason) on dev devices; if a real human is rejected, widen the bound and record it in `DECISIONS.md`.

## 5. Load test (simulated phones)

Script `scripts/loadtest/`: N headless "phones" using supabase-js against the **dev** project.

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

Every row in `SESSION_LIFECYCLE.md` §6 (E1–E29) maps to a unit, pgTAP or e2e test, or to a manual step in the dry run; keep the mapping table in `PROGRESS.md` until all are covered.

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
