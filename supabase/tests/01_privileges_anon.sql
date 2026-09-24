-- TESTING.md section 3: RLS on every table, privilege shape, function security, realtime publication,
-- and the anon role (no JWT): can't read or write any table; can call keepalive() only.
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
-- ------------------------------------------------------------------

select plan(58);

-- ============ RLS enabled on every public table ============
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'RLS is enabled on every table in public');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'),
  8, 'public has exactly the 8 spec tables');

-- ============ Privilege shape ============
select ok(not exists (
  select 1 from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon'),
  'anon holds no privilege on any public table or view');
select ok(not has_table_privilege('authenticated', t, 'TRUNCATE'), 'authenticated cannot TRUNCATE ' || t)
  from unnest(array['public.event_days','public.sessions','public.rounds','public.players','public.scores',
                    'public.hidden_names','public.blocked_terms','public.keepalive']) t;
select ok(not has_table_privilege('authenticated', t, 'DELETE'), 'authenticated cannot DELETE from ' || t)
  from unnest(array['public.event_days','public.sessions','public.rounds','public.players','public.scores','public.keepalive']) t;
select ok(not has_table_privilege('authenticated', 'public.scores', 'UPDATE'), 'nobody signed in can UPDATE scores');
select ok(not has_table_privilege('authenticated', 'public.players', 'INSERT'), 'authenticated cannot INSERT players');
select ok(not has_column_privilege('authenticated', 'public.players', 'name', 'UPDATE'), 'players.name is not updatable');
select ok(has_column_privilege('authenticated', 'public.players', 'progress', 'UPDATE'), 'players.progress is updatable');
select ok(not has_table_privilege('authenticated', 'public.keepalive', 'SELECT'), 'authenticated cannot read keepalive');

-- ============ Function security ============
-- Event-trigger functions are skipped in the next two checks: they can't be called directly (only
-- as event triggers), and a cloud project with Supabase's "automatic RLS" option adds one to public
-- (public.rls_auto_enable, definer, search_path=pg_catalog). The anon check below stays unfiltered,
-- so such a function still may not be executable by anon.
select is(
  array(select p.proname::text collate "C" from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
          and p.prorettype <> 'event_trigger'::regtype order by 1),
  array['join_session', 'keepalive'],
  'join_session and keepalive are the only SECURITY DEFINER functions in public');
select is(
  (select count(*)::int from pg_proc p where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
     and p.prorettype <> 'event_trigger'::regtype
     and not coalesce(p.proconfig @> array['search_path=""'], false)),
  0, 'every public/private function sets search_path = empty');
select is(
  (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
     and has_function_privilege('anon', p.oid, 'EXECUTE')),
  1, 'anon can execute exactly one public function');
select ok(has_function_privilege('anon', 'public.keepalive()', 'EXECUTE'), 'that function is keepalive()');
select is(
  (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0, 'authenticated can execute every public function');
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon has no usage on schema private');

-- ============ Realtime publication ============
select is(
  array(select tablename::text collate "C" from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by 1),
  array['hidden_names', 'players', 'rounds', 'scores', 'sessions'],
  'supabase_realtime publishes exactly sessions, rounds, players, scores, hidden_names');

-- ============ Seed ============
select is((select count(*)::int from public.event_days where is_current), 1, 'exactly one current event day');
select is((select label from public.event_days where is_current), 'Day 1', 'seeded day is Day 1');
select ok((select count(*) from public.blocked_terms) > 0, 'blocked_terms has a starter list');

-- ============ anon: no reads ============
select pg_temp.as_anon();
select is(pg_temp.try('select 1 from ' || t), '42501', 'anon cannot select ' || t)
  from unnest(array['public.event_days','public.sessions','public.rounds','public.players','public.scores',
                    'public.hidden_names','public.blocked_terms','public.keepalive',
                    'public.v_round_board','public.v_session_board','public.v_day_board']) t;

-- ============ anon: no writes ============
select is(pg_temp.try($$ insert into public.event_days (label) values ('x') $$), '42501', 'anon cannot insert event_days');
select is(pg_temp.try($$ insert into public.hidden_names (name_key) values ('x') $$), '42501', 'anon cannot insert hidden_names');
select is(pg_temp.try($$ insert into public.blocked_terms (term_key, lang) values ('x', 'en') $$), '42501', 'anon cannot insert blocked_terms');
select is(pg_temp.try($$ update public.keepalive set pinged_at = now() $$), '42501', 'anon cannot update keepalive directly');
select is(pg_temp.try($$ delete from public.scores $$), '42501', 'anon cannot delete scores');
select is(pg_temp.try($$ truncate public.scores $$), '42501', 'anon cannot truncate scores');

-- ============ anon: functions ============
select is(pg_temp.try($$ select public.join_session('1234', 'Sara') $$), '42501', 'anon cannot call join_session');
select is(pg_temp.try($$ select public.server_now() $$), '42501', 'anon cannot call server_now');
select is(pg_temp.try($$ select public.admin_open_lobby('{stop_the_clock}') $$), '42501', 'anon cannot call admin_open_lobby');
select is(pg_temp.try($$ select public.admin_new_session() $$), '42501', 'anon cannot call admin_new_session');
select is(pg_temp.try($$ select public.admin_start_new_day('x') $$), '42501', 'anon cannot call admin_start_new_day');
select is(pg_temp.try($$ select public.keepalive() $$), 'ok', 'anon can call keepalive()');

select pg_temp.as_postgres();
select is((select pinged_at from public.keepalive where id = 1), now(), 'keepalive() touched pinged_at');

-- a guest may call keepalive too (harmless)
select pg_temp.login('11111111-0000-0000-0000-000000000001');
select is(pg_temp.try($$ select public.keepalive() $$), 'ok', 'a guest can call keepalive()');
select is(pg_temp.try($$ select 1 from public.keepalive $$), '42501', 'a guest cannot read keepalive');

select pg_temp.as_postgres();
select * from finish();
rollback;
