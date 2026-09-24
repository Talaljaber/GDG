# Product Requirements — GDG Booth Game

Purpose: what we are building for our GDG on Campus booth at the AI Expo in Jordan, for whom, and how we'll know it worked. This is the "what and why"; how it works is in `ARCHITECTURE.md` and `SESSION_LIFECYCLE.md`, and the game rules are in `docs/games/`. Locked choices are in `DECISIONS.md`.

Last updated: 2026-09-24

---

## 1. Problem and goals

Expo visitors walk past dozens of booths. We want ours to be the one people stop at, stay at, and come back to, while making the chapter look friendly, technical and well-run.

| # | Goal | How the product serves it |
|---|---|---|
| G1 | **Pull people in** | A big screen with a live leaderboard of real names, a QR anyone can scan, games that are fun to watch. |
| G2 | **Keep them a few minutes** | One session = 3 short games in a row (~3–6 min), with a leaderboard after every round. |
| G3 | **Bring them back** | Day boards per game (best score per name); "beat your best" and "join the next game" prompts. |
| G4 | **Represent GDG well** | GDG palette, chevron motifs, mosaic shatter, bilingual AR/EN copy in the chapter's voice. |
| G5 | **Run itself** | One host can run a session with a few taps; nothing breaks if a phone dies. |

## 2. Non-goals

- No accounts, emails, or personal data from guests beyond a typed name.
- No prizes logic, fraud-proof scoring, or server-side score verification (ADR-021).
- No laptop/solo mode, no shared-screen play (ADR-001).
- No offline mode (ADR-106, open question OQ-06).
- No custom backend server (ADR-028).
- No chapter membership sign-up flow inside the game (we can show a link to the chapter page on the results screen — see OQ-12).
- No native app, no app-store install.

## 3. Users

| User | Context | Needs |
|---|---|---|
| **Guest (player)** | Expo visitor, student/developer/professional, Arabic or English speaker, own phone on mobile data, bright hall, one hand, often distracted. Usually not a chapter member. | Join in under 20 s, understand each game in one sentence, see their name on the big screen, know their score immediately after each round. |
| **Host (admin at the booth)** | Chapter member running the laptop + projector, talking to guests at the same time. | Start a session in ≤ 3 taps, never get stuck (dead phones, offensive names), readable screen from several meters. |
| **Admin (dashboard)** | Chapter member on their phone or the laptop when not projecting. | Hide an offensive name in seconds, see all results at end of day, export CSV, start the next event day. |

## 4. User stories and acceptance criteria

Each criterion is checkable at the dry run. IDs are referenced from `PHASES.md` and `TESTING.md`.

### Guest

**US-G1 Join.** As a guest, I scan the QR on the big screen, type the code and my name, and I'm in the lobby.
- AC1: Scanning and opening the page creates no database rows and no auth user.
- AC2: A valid 4-digit code + valid name puts me in that session's player list on the big screen within 2 s on 4G.
- AC3: A wrong/expired code shows "That code isn't active" and keeps my typed name.
- AC4: Names over 12 characters can't be typed; invalid characters or blocked words show a friendly error.
- AC5: Arabic-Indic digits typed into the code field work.

**US-G2 Language.** As a guest, the app speaks my phone's language (Arabic or English) and I can switch.
- AC1: A phone with Arabic as the first preferred language opens in Arabic, RTL.
- AC2: The toggle switches instantly on join/lobby/results screens and is remembered on reload.

**US-G3 Wait in the lobby.** As a guest in the lobby, I see that I'm in and what's coming.
- AC1: Lobby shows my name (with suffix if duplicated), the 3 games in the lineup, and "Waiting for the host to start".
- AC2: If I was removed, I see "Removed by host" and can't rejoin that session with the same phone.

**US-G4 Play a round.** As a guest, when the host starts, my phone runs the game with a 3-2-1 and then I play.
- AC1: All phones start the round within ~1 s of each other (realtime latency).
- AC2: My score (0–1000) appears on my phone as soon as I finish, followed by the live round leaderboard.
- AC3: Reloading mid-round resumes where I was; my clock doesn't restart.
- AC4: Reloading after finishing a round shows my result, never a new game.

