-- Phase 6 security review (docs/SECURITY.md section 5 and section 7): structural guards that catch a
-- future migration weakening the floor, plus the review's behavioural probes not covered by 01-06:
-- removed players, own-status tampering, scores for another member, the raw size bound (T16),
-- joins after Start (T2), email users and forged metadata (T9, T15), private schema from anon (T10),
-- storage and Realtime Authorization (no buckets, no realtime.messages policies).
begin;
-- isolate from local dev/e2e data (rolled back with the transaction)
truncate public.scores, public.players, public.rounds, public.sessions, public.hidden_names restart identity cascade;
create extension if not exists pgtap with schema extensions;

-- ---------- helpers (same preamble in every test file) ----------
create function pg_temp.login(p_sub uuid, p_admin boolean default false) returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object(
      'sub', p_sub, 'role', 'authenticated', 'aud', 'authenticated', 'is_anonymous', not p_admin,
      'app_metadata', case when p_admin then json_build_object('provider', 'email', 'role', 'admin')
                           else json_build_object('provider', 'anonymous') end)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.as_admin() returns void language sql as $$
  select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001', true) $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;
create function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.rows(p_sql text) returns integer language plpgsql as $$
declare n integer; begin execute p_sql; get diagnostics n = row_count; return n; end $$;
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
declare st text; dt text;
begin
  execute p_sql; return 'ok';
exception when others then
  get stacked diagnostics st = returned_sqlstate, dt = pg_exception_detail;
  return st || coalesce(nullif(':' || dt, ':'), '');
end $$;
create function pg_temp.v(k text) returns text language sql stable as $$ select current_setting('t.' || k) $$;
create function pg_temp.setv(k text, val text) returns text language sql as $$ select set_config('t.' || k, val, true) $$;
-- ------------------------------------------------------------------

