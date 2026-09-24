# Decisions (ADR log)

Purpose: the single record of what is decided for the GDG Booth Game and why, so nobody relitigates settled choices. **A decision not in this file is not decided.** Accepted entries are locked (from the team brief or confirmed by the team in chat) and change only with the team's explicit OK; Proposed entries are Fable's resolutions of implementation gaps and are binding for implementation unless the team overrides them. New decisions get a new entry before code depends on them. This file is imported into every Claude Code session, so each entry stays short; detail lives in the linked doc.

Last updated: 2026-09-24

Format: **Status** · Source · then Context / Decision / Consequences. "Changed in chat 2026-09-24" = the team (Talal) revised the original brief in the planning conversation; the revision is what's Accepted.

---

## A. Locked decisions (Accepted)

### ADR-001 Phones only for players
**Accepted** · brief §2.1
Context: guests carry phones; shared devices slow the booth. Decision: players play only on their own phones; no laptop solo mode, no shared-screen play. Consequences: all game UIs are touch-first, portrait, 360 px minimum width (`SCREENS.md`).

### ADR-002 One permanent QR on the big screen
**Accepted** · brief §2.1
Context: printed or rotating QRs go stale. Decision: one QR encoding the site root URL, displayed on the big screen (never printed), with the short URL under it as a fallback; never regenerated. Consequences: the QR cannot identify a session, so a session code is needed (ADR-003).

### ADR-003 Join with the session code + name
**Accepted** · changed in chat 2026-09-24 (replaces "join page resolves whichever session is open")
Context: the team wants control over *which* session a guest joins and a clean "new game = new code" flow. Decision: after scanning, the guest types the 4-digit code shown on the big screen, then their name. Each session has its own new code. After a session, a guest joins the next one by entering the new code. Consequences: codes are generated per session (ADR-111); joining goes through the `join_session` function (ADR-110); guests can't join remotely without seeing the screen.

### ADR-004 Name-only join, no accounts
**Accepted** · brief §2.1
Decision: no account, no password, no email for guests; a name is the only input besides the code. Consequences: identity is an anonymous auth user (ADR-102).

### ADR-005 Name rules
**Accepted** · brief §2.1
Decision: 1–12 characters; letters (Arabic and Latin), digits and spaces only; profanity blocklist in Arabic and English; duplicate names allowed, the second identical name in a session gets a numeric display suffix ("Sara 2"). Consequences: exact character set, counting and normalisation in `SCORING.md` §6; blocklist lives in the database (ADR-114).

### ADR-006 playerId per phone, invisible
**Accepted** · brief §2.1, realised by ADR-102
Decision: each phone has a stable UUID `playerId` kept in localStorage; the name is display, the `playerId` is identity; the guest never sees it. Consequences: clearing storage or switching browser = new player (accepted, `SECURITY.md`).

### ADR-007 Scanning alone creates nothing
**Accepted** · brief §2.1, confirmed in chat 2026-09-24
Decision: nothing is written anywhere (no auth user, no player row) until the guest submits a valid code + name. Consequences: anonymous sign-in happens on name submit, not page load (ADR-102).

### ADR-008 Big screen = admin view; lobby contents
**Accepted** · brief §2.2
Decision: one laptop runs the admin/host view and is what's projected. Lobby shows code, QR + short URL, joined players with presence dots, a remove button per player, the lineup picker and Start. Consequences: `SCREENS.md` H-screens.

### ADR-009 After Start: leaderboards only, minimal controls
**Accepted** · brief §2.2, extended in chat 2026-09-24
Decision: once started, no remove/kick and no admin controls except: the lineup picker (edits the *next* session only), force-end (ends the current round), and a "Next round now" skip during intermissions (ADR-117). After **each round** the big screen shows the leaderboard (round scores + running session total). Consequences: the running session can't be altered except by ending rounds.

