# Investigation: Phase 8 games (How Many?, Swipe Sort, Pairs), 2026-09-25

Purpose: the verified findings of the end-to-end investigation into the three Phase 8 games (ADR-136), started because of timing problems seen in How Many? and Pairs. The investigation was stopped by request before the fix stage; the fixes landed on 2026-09-26 (see **Fix status** at the end, ADR-137). This file is the summary; `report.md` has every finding in full; `state.json` is the raw saved state; `partial-*.md` are notes from the two tracks that were stopped mid-run.

Last updated: 2026-09-26

## How it ran

- Workflow run `wf_2dafb802-1a5`. Fable planned 8 tracks (5 Opus, 3 Sonnet); each track's findings were checked by an agent on the other model, which tried to refute them.
- Fable's gap check then added 4 tracks (G1–G4). **G3 and G4 finished and were verified. G1 (a real-browser session: 3 phones + host, reload mid-round) and G2 (hidden tab, background throttling and screen lock for How Many? and Pairs) were stopped before reporting**, so nothing has yet been reproduced in a real browser.
- Totals: 29 findings: 25 confirmed, 2 uncertain, 2 refuted.

## What matters most

1. **The game seed is per player, not per round** (critical; confirmed independently by 4 tracks). `src/player/PlayerApp.tsx:250` (and the fallback at :355) sets `seed = ${round.id}:${playerRowId}`. Every doc says the seed is per round, so everyone in a round should see the same content. Today each player gets their own How Many? counts, Pairs board and Swipe Sort sequence. Close the Brackets, Color Clash and Odd One Out are affected the same way, against their own docs. The big screen's How Many? reveal then takes a "true count" by plurality over mostly different values, so the axis is close to arbitrary and dots jump when a late score arrives (G3-4). **Fix:** `seed = round.id`. Trivia must stay per player (ADR-027), so give it its own player component and fix the docs that say otherwise (G4-2: `SESSION_LIFECYCLE.md` §4.1, `.claude/rules/games.md`, `games/trivia.md` §2, `trivia-format.md`).
2. **The How Many? reveal on the big screen is timed from when it mounts, not from `ended_at`** (the likely "timing" symptom on the host; host-side-1, G3-2, G3-1). The 7 s step is anchored on `ended_at`, but the dot bursts and the crowd-average marker count from the moment the component mounts. In normal play the marker shows for about 0.1–1.5 s. After a host reload more than about 1.5 s into the step it is cut off or never appears. **Fix:** pass the time since `ended_at` into `HowManyReveal` (and `StcReveal`) and schedule against it, and/or pull `HM_REVEAL_MEAN_MS` earlier.
3. **Pairs clear time leaves out sleep** (medium; pairs-timing-02). `clear_ms` uses `performance.now()`, but the 60 s clock uses `Date.now()`. A phone that sleeps mid-game sends a clear time without the sleep, which inflates the score (up to 1000), and at the last match the countdown jumps from about 26 s back up to 56 s. The same measurement rule is in `pairs.md` §3, so it's a doc gap as well as a code bug.
4. **Pairs leaves cards face up when time runs out** (low; pairs-timing-03). A timeout or round end during the lock after a wrong pair, or with one card up, leaves unfound cards face up on the final board (against `pairs.md` §6/§9).
5. **How Many? timing across reload or screen lock** (low). The 1.5 s intro isn't saved, so a reload restarts it; the steps are chained on when each late timer fires, so a screen lock pushes the round well past its 40 s worst case (hm-timing-intro-not-resumable, shell-resume-roundend-2/-3; the intro runs from mount in every game). An uncertain edge: a freeze during the flash while its start epoch is still unsaved shows the field for a full 1 s after unlock.
6. **Shell wiring** (low):
   - A round that ends while a phone is still on its 3-2-1 mounts the game already ended and submits a 0 for a player who never played (`playerFlow.ts`, all games).
   - A missed realtime "round ended" event is only caught by the 15 s safety refetch, the same length as the 15 s late-accept window, so a late phone's score can get GD007.