-- An email (non-anonymous) user without an admin role, who wrote role = admin into user_metadata.
create function pg_temp.as_email_user(p_sub uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object(
      'sub', p_sub, 'role', 'authenticated', 'aud', 'authenticated', 'is_anonymous', false,
      'app_metadata', json_build_object('provider', 'email', 'providers', json_build_array('email')),
      'user_metadata', json_build_object('role', 'admin'))::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

select plan(40);

-- ================= Structural guards (run as postgres) =================

select is(
  (select count(*)::int from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0, 'checklist 1: RLS is enabled on every table in public');

-- Supabase's default privileges hand TRUNCATE/REFERENCES/TRIGGER on new tables to anon and
-- authenticated, and TRUNCATE ignores RLS: every relation must have had them revoked.
select is(
  (select count(*)::int from pg_class c, unnest(array['anon', 'authenticated']) r(role),
          unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege(r.role, c.oid, p.priv)),
  0, 'no public table or view grants TRUNCATE, REFERENCES or TRIGGER to anon or authenticated');

select is(
  (select count(*)::int from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
      and not coalesce(c.reloptions @> array['security_invoker=true'], false)),
  0, 'every public view is security_invoker (the caller''s RLS applies)');

select is(
  (select count(*)::int from pg_class c, unnest(array['INSERT', 'UPDATE', 'DELETE']) p(priv)
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
      and has_table_privilege('authenticated', c.oid, p.priv)),
  0, 'views are read-only for authenticated (no INSERT/UPDATE/DELETE)');

select is(
  (select count(*)::int from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.pronamespace = 'public'::regnamespace and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  0, 'no public function is executable by the PUBLIC pseudo-role');

select is(
  array(select p.proname::text collate "C" from pg_proc p
         where p.pronamespace = 'private'::regnamespace and p.prosecdef order by 1),
  array['current_event_day_id', 'is_session_member', 'scores_fill_and_validate', 'scores_mark_finished'],
  'private SECURITY DEFINER functions are exactly the two policy helpers and the two score triggers');

select is(
  (select count(*)::int from pg_proc p
    where p.prosecdef and p.pronamespace not in (select oid from pg_namespace
      where nspname in ('pg_catalog', 'information_schema', 'auth', 'storage', 'realtime', 'extensions',
                        'graphql', 'graphql_public', 'vault', 'net', 'pgbouncer', 'supabase_functions',
                        'pgsodium', 'pgsodium_masks', 'supabase_migrations', 'public', 'private'))),
  0, 'no SECURITY DEFINER function in any other app schema');

select is((select count(*)::int from storage.buckets), 0, 'storage: no buckets exist');
select is((select count(*)::int from pg_policies where schemaname = 'storage'), 0, 'storage: no policies grant anything');

select ok((select relrowsecurity from pg_class where oid = 'realtime.messages'::regclass),
  'realtime.messages has RLS enabled');
select is((select count(*)::int from pg_policies where schemaname = 'realtime'), 0,
  'realtime.messages has no policies: private channels are closed (update when an ADR adopts private channels)');

select ok(not exists (select 1 from pg_publication_tables
                       where pubname = 'supabase_realtime' and tablename in ('blocked_terms', 'keepalive', 'event_days')),
  'blocked_terms, keepalive and event_days are not published over Realtime');

select ok((select convalidated from pg_constraint where conname = 'scores_raw_size' and conrelid = 'public.scores'::regclass),
  'T16: scores_raw_size exists and is validated');

-- ================= Fixture =================
-- s1: A, B joined; R joined then removed in the lobby; started (r1 playing). s2: the pending session.
select pg_temp.setv('A', '22222222-0000-0000-0000-00000000000a');
select pg_temp.setv('B', '22222222-0000-0000-0000-00000000000b');
select pg_temp.setv('R', '22222222-0000-0000-0000-00000000000e');
select pg_temp.setv('E', '22222222-0000-0000-0000-00000000000f');
select pg_temp.setv('M', '22222222-0000-0000-0000-000000000011');
select pg_temp.setv('stc_raw', '{"attempts":[{"target_ms":5000,"measured_ms":5100,"missed_start":false},'
                               '{"target_ms":10000,"measured_ms":9800,"missed_start":false},'
                               '{"target_ms":7000,"measured_ms":null,"missed_start":true}]}');

select pg_temp.as_admin();
select pg_temp.setv('s1', s.id::text), pg_temp.setv('s1_code', s.code)
  from public.admin_open_lobby('{stop_the_clock,simon,trivia}') s;
select pg_temp.login(pg_temp.v('A')::uuid);
select pg_temp.setv('pA', public.join_session(pg_temp.v('s1_code'), 'Sara') ->> 'player_row_id');
select pg_temp.login(pg_temp.v('B')::uuid);
select pg_temp.setv('pB', public.join_session(pg_temp.v('s1_code'), 'Omar') ->> 'player_row_id');
select pg_temp.login(pg_temp.v('R')::uuid);
select pg_temp.setv('pR', public.join_session(pg_temp.v('s1_code'), 'Rami') ->> 'player_row_id');
select pg_temp.as_admin();
select public.admin_remove_player(pg_temp.v('pR')::uuid);
select pg_temp.setv('r1', j ->> 'round_id'), pg_temp.setv('s2_code', j ->> 'pending_code')
  from public.admin_start_session(pg_temp.v('s1')::uuid) j;

-- ================= Removed player (T3, T4) =================
select pg_temp.login(pg_temp.v('R')::uuid);
select is(pg_temp.rows(format($$ update public.players set progress = 'playing', progress_round = 1 where id = %L $$, pg_temp.v('pR'))),
          0, 'removed player cannot update own progress');
select is(pg_temp.rows(format($$ update public.players set status = 'joined', removed_at = null where id = %L $$, pg_temp.v('pR'))),
          0, 'removed player cannot un-remove themselves');
select is(pg_temp.try(format($$ insert into public.scores (round_id, player_id, score, duration_ms, raw) values (%L, %L, 500, 20000, %L) $$,
                             pg_temp.v('r1'), pg_temp.v('R'), pg_temp.v('stc_raw'))),
          'GD005', 'removed player cannot submit a score (GD005)');
select is(pg_temp.try(format($$ select public.join_session(%L, 'Rami') $$, pg_temp.v('s2_code'))),
          'ok', 'removed player may join the next session (a new session, a fresh start)');
select pg_temp.as_postgres();
select is((select status::text from public.players where id = pg_temp.v('pR')::uuid), 'removed', 'removed row unchanged');

-- ================= Member guest A =================
select pg_temp.login(pg_temp.v('A')::uuid);
select is(pg_temp.try(format($$ update public.players set status = 'removed', removed_at = now() where id = %L $$, pg_temp.v('pA'))),
          '42501', 'guest cannot set own status to removed');
select is(pg_temp.rows(format($$ update public.players set status = 'removed', removed_at = now() where id = %L $$, pg_temp.v('pB'))),
          0, 'guest cannot remove another player');
select is(pg_temp.try(format($$ update public.players set player_id = %L where id = %L $$, pg_temp.v('A'), pg_temp.v('pB'))),
          '42501', 'guest cannot take over another player row (player_id not updatable)');
select is(pg_temp.try(format($$ update public.players set session_id = %L where id = %L $$, pg_temp.v('s1'), pg_temp.v('pA'))),
          '42501', 'guest cannot move own row to another session');
-- another member's player_id passes the trigger (B is in the session) and then fails RLS WITH CHECK
select is(pg_temp.try(format($$ insert into public.scores (round_id, player_id, score, duration_ms, raw) values (%L, %L, 500, 20000, %L) $$,
                             pg_temp.v('r1'), pg_temp.v('B'), pg_temp.v('stc_raw'))),
          '42501', 'guest cannot insert a score for another member of the same session');
select is(pg_temp.try(format($$ insert into public.scores (round_id, player_id, score, duration_ms, raw) values (%L, %L, 500, 20000, %L) $$,
                             pg_temp.v('r1'), pg_temp.v('A'),
                             (pg_temp.v('stc_raw')::jsonb || jsonb_build_object('pad', repeat('x', 5000)))::text)),
          '23514', 'T16: a raw over 4096 bytes is refused (check_violation)');
select is(pg_temp.try(format($$ insert into public.scores (round_id, player_id, score, duration_ms, raw) values (%L, %L, 500, 20000, %L) $$,
                             pg_temp.v('r1'), pg_temp.v('A'),
                             (pg_temp.v('stc_raw')::jsonb || jsonb_build_object('note', 'extra key'))::text)),
          'ok', 'a normal-size raw with an extra key is still accepted');
select is(pg_temp.try(format($$ insert into public.scores (round_id, player_id, score, duration_ms, raw, created_at)
                               values (%L, %L, 900, 20000, %L, now() - interval '1 day') $$,
                             pg_temp.v('r1'), pg_temp.v('A'), pg_temp.v('stc_raw'))),
          '23505', 'a second score (even with a spoofed created_at) is refused');
select is((select created_at from public.scores where player_id = pg_temp.v('A')::uuid), now(),
          'created_at comes from the server');
select is(pg_temp.try($$ select private.is_admin() $$), 'ok', 'guest can evaluate private helpers in SQL (policies need it) ...');
select is((select private.is_admin()), false, '... and they report not admin');

-- ================= Joins lock at Start (T2) =================
select pg_temp.login(pg_temp.v('E')::uuid);
select is(public.join_session(pg_temp.v('s1_code'), 'Eve'),
          '{"error": "GD001"}'::jsonb, 'T2: a new identity cannot join a session that already started (GD001 as data, ADR-130)');
select is((select count(*)::int from public.sessions), 0, 'T7: that identity still sees no session');

-- ================= Email user with forged user_metadata (T9, T15) =================
select pg_temp.as_email_user(pg_temp.v('M')::uuid);
select is((select private.is_admin()), false, 'T9: user_metadata.role = admin is not admin (email user)');
select is(pg_temp.try($$ select public.admin_open_lobby('{simon,trivia,stop_the_clock}') $$), 'GD009', 'T15: email user cannot call admin functions');
select is(pg_temp.try($$ select public.admin_hide_name('sara', null) $$), 'GD009', 'T15: email user cannot hide names');
select is((select count(*)::int from public.blocked_terms), 0, 'T15: email user cannot read blocked_terms');
select is((select count(*)::int from public.sessions), 0, 'T15: email user sees no sessions');
select is(pg_temp.rows($$ update public.sessions set status = 'closed' $$), 0, 'T15: email user cannot update sessions');

-- ================= anon and the private schema (T10) =================
select pg_temp.as_anon();
select is(pg_temp.try($$ select private.is_admin() $$), '42501', 'T10: anon cannot use schema private');
select is(pg_temp.try($$ select private.is_session_member(gen_random_uuid()) $$), '42501', 'T10: anon cannot call private.is_session_member');
-- Locally anon has no INSERT grant (42501). The cloud grants it and RLS would refuse the row, but
-- realtime.messages is partitioned by day and partition routing (23514) can fail first. Either way
-- the write is refused; the no-policy check above is what keeps private channels closed.
select ok(pg_temp.try($$ insert into realtime.messages (topic, extension, payload, event, private)
                         values ('presence:x', 'broadcast', '{}', 'x', true) $$) in ('42501', '23514'),
          'anon cannot write realtime.messages (no policy; private channels stay closed)');

select pg_temp.as_postgres();
select * from finish();
rollback;
