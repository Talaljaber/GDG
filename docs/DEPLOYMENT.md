# Deployment

Purpose: step-by-step setup of the Supabase projects, the Netlify site and the keepalive job, plus environment variables, the migration process, rollback, and the "no deploys on event day" rule. A new team member should be able to stand up a working copy from this file alone. Platform facts are cited inline; re-check them if the event is months away.

Last updated: 2026-09-24

---

## 1. Environments

| | Dev | Prod |
|---|---|---|
| Supabase project | `gdg-booth-dev` | `gdg-booth-prod` (ADR-127) |
| Netlify | deploy previews + branch deploys (free) | production deploy of `main` (15 credits each, ADR-126) |
| Used by | development, load tests, rehearsals | dry run and event only |
| Region | `eu-central-1` Frankfurt | `eu-central-1` Frankfurt |

The Supabase Free plan allows two active projects (https://supabase.com/pricing).

## 2. Supabase setup (do for dev, then prod)

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

## 3. Netlify setup

1. Use a Netlify account (team) used **only** for this site: when the Free plan's 300 monthly credits run out, every project on the account is paused and shows "Site not available" (https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/billing-faq-for-credit-based-plans/). Check in the account's billing page whether it is on a credit-based plan or a legacy plan (accounts created before 2025-09-04 may be legacy; OQ-14).
2. Import the GitHub repository. Build command `npm run build`, publish directory `dist`.
3. `public/_redirects` contains `/*  /index.html  200` so `/host` and `/dashboard` load the app (https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/).
4. Environment variables (Project configuration → Environment variables; https://docs.netlify.com/build/environment-variables/get-started/). Set per deploy context:

| Variable | Production context | Deploy previews / branch deploys |
|---|---|---|
| `VITE_SUPABASE_URL` | prod project URL | dev project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | prod publishable key | dev publishable key |
| `VITE_PUBLIC_SHORT_URL` | the short URL shown under the QR | the preview URL |
| `VITE_APP_VERSION` | set by the build to the commit SHA | same |

`VITE_` variables are embedded in the public bundle by Vite; only public values go there. **Never** put the secret key or the DB password in Netlify.

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

- `.github/workflows/keepalive.yml`, schedule `17 */6 * * *` (every 6 hours at minute 17; GitHub runs schedules at most every 5 minutes and delays top-of-hour jobs: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
- The job sends one `POST {SUPABASE_URL}/rest/v1/rpc/keepalive` with the publishable key in the `apikey` header. `keepalive()` updates one row, which is real database activity (a plain API ping may not count).
- Repository secrets: `SUPABASE_URL_PROD`, `SUPABASE_PUBLISHABLE_KEY_PROD`, and the same for dev. Publishable keys are not secret, but keeping them in secrets avoids hard-coding.
- The job fails loudly (non-2xx → failed run → GitHub email to the repo owner).
- **Keep the repository private**: GitHub disables schedules in public repositories after 60 days without activity (same source). Private repos use a few Actions minutes per month.
- Check: the latest run is green (weekly, and on dry-run day); `select pinged_at from keepalive` is < 6 h old.

## 5. Migrations

- Tooling: Supabase CLI (https://supabase.com/docs/guides/deployment/database-migrations).
  - New migration: `supabase migration new <name>` → edit the SQL file in `supabase/migrations/`.
  - Local: `supabase start`, `supabase db reset` (re-applies all migrations), `supabase test db` (pgTAP tests in `supabase/tests/`, https://supabase.com/docs/guides/local-development/testing/overview).
  - A local `db reset` also wipes auth users: run `npm run dev:admin` afterwards. It creates (or repairs) the local admin from `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` in `.env.local` (non-`VITE_`, never bundled) with `app_metadata.role = 'admin'`, reading the CLI's local secret key at runtime from `supabase status -o env` (never stored anywhere); it refuses any non-localhost API URL.
  - Remote: `supabase link --project-ref <ref>` then `supabase db push` (dev first, then prod).
- Rules (`.claude/rules/supabase.md`):
  - Every schema change is a migration; never edit the schema in the dashboard.
  - Never edit an applied migration; add a new one.
  - Never disable RLS; every new table gets RLS + policies in the same migration.
  - No destructive changes once prod has real data: no `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, or type narrowing. Deprecate columns instead.
  - `DATA_MODEL.md` changes in the same commit.
- Order: dev push → run the pgTAP suite against dev → deploy preview test → prod push → production deploy.

## 6. Release process

1. PR → CI (typecheck, unit tests, `check:trivia`, `check:i18n`) → deploy preview on the dev project.
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
