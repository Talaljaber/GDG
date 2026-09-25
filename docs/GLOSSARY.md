# Glossary

Purpose: one meaning per word. Every other doc, the code, the database and the UI strings use these terms exactly as defined here. If a term is ambiguous in a discussion, this file wins; if this file is wrong, fix it here first and then everywhere else in the same change.

Last updated: 2026-09-25

| Term | Definition |
|---|---|
| **Event** | The whole AI Expo in Jordan appearance of our GDG on Campus booth. May span several days. |
| **Event day** | An admin-bounded period of the event (row in `event_days`). Started and ended by an admin action in the dashboard, never by the clock at midnight. Day boards are scoped to one event day. See ADR-109. |
| **Guest** | Any expo visitor using their own phone. Becomes a *player* only after submitting a code and a name. |
| **Admin / host** | A chapter member signed in with the single admin account. "Host" is used for the person running the big screen; same account, same rights. |
| **Big screen / host view** | The admin laptop's `/host` route, projected at the booth. Shows lobby, rounds, leaderboards. |
| **Dashboard** | The admin-only `/dashboard` route: session history, combined results, hide names, export, new event day. Never projected. |
| **QR** | The single permanent QR code shown on the big screen. It encodes the site's root URL and never changes during the event. |
| **Short URL** | The human-typeable URL printed under the QR on the big screen. Same destination as the QR. |
| **Session code** | A 4-digit code, new for every session, shown large on the big screen (lobby) or small in the corner (pending lobby during play). A guest types it after scanning the QR to join that session. See ADR-111. |
| **Session** | One lobby's worth of players playing a **lineup** of exactly **3 rounds** back to back, then seeing session results. States: `pending` → `lobby` → `playing` → `results` → `closed`. |
| **Lineup** | The ordered list of 3 **distinct** games for a session, chosen by the host before Start. |
| **Round** | One game within a session. A session has rounds 1, 2, 3. Each round has its own 120-second cap. States: `upcoming` → `playing` → `done`. |
| **Attempt** | One try inside a round (one grid in Odd One Out, one hidden-timer guess in Stop the Clock, one sequence in Simon, one drawing in Perfect Circle, one question in Trivia). Every attempt has its own timeout. |
| **Intermission** | The pause between rounds. The big screen shows the round leaderboard and the running session total, then a countdown to the next game. |
| **Lobby** | The session in state `lobby`: joinable, shown full-screen on the big screen with the code, QR, player list, presence dots, remove buttons, lineup picker and Start. |
| **Pending lobby** | The *next* session, in state `pending`, created automatically when the current session starts. Joinable with its own code (shown small on the big screen during play). Becomes the lobby when the host taps **New session**. |
| **Player** | A row in `players`: one guest in one session. Created only when the guest submits a valid code + name. |
| **playerId** | The guest's stable identity: the Supabase anonymous-auth user id (`auth.uid()`), created on first name submit and kept in the phone's localStorage by the Supabase client. Invisible to the guest. Same across sessions on the same phone/browser. See ADR-102. |
| **Name** | What the guest typed (≤ 12 characters). Display only; not identity. |
| **Name key** | The normalised form of a name used for duplicate detection, "best per name" and hiding. Normalisation rules in `SCORING.md` §6. |
| **Display suffix** | A number appended on display (e.g. "Sara 2") when a second player in the same session has the same name key. Not part of the name key. |
| **Active player** | A player in the session whose status is not `removed`. Rounds wait for all active players (or the cap). Presence does not affect "active". |
| **Removed** | A player flagged by the host in the lobby. Cannot rejoin that session. Not deleted. |
| **Presence** | Supabase Realtime Presence signal that a player's phone is connected. Only drives the grey-out dot in the lobby and round views. Never drops anyone. |
| **Score** | Integer 0–1000 for one player in one round, computed on the phone. One row in `scores`. |
| **Session total** | Sum of a player's round scores in one session, 0–3000. Ranks the session results. |
| **Round leaderboard** | Live ranking of scores for the current round only. |
| **Session leaderboard** | Ranking by session total (running total during intermissions, final at results). |
| **Day board** | Per-game leaderboard for the current event day: best score per name key across all sessions that day. One tab per game. |
| **Combined results** | Dashboard view of every score of the event (filterable by day), sortable, with a best-per-name toggle. |
| **Force-end** | Host control that ends the *current round* immediately (e.g. a phone died). |
| **Show day board** | Host control on the session results screen. Plays the shatter merge and switches the big screen to the day boards. |
| **New session** | Host control after results / day board. Closes the finished session and turns the pending lobby into the lobby. |
| **Shatter** | The GDG mosaic transition/celebration effect, built as its own layer. Never applied to the logo mark. See `DESIGN_SYSTEM.md` §6. |
| **Hidden name** | A name key the admin has hidden. It disappears from every leaderboard view; rows stay in the database. |
| **Rejection bounds** | Per-game limits beyond which a submitted score is physically impossible; the database refuses such inserts. See `SCORING.md` §4. |
| **Keepalive** | External scheduler (no GitHub Actions) that POSTs to the `keepalive()` RPC every 6 h so the free Supabase project never pauses. |
| **Dry run** | Full rehearsal on the day before the event with at least five real phones. |
