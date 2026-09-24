---
paths:
  - "supabase/**"
  - "src/lib/supabase.ts"
  - "src/lib/realtime.ts"
  - "docs/DATA_MODEL.md"
  - "scripts/loadtest/**"
---

# Supabase / SQL rules

Loaded when working on the database or the client's data layer. The schema spec is `docs/DATA_MODEL.md`.

## Non-negotiable
- **RLS on every table in `public`. Never disable it**, not even temporarily or locally for convenience.
- **Schema changes only through migrations** in `supabase/migrations/` (`supabase migration new <name>`). Never edit the schema in the dashboard. Never edit an applied migration; add a new one.
- **No destructive changes** once prod has data: no `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, type narrowing, or deleting history rows. Deprecate instead.
- Every new table ships in the same migration with RLS enabled, policies, privilege grants/revokes, and (if clients need it) the realtime publication entry.
- Update `docs/DATA_MODEL.md` in the same commit as the migration.

## Patterns
- Guests are anonymous users (`authenticated` role); identity is `(select auth.uid())`. Admin = `private.is_admin()` (JWT `app_metadata.role`). Never read roles from `user_metadata`.
- Browser-callable functions live in `public`, `set search_path = ''`, fully schema-qualified. Default `security invoker`. The only exposed `security definer` functions are `join_session` and `keepalive`; adding another needs an ADR.
- Helper, policy and trigger functions go in schema `private` (not exposed).
- Custom errors use SQLSTATE `GD0xx` from DATA_MODEL §5; add new codes there and map them to `COPY.md` strings.
- Scores are insert-only; trusted columns are set by the trigger, never by the client. The server never recomputes a score (ADR-113).
- Realtime fan-out rule (ADR-112): phones subscribe only to their own session's state rows and own player row; leaderboards on phones are polled. Don't add phone subscriptions to `scores`.

## Keys and environments
- The browser uses the **publishable** key only. The secret key never goes in code, `.env` files committed to git, Netlify, CI or scripts.
- One cloud project serves dev and prod (ADR-127): run `supabase test db` locally, then `supabase db push` and `supabase test db --linked`. No migrations on event days.

## Tests
- Every policy and function change comes with pgTAP tests in `supabase/tests/` covering guest, anon and admin (TESTING §3).
