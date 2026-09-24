# Prompt: Create the full documentation set for the GDG Booth Game

> Paste everything below this line into Claude Code, run from an empty repo root.

---

## Your role and scope

You are the technical writer and system designer for a small event project. Your job in this session is to produce the **complete documentation set, phase plan, and Claude Code memory files** for the system described below.

**Do not write implementation code.** No components, no game logic, no build config. The only code-like content allowed is what a spec needs: SQL for the schema and RLS policies, JSON schemas, scoring formulas, Mermaid diagrams, and directory trees. Everything you write must be something a developer (or a future Claude Code session) can build from without asking us again.

Before writing anything, read this whole prompt, then post a short plan: the list of files you'll create, in order, and any contradictions or gaps you found. Wait for my go-ahead before writing files.

---

## 1. Project context

- **Who:** our GDG on Campus chapter (Google Developer Groups). Small student team.
- **Where:** our booth at the **AI Expo in Jordan**.
- **What:** a quick multiplayer mini-game system guests play on their own phones. Think Kahoot's join flow, but the content is five short skill games instead of a quiz.
- **Why:** pull people to the booth, keep them there ~90 seconds, make them come back (leaderboard), and represent the GDG brand well.
- **Audience:** mixed expo visitors — students, developers, professionals. Arabic and English speakers. Most are not chapter members.
- **Prizes:** none or small. This matters: we deliberately accept light cheating risk (see §2.4 and `SECURITY.md`).

---

## 2. Locked decisions (final — do not reopen)

These were debated and decided. Document them; do not propose alternatives. If you believe one is technically impossible, say so in `OPEN_QUESTIONS.md` with evidence, but still document it as decided.

### 2.1 Devices and joining
- **Phones only for players.** No laptop solo mode, no shared-screen play.
- The **QR code is displayed on the big screen** (no printed QR). Also show a short URL under it as a fallback.
- **One permanent QR/URL for the whole event.** The join page resolves whichever session is currently open; we never regenerate the QR per session.
- Players join by **entering a name only** — no account, no password, like Kahoot.
- Name rules: max 12 characters, letters/digits/spaces only (Arabic and Latin letters both allowed), profanity blocklist in Arabic and English. Duplicate names are allowed; the second identical name in a session gets a numeric suffix on display.
- Each phone generates a **`playerId` (UUID)** on first visit and keeps it in localStorage. The name is display; the `playerId` is identity. Invisible to the player.
- **Scanning alone creates nothing.** A player exists in the session only after submitting a name.