7. **Needs a team decision (Accepted ADR-017):** one idle or dead phone holds every short round until the flat 128 s cap. The room waits about 85 s (How Many?), 93 s (Swipe Sort) or 63 s (Pairs) after every live phone is done. Options are in `report.md` (host-side-2): a per-game host deadline, or an "Everyone's time is up: End round" hint. It belongs in `OPEN_QUESTIONS.md` before any code.
8. **Smaller items:**
   - Swipe Sort: a drag held across a miss moves the next chevron.
   - Swipe Sort idle example says 36 misses; the timeline gives 37 (docs, test, pgTAP).
   - Hard-coded `outline-offset` instead of `--focus-offset` in `SwipeSort.module.css`.
   - With 1–2 rows, a tampered row can win the mode tie on the reveal.
   - Late scores' dots can appear after the reveal step ends.
   - Host tests are missing for How Many? through Intermission.
   - Two drifts in `docs/plans/games-v3.md`.

Refuted (no action): the How Many? "251 ms late look skips the flash" and the Swipe Sort "press in the 150 ms gap is dropped".

## Strongest lead for the How Many? symptom (G2, partial, not yet verified)

G2 had measured How Many? with the tab hidden before it was stopped (`partial-investigate-G2.md`):
- **Hiding the tab for only 1 s during the 1 s "look" step makes that round's field never show.** The player lands on the answer pad having seen nothing.
- **A 30 s hide** (screen lock or app switch) lets rounds 1–2 time out unseen, and the player returns to round 3's pad with a few seconds left, **scoring 0**.

This is the `isHidden()` skip in `HowMany.tsx:38`/`:333` combined with steps chained on timers that keep running while hidden. It matches the gap check's theory: when testing with several phone tabs in one window, background tabs are hidden and their timers are delayed ≥ 1 s. Pairs' 700 ms lock and 60 s end would fire late in the same case. G2's Pairs scenarios didn't finish.

## Not yet covered

- G1 (real browser) produced nothing; G2 is partial and unverified. Rerun them, or test on separate real phones, before calling the symptom explained. G1's spec is saved in `partial-state/g1/`.
- Real devices, playtests and `supabase test db --linked` remain as in `PROGRESS.md`.

## Resuming

The fix stage never started. To continue with fix planning and implementation, resume the same workflow script with `resumeFromRunId: "wf_2dafb802-1a5"` in the same Claude Code session (finished agents are cached; G1/G2 rerun). From a new session, hand `summary.md` + `report.md` to a fresh fix-planning run.

## Fix status (2026-09-26)

Fixed on 2026-09-26 by five parallel work packages (`fix-plan.json`: WP1 player shell, WP2 How Many? phone, WP3 host reveal, WP4 Pairs + Swipe Sort phones, WP5 docs) and recorded as **ADR-137**. Not committed or deployed yet. G1 and G2 were rerun before the fix (their findings are in `findings-kept.json`). Team decisions (Talal, chat 2026-09-26): How Many? keeps a **fixed schedule** that never pauses while the page is hidden (ADR-137 (2), **Accepted**); the Swipe Sort "gap press arms the next chevron" change was **dropped**: a press in the 0.15 s gap stays ignored (`games/swipe-sort.md` §3).

