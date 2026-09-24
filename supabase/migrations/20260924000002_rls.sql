-- 0002 Row Level Security: helpers, privileges, policies.
-- Spec: docs/DATA_MODEL.md section 4.

-- ============ 4.1 Helper functions (schema private) ============

-- Admin = JWT app_metadata.role = 'admin'. app_metadata (raw_app_meta_data) cannot be updated by the user,
-- which is why Supabase recommends it for authorization data.
-- Note: a JWT only picks up a changed role after the admin signs out and in again.
create function private.is_admin()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

-- Membership check used by policies. SECURITY DEFINER so a policy on players can query players
-- without recursing into its own RLS. Lives in private, so it can't be called over the Data API.
create function private.is_session_member(sid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.players p
    where p.session_id = sid and p.player_id = (select auth.uid())
  )
$$;

create function private.current_event_day_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.event_days where is_current
$$;

-- ============ 4.2 Enable RLS and set table privileges ============
alter table public.event_days    enable row level security;
alter table public.sessions      enable row level security;
alter table public.rounds        enable row level security;
alter table public.players       enable row level security;
alter table public.scores        enable row level security;
alter table public.hidden_names  enable row level security;
alter table public.blocked_terms enable row level security;
alter table public.keepalive     enable row level security;

-- Start from nothing, whatever the project's default privileges are. (Supabase's defaults for tables
-- created by postgres grant TRUNCATE/REFERENCES/TRIGGER to anon and authenticated; TRUNCATE ignores RLS.)
-- The unsigned anon role gets nothing. Guests are 'authenticated' (anonymous sign-in).
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, public;

-- Then grant exactly what the policies below are written for.
-- No DELETE on event_days, sessions, rounds, players, scores: nobody deletes history.
grant select, insert, update         on public.event_days    to authenticated;
grant select, insert, update         on public.sessions      to authenticated;
grant select, insert, update         on public.rounds        to authenticated;
-- players: rows are created only by join_session(); only these columns are updatable at all
-- (guest: progress*, admin: status/removed_at).
grant select                         on public.players       to authenticated;
grant update (progress, progress_round, status, removed_at) on public.players to authenticated;
-- scores: insert-only; never changed or deleted after insert.
grant select, insert                 on public.scores        to authenticated;
-- hidden_names: delete = un-hide (admin only by policy); blocked_terms: admin only by policy.
grant select, insert, update, delete on public.hidden_names  to authenticated;
grant select, insert, update, delete on public.blocked_terms to authenticated;
-- keepalive: no grants; only touched by keepalive().

-- ============ 4.3 Policies ============

-- ---------- Guest (and admin) read access ----------
create policy event_days_select on public.event_days
  for select to authenticated using (true);

-- Guests never list sessions, so they can't read a code they haven't been shown (join goes through join_session()).
create policy sessions_select_member on public.sessions
  for select to authenticated using (private.is_session_member(id));

create policy rounds_select_member on public.rounds
  for select to authenticated using (private.is_session_member(session_id));

create policy players_select_member on public.players
  for select to authenticated using (private.is_session_member(session_id));

-- Current day's scores are public to signed-in users (session boards + day boards).
create policy scores_select_today on public.scores
  for select to authenticated using (event_day_id = (select private.current_event_day_id()));

create policy hidden_names_select on public.hidden_names
  for select to authenticated using (true);

-- ---------- Guest writes ----------
-- Own, non-removed player row; only progress columns (grant above); can't set status to 'removed'
-- (with check) and can't set removed_at (check constraint ties it to status).
create policy players_update_own_progress on public.players
  for update to authenticated
  using      (player_id = (select auth.uid()) and status = 'joined')
  with check (player_id = (select auth.uid()) and status = 'joined');

-- Own score. Membership, round open and bounds are enforced by the trigger (0003, specific error codes).
create policy scores_insert_own on public.scores
  for insert to authenticated
  with check (player_id = (select auth.uid()));

-- ---------- Admin ----------
create policy event_days_admin    on public.event_days    for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy sessions_admin      on public.sessions      for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy rounds_admin        on public.rounds        for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy players_admin       on public.players       for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy scores_admin_read   on public.scores        for select to authenticated using ((select private.is_admin()));
create policy hidden_names_admin  on public.hidden_names  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy blocked_terms_admin on public.blocked_terms for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
-- (The missing DELETE/UPDATE grants above still stop even the admin from deleting history or editing scores.)

-- keepalive: no policies (only reachable through keepalive()).