### ADR-010 Session end flow: results → day board → new session
**Accepted** · changed in chat 2026-09-24
Decision: session results (ranked by session total) stay on screen until the host taps **Show day board**, which plays the ~15 s shatter merge into the per-game day boards. Then **New session** turns the pending lobby into the lobby, with the lineup the picker currently shows (the last lineup if untouched). Consequences: two host taps per session; `SESSION_LIFECYCLE.md` §2.

### ADR-011 Admin dashboard
**Accepted** · brief §2.2
Decision: separate `/dashboard` route, never shown to guests: session history (game lineup, start time, players, scores), combined results across all sessions and games (sortable, best-per-name toggle, day filter), hide an offensive name from every leaderboard, CSV export, start a new event day. Consequences: Phase 4.

### ADR-012 A session is 3 distinct games in a row
**Accepted** · changed in chat 2026-09-24 (replaces "one game per session")
Context: more play per visit, more variety on the board. Decision: in the lobby the host picks an ordered lineup of exactly 3 different games out of the 5; the session plays them as rounds 1–3 back to back. Consequences: a session lasts ~3–6 minutes, not ~90 s (PRD goal updated); `rounds` table; per-round caps; the MVP needs at least 3 working games (`PHASES.md`).

### ADR-013 Everyone plays simultaneously; no player cap
**Accepted** · brief §2.3
Decision: all active players play each round at the same time on their own phones; no turns; no cap on players. Consequences: realtime load scales with players; verified free-tier limits in `ARCHITECTURE.md` §6.

### ADR-014 Nobody is auto-dropped
**Accepted** · brief §2.3
Decision: a player who joined but never plays a round gets no score row for it: no leaderboard entry, no "did not play" label. Presence never removes anyone. Consequences: a dead phone holds a round until the 120 s cap or force-end.

### ADR-015 Late joiners go to the next session
**Accepted** · brief §2.3, detail changed in chat 2026-09-24
Decision: the session locks at Start. While it runs, the big screen shows the pending session's code small in a corner; entering it puts the guest in the pending lobby with "You're in the next round." Consequences: the pending session exists from Start until New session (ADR-108).

### ADR-016 Removed players are flagged, not deleted
**Accepted** · brief §2.3
Decision: remove (lobby only) sets the player's status to `removed`; their phone shows "Removed by host"; they cannot rejoin that session; the next session is a clean slate. Consequences: `join_session` refuses a removed playerId for that session.

### ADR-017 Round end conditions
**Accepted** · brief §2.3, applied per round after ADR-012
Decision: a round ends when every active player has submitted a score for it, **or** 120 seconds after it started, whichever comes first, or on host force-end. The session ends after round 3. Consequences: all game designs finish well inside 120 s (`SCORING.md` §2).

### ADR-018 Reload resumes on the phone; clocks never reset
**Accepted** · changed in chat 2026-09-24 (replaces "timing against timestamps stored in Supabase")
Context: the team wants all timing and scoring on the phone; the server never serves a clock or a score to the phone. Decision: the phone keeps its in-progress round state (attempt start times as epoch ms, answers so far) in localStorage; a reload resumes from that state with elapsed time measured from the stored start, so reloading never resets a clock. Reload after finishing a round shows the result and leaderboard, never a new game. Consequences: clearing storage mid-round loses progress (the unique constraint still blocks a second score); `SESSION_LIFECYCLE.md` edge cases.

