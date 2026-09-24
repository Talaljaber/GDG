# Progress

Phase 2 (sessions, rounds, leaderboards) and the Phase 3 integration items — implemented and verified locally; real-device checks pending (Phase 1 and 2).

Purpose: the living project memory. It records the current phase, what's done, what's next, blockers and short notes from each working session. Every Claude Code session reads it first and updates it last (CLAUDE.md working agreement). Keep it short: move finished detail into the relevant doc and keep only pointers here.

Last updated: 2026-09-24

---

## Current phase

**Phase 2: Sessions, rounds and leaderboards** (`PHASES.md`), built with real 3-round sessions (the other game modules already existed), plus the **Phase 3 integration items** (AC3.2–AC3.5: `ROUNDS_PER_SESSION = 3`, the 3-game lineup migration). Green locally: typecheck, lint, unit tests, `check:i18n`, `check:trivia`, `contrast`, build, `npm run e2e` (9 specs), `supabase test db` (490). Remaining: the real-device checks (Phase 1 AC1.2/AC1.3 and the manual items below), and Phase 3's AC3.1/AC3.6/AC3.7 sign-off per game. Phase 0's cloud items are tracked separately.

### Phase 2 acceptance criteria
| AC | Status | How verified |
|---|---|---|
| AC2.1 N rounds start → results with only Start (auto intermissions) | ✅ local | E2E-1: after Start, no host action: STC → intermission (15 s) → Odd One Out → intermission → Simon → 7 s last board → H4; all three rounds `all_finished`; `schedule.test.ts` (7 + 5 + 3 s, skip, last round) |
| AC2.2 dead phone → 128 s `time_cap`; force-end → `force_end` | ✅ local | `hostLoop.test.ts` (ends at exactly 128 000 ms, not before); E2E-6 (deadline passed while the host was away → `time_cap` 0.9–2.5 s after reopening; an idle phone keeps the round open until then); phase1 test 3 (`force_end`). Waiting a real 128 s is left to the dry run |
| AC2.3 latecomer via corner code → lobby after New session | ✅ local | E2E-3: running code refused (GD001), corner code → P3b, host corner counts 1, New session → pending becomes the lobby with the latecomer, phone switches to P3 |
| AC2.4 New session preselects the picker's lineup | ✅ local | E2E-1: next-games picker during the intermission saves `{simon,stop_the_clock,odd_one_out}` on the pending session (E20); after New session the lobby code = the corner code and the H1 cards read ① Simon ② Stop the Clock ③ Odd One Out |
| AC2.5 day board: one row per name key, best score, ties earliest | ✅ | unit (`boards.test.ts`: `bestPerName`, `compareDayRows`); pgTAP `07_boards.sql` (three "Sara"s → one row, the earlier of two equal 800s); e2e (E2E-1: per key and game = SQL `max(score)`; E2E-8: one row on P10 and in SQL) |
| AC2.6 duplicate names get suffixes 2, 3 | ✅ local | E2E-8: "Sara…", "Sara… 2", "SARA… 3" on the lobby (phone + host), round board (host + P8) and H4; day board without suffix; pgTAP `04_lifecycle.sql` |
| AC2.7 host tab closed mid-round and reopened | ✅ local | E2E-6: phones keep playing and saving while the host is closed; reopen reconstructs from the DB, ends the overdue round, runs the intermission; closed again for longer than the intermission → reopen shows the 3 s "Next" heads-up, then starts round 2 (ADR-129) |
| AC2.8 every E1–E29 has a test or a manual check | ✅ | mapping below |
| AC2.9 hidden name gone from the host ≤ 1 s, phones ≤ 3 s | ✅ local | E2E-7 (`admin_hide_name` during the intermission): host 0.25–0.35 s (hidden-name events refetch every board unthrottled), phone P8 board 2.84–2.93 s (sampled every 50 ms); never on totals/results; the hidden player's phone still shows its own total. Structural worst case on a phone is the 3 s board poll plus one request (≈ 3.05 s locally), so the test allows 3.5 s; a hard 3 s would need `BOARD_POLL_MS` 2500 (team call) |

