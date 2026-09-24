# Security

Purpose: a realistic threat model for a prize-less game at an expo booth. For each threat it records what we defend, what we deliberately accept, and why, so reviewers can check the implementation against intent and nobody over-engineers (or under-protects) it. Policies and functions referenced here are defined in `DATA_MODEL.md`.

Last updated: 2026-09-24

---

## 1. Context that shapes every choice

- **No prizes, or small ones** (brief §1). The worst realistic outcome is an embarrassing name on a projector or a faked top score, not financial loss.
- **No backend server** (ADR-028): every browser talks to Supabase with the public publishable key. The database (RLS, constraints, functions) *is* the security boundary.
- **Guests are anonymous.** No personal data beyond a typed name and an anonymous auth id.
- **Security floor** (ADR-030): RLS on every table; guests can insert and read only what they need; nobody can update or delete scores or other players.

## 2. Assets

| Asset | Why it matters |
|---|---|
| Big-screen content | Public and projected: offensive content reflects on the chapter and Google's brand |
| Leaderboards | Fairness is part of the fun |
| Admin account | Controls sessions, removal, hiding, new days |
| Results history | End-of-day export; the event's record |
| Free-plan quotas | Exhausting Netlify credits pauses the site; exhausting Realtime quotas disconnects phones |

## 3. Threats

| # | Threat | Likelihood | Defence | Accepted residual risk | Why |
|---|---|---|---|---|---|
| T1 | **Fake scores**: a guest edits JS or calls the API to submit a high score | Medium (dev audience!) | Score range CHECK; per-game impossible bounds and raw-shape checks in the trigger (`SCORING.md` §4); one score per player per round (unique constraint); `player_id = auth.uid()` (RLS); trusted columns overwritten by the trigger | A careful cheater can submit a *plausible* high score (e.g. 950) | ADR-021: client-side scoring is deliberate; no prizes; server-side verification would need a backend |
| T2 | **Replaying a round** by reload or storage clear | High | Unique `(round_id, player_id)`; a new playerId (cleared storage) can't join a session that already started (joins lock at Start) | A new identity can play the *next* session again, which is allowed anyway | Playing again is a feature |
| T3 | **Offensive names** on the big screen | High | Character whitelist; 12-char limit; Arabic + English blocklist in the database (whole-word default, editable live: ADR-114); host removes in the lobby; admin hides by name key from every board within ~1 s (ADR-115) | A creative name slips through for a few seconds | Layered: filter → remove → hide; the runbook has a 10-second procedure (§5.4) |
| T4 | **Leaderboard wipe / tampering** (deleting or editing scores, players, sessions) | Low–medium | No DELETE privilege on history tables for anyone; no UPDATE on scores for anyone; guest UPDATE limited to two progress columns on their own row (column privilege + RLS); admin writes only through functions with admin-only policies | — | Floor requirement (ADR-030) |
| T5 | **Publishable key exposure** (it's in the bundle) | Certain | By design: the key only grants what RLS allows; the secret key is never in the site, the repo, the keepalive or the load test (ADR-125) | Anyone can script the same calls a phone makes | That's T1/T6, already bounded |
| T6 | **Spam joins / bot players** flooding a lobby | Low | Joining requires the current 4-digit code shown only on the big screen (ADR-003); host removes players in the lobby; anonymous sign-in rate limit per IP (raised to 1,000/h so real guests on shared NAT aren't blocked, ADR-102) | A bot that watches the booth stream or guesses codes (1 in 9,000) could join; no CAPTCHA (ADR-124) | Codes change every session; impact is a junk row the host can remove; Turnstile is the upgrade path |
| T7 | **Reading other sessions' data or codes** | Low | Sessions/rounds/players readable only by members (`is_session_member`); join through `join_session` so codes aren't listable | Current-day scores (names + scores) are readable by any signed-in guest | They're shown on the projector anyway |
| T8 | **Admin account compromise** (shoulder-surfed password at the booth) | Low | Strong unique password in the team's password manager; admin signs in before the projector is connected; dashboard never projected; sign out at end of day; password rotated after the event | A compromised admin can hide names, remove lobby players, end rounds, start a day; **cannot** delete history or edit scores | Revokes in `DATA_MODEL.md` §4.2 bind the admin too |
| T9 | **Privilege escalation via user metadata** | Low | Admin role read only from `app_metadata` (not user-writable) | — | Verified Supabase guidance (`DATA_MODEL.md` §9) |
| T10 | **Definer function abuse** | Low | Only `join_session` and `keepalive` are exposed `SECURITY DEFINER`; narrow validated inputs; `search_path = ''`; helpers in unexposed `private` schema | — | Supabase's warning about definer functions in exposed schemas |
| T11 | **Quota exhaustion** (Realtime messages, Netlify credits, egress) by abuse or by our own design | Medium | Phones poll boards instead of subscribing to every score (ADR-112); small payloads; Netlify deploy budget and a dedicated account (ADR-126); load test (`TESTING.md` §5) | A determined flood of REST requests could burn egress | Free plan has no hard API request cap; egress 5 GB is far above our need |
| T12 | **XSS via names** | Low | Names are whitelisted characters only (no `<`, `>`, `&`, quotes); React escapes text; no `dangerouslySetInnerHTML` anywhere | — | Defence in depth |
| T13 | **Supabase project pause** mid-event | Low with keepalive | Keepalive every 6 h (ADR-128); check on dry-run day | — | Availability, not confidentiality |
| T14 | **Trivia answers visible in the bundle** | Certain | None | Accepted | ADR-116; no prizes; 10 s per question |
| T15 | **Unwanted email sign-ups** (sign-ups must stay enabled for anonymous auth) | Low | Email confirmation on; such users get only guest rights (no `app_metadata.role`) | Junk rows in `auth.users` | Harmless; anonymous and email users are cleaned after the event (§6) |

## 4. What we explicitly do not do

- No server-side score recomputation or anti-cheat heuristics beyond §3 T1 (ADR-021, ADR-113).
- No CAPTCHA (ADR-124).
- No device fingerprinting or IP logging by us.
- No collection of emails, phone numbers or photos from guests.

## 5. Security review checklist (Phase 6)

- [ ] `select tablename, rowsecurity from pg_tables where schemaname = 'public'`: every row `true`.
- [ ] pgTAP tests in `TESTING.md` §3 pass: guest can't select other sessions, can't update other rows, can't update own `status`/`name`, can't delete anything, can't insert a score for another playerId, can't call admin functions.
- [ ] Only `join_session` and `keepalive` in `public` are `SECURITY DEFINER` (`select proname from pg_proc where prosecdef and pronamespace = 'public'::regnamespace`).
- [ ] No secret key in the repo (`git grep -nE "sb_secret_[A-Za-z0-9]"` returns nothing) or in Netlify env vars.
- [ ] Anonymous sign-in rate limit set as documented; email confirmation on.
- [ ] Blocklist seeded; the "must pass" name list (`TESTING.md` §3) passes.
- [ ] Admin password rotated from the development one; stored in the password manager.

## 6. After the event

- Export combined results (runbook §6).
- Rotate the admin password; remove admin rights from the account if the project stays up.
- Delete anonymous auth users older than the event (Supabase doesn't clean them automatically) with a one-off SQL statement run by a maintainer; game history remains (no FK to `auth.users`).
- Decide whether to pause or delete the Supabase projects (OQ-15).
