# Security

Purpose: a realistic threat model for a prize-less game at an expo booth. For each threat it records what we defend, what we deliberately accept, and why, so reviewers can check the implementation against intent and nobody over-engineers (or under-protects) it. Policies and functions referenced here are defined in `DATA_MODEL.md`.

Last updated: 2026-09-25

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
| T6 | **Spam joins / bot players** flooding a lobby | Low | Joining requires the current 4-digit code shown only on the big screen (ADR-003); host removes players in the lobby; anonymous sign-in rate limit per IP (raised to 1,000/h so real guests on shared NAT aren't blocked, ADR-102) | A bot that watches the booth stream could join; no CAPTCHA (ADR-124). Codes are also **enumerable**: `join_session` has no throttle (review 2026-09-25: 300 wrong codes in 0.8 s from one guest, all 9,000 in about 25 s), see T18 | Codes change every session; impact is a junk row the host can remove; Turnstile is the upgrade path |
| T7 | **Reading other sessions' data or codes** | Low | Sessions/rounds/players readable only by members (`is_session_member`); join through `join_session` so codes aren't listable | Current-day scores (names + scores) are readable by any signed-in guest | They're shown on the projector anyway |
| T8 | **Admin account compromise** (shoulder-surfed password at the booth) | Low | Strong unique password in the team's password manager; admin signs in before the projector is connected; dashboard never projected; sign out at end of day; password rotated after the event | A compromised admin can hide names, remove lobby players, end rounds, start a day; **cannot** delete history or edit scores | Revokes in `DATA_MODEL.md` §4.2 bind the admin too |
| T9 | **Privilege escalation via user metadata** | Low | Admin role read only from `app_metadata` (not user-writable) | — | Verified Supabase guidance (`DATA_MODEL.md` §9) |
| T10 | **Definer function abuse** | Low | Only `join_session` and `keepalive` are exposed `SECURITY DEFINER`; narrow validated inputs; `search_path = ''`; helpers in unexposed `private` schema | — | Supabase's warning about definer functions in exposed schemas |
| T11 | **Quota exhaustion** (Realtime messages, Netlify credits, egress) by abuse or by our own design | Medium | Phones poll boards instead of subscribing to every score (ADR-112); small payloads; Netlify deploy budget and a dedicated account (ADR-126); load test (`TESTING.md` §5) | A determined flood of REST requests could burn egress | Free plan has no hard API request cap; egress 5 GB is far above our need |
| T12 | **XSS via names** | Low | Names are whitelisted characters only (no `<`, `>`, `&`, quotes); React escapes text; no `dangerouslySetInnerHTML` anywhere (the shatter layer and the QR build DOM/SVG nodes, never HTML strings); strict CSP in `netlify.toml` (T17) | — | Defence in depth |
| T13 | **Supabase project pause** mid-event | Low with keepalive | Keepalive every 6 h (ADR-128); check on dry-run day. The repo is public (ADR-128), so GitHub disables the schedule after 60 days without a commit: before the event, confirm the last commit is within 60 days of the last event day and the workflow is enabled | A disabled schedule goes unnoticed | Availability, not confidentiality |
| T14 | **Trivia answers visible in the bundle** | Certain | None | Accepted | ADR-116; no prizes; 10 s per question |
| T15 | **Unwanted email sign-ups** (sign-ups must stay enabled for anonymous auth) | Low | Email confirmation on; such users get only guest rights (no `app_metadata.role`) | Junk rows in `auth.users` | Harmless; anonymous and email users are cleaned after the event (§6) |
| T16 | **Database or egress exhaustion via an oversized score `raw`** (the trigger ignores extra keys; nothing bounded the size) | Low–medium | `scores_raw_size`: `octet_length(raw::text) <= 4096` (migration `20260925000200_scores_raw_size.sql`, pgTAP `07_security_review.sql`); a real raw is under 500 bytes | A member can still add up to ~4 KB of junk to each of their three scores | Found 2026-09-25: an 8 MB raw was stored. The Free plan's 500 MB database goes read-only when exceeded, the host downloads every raw of a round (Stop the Clock reveal) and inserts fan out over Realtime |
| T17 | **Clickjacking, injected scripts, content sniffing** (no security headers were set) | Low | `netlify.toml` headers: CSP (`script-src 'self'`, Google Fonts in `style-src`/`font-src`, `connect-src https://*.supabase.co wss://*.supabase.co`, `frame-ancestors 'none'`, `object-src 'none'`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, HSTS | `connect-src` allows any `*.supabase.co` project, not only ours | Pin it to our one project ref (ADR-127). Removing the `wss://` entry silently breaks Realtime |
| T18 | **Join-code enumeration** by a script (T6's "1 in 9,000" is per guess, and guesses are free) | Medium | Codes change every session; joins lock at Start (T2); names still pass the filter; the host removes strays; each identity needs an anonymous sign-in (1,000/h per IP) | A remote script can find the live lobby code in well under a minute and join bots or submit plausible scores (T1) without being at the booth | A per-guest throttle can't be done in the database alone: `join_session` reports a wrong code by raising, which rolls back any attempt log. Options (each needs an ADR): return errors as data and log failures, Turnstile on anonymous sign-in (ADR-124), longer codes (ADR-003) |
| T19 | **Spoofed Realtime presence or broadcast** on public channels: anyone with the publishable key, even unsigned, can join `presence:<sid>` or `session:<sid>`, track presence under any key and send broadcasts | Low | Presence is advisory only (dots, ADR-014); no client handles broadcast events; Postgres Changes are RLS-filtered (verified: a non-member guest and anon receive no session, player or round changes; anon can't subscribe at all) | Fake "present" dots in a lobby whose session id the attacker knows (session ids are visible in today's `scores` rows) | Upgrade path: private channels (`config: { private: true }`) plus `realtime.messages` policies scoped to members and the admin. Today `realtime.messages` has no policies, so private channels are refused |
| T20 | **Realtime quota exhaustion by a script**: subscribing to every score insert of the day (RLS lets any guest read today's scores) or holding many connections (Free: 200 concurrent, 100 msg/s) | Low–medium | ADR-112 keeps our own phones off `scores`; phones poll boards and refetch on reconnect | ADR-112 is client discipline, not enforced by RLS; a script can hold connections and slow or block the host and phones | Watch Realtime usage in the dashboard during the event |

### Public repository (ADR-128)

The repository is public: docs, the trivia pool (answers included), the blocklist seed and the full schema/RLS are readable by anyone. Nothing secret is in git (checked: no `sb_secret_…` in tracked files or history). Accepted, because the security boundary is RLS, not obscurity, and the trivia answers are in the bundle anyway (T14). Keep the real blocklist additions in the database (dashboard), not in git.

## 4. What we explicitly do not do

- No server-side score recomputation or anti-cheat heuristics beyond §3 T1 (ADR-021, ADR-113).
- No CAPTCHA (ADR-124).
- No device fingerprinting or IP logging by us.
- No collection of emails, phone numbers or photos from guests.

## 5. Security review checklist (Phase 6)

Ticked items were verified in the review of 2026-09-25 (§7) against the local stack; unticked ones need the cloud projects or the Netlify UI.

- [x] `select tablename, rowsecurity from pg_tables where schemaname = 'public'`: every row `true`. *(8/8 on the local DB; pinned by pgTAP `01` and `07`.)*
- [x] pgTAP tests in `TESTING.md` §3 pass: guest can't select other sessions, can't update other rows, can't update own `status`/`name`, can't delete anything, can't insert a score for another playerId, can't call admin functions. *(`supabase test db`: 8 files, 490 tests green; the same actions were also refused over the real REST API as anon, an anonymous guest and an email user.)*
- [x] Only `join_session` and `keepalive` in `public` are `SECURITY DEFINER` (`select proname from pg_proc where prosecdef and pronamespace = 'public'::regnamespace`). *(The query returns exactly those two; `07` also pins the four `private` definers.)*
- [ ] No secret key in the repo (`git grep -nE "sb_secret_[A-Za-z0-9]"` returns nothing) or in Netlify env vars. *(Repo half verified: nothing in tracked or untracked files or history; a production build contains none of `.env.local`'s secret key, JWKS URL or `E2E_*` values, only supabase-js's `sb_secret_` prefix check. Netlify env vars: check in the Netlify UI.)*
- [ ] Anonymous sign-in rate limit set as documented; email confirmation on. *(Local `config.toml`: `anonymous_users = 1000`, confirmations off locally by design. Check both cloud projects' Auth settings.)*
- [ ] Blocklist seeded; the "must pass" name list (`TESTING.md` §3) passes. *(The must-pass list passes in `06_names`; the seed is still the English placeholder, OQ-13.)*
- [ ] Admin password rotated from the development one; stored in the password manager.
- [ ] Security headers present on a deploy preview (`curl -sI <preview-url> | grep -i content-security-policy`), and the preview's lobby, round and day board update live with the CSP on (no CSP errors in the console).
- [ ] Migration `20260925000200_scores_raw_size.sql` applied to the cloud project with `supabase db push`, then `supabase test db --linked` (ADR-127; not on an event day).

## 6. After the event

- Export combined results (runbook §6).
- Rotate the admin password; remove admin rights from the account if the project stays up.
- Delete anonymous auth users older than the event (Supabase doesn't clean them automatically) with a one-off SQL statement run by a maintainer; game history remains (no FK to `auth.users`).
- Decide whether to pause or delete the Supabase projects (OQ-15).

## 7. Review 2026-09-25

Phase 6 review against the **local** stack; no cloud project was touched. Method: SQL on the local database (RLS flags, table, column and function privileges, default privileges, policies, publication, storage, `realtime.messages`); about 140 real API calls as anon (publishable key only), an anonymous guest and a fresh email user, each trying every forbidden action (reading other sessions and codes, updating others' rows and their own `status`/`name`, deletes, direct inserts into `players`/`hidden_names`/`blocked_terms`/`event_days`, scores for another player or a session not joined, every admin RPC, `private` functions over `/rpc` and with `Content-Profile: private`, other schemas via profile headers, writes through the views, GraphQL, storage, `auth.updateUser` forging `role`); Realtime subscriptions with an admin positive control; a production build grepped for secrets; the frontend read for HTML sinks; the new headers tested in Chromium against a local build.

**Held:** RLS on all 8 tables; no TRUNCATE/REFERENCES/TRIGGER for `anon` or `authenticated`; `anon` can call only `keepalive()`; all 13 admin RPCs return `GD009` for guests and email users; a forged `user_metadata.role` never makes an admin, and `PUT /auth/v1/user` with `app_metadata` is refused; `private`, `auth`, `realtime`, `storage`, `vault` and `net` aren't reachable over REST (`PGRST106`); `pg_graphql` isn't enabled; there are no storage buckets; the views are `security_invoker` and read-only; Postgres Changes deliver nothing to a non-member guest or to anon (the admin control received the same changes); private Realtime channels are refused; the bundle holds only the URL and the publishable key; there's no `dangerouslySetInnerHTML` or `innerHTML` in app code.

**Fixed:** T16, a size bound on `scores.raw` (new migration, tests in `07_security_review.sql`); T17, security headers in `netlify.toml`.

**Open, ranked:** T18 code enumeration (medium; needs an ADR); T20 Realtime quota abuse (low–medium, accepted); T19 public-channel presence spoofing (low, accepted); the informational items below.

Informational:
- The score trigger runs before RLS `WITH CHECK`, so a score for an unknown `player_id` returns `GD005` while one for a real member returns `42501`, and `GD006`/`GD007` reveal a round's state. It leaks almost nothing (ids are random uuids) and needs no change.
- `hidden_names.note` is readable by every signed-in user and is published over Realtime: keep notes neutral.
- A removed player can still read their session's rows (by design, to show "Removed by host").
- The PostgREST OpenAPI description at `/rest/v1/` is readable with the publishable key (table and function names, which the bundle already contains).
- `.github/workflows/*.yml` set no `permissions:`; add `permissions: contents: read` so the token is read-only whatever the repo default.
- Frontend: `src/lib/supabase.ts` treats `/host/` and `/dashboard/` (with a trailing slash) as admin routes, but `src/main.tsx` switches on the exact path, so `/host/` renders the player app with the admin's stored session. Normalise the path the same way in both.
