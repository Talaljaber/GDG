# Open Questions

Purpose: everything not yet decided that the team (not the code) must answer: each question with an owner, what it blocks, and a recommendation where we have one. When a question is answered, record the answer as an ADR in `DECISIONS.md` and mark it answered here. Proposals to change a locked decision also go here first (CLAUDE.md working agreement).

Last updated: 2026-09-25

Status legend: **Open** · **Answered** (link the ADR).

---

## 1. Questions for the team

| # | Question | Owner | Blocks | Recommendation | Status |
|---|---|---|---|---|---|
| OQ-01 | **Event date(s) and hard deadline.** When is the AI Expo, and by when must the build be frozen? | TBD | Phase scheduling; dry-run date; whether to re-verify platform facts (checked 2026-09-24); Supabase's legacy-key deprecation "by end of 2026" only matters if we used legacy keys (we don't, ADR-125) | Freeze the build ≥ 3 days before day one; dry run the day before | Open |
| OQ-02 | **Team size and roles.** Who builds, who owns content, who runs the booth each day? Are the PRD §5 metric targets right? | TBD | Phase sizing (S/M/L assume 2–4 part-time devs); runbook staffing | Name: 1 tech lead, 1 content lead, 2 booth leads per day | Open |
| OQ-03 | **Who writes and reviews the 30 trivia questions** (AR + EN, two reviewers each)? | TBD | Phase 3 Trivia; content freeze (Phase 6 AC6.4); MVP game choice (swap Trivia ↔ Simon if late) | Content lead writes; two others review; due before Phase 5 ends | Open |
| OQ-04 | **Bilingual confirmation and Arabic review.** Confirm full AR/EN; who is the native-speaker reviewer for `COPY.md`? OK with MSA on screen plus a light Jordanian touch in a few calls to action and the spoken script? | TBD | Phase 5 copy pass | Yes to both; one native reviewer signs off | Open |
| OQ-05 | **Prizes**: none, or small? What exactly? | TBD | If any prize has real value, revisit the accepted cheating risk (ADR-021, `SECURITY.md` T1) | None, or symbolic stickers for the day's top names | Open |
| OQ-06 | **Offline fallback** for the booth? | TBD | Nothing (ADR-106 recommends none) | Don't build one; team hotspot + spoken trivia round as fallback | Open |
| OQ-07 | **Brand approval from the chapter lead.** Google has brand guidelines for community chapters: confirm logo use, palette, Google's four colours on Simon, the shatter motif, and the product name ("GDG Booth Games") are OK. | Chapter lead | Phase 5 AC5.6; runbook §0 | Send `DESIGN_SYSTEM.md` + screenshots at the start of Phase 5 | Open |
| OQ-08 | **Logo colours.** Sampled from `assets/logo.png` on 2026-09-24 (blue `#1C89CC`/`#1579B4`, amber `#F8A928`/`#E59F26`). Still wanted: a vector (SVG) logo for crisp big-screen use, and approval of our proposed near-black/off-white (the logo has neither). | TBD | Crisp logo on the projector; nothing else | Ask the chapter lead for the SVG lockup | Partly answered |
| OQ-09 | **Short URL**: Netlify subdomain or a custom short domain? | TBD | QR generation; lobby layout | A short custom domain if the chapter has one; otherwise `<name>.netlify.app` | Open |
| OQ-10 | **Venue and projector**: resolution, brightness, booth lighting, power, screen size, viewing distance; is a phone hotspot allowed? | TBD | Projector check (`TESTING.md` §6); big-screen theme (ADR-122) | Ask the organisers; bring our own HDMI adapter | Open |
| OQ-11 | **Sound**: games are silent by design (noisy shared space). OK? | TBD | Nothing now; would add assets and strings | Keep silent | Open |
| OQ-12 | **Chapter call to action** on the results screen (e.g. a link to the chapter page)? Currently a non-goal. | TBD | New string + URL in `COPY.md`; brand approval | Add one small "Meet GDG on Campus" link if the chapter lead agrees | Open |
| OQ-13 | **Blocklist owner and contents** (Arabic + English), and names that must never be blocked. | TBD | Seed migration; `TESTING.md` §3 name lists | Content lead drafts; one reviewer per language; whole-word matching by default | Open |
| OQ-14 | **Netlify account plan.** Is the team's Netlify account on the credit-based Free plan or a legacy plan? Can we use an account dedicated to this site? | TBD | Deploy budget (ADR-126); risk of all sites pausing | Dedicated account on the Free plan; check credits weekly | Open |
| OQ-15 | **After the event**: keep the Supabase projects (and keepalive) or pause/delete? How long to keep results? | TBD | `SECURITY.md` §6 | Keep 30 days for follow-up posts, then delete | Open |
| OQ-16 | **Practical player ceiling.** "No player cap" is locked (ADR-013) and not enforced. The Free plan's Realtime limit of 100 messages/s means very large simultaneous sessions (≈ 60–80+ phones) may lag. OK to handle informally at the booth (start at ~30 players; the rest go to the next round)? | TBD | Runbook §5.8; load test L3 interpretation | Yes: informal handling; a paid plan isn't worth it for a booth | Open |
| OQ-17 | **Anonymous sign-in limit on the Free plan**: docs say it's configurable, not whether the Free plan caps the value. Confirm 1,000/h saves in the dashboard. | Tech lead | ADR-102; load test (single IP) | Check in Phase 0; if capped, set the maximum allowed and note it | Open |
| OQ-18 | **Event days and hours**: how many days, booth hours, who starts each new day? | TBD | Runbook §6.2 routine | Booth lead starts the new day each morning before the first session | Open |
| OQ-19 | **Review of Proposed ADRs.** ADR-101 to ADR-128 are Fable's resolutions; any the team wants to change? Especially ADR-105 (two different guests with the same name share one day-board row) and ADR-117 (15 s auto intermission). | Team | Nothing blocks, but late changes cost more | Review before Phase 1 starts | Open |
| OQ-20 | **Proposed change to ADR-015's locked English pending-lobby string.** ADR-015 quotes `lobby.next_round` as "You're in the next round." A session is now 3 rounds (ADR-012), so "round" is ambiguous: on the same screen `round.label` says "Round {n} of {total}", and a latecomer could read "next round" as the next round of the *current* session rather than the next session. The Arabic copy review (2026-09-24) flagged the matching Arabic bug and it's fixed to «الجلسة»; the English can't change without the team's OK since ADR-015 is Accepted. | Team | ADR-015 (Accepted); `lobby.next_round` EN string | Change the English to "You're in the next session." | Open |
| OQ-21 | **Shorten the day-board merge from ~15 s to ~8 s?** ADR-010 (Accepted) fixes "the ~15 s shatter merge". After the 2026-09-25 fix it plays once as one continuous mosaic, but 15 s of non-interactive animation is long at a booth when the next group should be joining. The length is one constant (`DAY_BOARD_MERGE_TIMELINE` in `src/effects/shatter/motion.ts`). | Team | ADR-010; `src/effects/shatter/motion.ts` | ~8 s: 1 s fragment + 3 × 2 s per game + 1 s settle | Open |
| OQ-22 | **Steady Hand (tilt game, `newgames.md` Phase C) is a can't-play fairness risk, not built.** iOS 13+ Safari exposes motion only after `DeviceMotionEvent.requestPermission()` from a user gesture, caches a denial across reloads (a denied phone can't retry in-session), and Android Chrome has no prompt at all (the API is just there, or absent on sensorless phones). Because the host picks one lineup for everyone, a session with Steady Hand strands every phone that denied, has no sensor, or runs a browser without the API, while the rest play: unlike every other game this is "no game at all", not a scoring gap. If it is ever approved: feature flag off by default; the picker shows a warning on the tile; a phone that can't play shows a clear message (no spinner, no silent 0) and gets **no score row** (ADR-014 already covers it); the permission gate branches by capability (prompt only where `requestPermission` exists; a 1.5 s wait for the first `devicemotion` event decides "no sensor"); the dry run checks whether iOS scopes a cached denial per origin. Research: `scratchpad/v3/research-games.md` §4. | Talal | Whether Phase C is ever built; nothing else | Don't build it for this event; revisit after the event with real-device numbers | Open |

## 2. Locked decisions with technical notes

The brief asks us to flag any locked decision that looks technically impossible. None is impossible; these carry constraints worth knowing:

1. **No player cap (ADR-013)**: possible, but the Free plan's Realtime limits set a practical ceiling (evidence: 100 messages/s, 200 concurrent connections, https://supabase.com/docs/guides/realtime/limits). Mitigated by polling boards (ADR-112). See OQ-16.
2. **"Each phone generates a playerId (UUID) and keeps it in localStorage" (ADR-006)**: implemented by Supabase anonymous sign-in, where Supabase generates the UUID and the client keeps the session in localStorage. The intent (stable, invisible, per-phone identity) holds; the UUID's origin differs. Documented in ADR-102.
3. **Timing against Supabase timestamps (original brief §2.3)**: superseded by the team in chat (ADR-018): all timing on the phone. Nothing is left to flag.

## 3. Answered

(none yet)
