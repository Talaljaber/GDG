-- TESTING.md section 3, "Views": board contents, ordering and tie-breaks (SCORING.md section 5; PHASES AC2.5, AC2.9).
-- Round board: score desc, created_at asc. Session board: total desc, total_duration_ms asc, joined_at asc.
-- Day board: one row per (day, game, name key) with the best score; ties by earliest; names without suffix.
-- Hidden name keys are excluded from all three (ADR-115). Also: the 3-game lineup constraint (ADR-012).
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

create function pg_temp.g(k text) returns uuid language sql immutable as $$
  select ('77777777-0000-0000-0000-00000000000' || k)::uuid $$;
create function pg_temp.t(n integer) returns timestamptz language sql immutable as $$
  select timestamptz '2026-09-24 10:00:00+00' + make_interval(secs => n) $$;
-- a score row via the real trigger, then its time pinned (the trigger stamps now(), the same for the whole transaction)
create function pg_temp.score(p_round text, k text, p_score integer, p_dur integer, p_raw text, p_at integer)
returns void language plpgsql as $$
declare v_id uuid;
begin
  insert into public.scores (round_id, player_id, score, duration_ms, raw)
  values (pg_temp.v(p_round)::uuid, pg_temp.g(k), p_score, p_dur, p_raw::jsonb) returning id into v_id;
  update public.scores set created_at = pg_temp.t(p_at) where id = v_id;
end $$;

select plan(22);

select pg_temp.setv('stc', '{"attempts":[{"target_ms":5000,"measured_ms":5100,"missed_start":false},'
                           '{"target_ms":10000,"measured_ms":9800,"missed_start":false},'
                           '{"target_ms":7000,"measured_ms":null,"missed_start":true}]}');
select pg_temp.setv('ooo', '{"grids":[{"size":4,"find_ms":3000,"wrong_taps":0,"timed_out":false},'
                           '{"size":5,"find_ms":4000,"wrong_taps":1,"timed_out":false},'
                           '{"size":6,"find_ms":20000,"wrong_taps":0,"timed_out":true}]}');

-- ============ Fixture (as postgres): two sessions of the current day ============
-- S1: Sara (a), SARA 2 (b, same name key), Omar (c), Lina (d). Rounds: 1 Stop the Clock, 2 Odd One Out.
-- S2: sara (e, same key again, another session). Round 1 Stop the Clock.
select pg_temp.as_postgres();
with x as (
  insert into public.sessions (event_day_id, code, status, lineup)
  values (private.current_event_day_id(), '7001', 'closed', '{stop_the_clock,odd_one_out,simon}') returning id)
select pg_temp.setv('s1', id::text) from x;
with x as (
  insert into public.sessions (event_day_id, code, status, lineup)
  values (private.current_event_day_id(), '7002', 'closed', '{stop_the_clock,simon,trivia}') returning id)
select pg_temp.setv('s2', id::text) from x;
insert into public.players (session_id, player_id, name, name_key, display_suffix, joined_at) values
  (pg_temp.v('s1')::uuid, pg_temp.g('a'), 'Sara', 'sara', null, pg_temp.t(0)),
  (pg_temp.v('s1')::uuid, pg_temp.g('b'), 'SARA', 'sara', 2,    pg_temp.t(1)),
  (pg_temp.v('s1')::uuid, pg_temp.g('c'), 'Omar', 'omar', null, pg_temp.t(2)),
  (pg_temp.v('s1')::uuid, pg_temp.g('d'), 'Lina', 'lina', null, pg_temp.t(3)),
  (pg_temp.v('s2')::uuid, pg_temp.g('e'), 'sara', 'sara', null, pg_temp.t(4));
with x as (
  insert into public.rounds (session_id, round_no, game, status, started_at)
  values (pg_temp.v('s1')::uuid, 1, 'stop_the_clock', 'playing', now()) returning id)
select pg_temp.setv('r1', id::text) from x;
with x as (
  insert into public.rounds (session_id, round_no, game, status, started_at)
  values (pg_temp.v('s1')::uuid, 2, 'odd_one_out', 'playing', now()) returning id)
select pg_temp.setv('r2', id::text) from x;
with x as (
  insert into public.rounds (session_id, round_no, game, status, started_at)
  values (pg_temp.v('s2')::uuid, 1, 'stop_the_clock', 'playing', now()) returning id)
select pg_temp.setv('r3', id::text) from x;

--                 round  who score duration  raw                 at (s)
select pg_temp.score('r1', 'a', 700, 40000, pg_temp.v('stc'), 10);
select pg_temp.score('r1', 'b', 800, 40000, pg_temp.v('stc'), 20);
select pg_temp.score('r1', 'c', 800, 30000, pg_temp.v('stc'), 15);
select pg_temp.score('r1', 'd', 700, 40000, pg_temp.v('stc'), 30);
select pg_temp.score('r2', 'a', 300, 30000, pg_temp.v('ooo'), 40);
select pg_temp.score('r2', 'c', 300, 30000, pg_temp.v('ooo'), 41);
select pg_temp.score('r2', 'b', 300, 30000, pg_temp.v('ooo'), 42);
select pg_temp.score('r2', 'd', 300, 30000, pg_temp.v('ooo'), 43);
select pg_temp.score('r3', 'e', 800, 40000, pg_temp.v('stc'), 5);