### 2.2 The admin / big screen
- One laptop connected to the big screen runs the **admin view**, which is also what's projected.
- **Before start (lobby):** QR + URL, list of joined players, a presence indicator per player (greys out if the phone goes quiet), a **remove** button per player, the **game picker**, and **Start**.
- **After start:** the screen becomes the **live leaderboard** for that session. **No remove/kick, no admin controls** except the **game picker** (which sets the game for the *next* session and never affects the running one) and a small **force-end** control for when a phone dies.
- After results: a **New session** action returns to an empty lobby with the last game preselected.
- **Admin dashboard** (separate route, opened on the admin's phone or on the laptop when not projecting — never shown to guests) with:
  - **Session history** — every session of the day: game, start time, players, their scores.
  - **Combined results** — one view of all results across all sessions and games, sortable, best-per-name toggle. This is what we'd use at end of day.
  - Ability to hide an offensive name from any leaderboard.

### 2.3 Session rules
- **Admin picks one game per session.** Everyone in the session plays that game.
- **Everyone plays simultaneously** on their own phone. No turns.
- **No player cap.**
- **Nobody is ever auto-dropped.** A player who joined but never plays simply gets no score: no score row, no leaderboard entry, no "did not play" label.
- **Late joiners:** the session locks when the admin hits Start. Anyone submitting a name after that lands in the **next session's lobby** (a pending lobby that exists while the current session runs) and sees "You're in the next round."
- **Removed players:** flagged, not deleted. Their phone shows "Removed by host" and cannot rejoin *that* session. Next session is a clean slate.
- **Session ends** when every active player has finished **or** after **120 seconds**, whichever comes first, or on admin force-end.
- **Reload during a game:** the player is recognised via `playerId` and resumes; timing is measured against the **session/attempt start timestamp stored in Supabase**, so reloading can never reset a clock.
- **Reload after finishing:** shows their result and the leaderboard, never a new game. Enforced by a **unique constraint on (session_id, player_id)** for scores.
- **Player screen after finishing:** their own score large at the top, then the same live leaderboard as the big screen.

### 2.4 Scoring and leaderboards
- Every game outputs an integer **0–1000**.
- **Scores are computed on the client** and submitted. The only server-side defence is **rejecting impossible values** (above the game's max, negative, or physically impossible per-game bounds you define). This is intentional.
- **Leaderboards are per game** (tabs), **day-long**, **best score per name**.
- Session results stay on screen until the admin taps **New session**; the ~15-second shatter animation merges them into the day board.
- **Multi-day event:** the day board resets per event day; previous days stay in the dashboard history. Define how a "day" is bounded (admin action, not midnight).

### 2.5 The five games

All games: touch input on phone, themed per §4, must finish well inside the 120-second session cap. **Every attempt has its own timeout** (a player can never sit on one grid, one hidden timer or one drawing indefinitely); define each cap and what score a timed-out attempt gets.

1. **Odd One Out** — a grid of GDG chevrons with exactly one different (rotated or amber among blue). Tap it. **Three grids, each harder** (bigger grid and/or subtler difference). Time per grid is measured; total time converts to score. Difficulty must be tuned for small phone screens under bright expo lighting.
2. **Stop the Clock** — tap start; the timer is **completely hidden** (no bar, no ticking, no animation). Tap stop when you think the target has elapsed. **Three attempts with different targets (e.g. 5s, 10s, 7s).** Score from total absolute error; an attempt auto-stops at target + 10 s. **Nobody sees their result until they've finished all three**, and the session reveal shows everyone's guesses together.
3. **Simon** — four pads flash a sequence; player taps it back. Starts at length 3, +1 each success, **one mistake ends the turn**. Score from length reached plus a small time bonus to break ties. Pads must differ by **position and shape, not color alone** (color-blind players).
4. **Perfect Circle** — draw a circle with a finger. Scored on roundness (and closure). Define the roundness metric precisely, the minimum size that counts, and the number of attempts (one clean attempt is the default unless you justify otherwise).
5. **Trivia** — **5 questions per player**, drawn from a **pool of 30**; repeats across players are fine. **No repeated question within one player's five.** **4 answer options, 10 seconds per question,** options shuffled per player. Score = correct answers plus remaining time on each correct one. Wrong answer scores zero for that question but doesn't end the round.

For each game you must define: exact rules, timings, the scoring formula mapping raw performance to 0–1000, the max possible and the "impossible" rejection bounds, every UI state, and edge cases.

### 2.6 Stack
- **Frontend:** static site on **Netlify** (free plan).
- **Data + realtime:** **Supabase** (free plan): Postgres + Realtime. Phones and admin talk to Supabase directly via the JS client.
- **No custom backend server.** No Render, no WebSocket server, no Netlify Functions unless you document a specific need in `DECISIONS.md`.
- Runs on guests' own mobile data; we don't depend on venue WiFi.
- **Security floor:** RLS on every table. Guests can insert and read what they need; guests can never update or delete scores or other players. Name filter + admin hide as backup.
- **Supabase free projects pause after 7 days without database activity** — a keepalive (scheduled ping, e.g. GitHub Actions) runs from the day the project is created.
- **Never deploy on event day.** Dry run with at least five real phones the day before.

---

## 3. Gaps you must resolve (and record)

These weren't settled because they're implementation-level. Propose a solution for each, justify it, and record it in `DECISIONS.md` as **Proposed** (not Accepted):

1. **Admin authentication.** Guests use the public anon key. How does the admin get rights to create sessions, lock them, remove players, force-end and hide names without a backend server? (Consider Supabase Auth with a single admin account and role-based RLS.)
2. **Player row ownership.** Players need to update their own status (joined → playing → finished) and nobody else's. How is that enforced by RLS without accounts? (Consider Supabase anonymous sign-in so `auth.uid()` is the `playerId`.)
3. **Presence.** Lobby presence indicator: Supabase Realtime Presence vs periodic heartbeat writes. Pick one and justify (think about DB write volume and free-tier limits).
4. **Session timer authority.** Where the 120s deadline and per-attempt start timestamps live, and how clients agree on "now" (clock skew between phones).
5. **Leaderboard dedupe.** "Best per name" vs "best per playerId" — define exactly which, and what happens with duplicate names across sessions.
6. **Offline fallback.** Whether we want a no-network fallback for the booth. Record as an open question for the team, with a recommendation.
7. **Frontend tooling.** Framework (or none), TypeScript or not, build tool, i18n library. Recommend the lightest option a small student team can maintain, and justify.
8. **Pending lobby mechanics.** How the "next session" lobby exists while the current one runs, and how it becomes the active lobby on **New session**.
9. **Day boundary.** How the admin starts a new event day without losing history.

Verify any platform limits or features you rely on against current official Supabase and Netlify docs, and cite the doc URL in the relevant file. Don't rely on memory for limits.

---

## 4. Brand and theming (GDG)

The whole thing must feel like our GDG chapter — colors, type, motion, copy, and trivia content.

- **Logo:** two chevrons, `<` in blue and `>` in amber, facing each other, with a shattered crystalline mosaic on their inner edges. The logo file will be provided in `/assets`.
- **Palette:** blue (~#2A8FC7) as primary and amber (~#F0A32E) as highlight/winner, plus a near-black and an off-white. **Exact values must be sampled from the logo file** — list them as placeholders to confirm. No other brand colors.
- **One exception:** **Simon uses Google's four colors** (blue, red, yellow, green) on its pads as a deliberate Google nod.
- **Signature motif:** the **mosaic shatter** is the transition between screens and the celebration effect (round results shatter in; a new best score fragments and reassembles). It's built as its own effect — **never distort or animate the actual logo mark.** Note that Google has brand guidelines for chapters; add a checklist item to confirm with our chapter lead.
- **Two chevrons facing each other** = natural versus/intro framing.
- **Type:** Roboto for Latin; Cairo or Tajawal for Arabic (all Google Fonts).
- **Bilingual AR/EN with full RTL support.** Define how language is chosen (device default + toggle).
- **Big-screen readability:** sizes and contrast for a projector viewed from several meters; phone readability in bright light.
- **Vibe:** friendly, colorful, community-first, slightly playful — like our chapter's Instagram, not corporate. Leaderboard celebrates people by name.
- **Game theming:** Odd One Out uses chevrons; Stop the Clock's reveal uses the shatter; Simon pads are rounded chevron tips; Perfect Circle's stroke fills with the mosaic texture and the score ring goes blue→amber.
- **Trivia content** mixes three buckets: Google/dev general knowledge, AI basics at expo-visitor level, and a few light GDG/community questions. **No insider questions** a guest can't answer (e.g. "who was our 2023 lead").

---

## 5. Deliverables

Create exactly this structure. Every doc starts with a one-paragraph purpose statement and a "Last updated" line.

```
/CLAUDE.md
/.claude/rules/            (path-scoped rules, see below)
/docs/
  README.md                index of all docs, one line each
  PRD.md
  ARCHITECTURE.md
  DATA_MODEL.md
  SESSION_LIFECYCLE.md
  SCORING.md
  games/
    odd-one-out.md
    stop-the-clock.md
    simon.md
    perfect-circle.md
    trivia.md
  SCREENS.md
  DESIGN_SYSTEM.md
  COPY.md
  content/
    trivia-format.md
    trivia-questions.json   (schema-valid template, 30 empty slots + 3 filled examples)
  SECURITY.md
  DEPLOYMENT.md
  TESTING.md
  EVENT_RUNBOOK.md
  PHASES.md
  DECISIONS.md
  OPEN_QUESTIONS.md
  PROGRESS.md
  GLOSSARY.md
```

### What each file must contain

- **CLAUDE.md** — the project memory loaded every session. **Keep it under ~150 lines.** Include: one-paragraph project summary; stack; directory map; the non-negotiable rules as short, verifiable bullets (e.g. "Scores are 0–1000 integers", "Never add a backend server", "All UI strings live in the i18n files, AR+EN"); where to find each doc; the working agreement in §7. **Do not @import the whole docs folder** — imported files load into context at launch. Import only `docs/PROGRESS.md` and `docs/DECISIONS.md`; reference everything else by path.
- **.claude/rules/** — small path-scoped rule files so detail only loads when relevant, e.g. one for game code (scoring contract, timing, theming per game), one for Supabase/SQL (RLS required, migrations only, no destructive changes), one for UI/i18n (RTL, fonts, palette tokens).
- **PRD.md** — goals, non-goals, users (guest, admin), user stories with acceptance criteria, success metrics for the event (e.g. players per hour, return players).
- **ARCHITECTURE.md** — Mermaid diagrams: system overview, join flow sequence, gameplay + score submission sequence, realtime leaderboard flow. Explain the no-backend design and its trade-offs.
- **DATA_MODEL.md** — every table and column with types, constraints, indexes, the unique (session_id, player_id) constraint, realtime publications, and **full RLS policies in SQL** for guest and admin. Include an ER diagram (Mermaid).
- **SESSION_LIFECYCLE.md** — state machine (lobby → playing → results → closed) as Mermaid, plus per-player states (joined → playing → finished / removed). An **edge-case table**: every scenario (reload in lobby, reload mid-game, reload after finish, removed then rescans, late join, phone dies, admin closes laptop, two tabs same phone, duplicate names, zero players finish, network drop mid-submit, phone screen locks mid-game, phone rotates, language switched mid-game, Supabase project paused at first request) with expected behaviour.
- **SCORING.md** — the shared 0–1000 contract, per-game formulas in one place, rejection bounds, tie-breaking, how "best per name" is computed.
- **games/*.md** — one per game using the same template: rules, flow, timings, difficulty curve, scoring formula with worked examples, rejection bounds, UI states, theming, accessibility, edge cases, test cases.
- **SCREENS.md** — every screen for player phone, big screen/admin, and admin dashboard, with each state, what's shown, and transitions. Include low-fi ASCII or Mermaid wireframes where useful.
- **DESIGN_SYSTEM.md** — color tokens (with placeholders for sampled values), typography scale for phone and projector, spacing, motion (the shatter effect spec: duration, easing, when used), iconography, RTL rules, accessibility (contrast, touch target sizes, reduced motion).
- **COPY.md** — every user-facing string, AR and EN side by side, in the chapter's friendly voice.
- **content/trivia-format.md + trivia-questions.json** — JSON schema, bucket tags, difficulty tag, AR/EN fields, answer shuffling rule, review checklist for the team writing them.
- **SECURITY.md** — threat list realistic for a booth (fake scores, name abuse, leaderboard wipe, anon-key exposure, spam joins), what we defend and what we accept, and why.
- **DEPLOYMENT.md** — Netlify and Supabase setup steps, environment variables, keepalive setup, migration process, rollback, the "no deploys on event day" rule.
- **TESTING.md** — test strategy per layer, device/browser matrix (iOS Safari, Android Chrome, low-end Android), bright-light check for Odd One Out, load test with 15+ simulated phones, the day-before dry run script.
- **EVENT_RUNBOOK.md** — for whoever runs the booth: setup checklist, how to run a session, what to say to guests (short script), failure playbook (Supabase paused, a phone can't load, projector issues, offensive name, admin laptop crash), end-of-day steps (export combined results as CSV, start a new event day).
- **PHASES.md** — see §6.
- **DECISIONS.md** — an ADR-style log. One entry per decision in §2 (status **Accepted**) and §3 (status **Proposed**), each with context, decision, consequences. This file exists so nobody relitigates settled choices.
- **OPEN_QUESTIONS.md** — at minimum: event date and deadline, team size and roles, who writes the 30 trivia questions, bilingual confirmation, prizes, offline fallback, brand approval from chapter lead, exact logo colors. Each with owner (TBD) and what it blocks.
- **PROGRESS.md** — the living project memory: current phase, what's done, what's next, blockers, last session notes. Start it with "Phase 0 — docs complete, implementation not started."
- **GLOSSARY.md** — session, round, attempt, player, playerId, lobby, day board, etc.

---

## 6. Phase plan (PHASES.md)

Break the build into phases. Each phase has: goal, scope (in/out), task list, **acceptance criteria that can be checked**, dependencies, and a rough size (S/M/L). Suggested order — adjust if you find a reason, and record why in DECISIONS.md:

- **Phase 0 — Foundations:** repo, Netlify + Supabase projects, keepalive, schema + RLS migrations, i18n scaffolding, design tokens.
- **Phase 1 — Vertical slice:** join by QR + name, lobby with presence and remove, admin Start, **Stop the Clock** end to end, score submission, session results. (Stop the Clock first because it's the simplest game and proves the whole pipeline.)
- **Phase 2 — Leaderboards & sessions:** live leaderboard via Realtime, per-game day boards, best-per-name, reload/late-join/removed handling, 120s cap, force-end, new session.
- **Phase 3 — Remaining games:** Odd One Out, Simon, Perfect Circle, Trivia (with the JSON pool).
- **Phase 4 — Admin dashboard:** session history, combined results, hide names, export.
- **Phase 5 — Theming & polish:** full GDG theme, shatter motion, RTL pass, projector and bright-light tuning, copy pass.
- **Phase 6 — Hardening & event prep:** load test, device matrix, security review, dry run, runbook rehearsal, content freeze.

Mark which phases are the **minimum shippable version** if time runs short (my suggestion: Phases 0–2 plus two or three games), and say explicitly which games to cut first.

---

## 7. Working agreement to write into CLAUDE.md

- Read `docs/PROGRESS.md` at the start of every session; update it at the end (done, next, blockers).
- A decision not in `DECISIONS.md` isn't decided. New decisions get a new ADR entry before code depends on them.
- Never change a locked decision without the team's explicit OK in chat; propose it in `OPEN_QUESTIONS.md` instead.
- Work phase by phase; a phase is done only when its acceptance criteria in `PHASES.md` pass.
- Schema changes only through migrations; never disable RLS.
- Keep docs in sync with code in the same change.
- No hard-coded user-facing strings; everything goes through the AR/EN string files defined in `COPY.md`.

---

## 8. Quality bar before you finish

When all files are written, do a final pass and report:
1. A consistency check — every number (12 chars, 120s, 5 of 30 questions, 10s per question, 3 attempts, 0–1000, etc.) is identical across all docs.
2. Every locked decision in §2 appears in `DECISIONS.md`.
3. Every gap in §3 has a Proposed decision.
4. Every screen in `SCREENS.md` has its strings in `COPY.md`.
5. `CLAUDE.md` line count.
6. Anything you couldn't resolve, listed in `OPEN_QUESTIONS.md`.

Then stop. Do not start Phase 0.