### ADR-019 One score per player per round
**Accepted** · brief §2.3, adapted to rounds after ADR-012
Decision: unique constraint on `scores (round_id, player_id)` (the brief's `(session_id, player_id)` becomes per round because a session now has 3 rounds). Consequences: retries are idempotent; a replay attempt is refused by the database.

### ADR-020 Player screen after finishing
**Accepted** · brief §2.3
Decision: after finishing a round, the phone shows the player's own score large at the top, then the same live leaderboard as the big screen. Consequences: `SCREENS.md` P-screens.

### ADR-021 Client-computed 0–1000 scores; server rejects only impossible values
**Accepted** · brief §2.4, confirmed in chat 2026-09-24
Decision: every round outputs an integer 0–1000 computed on the phone and submitted by an insert through the Supabase client. The only server-side defence is rejecting impossible values (out of range or beyond per-game physical bounds). Consequences: cheating is possible and accepted (`SECURITY.md`); bounds in `SCORING.md` §4.

### ADR-022 Leaderboards
**Accepted** · brief §2.4, session total added in chat 2026-09-24
Decision: day boards are per game (tabs), day-long, best score per name (ADR-105). Session results rank by session total (sum of the 3 round scores, 0–3000); each round score also counts toward that game's day board. Consequences: `SCORING.md` §5.

### ADR-023 Multi-day event
**Accepted** · brief §2.4
Decision: day boards reset per event day; previous days stay in dashboard history. A day is bounded by an admin action, not midnight (ADR-109).

### ADR-024 The five games
**Accepted** · brief §2.5
Decision: Odd One Out, Stop the Clock, Simon, Perfect Circle, Trivia, with the rules in the brief; every attempt has its own timeout. Consequences: full specs in `docs/games/*.md`; numbers in `SCORING.md`.

### ADR-025 Stop the Clock reveal
**Accepted** · brief §2.5, confirmed in chat 2026-09-24
Decision: fixed targets 5 s, 10 s, 7 s; timer completely hidden; no feedback until all three are done; then the player sees their own score and guesses; at the end of the round the big screen reveals everyone's guesses together. Consequences: the score row stores per-attempt raw data.

### ADR-026 Simon accessibility and colours
**Accepted** · brief §2.5, §4
Decision: pads differ by position and shape (rounded chevron tips pointing up/right/down/left), not colour alone; pads use Google's four colours as the one deliberate exception to the GDG palette.

### ADR-027 Trivia structure
**Accepted** · brief §2.5
Decision: 5 questions per player from a pool of 30; no repeats within one player's five; 4 options shuffled per player; 10 s per question; wrong/timeout = 0 for that question, round continues; score from correct answers plus remaining time.

### ADR-028 Stack: Netlify static site + Supabase, no backend server
**Accepted** · brief §2.6
Decision: static frontend on Netlify (free); Supabase (free) Postgres + Realtime + Auth, called directly from the browser with the JS client. No custom server, no Render, no WebSocket server, no Netlify Functions. Database functions/triggers inside Supabase are allowed (ADR-110). Consequences: `ARCHITECTURE.md` §2.

### ADR-029 Guests use their own mobile data
**Accepted** · brief §2.6
Decision: the design never depends on venue WiFi. Consequences: small bundle, few requests; carrier NAT means many guests share an IP (ADR-102).

### ADR-030 Security floor
**Accepted** · brief §2.6
Decision: RLS on every table; guests can insert and read only what they need; guests can never update or delete scores or other players; name filter + admin hide as backup. Consequences: full policies in `DATA_MODEL.md` §4.

### ADR-031 Keepalive from day one
**Accepted** · brief §2.6
Decision: a scheduled GitHub Actions job touches the database from the day the Supabase project is created, so the free project never pauses for inactivity. Consequences: `DEPLOYMENT.md` §4.

### ADR-032 No deploys on event day; dry run the day before
**Accepted** · brief §2.6, confirmed in chat 2026-09-24
Decision: the build used at the event is deployed and tested before the event; nothing is deployed on an event day. Dry run with at least five real phones the day before. Consequences: content (trivia, blocklist seed) freezes before the last deploy; see ADR-119 for the emergency exception.

### ADR-033 GDG brand
**Accepted** · brief §4
Decision: palette = blue (primary), amber (highlight/winner), near-black, off-white, exact values sampled from the logo (placeholders until then); no other brand colours except Simon's pads. Mosaic shatter is the transition/celebration motif, built as its own effect; the logo mark is never distorted or animated. Facing chevrons frame intros/versus moments. Roboto (Latin) and Cairo (Arabic). Consequences: `DESIGN_SYSTEM.md`; chapter-lead brand approval is an open question.

### ADR-034 Bilingual AR/EN with full RTL
**Accepted** · brief §4
Decision: every screen in Arabic and English; RTL layout for Arabic; language = device default, overridable by a toggle that is remembered on the device. Consequences: no hard-coded strings; `COPY.md` is the source of all strings.

---

## B. Gap resolutions (Proposed)

### ADR-101 Admin authentication
**Proposed** · gap §3.1
Context: admins need write rights no guest has, without a server. Decision: one Supabase Auth email+password admin account (shared by the booth team, password in the team's password manager). Admin rights = `app_metadata.role = 'admin'` on that user, set once via SQL; RLS and functions check it with `is_admin()`. `app_metadata` can't be changed by users themselves (see `DATA_MODEL.md` §4 for the cited doc). Consequences: `/host` and `/dashboard` show a login form. "Allow new users to sign up" must stay **on**, because turning it off also blocks anonymous sign-ins (Supabase Auth source; `DEPLOYMENT.md` §2). Anyone who signs up with an email just gets guest rights (no `app_metadata.role`); email confirmation stays on. After promoting the account, the admin signs out and in once so the JWT carries the role.

### ADR-102 Player identity = Supabase anonymous sign-in
**Proposed** · gap §3.2, timing confirmed in chat 2026-09-24
Decision: on name submit (not page load) the phone calls anonymous sign-in; `auth.uid()` is the `playerId`; the Supabase client persists the session in localStorage. RLS compares `player_id = auth.uid()`. Supabase's default anonymous sign-in limit is 30 per hour per IP (verified, `DEPLOYMENT.md` §2.3); it is raised to 1,000 per hour in Authentication → Rate Limits so guests behind the same carrier NAT or booth WiFi are never blocked (team request in chat). The session code is the practical gate against spam; CAPTCHA is not enabled (ADR-124). Consequences: a second tab/browser/scanner app = a different playerId (accepted).

### ADR-103 Presence via Realtime Presence
**Proposed** · gap §3.3
Decision: each phone calls `track({player_id})` once per join on channel `presence:<session_id>`; the host view reads presence state. No heartbeat writes. Rationale: Presence is in-memory (no DB writes), leaves are automatic on disconnect, and one track per phone stays far under the Free plan's 20 presence messages/s. Fallback if the load test shows trouble: a 15 s `last_seen_at` heartbeat column read only by the host. Consequences: presence is advisory only (ADR-014); a dot greys out after 10 s without presence.

### ADR-104 Timing authority
**Proposed** · gap §3.4, shaped by ADR-018
Decision: phones measure all gameplay time locally (`performance.now()` for precision, epoch ms in localStorage for reload). Phones never compare clocks with each other or the server. The **host client** is the authority for round lifecycle: it starts rounds and ends them when all active players have scores, or when its own deadline passes (3 s countdown + 120 s + 5 s grace = 128 s after `round.started_at`, measured against server time fetched once). The database only uses its own `now()` to refuse score inserts arriving more than 15 s after `round.ended_at`. Consequences: phone clock skew is irrelevant; a crashed host laptop pauses round advancement until reopened (runbook).

### ADR-105 "Best per name" = best per name key, per game, per event day
**Proposed** · gap §3.5
Decision: the day board groups scores by normalised name key (not playerId, not display suffix). Two different guests who both type "Sara" share one day-board row showing the better score. Ties: earlier `created_at` wins. Session leaderboards list every player separately (with suffixes). Consequences: normalisation in `SCORING.md` §6; hiding works on name keys.

### ADR-106 Offline fallback: don't build one
**Proposed** · gap §3.6 (open question OQ-06 for the team)
Recommendation: no offline mode. Without a server there's nothing to fall back to, and an offline mode doubles the state logic. Mitigations: guests use their own mobile data; a team phone hotspot for the laptop; runbook "network down" playbook (switch to a spoken trivia round at the booth).

### ADR-107 Frontend tooling
**Proposed** · gap §3.7
Decision: Vite + React + TypeScript; plain CSS with custom-property tokens (no CSS framework); no router library (three paths switched by `location.pathname`); no i18n library: two JSON dictionaries (`en.json`, `ar.json`) plus a ~30-line `t()` using `Intl.PluralRules`; Vitest for unit tests, Playwright for multi-phone e2e. Rationale: React is what most student teams already know, TypeScript catches contract mistakes in scoring payloads and DB types (`supabase gen types`), and every extra library is one more thing to learn. Consequences: `ARCHITECTURE.md` §8 source tree.

### ADR-108 Pending lobby mechanics
**Proposed** · gap §3.8
Decision: `start_session` atomically sets the lobby to `playing`, creates its 3 rounds, and creates a new session in state `pending` with a fresh code and the same lineup. Late joiners join the pending session. `new_session` closes the finished session and flips `pending` → `lobby`. If no pending session exists (first session of the day), `new_session` creates a lobby. At most one joinable (`pending` or `lobby`) and one running (`playing` or `results`) session exist at any time (partial unique indexes).

### ADR-109 Event day boundary
**Proposed** · gap §3.9
Decision: `event_days` table; exactly one row is current. The dashboard's "Start new event day" (allowed only when no session is `playing`) closes the current day, closes any joinable session, and opens a new day. Every session and score references its day. History is never deleted.

### ADR-110 Database functions for multi-step writes
**Proposed**
Decision: joining (`join_session`) and every admin state transition are Postgres functions called with `supabase.rpc()`. Admin functions are `SECURITY INVOKER` (Supabase's recommended default) backed by admin-only RLS policies, and check `is_admin()` for a clear error. `join_session` and `keepalive` are the only `SECURITY DEFINER` functions exposed, with fully validated inputs; helper/trigger functions live in the unexposed `private` schema, following Supabase's warning about definer functions in exposed schemas. This runs inside Supabase and is not a backend server (ADR-028). Scores and player progress use plain inserts/updates under RLS.

### ADR-111 Session code format
**Proposed**
Decision: 4 digits, 1000–9999, random, unique among joinable sessions. Input accepts Western and Arabic-Indic digits. Rationale: fast to type on a numeric keypad; readable from across the booth.

### ADR-112 Realtime via Postgres Changes
**Proposed**
Decision: Postgres Changes (RLS applies per subscriber) for **state**: phones subscribe to their session's `sessions`/`rounds` rows and their own `players` row; the host also subscribes to `players`, `scores` and `hidden_names`. Phones **poll** leaderboard views (every 3 s while a board is visible) instead of receiving every score. Rationale: the Free plan allows 100 Realtime messages/s for the whole project; fanning every score out to every phone would exceed that with ~15 players finishing together. Upgrade path: database-triggered Broadcast if load tests show lag (`TESTING.md` §5). Details `DATA_MODEL.md` §8.

### ADR-113 Server bounds via constraints + trigger
**Proposed**
Decision: `CHECK (score BETWEEN 0 AND 1000)` plus a `BEFORE INSERT` trigger that fills trusted columns (game, session, day, name) and rejects per-game impossible values and malformed raw data (`SCORING.md` §4). The server never recomputes a score from the raw data.

### ADR-114 Profanity blocklist in the database
**Proposed**
Decision: blocked terms live in a `blocked_terms` table checked inside `join_session`, seeded by migration, editable by the admin from the dashboard. Rationale: can be extended on event day without a deploy (ADR-032). Guests can't read the list.

### ADR-115 Hide by name key
**Proposed**
Decision: hiding writes the name key to `hidden_names`; all leaderboard views exclude hidden keys, including live session boards. Rows are kept. The hidden player's own phone still shows their own score.

### ADR-116 Trivia pool is static content in the repo
**Proposed**
Decision: `docs/content/trivia-questions.json` is the single source; the build imports it; per-player draws happen on the phone. Consequences: content freezes before the last deploy; answers are visible in the bundle (accepted, `SECURITY.md`).

### ADR-117 Intermissions between rounds
**Proposed** (the host-side leaderboard after every round was requested in chat 2026-09-24)
Decision: when a round ends, the host view shows a 15 s intermission: round leaderboard (7 s) → running session total (5 s) → "Next: <game>" 3-2-1 (3 s), then the host client starts the next round automatically. The host may tap "Next round now". Phones show the same boards and the countdown.

### ADR-118 Phase plan adjustments
**Proposed**
Decision: vs the brief's suggested order: admin auth, anonymous sign-in and the full schema (incl. `rounds`) move into Phase 0; a basic force-end moves into Phase 1 so slice sessions can't hang; multi-round sequencing is Phase 2; hide-name and CSV export are part of the minimum shippable version. Details in `PHASES.md`.

### ADR-119 Emergency rollback exception
**Proposed**
Decision: on an event day, the only allowed change to the live site is re-publishing a previously deployed, dry-run-tested Netlify build (no new build), and only with the booth lead's OK. Database changes on event day: only admin data actions (blocklist, hide), never migrations.

### ADR-120 Round count constant for the vertical slice
**Proposed**
Decision: the data model supports N rounds; `ROUNDS_PER_SESSION = 3` is a single config constant. During Phases 1–2 (only Stop the Clock exists) it is 1; it becomes 3 the moment three games pass their acceptance criteria and never changes after Phase 3.

### ADR-121 Two tabs on one phone
**Proposed**
Decision: the app takes a Web Locks lock per playerId; a second tab shows "Already open in another tab" and does nothing. Fallback where Web Locks is missing: a `BroadcastChannel` ping.

### ADR-122 Big-screen and phone themes
**Proposed**
Decision: light theme (off-white background, near-black text, blue/amber fills) on both phones and the big screen, because expo halls are bright and projectors wash out dark backgrounds. A dark big-screen theme exists as a token switch and is compared at the dry run.

### ADR-123 Numerals
**Proposed**
Decision: scores, codes and timers display Western digits (0–9) in both languages (common in Jordan, avoids mixed-digit leaderboards); inputs accept Arabic-Indic digits and normalise them.

### ADR-124 No CAPTCHA on anonymous sign-in
**Proposed**
Context: Supabase strongly recommends invisible CAPTCHA or Cloudflare Turnstile for anonymous sign-ins. Decision: not enabled for the event: joining needs the on-screen code, bots gain nothing but a place on a prize-less board, and Turnstile adds a dependency and a failure mode on slow mobile data. Consequences: spam joins are an accepted risk (`SECURITY.md` T6); Turnstile is the documented upgrade if abuse appears before the event.

### ADR-125 Browser uses the publishable key
**Proposed**
Decision: the site uses Supabase's publishable key (`sb_publishable_…`), not the legacy `anon` key, which Supabase is deprecating by the end of 2026. The secret key never leaves the maintainers' machines and is never used by the site, the keepalive job or the load test.

### ADR-126 Netlify credit budget
**Proposed**
Context: the Netlify Free plan (credit-based, accounts since Sept 2025) has a hard 300 credits/month; each production deploy costs 15; bandwidth 20 credits/GB; when credits run out, **every site on the account is paused**. Rollbacks and deploy previews cost nothing. Decision: day-to-day testing uses deploy previews / branch deploys; production deploys are batched (target ≤ 8 per month, none in the event week except the final one); the booth site lives on a Netlify account used for nothing else; credit usage is checked at the dry run. Consequences: `DEPLOYMENT.md` §3; open question OQ-14 (which plan the team's account is on).

### ADR-127 Two Supabase projects
**Proposed**
Decision: `gdg-booth-dev` (development, deploy previews, load tests) and `gdg-booth-prod` (event only), the Free plan's limit of two active projects. Migrations are applied to dev first, then prod. The keepalive runs against both (dev pausing is harmless but annoying).

### ADR-128 Keepalive cadence and repository
**Proposed**
Decision: the GitHub Actions job calls `keepalive()` (a real database write) every 6 hours at minute 17 (avoiding top-of-hour delays). The repository is **private**, because GitHub disables schedules in public repositories after 60 days without activity. The job's success is checked weekly and on the dry-run day.

