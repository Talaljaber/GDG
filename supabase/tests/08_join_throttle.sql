-- Join-code throttle (ADR-130, SECURITY.md T18; migration 20260925000400_join_throttle.sql):
-- 5 wrong codes from one auth.uid() within a rolling 60 s lock that identity for 30 s, even for the
-- right code; wrong codes and the lock come back as data ({"error": "GD001"} / {"error": "GD013",
-- "retry_after_s": n}); the lock is per identity; private.join_attempts is closed to anon and guests;
-- other join errors still raise. Time is simulated by backdating log rows (now() is fixed per transaction).
begin;
-- isolate from local dev/e2e data (rolled back with the transaction)
truncate public.scores, public.players, public.rounds, public.sessions, public.hidden_names,
         private.join_attempts restart identity cascade;
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

-- guest uid by letter
create function pg_temp.g(k text) returns uuid language sql immutable as $$
  select ('55555555-0000-0000-0000-00000000000' || k)::uuid $$;
-- join as guest k; returns the join result
create function pg_temp.join_as(k text, p_code text, p_name text) returns jsonb language plpgsql as $$
begin
  perform pg_temp.login(pg_temp.g(k));
  return public.join_session(p_code, p_name);
end $$;
-- i-th wrong code: a well-formed code that isn't the lobby's (the only joinable session)
create function pg_temp.bad(i integer) returns text language sql stable as $$
  select ((pg_temp.v('code')::integer - 1000 + i) % 9000 + 1000)::text $$;
-- log rows of guest k (read as postgres)
create function pg_temp.log_count(k text) returns integer language plpgsql as $$
declare n integer;
begin
  perform pg_temp.as_postgres();
  select count(*)::integer into n from private.join_attempts where player_id = pg_temp.g(k);
  return n;
end $$;
-- move guest k's log rows back in time
create function pg_temp.backdate(k text, secs integer) returns void language plpgsql as $$
begin
  perform pg_temp.as_postgres();
  update private.join_attempts set at = at - make_interval(secs => secs) where player_id = pg_temp.g(k);
end $$;

select plan(52);

-- ============ structure and privileges ============
select has_table('private', 'join_attempts', 'private.join_attempts exists');
select ok((select relrowsecurity from pg_class where oid = 'private.join_attempts'::regclass), 'join_attempts has RLS enabled');
select is((select count(*)::int from pg_policies where schemaname = 'private' and tablename = 'join_attempts'), 0,
          'join_attempts has no policies (only join_session touches it)');
select ok(not has_table_privilege(r, 'private.join_attempts', p), r || ' has no ' || p || ' on join_attempts')
  from unnest(array['anon', 'authenticated']) r,
       unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p;
select ok(not has_sequence_privilege('authenticated', 'private.join_attempts_id_seq', 'USAGE'),
          'authenticated has no usage on the log sequence');
select is((select string_agg(proname, ',') from pg_proc where oid = 'public.join_session(text,text)'::regprocedure and prosecdef),
          'join_session', 'join_session is still SECURITY DEFINER');

-- ============ setup: one lobby ============
select pg_temp.as_admin();
select pg_temp.setv('s1', s.id::text), pg_temp.setv('code', s.code) from public.admin_open_lobby('{stop_the_clock,odd_one_out,simon}') s;

-- ============ guests and anon can't touch the log ============
select pg_temp.login(pg_temp.g('f'));
select is(pg_temp.try($$ select 1 from private.join_attempts $$), '42501', 'guest cannot read join_attempts');
select is(pg_temp.try(format($$ insert into private.join_attempts (player_id) values (%L) $$, pg_temp.g('f'))), '42501',
          'guest cannot insert into join_attempts');
select is(pg_temp.try($$ delete from private.join_attempts $$), '42501', 'guest cannot delete from join_attempts');
select pg_temp.as_anon();
select is(pg_temp.try($$ select 1 from private.join_attempts $$), '42501', 'anon cannot read join_attempts');

-- ============ wrong codes come back as data and are logged ============
select is(pg_temp.join_as('a', pg_temp.bad(1), 'Sara'), '{"error": "GD001"}'::jsonb, 'wrong code 1 -> {"error":"GD001"} (not a raise)');
select is(pg_temp.log_count('a'), 1, 'wrong code 1 is logged');
select is(pg_temp.join_as('a', pg_temp.bad(2), 'Sara'), '{"error": "GD001"}'::jsonb, 'wrong code 2 -> GD001');
select is(pg_temp.join_as('a', pg_temp.bad(3), 'Sara'), '{"error": "GD001"}'::jsonb, 'wrong code 3 -> GD001');
select is(pg_temp.join_as('a', '12a4', 'Sara'), '{"error": "GD001"}'::jsonb, 'malformed code 4 -> GD001 (counts too)');
select is(pg_temp.join_as('a', pg_temp.bad(4), 'Sara'), '{"error": "GD001"}'::jsonb, 'wrong code 5 -> GD001');
select is(pg_temp.log_count('a'), 5, 'five wrong codes logged');