### Phase 3 integration criteria (this session)
| AC | Status | How verified |
|---|---|---|
| AC3.2 every game finishes inside its worst case and handles "round ended" | ✅ | `src/games/worstCase.test.tsx`: all five modules, an idle player is scored within `worstCaseMs` (≤ 120 s), and a mid-round "round ended" finishes at once with the scorer's value; plus each game's own E27 tests. Fixed on the way: Odd One Out's documented worst case left out the intro and the last transition (62 → **64 s**, `SCORING.md` §2, `games/odd-one-out.md`; idle measures 63.6 s) |
| AC3.3 server accepts each game's valid payload; rejects each bound | ✅ local | `e2e/payloads.spec.ts`: two real sessions covering all five games, each payload built by the game's own `buildRaw` (new for Simon: `simon/scoring.ts`), passing the game's client bounds mirror, accepted by the trigger and stored as sent; rejects: pgTAP `05_score_bounds.sql` |
| AC3.4 a full 3-round session with three different games on 3 phones | ✅ local | E2E-1 (Stop the Clock, Odd One Out, Simon, 3 phones, totals = sums) |
| AC3.5 `ROUNDS_PER_SESSION = 3`; picker enforces 3 distinct | ✅ | `src/config.ts`; migration `20260925000300_lineup_exactly_three.sql` (`sessions_lineup_three` + `lineup_is_valid` = exactly 3; pgTAP `04`/`07`: 1, 2, repeat, 2-D → GD011, 23514); `hostLoop.test.ts` (picker rules); e2e helpers pick 3 in every test |

### Phase 1 acceptance criteria
| AC | Status | How verified |
|---|---|---|
| AC1.1 no auth user / rows on open | ✅ local | e2e test 1: `auth.users` and `players` counts by SQL before/after opening `/`, and zero Auth/REST requests |
| AC1.2 US-G1 AC1–AC5 | ✅ local (Chromium) · ⏳ iPhone + Android | e2e test 1 (AC1 as above; AC2 join on big screen 1.4 s locally; AC3 wrong code keeps name; AC4 12-char cap, invalid + blocked names; AC5 Arabic-Indic code digits); `JoinFlow.test.tsx`. **Needs manual testing on a real iPhone (Safari) and Android (Chrome) on 4G.** |
| AC1.3 dot greys within 10 s of airplane mode | ⚠️ partial | e2e test 3: a closed phone greys 10.1 s after close (grace `PRESENCE_GREY_MS` = 10 s starts when Presence reports the leave). **Airplane mode needs a real-device test:** a dead socket (no TCP close) is only noticed when the Realtime server's heartbeat times out, which can take much longer than 10 s. If it does, ADR-103's fallback (heartbeat column) is the fix. |
| AC1.4 removed within 2 s, can't rejoin | ✅ local | e2e test 1: 0.2–0.8 s; rejoin with the same code → GD004 → Removed screen |
| AC1.5 3 phones end to end, scores = hand calc, big screen within 1 s | ✅ local | e2e test 1: timed holds; each score = formula over the phone's recorded guesses = DB row = host row; host showed it 9–106 ms after the phone's save (score refresh throttled, not debounced); host ended the round itself (`all_finished`) |
| AC1.6 reload mid-attempt resumes; second submit = success | ✅ local | e2e test 2: STC-T7 (same attempt, same `attemptStartEpoch`, attempt 1 kept); re-sent payload → 409/23505 → saved; one score row |
| AC1.7 End round with a phone never playing | ✅ local | e2e test 3: confirm → `force_end`, no score row for the idle phone |
| AC1.8 STC unit tests; running screen unchanged 20 s | ✅ | STC unit tests (incl. DOM-stability over ~19 s); e2e test 3: 19 screenshots 1 s apart (0.5–18.5 s after Start; auto-stop is at 20 s) byte-identical |

## Done

