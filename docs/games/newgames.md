# Prompt: Add new games to the GDG Booth Game

> Paste everything below this line into Claude Code, from the project root.

---

## Context

The booth game already works with five games: Odd One Out, Stop the Clock, Simon, Perfect Circle and Trivia. We're expanding the pool with new games that follow the **same contract**. Don't redesign anything that exists; build on it.

## Step 0: read before touching anything

1. Read `CLAUDE.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/SCORING.md`, `docs/SESSION_LIFECYCLE.md`, `docs/DESIGN_SYSTEM.md`, `docs/COPY.md`, and one existing game doc end to end (`docs/games/stop-the-clock.md` is the closest reference).
2. Read the code for one existing game from start to finish, following it from the game picker to score submission and the leaderboard. Learn how a game is registered, how it gets its timer and seed, how it submits, and how its reveal renders.
3. List the reusable pieces you found, for example the reveal component, timer, seeded randomness, number input, shatter effect, and i18n helpers. Also list anything the new games need that doesn't exist yet.
4. Post a short plan covering files to add, files to change, any migration, and questions. **Wait for my go-ahead.**

## The shared contract (same as existing games)

Every new game must:

- Run on a phone with touch only, and play simultaneously with everyone else in the session.
- Take **60 seconds or less** from start to finish, well inside the 120-second session cap. Every attempt has its own timeout.
- Output an integer **0–1000**, computed on the client, with **rejection bounds** enforced wherever the existing games enforce them (DB constraint, RLS check, or whatever mechanism is already in place).
- Be calibrated so a strong playtester lands around **800–900** and a perfect 1000 is near-impossible. Record the calibration assumptions in `SCORING.md`.
- Use the **session seed** so every player in a session gets the same sequence or layout. That's needed for fairness and for the reveal. If existing games don't seed, add seeding for the new ones and write an ADR entry.
- Handle reload mid-game, screen lock, and rotation exactly as the existing games do.
- Put all strings in the AR/EN string files, support RTL, and follow the GDG theme: blue `#1c89c2`, amber `#eaa928`, the neutrals, Roboto plus Cairo/Tajawal, and the mosaic shatter for transitions. Don't animate or distort the real logo.
- Have touch targets of at least 48px, meet contrast rules, and never rely on color alone except where color *is* the game (Color Clash, Swipe Sort). For those, check that the colors used stay distinguishable for common color-blindness types.
- Get a doc in `docs/games/` using the **same template** as the existing games: rules, flow, timings, difficulty curve, scoring formula with worked examples, rejection bounds, UI states, theming, accessibility, edge cases, and test cases.

## The new games

The numbers below are starting values. Tune them in playtesting, then update the doc.

### Phase A (build these first)

**1. Close the Brackets**
- An opening sequence appears, for example `{ ( [ <`. The player taps the matching closers in the correct (reverse) order. There are four big buttons: `)` `]` `}` `>`.
- The first sequence has length 2, and each solved sequence adds one, up to a maximum of 8.
- A wrong tap fails that sequence. It turns red and shakes, and the next sequence stays at the same length. The game never ends early.
- The game lasts 30 seconds in total.
- The score comes from the sum of solved sequence lengths, with a small speed factor.
- Theming: brackets drawn in the chevron style, correct closers flashing amber.

**2. Color Clash**
- A color word appears in a *different* ink color. The player taps the button for the **ink**, not the word.
- There are three inks: blue, amber and charcoal. Each button shows a swatch plus the color name.
- About 30% of trials are congruent, meaning the word and ink match, so players can't just always tap the "other" color.
- Words appear in the player's language.
- The game lasts 30 seconds. The score is correct taps minus wrong taps, with a speed factor.

**3. How Many?**
- A field of chevrons, with random rotations and a mix of blue and amber, flashes for **1.0 second** and then disappears.
- The player enters a number on an on-screen number pad and has 10 seconds per answer.
- There are three rounds with rising counts, starting at roughly 8–15, then 20–35, then 40–70. Chevrons must not overlap.
- The score is based on relative error in each round, with about a third of the total per round.
- **Big-screen reveal:** for each round, show everyone's guesses together along with the true count. Reuse or extend the Stop the Clock reveal.

### Phase B

**4. Swipe Sort**
- Chevrons appear one at a time. The player swipes left for blue and right for amber.
- The time between chevrons starts around 900ms and drops to about 350ms over 30 seconds. A chevron that isn't swiped in time counts as a miss.
- The score is correct swipes minus wrong swipes and misses.
- Keep the swipe area away from the screen edges and stop the browser's own gestures, such as iOS back-swipe and pull-to-refresh. Test this specifically on iOS Safari.

**5. Pairs**
- A 4×4 grid holds 8 pairs of face-down cards. The player flips two at a time.
- Use custom icons drawn in the brand style: bug, coffee, terminal, git branch, cloud, lightbulb, rocket and gear. **No Google product logos.**
- The layout is shuffled from the session seed, so the whole session gets the same board. The game lasts 60 seconds at most.
- The score is based on time, with a penalty for each failed pair.

### Phase C (optional, only after I approve)

**6. Steady Hand**
- The player tilts the phone to keep a ball inside a shrinking circle for 20 seconds, using the device's motion sensors.
- iOS needs a motion-permission prompt, and some phones will deny it or have no sensor. Because the admin picks one game for everyone, this can be unfair. Put it behind a feature flag. The picker should show a warning for it, and any phone that can't play it must show a clear message instead of breaking.
- Write up this risk in `OPEN_QUESTIONS.md` before building. Build it only if I confirm.

## Changes to existing parts

- **Game picker:** the pool grows from 5 games to 10 or 11. Change the picker to a grid of icon tiles that still fits on the admin screen without scrolling, and keep "last game preselected."
- **Leaderboard tabs:** 10 or more tabs won't fit in one row. Make them scrollable or switch to a dropdown. It must still be readable on the big screen and on phones.
- **Admin dashboard:** new games appear in session history and combined results with no special-casing.
- **Game IDs:** if game IDs are limited by an enum or check constraint, add them through a **migration**. Never edit the schema by hand, and never disable RLS.
- **The existing five games must not change behavior.** Run their tests, or a manual pass if they have no tests, after every phase.

## Docs to update in the same change

- `docs/games/<new-game>.md` for each game
- `SCORING.md`: formulas, bounds and calibration
- `COPY.md`: every new string in AR and EN
- `SCREENS.md`: new game screens and any new reveal
- `DESIGN_SYSTEM.md`: new icons and bracket styling
- `DECISIONS.md`: an ADR for expanding the pool, plus one for seeding if it was added
- `PHASES.md`: a new phase for this work, with checkable acceptance criteria
- `TESTING.md`: new cases, including iOS swipe conflicts and number-pad input
- `EVENT_RUNBOOK.md`: a short note on which games work best for crowds and for solo players
- `PROGRESS.md`: at the end of every phase

## How to work

- Build **one game at a time**. For each: doc, then implementation, then tests, then an update to `PROGRESS.md`.
- **Stop after Phase A** and summarize what was built, calibration results, any decisions made, and anything that needs my input. Don't start Phase B until I say so. Stop again after Phase B.
- Wherever this prompt conflicts with the existing code or docs, the existing implementation wins unless it breaks the contract above. Raise the conflict in your plan instead of silently picking a side.