**US-G5 Between rounds.** As a guest, after each round I see the round leaderboard and the running session total, then the next game's intro.
- AC1: The phone mirrors the big screen's intermission and countdown.

**US-G6 Session results.** As a guest, at the end I see my session total and rank, and I can join the next game.
- AC1: Results show my total (0–3000), my 3 round scores, my rank.
- AC2: "Join the next game" opens the code screen with my name pre-filled.

**US-G7 Late join.** As a guest arriving mid-session, I can get into the next one.
- AC1: The big screen shows the next code in a corner during play; entering it shows "You're in the next round."

### Host

**US-H1 Open a lobby.** As a host, I sign in on the laptop and get a lobby with a code, QR and short URL.
- AC1: The lobby code is 4 digits and readable from 6 m (projector test, `TESTING.md` §6).

**US-H2 Pick the lineup.** As a host, I choose 3 different games in order before Start.
- AC1: The picker prevents duplicates and fewer than 3 (once `ROUNDS_PER_SESSION = 3`, ADR-120).
- AC2: A new lobby preselects the lineup the picker currently shows (the last one if untouched).

**US-H3 Manage the lobby.** As a host, I see who's in and whether their phone is connected, and I can remove someone.
- AC1: A player's dot greys out within 10 s of their phone going offline.
- AC2: Remove takes effect on the guest's phone within 2 s.

**US-H4 Run the session.** As a host, I tap Start and the session runs itself.
- AC1: Each round ends when all active players finish or at the 120 s cap.
- AC2: After each round the big screen shows the round leaderboard and running total, then starts the next round automatically after 15 s (or when I tap "Next round now").
- AC3: Force-end ends the current round in ≤ 2 s; scores already submitted count.
- AC4: The lineup picker during play changes only the next session.

**US-H5 Finish.** As a host, I show the results, then the day boards, then open a new session.
- AC1: Results stay until I tap Show day board; the shatter merge then plays (~15 s, or a 200 ms crossfade with reduced motion).
- AC2: New session shows the pending lobby with the late joiners already in it.

### Admin

**US-A1 Hide a name.** As an admin, I hide an offensive name and it disappears from every board within 2 s.
**US-A2 Session history.** As an admin, I see every session of the day with lineup, start time, players and scores.
**US-A3 Combined results.** As an admin, I see all scores across sessions and games, sortable, with a best-per-name toggle and a day filter, and export them as CSV.
**US-A4 New event day.** As an admin, I start a new event day; day boards reset and yesterday stays in history.
**US-A5 Blocklist.** As an admin, I add a blocked term during the event without a deploy (ADR-114).

## 5. Success metrics for the event

Measured from the database (`scores`, `players`, `sessions`) after each day; queries are listed in `EVENT_RUNBOOK.md` §6.

| Metric | Definition | Target (per event day) |
|---|---|---|
| Players per hour | Distinct playerIds with ≥ 1 score, per clock hour of booth time | ≥ 40 at peak hours |
| Sessions per hour | Sessions reaching `results` | ≥ 6 at peak hours |
| Join completion | Players with ≥ 1 score ÷ players who joined | ≥ 85 % |
| Return players | playerIds that played ≥ 2 sessions ÷ all playerIds | ≥ 20 % |
| Round completion | Scores ÷ (active players × rounds) | ≥ 90 % |
| Hide actions | Names hidden by admin | Tracked, target 0 |
| Incidents | Rounds force-ended because of a stuck phone | Tracked; if > 10 % of rounds, review |

Targets are our guesses for a single booth; confirm them with the team (OQ-02).

## 6. Constraints

- Supabase and Netlify free plans; limits verified in `ARCHITECTURE.md` §6.
- Guests on mobile data; small bundle (target < 300 KB gzipped JS+CSS, excluding fonts).
- Bright hall; projector; phones held one-handed in portrait.
- No deploy on event days (ADR-032).
