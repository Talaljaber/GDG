# GDG Booth Game — project memory

A multiplayer mini-game system for our GDG on Campus booth at the AI Expo in Jordan. Guests scan one permanent QR on the big screen, type the session's 4-digit code and a name (no account), and play a session of **3 different short games in a row** on their own phones, picked from seven: Odd One Out, Stop the Clock, Simon, Perfect Circle, Trivia, Close the Brackets, Color Clash (ADR-134). The admin laptop is the projected big screen (lobby, live leaderboards after every round, session results, per-game day boards); a separate admin dashboard handles history, combined results, hiding names and new event days. Bilingual Arabic/English with full RTL, GDG-branded. Goal: pull people to the booth, keep them a few minutes, bring them back.

Last updated: 2026-09-25

**Status:** see the imported PROGRESS below. Documentation is complete; follow `docs/PHASES.md`.

## Stack
- Static frontend on **Netlify** (free). Vite + React + TypeScript, plain CSS tokens, tiny in-house i18n (ADR-107).
- **Supabase** (free, eu-central-1): Postgres + RLS + SQL functions/triggers, Auth (anonymous guests + one admin), Realtime (Postgres Changes + Presence).
- **No backend server.** No Netlify Functions, no Render, no WebSocket server.
- No GitHub Actions (team decision 2026-09-25): keepalive via an external scheduler every 6 h (ADR-031, `docs/DEPLOYMENT.md` §4); run the checks by hand before each deploy. Vitest, pgTAP (`supabase test db`), Playwright.

## Directory map
```
CLAUDE.md                 this file
.claude/rules/            path-scoped rules: games, supabase, ui-i18n, docs-sync
docs/                     all specs (index: docs/README.md)
  games/*.md              one spec per game
  content/                trivia format + trivia-questions.json (the pool)
assets/                   logo files (provided)
public/_redirects         SPA fallback
src/
  main.tsx  config.ts     route switch (/, /host, /dashboard); constants
  lib/                    supabase client, realtime, storage, names, rng, errors
  i18n/                   en.json, ar.json, t.ts
  styles/                 tokens.css, base.css
  effects/shatter/        mosaic shatter layer
  components/ player/ host/ dashboard/
  games/<game-id>/        screen + scoring.ts + scoring.test.ts
supabase/migrations/      schema, RLS, trigger, functions, views, realtime, seed
supabase/tests/           pgTAP
scripts/                  check-trivia, check-i18n, contrast, loadtest/
e2e/                      Playwright
```
(The tree is planned; it appears as Phase 0 builds it. Full version: `docs/ARCHITECTURE.md` §8.)

## Non-negotiable rules
- Scores are **integers 0–1000 per round**, computed **on the phone**; the server only rejects impossible values (`docs/SCORING.md` §4). Session total = sum of 3 rounds (0–3000).
- A session is **exactly 3 distinct games** chosen before Start (`ROUNDS_PER_SESSION`, 1 only during Phases 1–2).
- Each round ends when all active players have scored, or **120 s**, or host force-end. Every attempt has its own timeout.
- **All gameplay timing is local to the phone** (`performance.now()`, epochs in localStorage); a reload never resets a clock.
- **One score per player per round**: unique `(round_id, player_id)`; a 23505 on retry means "already saved".
- Nothing is written until the guest submits a valid code + name; anonymous sign-in happens then, not on page load.
- Names: 1–12 characters, Arabic/Latin letters, digits, spaces; blocklist in the DB; duplicates get a display suffix.
- Nobody is auto-dropped; players with no score for a round simply have no row.
- **Never add a backend server.** Multi-step writes are SQL functions called with `supabase.rpc()`.
- **RLS on every table; never disable it.** Schema changes **only via migrations**; no destructive migrations.
- Browser uses the **publishable key only**; the secret key never appears in code, CI, Netlify or scripts.
- Phones never subscribe to `scores`; they poll leaderboard views (Realtime Free limit 100 msg/s, ADR-112).
- **All UI strings live in the i18n files, AR + EN**, sourced from `docs/COPY.md`. No hard-coded user-facing text.
- RTL via logical CSS properties; names in `<bdi>`; Western digits in both languages.
- Colours/sizes/durations only from design tokens. Palette: blue, amber, near-black, off-white; Google's four colours only in Simon.
- **Never animate, distort or recolour the logo.** Effects use the separate shatter layer, with a reduced-motion fallback.
- **No deploys on event days**; the only emergency action is re-publishing a previous tested Netlify deploy (ADR-119). No migrations on event days.
- Keep production deploys scarce (Netlify Free: 15 of 300 credits each; running out pauses the site, ADR-126). Test on deploy previews.

## Where to find things
| Need | File |
|---|---|
| Where we are / what's next | `docs/PROGRESS.md` (imported below) |
| What's decided and why | `docs/DECISIONS.md` (imported below) |
| Undecided things, owners | `docs/OPEN_QUESTIONS.md` |
| Goals, user stories, metrics | `docs/PRD.md` |
| System design, diagrams, capacity, source tree | `docs/ARCHITECTURE.md` |
| Tables, RLS SQL, functions, realtime | `docs/DATA_MODEL.md` |
| States, host loop, timing constants, edge cases | `docs/SESSION_LIFECYCLE.md` |
| Formulas, bounds, boards, name rules | `docs/SCORING.md` |
| A game's full spec | `docs/games/<game>.md` |
| Screens, states, string keys | `docs/SCREENS.md` |
| Tokens, type, motion, RTL, a11y | `docs/DESIGN_SYSTEM.md` |
| Every string (AR/EN) | `docs/COPY.md` |
| Trivia format and pool | `docs/content/` |
| Threats and accepted risks | `docs/SECURITY.md` |
| Setup, env vars, keepalive, migrations, rollback | `docs/DEPLOYMENT.md` |
| Tests, device matrix, load test, dry run | `docs/TESTING.md` |
| Running the booth | `docs/EVENT_RUNBOOK.md` |
| Build plan and acceptance criteria | `docs/PHASES.md` |
| Terms | `docs/GLOSSARY.md` |

## Working agreement
- Read `docs/PROGRESS.md` at the start of every session; update it at the end (done, next, blockers, short session note).
- A decision not in `docs/DECISIONS.md` isn't decided. New decisions get a new ADR entry **before** code depends on them.
- Never change a locked (Accepted) decision without the team's explicit OK in chat; propose it in `docs/OPEN_QUESTIONS.md` instead.
- Work phase by phase; a phase is done only when its acceptance criteria in `docs/PHASES.md` pass.
- Schema changes only through migrations; never disable RLS.
- Keep docs in sync with code **in the same change** (numbers, strings, schema, screens).
- No hard-coded user-facing strings; everything goes through the AR/EN string files defined in `docs/COPY.md`.

## Memory imports
Only these two files are imported (they load at launch). Everything else is referenced by path above; open it when needed.

@docs/PROGRESS.md
@docs/DECISIONS.md
