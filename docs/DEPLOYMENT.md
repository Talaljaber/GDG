# Deployment

Purpose: step-by-step setup of the Supabase projects, the Netlify site and the keepalive job, plus environment variables, the migration process, rollback, and the "no deploys on event day" rule. A new team member should be able to stand up a working copy from this file alone. Platform facts are cited inline; re-check them if the event is months away.

Last updated: 2026-09-26

---

## 1. Environments

| | Local | Cloud |
|---|---|---|
| Supabase | `supabase start` (CLI stack on this machine) | one project, `gdg-booth` (ref `ppikklvltpfdwbxtilme`, `eu-central-1`), for dev and prod (ADR-127) |
| Netlify | `npm run dev` | deploy previews + branch deploys (free) and the production deploy of `main` (15 credits each, ADR-126) |
| Used by | development, unit/pgTAP/e2e tests, load tests | deploy previews, rehearsals, dry run, event |

Because the cloud project is also the event database, test data from previews and rehearsals lands in it; run "Start new event day" before each event day so the day boards start clean (ADR-109). The e2e suite and the load test refuse the cloud unless explicitly targeted (TESTING §5).

## 2. Supabase setup (the one cloud project)

### 2.1 Project
1. Create the project in `eu-central-1`. Save the database password in the team password manager.
2. **Day zero: set up the keepalive (§4) the same day** (ADR-031). Free projects pause after about a week of low database activity (https://supabase.com/docs/guides/platform/free-project-pausing).

### 2.2 Auth
1. Authentication → Sign In / Providers: **enable "Allow anonymous sign-ins"** (https://supabase.com/docs/guides/auth/auth-anonymous).
2. Keep **"Allow new users to sign up" enabled.** Disabling it also blocks anonymous sign-ins (Supabase Auth source, `internal/api/anonymous.go`; the docs only say "only existing users can sign in": https://supabase.com/docs/guides/auth/general-configuration).
3. Email provider: enabled, **confirm email on** (so stray email sign-ups can't sign in without a mailbox; they would only have guest rights anyway, ADR-101).
4. CAPTCHA: off (ADR-124).

### 2.3 Rate limits
Authentication → Rate Limits: set **anonymous sign-ins to 1,000 per hour** (default is 30 per hour per IP; burst equals the hourly limit; configurable in the dashboard or via the Management API field `rate_limit_anonymous_users`: https://supabase.com/docs/guides/auth/rate-limits). Whether the Free plan caps this value is not documented; confirm the saved value in the dashboard and re-check at the dry run.

### 2.4 Admin account
Shortcut for steps 1–2: paste `scripts/cloud-admin.sql` into the SQL editor, replace its two placeholders, run it (creates or repairs the confirmed admin with `role = 'admin'`; no secret key needed), then delete the saved snippet so the password isn't kept in the query history. Or by hand:

1. Authentication → Users → Add user: the shared admin email and a strong password (password manager).
2. SQL editor, run once (maintainer only):
   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
   where email = '<admin email>';
   ```
3. Sign out and back in on `/host` so the JWT carries the role (a JWT only reflects `app_metadata` when it's reissued).

### 2.5 API keys
Settings → API Keys: copy the **publishable key** (`sb_publishable_…`). Never copy the secret key anywhere outside the password manager (https://supabase.com/docs/guides/api/api-keys; Supabase is deprecating the legacy `anon`/`service_role` keys by the end of 2026, ADR-125).

### 2.6 Schema
Apply migrations (§5). Then check: Database → Publications → `supabase_realtime` contains `sessions`, `rounds`, `players`, `scores`, `hidden_names`.

### 2.7 Cloud project status (2026-09-24)
- `gdg-booth` (`ppikklvltpfdwbxtilme`) created in `eu-central-1`. It replaces the first project (`efujkyahxteycysrcgkl`, `ap-northeast-2` Seoul, schema pasted in by hand with no migration history), which is retired: nothing points at it.
- `supabase db push` applied the migrations on `main`: `20260924000001`–`0007` and `20260925000200`, then `20260925000300_lineup_exactly_three` (renamed from `…000100` so it sorts after `000200`) once `ROUNDS_PER_SESSION = 3` was on `main`. `migration list --linked` matches local; `sessions_lineup_three` is validated (the project had no old 1-game sessions). `20260925000400_join_throttle` (ADR-130) followed on 2026-09-24; no site was deployed yet, so no older client could misread its new `join_session` results. From now on, the Netlify build that handles them must be live before any similar change. Catalog after it: `private.join_attempts` exists with no `anon`/`authenticated` grants; the public-schema checks above are unchanged.
- Later pushes: `20260925000500`/`000600` (ADR-134) and `20260925000700`/`000800` (ADR-136) are on the cloud (2026-09-25). **Not yet on the cloud:** `20260926000100_how_many_retune` (ADR-138; widens the How Many? bounds and keeps the old bands, so it must be pushed **before** the Netlify build that uses the new bands: the cloud still rejects their counts and 10–15 s answers).
- Verified from the catalog: 8 tables in `public`, all with RLS; anon has no table grants and can execute only `keepalive()`; `supabase_realtime` publishes `hidden_names`, `players`, `rounds`, `scores`, `sessions`; the only definer functions in `public` are `join_session`, `keepalive` and Supabase's `rls_auto_enable` (the "automatic RLS" event trigger `ensure_rls`, left on; the pgTAP checks skip event-trigger functions).
- `supabase test db --linked` runs as a temporary CLI login role that can't `truncate` or create `pgtap`, so the full suite on the cloud needs the database password: `$env:SUPABASE_DB_PASSWORD = "<db password>"; npx supabase test db --linked` (PowerShell), run by a maintainer. Pending: that run (AC0.1), the Auth settings (§2.2–2.3), the admin (§2.4, `host@gdg.com`), the keepalive secrets (§4) and Netlify (§3).

## 3. Netlify setup

1. Use a Netlify account (team) used **only** for this site: when the Free plan's 300 monthly credits run out, every project on the account is paused and shows "Site not available" (https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/billing-faq-for-credit-based-plans/). Check in the account's billing page whether it is on a credit-based plan or a legacy plan (accounts created before 2025-09-04 may be legacy; OQ-14).
2. Import the GitHub repository. Build command `npm run build`, publish directory `dist`.
3. `public/_redirects` contains `/*  /index.html  200` so `/host` and `/dashboard` load the app (https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/).
4. Environment variables (Project configuration → Environment variables; https://docs.netlify.com/build/environment-variables/get-started/). Set per deploy context:

| Variable | Production context | Deploy previews / branch deploys |
|---|---|---|
| `SUPABASE_URL` | the cloud project URL | same (one project, ADR-127) |
| `SUPABASE_PUBLISHABLE_KEY` | the cloud publishable key | same |
| `VITE_PUBLIC_SHORT_URL` | the short URL shown under the QR | the preview URL |
| `VITE_APP_VERSION` | set by the build to the commit SHA | same |

`VITE_` variables, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are embedded in the public bundle by Vite (`envPrefix` in `vite.config.ts` names those two in full, so `SUPABASE_SECRET_KEY` and `SUPABASE_JWKS_URL` are never exposed); only public values go there. **Never** put the secret key or the DB password in Netlify.

5. Short URL and QR: the QR encodes `VITE_PUBLIC_SHORT_URL` (the site root). Use the Netlify subdomain (e.g. `gdg-booth.netlify.app`) or a custom short domain if the chapter has one (OQ-09). The QR never changes (ADR-002).

### 3.1 Credit budget (ADR-126)

| Item | Cost (Free, credit-based) | Plan |
|---|---|---|
| Production deploy | 15 credits each | ≤ 8 per month; test on deploy previews (free) |
| Bandwidth | 20 credits per GB | ≈ 28 credits for the whole event (ARCHITECTURE §6) |
| Web requests | 2 credits per 10 k | small |
| Rollback ("Publish deploy" of an old deploy) | free, instant, no new build | allowed as the event-day emergency action (ADR-119) |

Source: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/ and https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/. Check the credit meter at the dry run: at least 100 credits must remain for the event.

## 4. Keepalive (from day zero)

No GitHub Actions (2026-09-25, ADR-031 changed, ADR-128 superseded): the repo has no workflows at all. The keepalive is an external free scheduler hitting the database directly — no server, no secret key.

- Scheduler: an external free cron service (e.g. cron-job.org). One job, every 6 hours.
- Request: `POST {SUPABASE_URL}/rest/v1/rpc/keepalive`
  - Headers: `apikey: <publishable key>`, `Authorization: Bearer <publishable key>`, `Content-Type: application/json`
  - Body: `{}`
- `keepalive()` updates one row, which is real database activity (a plain API ping may not count).
- Set up: create the scheduler job with the cloud project's `SUPABASE_URL` and publishable key (§2.5); only public values are involved, so this needs no secret storage.
- Check: `select pinged_at from keepalive` is < 6 h old (SQL editor, or the scheduler's own run history if it logs response bodies).
- Status (2026-09-25): not yet set up (`PROGRESS.md`); until it is, the Free project can pause after about a week of no activity (§2.1).

## 5. Migrations

- Tooling: Supabase CLI (https://supabase.com/docs/guides/deployment/database-migrations).
  - New migration: `supabase migration new <name>` → edit the SQL file in `supabase/migrations/`.
  - Local: `supabase start`, `supabase db reset` (re-applies all migrations), `supabase test db` (pgTAP tests in `supabase/tests/`, https://supabase.com/docs/guides/local-development/testing/overview).
  - A local `db reset` also wipes auth users: run `npm run dev:admin` afterwards. It creates (or repairs) the local admin from `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` in `.env.local` (non-`VITE_`, never bundled) with `app_metadata.role = 'admin'`, reading the CLI's local secret key at runtime from `supabase status -o env` (never stored anywhere); it refuses any non-localhost API URL.
  - Remote: `supabase link --project-ref ppikklvltpfdwbxtilme`, `supabase migration list --linked`, then `supabase db push` and `supabase test db --linked`.
- Rules (`.claude/rules/supabase.md`):
  - Every schema change is a migration; never edit the schema in the dashboard.
  - Never edit an applied migration; add a new one.
  - Never disable RLS; every new table gets RLS + policies in the same migration.
  - No destructive changes once prod has real data: no `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, or type narrowing. Deprecate columns instead.
  - `DATA_MODEL.md` changes in the same commit.
- Order: `supabase db reset` + `supabase test db` locally → `supabase db push` to the cloud project → `supabase test db --linked` → deploy preview test → production deploy. The cloud project is the event database (ADR-127): never push on event days (ADR-119).

## 6. Release process

No CI (2026-09-25): Netlify's build runs only `npm run build`. Run these checks by hand before every deploy:

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test` (Vitest unit tests)
- [ ] `npm run check:i18n`
- [ ] `npm run check:trivia`
- [ ] `npm run contrast`

1. PR → run the checklist above locally → deploy preview on the cloud project.
2. Test on the preview with real phones for anything touching gameplay.
3. Merge to `main` → production deploy (counts against the credit budget).
4. Tag the release (`vYYYY.MM.DD-n`) and note it in `PROGRESS.md`.

## 7. Event rules

- **No deploys on event days** (ADR-032). The event build is the one deployed **and** dry-run tested the day before (the team deploys before and tries it, confirmed in chat 2026-09-24).
- In Netlify, **lock auto publishing** on the evening of the dry run ("Lock to stop auto publishing"), so an accidental merge doesn't go live. Netlify still builds locked commits; whether that costs credits isn't documented, so don't merge during the event either.
- **Only emergency action on an event day**: re-publish the last known-good production deploy ("Publish deploy"), which is instant and needs no build, with the booth lead's OK (ADR-119).
- **No migrations on event days.** Allowed database actions: dashboard admin actions only (hide names, blocklist, new day).
- Content freeze (trivia, blocklist seed) is the last production deploy before the event.

## 8. Rollback

| What broke | Rollback |
|---|---|
| Frontend (bad deploy) | Netlify → Deploys → pick the last good one → **Publish deploy** (instant, free). |
| A migration (dev) | Fix forward with a new migration; `supabase db reset` locally. |
| A migration (prod, before the event) | Fix forward with a new migration. Take a manual backup (`supabase db dump`) before every prod push; the Free plan's automated backups aren't something to rely on. |
| Data mistake (e.g. wrong day started) | Admin functions only; history is never deleted, so nothing needs restoring. Document it in `PROGRESS.md`. |