-- ============ Round board: score desc, created_at asc ============
select pg_temp.login(pg_temp.g('a'));
select is(array(select coalesce(name || ' ' || display_suffix, name) from public.v_round_board
                 where round_id = pg_temp.v('r1')::uuid order by score desc, created_at asc),
          array['Omar', 'SARA 2', 'Sara', 'Lina'], 'round board: 800 Omar (earlier) before 800 SARA 2; 700 Sara before 700 Lina');
select is((select display_suffix from public.v_round_board where round_id = pg_temp.v('r1')::uuid and name = 'SARA'),
          2::smallint, 'round board carries the display suffix');

-- ============ Session board: total desc, total_duration_ms asc, joined_at asc ============
select is(array(select name || ':' || total || ':' || total_duration_ms || ':' || rounds_scored from public.v_session_board
                 where session_id = pg_temp.v('s1')::uuid
                 order by total desc, total_duration_ms asc, joined_at asc),
          array['Omar:1100:60000:2', 'SARA:1100:70000:2', 'Sara:1000:70000:2', 'Lina:1000:70000:2'],
          'session board: totals; faster overall wins a tie; then earlier join');
select is((select count(*)::int from public.v_session_board where session_id = pg_temp.v('s2')::uuid), 0,
          'session board: a guest sees only sessions they are in (players RLS)');
select ok((select bool_and(total between 0 and 3000) from public.v_session_board), 'session totals are within 0-3000');

-- ============ Day board: best per name key, ties earliest, names without suffix ============
select is((select count(*)::int from public.v_day_board where game = 'stop_the_clock'), 3,
          'day board: one row per name key (three people typed Sara)');
select is(array(select name || ':' || score || ':' || extract(epoch from achieved_at - pg_temp.t(0))::int
                  from public.v_day_board where game = 'stop_the_clock' order by score desc, achieved_at asc),
          array['sara:800:5', 'Omar:800:15', 'Lina:700:30'],
          'day board (Stop the Clock): the sara key keeps its best 800, the earliest of two (S2 at 5 s beats S1 at 20 s)');
select is(array(select name || ':' || extract(epoch from achieved_at - pg_temp.t(0))::int
                  from public.v_day_board where game = 'odd_one_out' order by score desc, achieved_at asc),
          array['Sara:40', 'Omar:41', 'Lina:43'],
          'day board (Odd One Out): all 300, ordered by who got there first');
select is((select count(*)::int from public.v_day_board where name like '% %'), 0, 'day board names carry no suffix');
select is((select count(*)::int from public.v_day_board where event_day_id <> private.current_event_day_id()), 0,
          'day board: only the current day is readable by a guest');

-- ============ Hidden names leave every board (AC2.9, E24) ============
select pg_temp.as_admin();
select is(pg_temp.try($$ select public.admin_hide_name('OMAR') $$), 'ok', 'hide Omar');
select pg_temp.login(pg_temp.g('d'));
select is((select count(*)::int from public.v_round_board where name = 'Omar'), 0, 'hidden: not on the round board');
select is((select count(*)::int from public.v_session_board where name = 'Omar'), 0, 'hidden: not on the session board');
select is((select count(*)::int from public.v_day_board where name_key = 'omar'), 0, 'hidden: not on the day board');
select is(array(select name from public.v_day_board where game = 'stop_the_clock' order by score desc, achieved_at asc),
          array['sara', 'Lina'], 'hidden: the others move up');
select is((select count(*)::int from public.scores where name_key = 'omar'), 2, 'hidden: the rows are kept');
select is((select count(*)::int from public.hidden_names where name_key = 'omar'), 1, 'guests can read hidden keys (phones filter the day board)');
select pg_temp.as_admin();
select is(pg_temp.try($$ select public.admin_unhide_name('omar') $$), 'ok', 'unhide Omar');
select pg_temp.login(pg_temp.g('d'));
select is((select count(*)::int from public.v_day_board where name_key = 'omar'), 2, 'unhidden: back on both day boards');

-- ============ Exactly 3 distinct games (migration 20260925000300, ADR-012) ============
select pg_temp.as_postgres();
select ok(exists (select 1 from pg_constraint where conname = 'sessions_lineup_three' and conrelid = 'public.sessions'::regclass),
          'sessions_lineup_three exists');
select is(split_part(pg_temp.try(format($$ insert into public.sessions (event_day_id, code, status, lineup) values (%L, '7003', 'closed', '{simon,trivia}') $$,
                             private.current_event_day_id())), ':', 1),
          '23514', 'a 2-game lineup is refused by the constraint');
select is(split_part(pg_temp.try(format($$ update public.sessions set lineup = '{simon}' where id = %L $$, pg_temp.v('s1'))), ':', 1),
          '23514', 'shrinking a lineup is refused by the constraint');

select pg_temp.as_postgres();
select * from finish();
rollback;