| Finding | Status | How / why |
|---|---|---|
| hm-timing-seed-per-player, pairs-timing-01, shell-resume-roundend-1, G1-1 | Fixed | `GameModule.seedScope` (default `'round'`: seed = round id; Trivia `'player'`, ADR-027); `src/player/seed.ts`, used by `PlayerApp.tsx`; `seed.test.ts` checks two phones draw the same How Many? fields and Pairs layout (ADR-137 (1)) |
| shell-resume-roundend-4 | Fixed | a round that ends during the 3-2-1 is not played: no game mounts, nothing is submitted, its local state is cleared (`roundEndedBeforeStart`, `playerFlow.ts`; layout effect in `PlayerApp.tsx`) |
| shell-resume-roundend-5 | Fixed | round rows refetched every 5 s while a round is on the phone and not yet submitted (`ROUND_SAFETY_REFETCH_MS`, `useSessionSync(..., inRound)`; `hooks.test.tsx`) |
| hm-timing-intro-not-resumable, shell-resume-roundend-2, G1-4, G2-3 | Fixed | How Many? fixed schedule on stored epochs (intro on `roundStartEpoch`, lock on the answer end, next look on the lock end), catch-up `runDue`; HM-T15–T18. G2-3 per the team decision: flashes shown while hidden are lost, the round still ends inside 39 s |
| hm-timing-flash-epoch-post-commit (uncertain) | Fixed | `dueEpoch` gives `flash` with no start epoch a deadline at the end of its window; HM-T19 |
| host-side-1, G1-3 | Fixed | H3 reveal slots count from `ended_at` (`anchorMs`, `anchoredSlot`, `slotDelay`); How Many? dots within 3.5 s, crowd average at 4.0 s (`HM_REVEAL_DOTS_MS`, `HM_REVEAL_MEAN_MS`), ≥ 3 s on screen; Stop the Clock anchored the same way |
| host-side-3 | Fixed | a late row's dot (and a first-time average) that is already due shows at once; the strip counts are locked per round (`fixedCounts`) so the axis doesn't jump |
| host-side-4 | Fixed (documented) | the "one tampered row can't move the axis" rule needs ≥ 3 rows; with 1–2 rows the higher-ranked row wins (accepted, ADR-137 (6), ADR-021); unit test |
| host-side-5 | Fixed | tests for the How Many? path through Intermission and the reveal timing against the step (`Intermission.test.tsx`, `HowManyReveal.test.tsx`); plan examples corrected |
| pairs-timing-02, G2-2, G4-1 | Fixed | Pairs `clear_ms` on the epoch clock (`Date.now()` − `gameStartEpoch`), so a sleep is counted and the countdown never jumps up; PR-T15 |
| G2-1 | Fixed | Pairs closes a passed end or lock on `visibilitychange`/`pageshow` |
| pairs-timing-03 | Fixed | a timed-out board turns unfound cards face down |
| shell-resume-roundend-3 | Fixed for Pairs, Swipe Sort, How Many? | their board clocks start at `roundStartEpoch` + 1.5 s whatever the mount time (SS-T15, PR-T15). The other seven games' intros still run from mount (no finding against them; unchanged) |
| swipe-timing-stale-drag-follows-next-item | Fixed | a drag moves only the chevron it started on and resets when that item ends (SS-T16) |
| swipe-timing-gap-press-dead | Not fixed, by decision | the team dropped the change: a press in the gap stays ignored, as the doc always said |
| swipe-timing-idle-example-36, G1-5 | Fixed | 37 misses everywhere: `games/swipe-sort.md`, `SCORING.md` §3.9, `scoring.test.ts`, pgTAP `11` (no migration; the score is 0 either way) |
| player-ui-i18n-001 | Fixed | `outline-offset: var(--focus-offset)` in `SwipeSort.module.css` |
| docs-vs-code-plan-drift-1, -2 | Fixed | `docs/plans/games-v3.md` (≈ 13–15 misses; SS-T9 `right`) |
| host-side-2 | Needs the team | the 128 s hold with one silent phone is ADR-017 (Accepted): proposed as **OQ-23** (a per-game host deadline, or a rail hint + missing-player count); no code change |

Still open: none of the timing fixes has been checked on real phones yet (screen lock, app switch, Safari `pageshow`; HM-T13, SS-T13, the Pairs sleep case), OQ-23, and the playtests (HM-T14, SS-T14, PR-T14).