-- ============ 6th try is locked, even with the right code ============
select is(pg_temp.join_as('a', pg_temp.v('code'), 'Sara'), '{"error": "GD013", "retry_after_s": 30}'::jsonb,
          '6th try with the RIGHT code -> {"error":"GD013","retry_after_s":30}');
select pg_temp.as_postgres();
select is((select count(*)::int from public.players where player_id = pg_temp.g('a')), 0, 'locked: no player row');
select is(pg_temp.join_as('a', pg_temp.bad(5), 'Sara') ->> 'error', 'GD013', 'locked: a wrong code also gets GD013');
select is(pg_temp.log_count('a'), 5, 'tries while locked are not logged (they do not extend the lock)');
select is(pg_temp.try(format($$ select pg_temp.join_as('a', %L, 'Sam!') $$, pg_temp.v('code'))), 'ok',
          'locked: a bad name gets the wait result, not GD002 (lock checked first)');

-- ============ per identity: another uid is unaffected ============
select is(pg_temp.join_as('b', pg_temp.v('code'), 'Omar') ->> 'session_id', pg_temp.v('s1'), 'guest b joins with the right code');
select is(pg_temp.join_as('c', pg_temp.bad(1), 'Lina'), '{"error": "GD001"}'::jsonb, 'guest c: a wrong code is GD001, not locked');
select is(pg_temp.log_count('c'), 1, 'guest c has its own log');

-- ============ lock expiry (simulated) ============
select pg_temp.backdate('a', 20);
select is(pg_temp.join_as('a', pg_temp.v('code'), 'Sara'), '{"error": "GD013", "retry_after_s": 10}'::jsonb,
          '20 s later: 10 s left');
select pg_temp.backdate('a', 9);
select is((pg_temp.join_as('a', pg_temp.v('code'), 'Sara') ->> 'retry_after_s')::int, 1, '29 s later: 1 s left');
select pg_temp.backdate('a', 1);
select is(pg_temp.join_as('a', pg_temp.v('code'), 'Sara') ->> 'session_id', pg_temp.v('s1'), '30 s later: the right code joins');
select pg_temp.as_postgres();
select is((select count(*)::int from public.players where player_id = pg_temp.g('a')), 1, 'guest a has one player row');
select is(pg_temp.log_count('a'), 5, 'a successful join clears nothing');

-- One more wrong code while the 5 are still inside the 60 s window locks again.
select is(pg_temp.join_as('a', pg_temp.bad(6), 'Sara'), '{"error": "GD001"}'::jsonb, 'after expiry: a wrong code is GD001 ...');
select is(pg_temp.join_as('a', pg_temp.v('code'), 'Sara') ->> 'error', 'GD013', '... and, with 6 in 60 s, locks again');

-- Rows older than 60 s don't count: 4 fresh wrong codes don't lock.
select pg_temp.backdate('a', 61);
select is(pg_temp.join_as('a', pg_temp.bad(i), 'Sara') ->> 'error', 'GD001', 'fresh window: wrong code ' || i || ' -> GD001')
  from generate_series(1, 4) i;
select is(pg_temp.join_as('a', pg_temp.v('code'), 'Sara') ->> 'session_id', pg_temp.v('s1'),
          'fresh window, 4 wrong: the right code returns the existing membership');

-- ============ purge of old rows ============
select pg_temp.as_postgres();
insert into private.join_attempts (player_id, at) values (pg_temp.g('d'), now() - interval '11 minutes');
select is(pg_temp.join_as('c', pg_temp.bad(2), 'Lina') ->> 'error', 'GD001', 'another wrong code ...');
select pg_temp.as_postgres();
select is((select count(*)::int from private.join_attempts where at < now() - interval '10 minutes'), 0,
          '... purges log rows older than 10 minutes');

-- ============ other errors still raise, and log nothing ============
select pg_temp.login(pg_temp.g('e'));
select is(pg_temp.try(format($$ select public.join_session(%L, 'Sam!') $$, pg_temp.v('code'))), 'GD002', 'invalid name still raises GD002');
select is(pg_temp.try(format($$ select public.join_session(%L, 'ass') $$, pg_temp.v('code'))), 'GD003', 'blocked name still raises GD003');
select is(pg_temp.log_count('e'), 0, 'name errors are not logged as wrong codes');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is(pg_temp.try(format($$ select public.join_session(%L, 'Dana') $$, pg_temp.bad(1))), 'GD012', 'no auth.uid() still raises GD012');

select pg_temp.as_postgres();
select * from finish();
rollback;
