-- TESTING.md section 3, "Admin": can run every admin function (see 04_lifecycle.sql for the transitions);
-- still can't delete sessions/scores or update scores. Hide/unhide and blocklist management.
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

select plan(29);

-- ============ Fixture: one running session with one score ============
select pg_temp.setv('A', '22222222-0000-0000-0000-00000000000a');
select pg_temp.as_admin();
select pg_temp.setv('s1', s.id::text), pg_temp.setv('s1_code', s.code)
  from public.admin_open_lobby('{stop_the_clock,odd_one_out,simon}') s;
select pg_temp.login(pg_temp.v('A')::uuid);
select pg_temp.setv('pA', public.join_session(pg_temp.v('s1_code'), 'Sara') ->> 'player_row_id');
select pg_temp.as_admin();
select pg_temp.setv('r1', j ->> 'round_id') from public.admin_start_session(pg_temp.v('s1')::uuid) j;
select pg_temp.login(pg_temp.v('A')::uuid);
insert into public.scores (round_id, player_id, score, duration_ms, raw)
values (pg_temp.v('r1')::uuid, pg_temp.v('A')::uuid, 800, 30000,
        '{"attempts":[{"target_ms":5000,"measured_ms":5100,"missed_start":false},{"target_ms":10000,"measured_ms":9900,"missed_start":false},{"target_ms":7000,"measured_ms":7400,"missed_start":false}]}');

-- ============ Admin reads everything ============
select pg_temp.as_admin();
select ok(private.is_admin(), 'admin JWT (app_metadata.role = admin) is recognised');
select is((select count(*)::int from public.sessions), 2, 'admin reads every session (running + pending)');
select is((select count(*)::int from public.players), 1, 'admin reads every player');
select is((select count(*)::int from public.scores), 1, 'admin reads scores');
select ok((select count(*) from public.blocked_terms) > 0, 'admin reads blocked_terms');

-- ============ ...but can't delete history or edit scores ============
select is(pg_temp.try('delete from ' || t), '42501', 'admin cannot delete from ' || t)
  from unnest(array['public.event_days','public.sessions','public.rounds','public.players','public.scores']) t;
select is(pg_temp.try($$ update public.scores set score = 1000 $$), '42501', 'admin cannot update scores');
select is(pg_temp.try($$ truncate public.scores $$), '42501', 'admin cannot truncate scores');
select is(pg_temp.try(format($$ insert into public.players (session_id, player_id, name, name_key) values (%L, gen_random_uuid(), 'X', 'x') $$,
                             pg_temp.v('s1'))),
          '42501', 'admin cannot insert players directly');
select is(pg_temp.try($$ update public.players set name = 'X' $$), '42501', 'admin cannot rename players');

-- ============ Hide / unhide by name key ============
select is(pg_temp.try($$ select public.admin_hide_name('  SARA ', 'test') $$), 'ok', 'admin_hide_name');
select is((select note from public.hidden_names where name_key = 'sara'), 'test', 'hidden by normalised key');
select is(pg_temp.try($$ select public.admin_hide_name('sara', null) $$), 'ok', 'hiding twice is harmless');
select pg_temp.login(pg_temp.v('A')::uuid);
select is((select count(*)::int from public.v_round_board), 0, 'hidden name gone from round board');
select is((select count(*)::int from public.v_session_board), 0, 'hidden name gone from session board');
select is((select count(*)::int from public.v_day_board), 0, 'hidden name gone from day board');
select is((select count(*)::int from public.scores), 1, 'the score row itself is kept');
select pg_temp.as_admin();
select is(pg_temp.try($$ select public.admin_unhide_name('Sara') $$), 'ok', 'admin_unhide_name');
select pg_temp.login(pg_temp.v('A')::uuid);
select is((select total from public.v_session_board where player_row_id = pg_temp.v('pA')::uuid), 800, 'unhidden: back on the session board');

-- ============ Blocklist management ============
select pg_temp.as_admin();
select is(pg_temp.try($$ select public.admin_add_blocked_term(' Foo Bar ', 'substring', 'en') $$), 'ok', 'admin_add_blocked_term');
select is((select match::text from public.blocked_terms where term_key = 'foobar'), 'substring', 'stored as name key with spaces removed');
select is(pg_temp.try($$ select public.admin_add_blocked_term('   ', 'substring', 'en') $$), '23514', 'an empty term is refused');
select is(pg_temp.try($$ select public.admin_remove_blocked_term('FOO BAR') $$), 'ok', 'admin_remove_blocked_term');
select is((select count(*)::int from public.blocked_terms where term_key = 'foobar'), 0, 'term removed');

-- ============ Roles never come from user_metadata ============
select set_config('request.jwt.claims',
  '{"sub":"33333333-0000-0000-0000-000000000001","role":"authenticated","user_metadata":{"role":"admin"},"app_metadata":{"provider":"anonymous"}}', true);
select is(pg_temp.try($$ select public.admin_open_lobby('{simon}') $$), 'GD009', 'user_metadata.role = admin is not an admin');

select pg_temp.as_postgres();
select * from finish();
rollback;
