# Documentation Index

Purpose: the map of the GDG Booth Game documentation, with one line per file, so a developer or a Claude Code session can find the right document without opening all of them. Start with `PROGRESS.md` (where we are) and `DECISIONS.md` (what's settled); the rest is reference to open when working on that area.

Last updated: 2026-09-25

| File | What it's for |
|---|---|
| [PROGRESS.md](PROGRESS.md) | Living memory: current phase, done, next, blockers, session notes. Read first, update last. |
| [DECISIONS.md](DECISIONS.md) | ADR log: Accepted (locked) and Proposed decisions. If it isn't here, it isn't decided. |
| [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) | Questions for the team, with owners and what each one blocks. |
| [PRD.md](PRD.md) | Goals, non-goals, users, user stories with acceptance criteria, event success metrics. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | No-backend design, system/join/gameplay/realtime diagrams, capacity vs free-plan limits, game module contract, source tree. |
| [DATA_MODEL.md](DATA_MODEL.md) | Tables, constraints, indexes, ER diagram, full RLS SQL, trigger, functions, views, realtime, verified platform facts. |
| [SESSION_LIFECYCLE.md](SESSION_LIFECYCLE.md) | Session/round/player state machines, host loop, timing constants, edge-case table E1–E29. |
| [SCORING.md](SCORING.md) | The 0–1000 contract, all formulas, rejection bounds, boards and tie-breaks, name normalisation. |
| [games/stop-the-clock.md](games/stop-the-clock.md) | Stop the Clock spec (built first). |
| [games/odd-one-out.md](games/odd-one-out.md) | Odd One Out spec. |
| [games/simon.md](games/simon.md) | Simon spec. |
| [games/perfect-circle.md](games/perfect-circle.md) | Perfect Circle spec, including the roundness metric. |
| [games/trivia.md](games/trivia.md) | Trivia spec, including the per-player draw. |
| [games/close-brackets.md](games/close-brackets.md) | Close the Brackets spec (ADR-134). |
| [games/color-clash.md](games/color-clash.md) | Color Clash spec, including the colour-vision check of the inks (ADR-134). |
| [games/how-many.md](games/how-many.md) | How Many? spec, including the flash field and the big-screen count reveal (ADR-136). |
| [games/swipe-sort.md](games/swipe-sort.md) | Swipe Sort spec, including the gesture reducer and the browser-gesture defence (ADR-136). |
| [games/pairs.md](games/pairs.md) | Pairs spec, including the 4 x 4 memory board (ADR-136). |
| [games/newgames.md](games/newgames.md) | The brief for new games; Phase A and B are built (ADR-134, ADR-136), Phase C (Steady Hand) is not approved (OQ-22). |
| [plans/games-v3.md](plans/games-v3.md) | Implementation plan for How Many?, Swipe Sort and Pairs: rules, scoring, bounds, reveal, migrations, work packages (ADR-136); Steady Hand risk entry. |
| [SCREENS.md](SCREENS.md) | Every phone, big-screen and dashboard screen, with states, wireframes, transitions and string keys. |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Colour tokens (placeholders), type scales, spacing, shatter motion spec, icons, RTL, accessibility. |
| [COPY.md](COPY.md) | Every user-facing string in English and Arabic; voice; plural rules; booth script. |
| [content/trivia-format.md](content/trivia-format.md) | Trivia JSON Schema, tags, shuffle rule, writing guide, review checklist. |
| [content/trivia-questions.json](content/trivia-questions.json) | The 30-question pool (template: 3 examples + 27 drafts). |
| [SECURITY.md](SECURITY.md) | Booth threat model: what we defend, what we accept, why; review checklist. |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Supabase + Netlify setup, env vars, keepalive, migrations, release, event-day rules, rollback. |
| [TESTING.md](TESTING.md) | Test layers, pgTAP cases, load test, device matrix, bright-light/projector checks, dry-run script. |
| [EVENT_RUNBOOK.md](EVENT_RUNBOOK.md) | For the booth: setup, running a session, what to say, failure playbook, end of day. |
| [PHASES.md](PHASES.md) | Build plan: phases 0–6 with checkable acceptance criteria; minimum shippable version. |
| [GLOSSARY.md](GLOSSARY.md) | One meaning per term (session, round, attempt, playerId, day board, …). |
| [investigations/2026-09-25-phase8-games/summary.md](investigations/2026-09-25-phase8-games/summary.md) | Verified investigation of How Many?, Swipe Sort and Pairs (timing, seed, reveal); full findings in `report.md`, raw state in `state.json`; fixes not started. |
| [plans/host-v3.md](plans/host-v3.md) | Host v3 "Stage and Rail" redesign plan: diagnosis, tokens, per-screen specs, work packages, ADR-135. |
