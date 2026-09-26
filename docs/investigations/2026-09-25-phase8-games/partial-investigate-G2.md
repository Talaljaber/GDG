# Partial results: G2, hidden tab and screen lock (stopped before reporting)

Purpose: what track G2 (Opus) had measured when the run was stopped. **Not adversarially verified.** The test files and raw output are in `partial-state/g2/` (`hm-hidden.g2.test.tsx`, `hm-out.txt`; `pr-hidden.g2.test.tsx` and `suspend.g2.test.tsx` were written but produced no saved output).

Last updated: 2026-09-25

## How Many?, tab hidden while timers keep firing (jsdom, fake timers)

Every guess is 20. The true counts are 8 / 32 / 46.

| Hidden at (phase) | Hidden for | Flash seen (rounds 1, 2, 3) | Score | Duration |
|---|---|---|---|---|
| never (baseline) | – | yes, yes, yes | 24 | 13.96 s |
| 0.5 s (intro) | 1 s | yes, yes, yes | 24 | 13.96 s |
| 0.5 s (intro) | 5 s | **no**, yes, yes | 24 | 15.96 s |
| 0.5 s (intro) | 30 s | **no, no, no** (rounds 1–2 timed out) | **0** | 32.64 s |
| 1.8 s (look) | 1 s | **no**, yes, yes | 24 | 13.26 s |
| 1.8 s (look) | 5 s | **no**, yes, yes | 24 | 17.26 s |
| 1.8 s (look) | 30 s | **no, no, no** (rounds 1–2 timed out) | **0** | 33.94 s |
| 2.8 s (flash) | 1 s / 5 s | yes, yes, yes | 24 | 14.26 / 18.26 s |
| 2.8 s (flash) | 30 s | yes, **no, no** (rounds 1–2 timed out) | **0** | 34.94 s |
| 4.0 s (answer) | 1 s / 5 s | yes, yes, yes | 24 | 13.96 / 17.96 s |
| 4.0 s (answer) | 30 s | yes, **no, no** (rounds 1–2 timed out) | **0** | 36.14 s |

What this shows (still to be verified):
- **Even a 1 s hide during the 1 s "look" step makes the player miss that round's field for good.** They land on the answer pad having seen nothing, and the answer clock keeps running. This is the documented isHidden() skip (`HowMany.tsx:38`, `:333`), but it fires on any brief hide: the notification shade, an app switch, or a background tab in a multi-tab test.
- **A long hide (screen lock or app switch) keeps the game running while nobody is looking.** The remaining rounds play out and time out unseen, and the player comes back to the last answer pad with a few seconds left, scoring 0.
- This matches the gap check's leading theory for the reported "timing" problem in How Many?. It also explains why several phone tabs in one browser window behave badly (background tabs are hidden and their timers are delayed).

The Pairs and freeze/suspend scenarios were written but not run to completion.