- 2026-09-24: **Phase 5 shatter wiring**: screen transitions on phone and big screen (`src/components/ScreenTransition.tsx`, keys in `src/player/screenKey.ts` / `src/host/screenKey.ts`; never into a game), board shatter-in + H2 new-#1 celebrate (`src/components/useRevealRows.ts`), P7 new-best celebrate and Stop the Clock dot bursts (`RevealIn.tsx`), the ~15 s H4 → H5 merge (`src/host/Results.tsx`, H4/H5 now one screen), host **Reduce motion** toggle (`src/host/motion.tsx`), `SHATTER_LOGO_CLASS` on every logo, z tokens in `tokens.css`. Phone initial JS +7.1 kB gzip. Details: DESIGN_SYSTEM §6.2 "Where it's wired"; AC status in PHASES Phase 5.
- 2026-09-24: **Phase 0 cloud (partial)**: one project `gdg-booth` (`ppikklvltpfdwbxtilme`, eu-central-1, ADR-127; the Seoul project is retired) with all 9 migrations via `supabase db push`; catalog checked: RLS on all 8 tables, anon executes only `keepalive()`, realtime publication correct. Supabase's automatic-RLS event trigger is on; pgTAP 01 skips event-trigger functions. Status: `DEPLOYMENT.md` §2.7.
- 2026-09-24: **Phase 2 + Phase 3 integration** (this session): multi-round host loop with intermissions anchored on `ended_at` (`src/host/useHost.ts`, `schedule.ts`), pending session corner code + next-games picker (`common.tsx`), H3 with the Stop the Clock guess reveal (`StcReveal.tsx`, `reveal.ts`; shatter hook `src/components/RevealIn.tsx`), H4 table with round columns, H5 rotating day boards (`Results.tsx`); phones P3b, P7 `new_best`, P8, P9 from own rows, P10, P11 by event day, landscape overlay (E16) (`src/player/`); board ordering helpers (`src/lib/boards.ts`); API for rounds, day boards, hidden keys (`src/lib/api.ts`); `pending:` and `day:` channels (`realtime.ts`); `ROUNDS_PER_SESSION = 3` + migration `20260925000300`; pgTAP `07_boards.sql`; e2e `phase2.spec.ts`, `payloads.spec.ts`; Phase 1 e2e adapted to 3 rounds.

- 2026-09-24: **Game modules built ahead of Phase 3** (pure scoring + screens + tests, each to its doc): Odd One Out, Simon, Perfect Circle, Trivia (`src/games/*`). Registered in `src/games/registry.ts`; Trivia is only offered once ≥ 5 questions are ready (currently 3). Sessions stay at `ROUNDS_PER_SESSION = 1` until Phase 2's multi-round sequencing lands (ADR-120). Perfect Circle metric fixes written back to `games/perfect-circle.md` (midpoint resampling; sweep measured around the stroke's centroid).
- 2026-09-24: **Load-test toolkit, full scale** (`scripts/loadtest/`, `npm run loadtest -- --scenario L1`): L1 (176 ms), L2 (319 ms, earlier session), L3 (60 phones, round-start p95 539 ms), L4 (30 phones submitting within 2 s, board complete in 521 ms) and L5 (30 phones, 10 s socket drop, presence recovered in ≤ 340 ms) all pass on the local stack, 0 errors. Estimated realtime burst rate (new: reported per run, not enforced by the local stack) stays under the cloud's 100 msg/s state/score limit throughout, but the presence-track burst on join/mass-reconnect estimates over the 20 msg/s presence limit from 30+ phones — matches `ARCHITECTURE.md` §6's own prediction, not a failure. Two real tooling bugs found and fixed along the way: a leftover `playing` session (rounds 2-3 never force-ended) blocked every later run, and `admin_open_lobby` reusing a leftover session's lineup unchanged could hand round 1 the wrong game. Details and numbers: `TESTING.md` §5.
- 2026-09-24: **Phase 0 (local)**: scaffold, tooling, CI + keepalive workflows, tokens (sampled logo colours), i18n generated from COPY.md, client libs, migrations + 420 pgTAP tests (isolated from local data). Cloud parts (Supabase projects, Netlify, keepalive runs) still to do.
- 2026-09-24: **Phase 1 slice**: data layer (`src/lib/api.ts`, `realtime.ts`, `boards.ts`), player app P1–P7, P9, P11/other-tab, offline banner (`src/player/`), host H0–H2, H4 with the host loop (`src/host/`), shared components (`src/components/`), `scripts/create-local-admin.ts` (`npm run dev:admin`), Playwright (`playwright.config.ts`, `e2e/phase1.spec.ts`, `npm run e2e`).
- 2026-09-24: Full documentation set, phase plan and Claude Code memory files written (`docs/README.md` lists them). Platform limits verified against official Supabase, Netlify and GitHub docs (sources in `ARCHITECTURE.md` §6 and `DATA_MODEL.md` §9).

