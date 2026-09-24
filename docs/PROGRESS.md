# Progress

Phase 1 (vertical slice) — implemented and verified locally; real-device checks pending.

Purpose: the living project memory. It records the current phase, what's done, what's next, blockers and short notes from each working session. Every Claude Code session reads it first and updates it last (CLAUDE.md working agreement). Keep it short: move finished detail into the relevant doc and keep only pointers here.

Last updated: 2026-09-24

---

## Current phase

**Phase 1: Vertical slice** (`PHASES.md`). Built and green locally (typecheck, lint, unit tests, `check:i18n`, `check:trivia`, build, `npm run e2e`). Remaining before it's "done": the real-device parts of AC1.2/AC1.3 (below). Phase 0's cloud items (dev/prod projects, Netlify, keepalive runs) are tracked separately.

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

- 2026-09-24: **Game modules built ahead of Phase 3** (pure scoring + screens + tests, each to its doc): Odd One Out, Simon, Perfect Circle, Trivia (`src/games/*`). Registered in `src/games/registry.ts`; Trivia is only offered once ≥ 5 questions are ready (currently 3). Sessions stay at `ROUNDS_PER_SESSION = 1` until Phase 2's multi-round sequencing lands (ADR-120). Perfect Circle metric fixes written back to `games/perfect-circle.md` (midpoint resampling; sweep measured around the stroke's centroid).
- 2026-09-24: **Load-test toolkit** (`scripts/loadtest/`, `npm run loadtest -- --scenario L1`): L1 (15 phones) and L2 (30) pass locally: round-start p95 176 ms / 319 ms, no errors. L3–L5 not yet run at full scale.
- 2026-09-24: **Phase 0 (local)**: scaffold, tooling, CI + keepalive workflows, tokens (sampled logo colours), i18n generated from COPY.md, client libs, migrations + 420 pgTAP tests (isolated from local data). Cloud parts (Supabase projects, Netlify, keepalive runs) still to do.
- 2026-09-24: **Phase 1 slice**: data layer (`src/lib/api.ts`, `realtime.ts`, `boards.ts`), player app P1–P7, P9, P11/other-tab, offline banner (`src/player/`), host H0–H2, H4 with the host loop (`src/host/`), shared components (`src/components/`), `scripts/create-local-admin.ts` (`npm run dev:admin`), Playwright (`playwright.config.ts`, `e2e/phase1.spec.ts`, `npm run e2e`).
- 2026-09-24: Full documentation set, phase plan and Claude Code memory files written (`docs/README.md` lists them). Platform limits verified against official Supabase, Netlify and GitHub docs (sources in `ARCHITECTURE.md` §6 and `DATA_MODEL.md` §9).

## Next

1. Phase 1 real-device checks: AC1.2 on an iPhone and an Android; AC1.3 with airplane mode (see the table above).
2. Phase 2: multi-round sequencing, intermission, pending lobby + corner code, day boards (`PHASES.md`).
3. Team answers the blocking open questions: OQ-01 (dates), OQ-02 (roles), OQ-03 (trivia writers), OQ-14 (Netlify account), and reviews Proposed ADRs (OQ-19).
4. Phase 0 cloud tasks: Supabase projects, Netlify, **keepalive on day zero**.

## Blockers

- Phase 0 cloud setup needs the team's Supabase/Netlify accounts (OQ-14). Phase 5 wants a vector logo (OQ-08) and brand approval (OQ-07). Trivia needs 27 more questions written and reviewed (OQ-03).

## Edge-case test coverage (E1–E29, `SESSION_LIFECYCLE.md` §6)

Fill in as tests land: `E# → test id / manual step`.
- E1 reload in lobby → `playerFlow.test.ts` (derivation), manual
- E2 reload mid-round → e2e test 2 (Stop the Clock)
- E3 reload after finishing → `playerFlow.test.ts`; e2e test 2 (reload on results)
- E5 removed, rescans → e2e test 1
- E6 wrong/old code → e2e test 1, `JoinFlow.test.tsx`
- E7 phone leaves → e2e test 3 (presence grey + End round)
- E8 host reload → `hostLoop.test.ts` (overdue round ends at once); manual
- E9 two tabs → `storage.test.ts` (tab lock); screen `sys.other_tab`
- E13 Start with zero players → Start disabled (H1); pgTAP GD010
- E14 network drop mid-submit / 23505 → `submitter.test.ts`; e2e test 2
- E17 language toggle hidden during rounds → e2e test 1
- E23 two host tabs → GD010 ignored (`hostLoop.test.ts`); manual
- E26 phone late to a round → `playerFlow.test.ts` (begin on a playing round)
- E27 cap during an attempt → STC unit tests; `playerFlow.test.ts` (local 120 s cap)
- E28 invalid name with right code → e2e test 1, `JoinFlow.test.tsx`
- E29 rate-limited sign-in → `JoinFlow.test.tsx` (one retry after 5 s)

## Session notes

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