## Next

1. Real-device checks: Phase 1 AC1.2 (iPhone + Android) and AC1.3 (airplane mode); Phase 2 on a projector: H3 reveal and H4/H5 readability, the P8 steps next to the big screen, the landscape overlay (E16) and screen lock (E15) on real phones.
2. Phase 3 sign-off per game (AC3.1, AC3.6, AC3.7) and E2E-2 (reload mid-round) for the four newer games in the browser (unit-tested today).
3. Team answers the blocking open questions: OQ-01 (dates), OQ-02 (roles), OQ-03 (trivia writers), OQ-14 (Netlify account), and reviews Proposed ADRs (OQ-19).
4. Phase 5 real-hardware checks for the shatter (AC5.3): ≥ 45 fps on the low-end Android (transitions, P7 celebrate), and on the projector the H3 shatter-in/dot bursts and the H4 → H5 merge (TESTING §6); compare with Reduce motion on.
5. Phase 0 cloud (with Talal): full pgTAP run on the cloud (AC0.1, needs the DB password), Auth settings check (`DEPLOYMENT.md` §2.2–2.3), cloud admin `host@gdg.com` (`scripts/cloud-admin.sql`), keepalive secrets (AC0.3), Netlify (AC0.4).

## Blockers

- **GitHub Actions is locked by a billing issue on the account** (2026-09-25): CI and the scheduled keepalive are refused ("account is locked due to a billing issue"), so the keepalive isn't touching the cloud database; the Free project pauses after ~7 days without activity. Talal fixes billing in GitHub → Settings → Billing, then re-runs Keepalive once by hand.
- Netlify needs the team's account (OQ-14). Phase 5 wants a vector logo (OQ-08) and brand approval (OQ-07). Trivia: the pool now has 30 questions marked ready (`check:trivia`); the review sign-off is OQ-03.

## Edge-case test coverage (E1–E29, `SESSION_LIFECYCLE.md` §6)

`E# → test / manual step` (unit = Vitest, pgTAP = `supabase/tests`, e2e = Playwright spec + test).
- E1 reload in lobby → `playerFlow.test.ts` (lobby/pending derivation); `join_session` idempotent (pgTAP 04); manual
- E2 reload mid-round → e2e phase1 test 2 (Stop the Clock, same attempt and epoch); each game's reload/snapshot unit tests (all five); E2E-2 for the other four games in the browser: to do
- E3 reload after finishing a round → `playerFlow.test.ts`; e2e phase1 test 2 (reload on P8 after the round: 409 → saved, no new game)
- E4 reload after the session ended → `playerFlow.test.ts` (results, day board, frozen after New session); manual
- E5 removed, rescans → e2e phase1 test 1 (GD004); pgTAP 04
- E6 late join / old code → E2E-3 (running code GD001, corner code → P3b); e2e phase1 test 1; `JoinFlow.test.tsx`; pgTAP 04
- E7 phone leaves mid-round → e2e phase1 test 3 (grey + End round, no score row); E2E-6 (an idle phone holds the round to the deadline); `hostLoop.test.ts`
- E8 host crash / reload → E2E-6 (overdue round → `time_cap` on reopen; late resume shows 3 s "Next" then starts the round); `schedule.test.ts`; `hostLoop.test.ts`
- E9 two tabs → `storage.test.ts` (tab lock); screen `sys.other_tab`
- E10 two browsers on one phone → accepted by design (separate anonymous user); manual at the dry run
- E11 duplicate names → E2E-8; pgTAP 04 (suffixes 2, 3), 07 (one day-board row per key)
- E12 zero players finish → `hostLoop.test.ts` (`time_cap` with no scores); H2/H3 `round.no_scores`, H4/P9 `results.no_scores` (manual)
- E13 Start with zero players → Start disabled (H1, e2e phase1 before joins); pgTAP 04 (GD010)
- E14 network drop mid-submit → `submitter.test.ts`; e2e phase1 test 2 (23505 → saved); pgTAP 04 (GD007 after 15 s)
- E15 screen lock → epoch-based timers in every game (unit tests resume from stored epochs); manual on real phones
- E16 landscape during a round → E2E-3 (overlay `sys.rotate` in landscape, round continues); Perfect Circle stroke discard on resize (PC unit tests); manual on real phones
- E17 language toggle → e2e phase1 test 1 (hidden during rounds); E2E-1 (visible again on P8)
- E18 project paused / 5xx → `errors.test.ts` + `api.ts` mapping (`join.error_warming`), host banner `host.banner.db_down`; manual (runbook §5.1)
- E19 join the pending session while in the running one → allowed by the server (pgTAP 04 pending joins); manual
- E20 lineup changed during play → E2E-1 (next-games picker edits the pending session); pgTAP 04 (pending ok, playing GD010)
- E21 New session before Show day board → E2E-3, E2E-7 (New session straight from H4); pgTAP 04
- E22 score after force-end → pgTAP 04 (within 15 s accepted, after GD007); host boards re-query on inserts during the intermission (E2E-1/-7 boards update); phase1 test 2 (re-send within the window)
- E23 two host tabs → `hostLoop.test.ts` (GD010 ignored); `schedule.test.ts` (same step from `ended_at`); manual
- E24 hidden name on screen → E2E-7; pgTAP 03, 07
- E25 new event day → `playerFlow.test.ts` (closed pending → P11; results closed by a new day → P11; closed by New session stays); pgTAP 04 (closes joinable/results, refused while playing); manual from the dashboard
- E26 phone late to a round → `playerFlow.test.ts` (begins on a playing round)
- E27 cap / round ended during an attempt → `worstCase.test.tsx` (all five games); each game's tests; `playerFlow.test.ts`; E2E-6 (idle phone finishes on `time_cap`)
- E28 invalid name with the right code → e2e phase1 test 1, `JoinFlow.test.tsx`
- E29 rate-limited sign-in → `JoinFlow.test.tsx` (one retry after 5 s)

## Session notes

### 2026-09-24: Load test L1, L3-L5 at full scale (local stack)
- Ran L1 (smoke), L3 (60 phones), L4 (30 phones submit within 2 s) and L5 (30 phones, 10 s socket drop) against `supabase start`; all pass. Added a realtime message-rate estimate (largest count in any 1 s window from observed timestamps) to the console summary and JSON report, since the local stack doesn't enforce the cloud's Free-plan Realtime quotas (100 msg/s, 20 presence msg/s). Full table and per-scenario numbers: `TESTING.md` §5.
- Found and fixed two `scripts/loadtest` bugs (not app/DB bugs): (1) `run.ts` measured round 1 then ended it but never force-finished rounds 2-3, so the session stayed `playing` and every later run's `admin_start_session`/`admin_new_session` failed (`GD010`); added `SimHost.finishRemainingRounds` call + a `closeLeftoverRunningSession()` recovery step. (2) `admin_open_lobby` intentionally keeps an existing joinable session's lineup unchanged, so a leftover session could hand round 1 a different game than Stop the Clock (surfaced as `GD008 impossible_score`, detail `ooo.shape`, since the sim phone always builds a Stop the Clock payload); `SimHost.openLobby` now also calls `admin_set_lineup` to force the requested order.
- Mid-session, migration `20260925000400_join_throttle.sql` (ADR-130) landed: `join_session` now returns `{error: "GD001"|"GD013", retry_after_s?}` as data instead of raising for a wrong/locked code. Updated `sim-phone.ts`'s `join()` to check for that shape (the load test always uses a real code, so this path isn't expected to fire, but an unhandled case would have silently reported a broken join as a success).
- No app or migration changes made; the one score rejection seen during triage was caused by the tooling's lineup-order gap, not by the trigger/bounds logic in `20260924000003_score_trigger.sql`.

### 2026-09-24: Phase 2 + Phase 3 integration
- Decisions filled in (ADR-129, Proposed): intermission anchored on `ended_at` (server time); after the last round only the 7 s round board, then results; a host reopening after the intermission shows 3 s of "Next" first; phones mirror the steps from their own clock and hold on "Next" (P5 does the 3-2-1); corner code + next-games picker on H2–H5.
- Spec gaps fixed: Odd One Out worst case 62 → 64 s (intro + last transition were missing); a saved lineup with an unregistered game (e.g. Trivia) no longer hides a pick in the picker; E16 overlay was missing.
- Migration `20260925000300`: `sessions_lineup_three` added NOT VALID and validated only when every row has 3 games (after `supabase db reset` it is validated at once; on a database with old 1-game sessions it stays NOT VALID). Renamed from `000100` to sort after `20260925000200_scores_raw_size.sql`, which the cloud project already has. A CHECK applies to every UPDATE, so the migration closes old *open* 1-game sessions (status only) and refuses to run while one is `playing`.
- Phones read their own `scores` rows (P9 total for a hidden player, P7 `new_best`) and poll `hidden_names` on P10; no new subscriptions (ADR-112). The host subscribes to `pending:<id>` and, on H5, `day:<event_day_id>`.
- AC1.5 note: the last Stop the Clock finisher ends the round within ~0.5 s and H3 shows the guess reveal (dots, no scores), so that player's score may skip H2's live board; the phase1 e2e then checks it on H3's session total.
- Strings added: `common.done`, `host.results.total` (COPY.md §3, §6). Trivia now has 30 ready questions (another session), so the picker offers all five games.
- e2e: the web server runs with `E2E_NO_HMR=1` (concurrent file edits were reloading the test pages); `e2e/env.ts` refuses non-local Supabase URLs (`.env.local` now points at the cloud project). Tests leave the lobby with whoever joined last (e.g. E2E-3's latecomer): harmless, as every test counts its own players.

### 2026-09-24: Phase 1 vertical slice
- Built as scoped (no intermission, pending-lobby UI, day boards, shatter or dashboard). The host loop from `SESSION_LIFECYCLE.md` §3.1 runs for the one-round case, including the 128 s `time_cap` deadline via a `server_now()` offset (PHASES listed cap automation as out; it was cheap and makes stuck rounds end on their own).
- Copy changes (COPY.md + SCREENS.md): `lobby.lineup` → "Your games" (the count varies until Phase 3); `host.lineup.title` takes `{n}`; `host.lineup.need_three` replaced by plural `host.lineup.need`; new `join.name.counter`.
- The admin session at `/host` and `/dashboard` uses its own storage key (`gdg.v1.admin-auth`), so a laptop that was also a test phone never mixes the guest's anonymous session with the admin one.
- Phones poll the session's player rows (tiny) every 3 s for "n players" and "x/y done"; realtime stays limited to own session/rounds/own player row (ADR-112). A 15 s safety refetch of the state rows covers a missed realtime event.
- The e2e uses 4 phone contexts in test 1 (3 players + 1 removed), so 3 phones still play end to end.
- Local-only: `.env.local` needs `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` (in `.env.example`); after `supabase db reset` run `npm run dev:admin`.

### 2026-09-24: documentation session
- Changes to the original brief confirmed by the team in chat and recorded as Accepted ADRs: join with a per-session code (ADR-003); a session = 3 distinct games in a row (ADR-012); all timing and scoring on the phone (ADR-018); session ranking by total + per-game day boards (ADR-022); results stay until the host taps Show day board (ADR-010); next-session code shown small during play (ADR-015); leaderboard on the big screen after every round (ADR-009, ADR-117).
- Platform findings that shaped the design: Realtime Free limit 100 msg/s, so phones poll boards (ADR-112); disabling sign-ups blocks anonymous sign-ins, so sign-ups stay on (ADR-101); Netlify Free is credit-based with a pause-everything failure mode (ADR-126); definer functions kept out of exposed schemas (ADR-110).
