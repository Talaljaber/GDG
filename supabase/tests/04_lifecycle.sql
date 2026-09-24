-- TESTING.md section 3, "Functions": every transition in SESSION_LIFECYCLE.md sections 2-3, plus:
-- start with 0 players -> GD010; remove after start -> GD010; two joinable sessions impossible;
-- join_session idempotent for the same uid; removed uid -> GD004; late score within 15 s accepted, after -> GD007.
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

-- guest uid by letter
create function pg_temp.g(k text) returns uuid language sql immutable as $$
  select ('44444444-0000-0000-0000-00000000000' || k)::uuid $$;
-- join as guest k; returns the join payload
create function pg_temp.join_as(k text, p_code text, p_name text) returns jsonb language plpgsql as $$
begin
  perform pg_temp.login(pg_temp.g(k));
  return public.join_session(p_code, p_name);
end $$;
create function pg_temp.sess(p_id text) returns public.sessions language sql as $$
  select * from public.sessions where id = p_id::uuid $$;
create function pg_temp.rnd(p_id text) returns public.rounds language sql as $$
  select * from public.rounds where id = p_id::uuid $$;

select plan(110);

select pg_temp.setv('stc_raw', '{"attempts":[{"target_ms":5000,"measured_ms":5100,"missed_start":false},'
                               '{"target_ms":10000,"measured_ms":9800,"missed_start":false},'
                               '{"target_ms":7000,"measured_ms":null,"missed_start":true}]}');

-- ============ admin_open_lobby ============
select pg_temp.as_admin();
select is(pg_temp.try($$ select public.admin_open_lobby('{}') $$), 'GD011', 'open_lobby: empty lineup -> GD011');
select is(pg_temp.try($$ select public.admin_open_lobby('{simon,simon}') $$), 'GD011', 'open_lobby: duplicate games -> GD011');
select is(pg_temp.try($$ select public.admin_open_lobby('{simon,trivia,odd_one_out,perfect_circle}') $$), 'GD011', 'open_lobby: 4 games -> GD011');
select is(pg_temp.try($$ select public.admin_open_lobby(null) $$), 'GD011', 'open_lobby: null lineup -> GD011');
select is(pg_temp.try($$ select public.admin_open_lobby('{simon,NULL}') $$), 'GD011', 'open_lobby: null game -> GD011');
select is((select count(*)::int from public.sessions), 0, 'open_lobby: failed calls created nothing');

select pg_temp.setv('s1', s.id::text), pg_temp.setv('s1_code', s.code) from public.admin_open_lobby('{stop_the_clock}') s;
select is((pg_temp.sess(pg_temp.v('s1'))).status::text, 'lobby', 'open_lobby: creates a lobby');
select ok(pg_temp.v('s1_code') ~ '^[1-9][0-9]{3}$', 'open_lobby: 4-digit code 1000-9999');
select is((pg_temp.sess(pg_temp.v('s1'))).event_day_id, private.current_event_day_id(), 'open_lobby: in the current day');
select isnt((pg_temp.sess(pg_temp.v('s1'))).opened_at, null, 'open_lobby: opened_at set');
select is((select id::text from public.admin_open_lobby('{simon}')), pg_temp.v('s1'), 'open_lobby: returns the existing joinable session');
select is((pg_temp.sess(pg_temp.v('s1'))).lineup, '{stop_the_clock}'::public.game_id[], 'open_lobby: existing lineup untouched');

-- ============ admin_set_lineup ============
select is(pg_temp.try(format($$ select public.admin_set_lineup(%L, '{stop_the_clock,simon,trivia}') $$, pg_temp.v('s1'))), 'ok', 'set_lineup on lobby');
select is((pg_temp.sess(pg_temp.v('s1'))).lineup, '{stop_the_clock,simon,trivia}'::public.game_id[], 'set_lineup: stored');
select is(pg_temp.try(format($$ select public.admin_set_lineup(%L, '{simon,simon}') $$, pg_temp.v('s1'))), 'GD011', 'set_lineup: duplicates -> GD011');
select is(pg_temp.try($$ select public.admin_set_lineup(gen_random_uuid(), '{simon}') $$), 'GD010', 'set_lineup: unknown session -> GD010');

-- ============ start with 0 players ============
select is(pg_temp.try(format($$ select public.admin_start_session(%L) $$, pg_temp.v('s1'))), 'GD010', 'start_session with 0 players -> GD010');

-- ============ join_session ============
select pg_temp.setv('jA', pg_temp.join_as('a', pg_temp.v('s1_code'), 'Sara')::text);
select is(pg_temp.v('jA')::jsonb ->> 'session_status', 'lobby', 'join: payload session_status');
select is(pg_temp.v('jA')::jsonb ->> 'session_id', pg_temp.v('s1'), 'join: payload session_id');
select is(pg_temp.v('jA')::jsonb -> 'display_suffix', 'null'::jsonb, 'join: first Sara has no suffix');
select pg_temp.setv('pA', pg_temp.v('jA')::jsonb ->> 'player_row_id');
select is(pg_temp.join_as('a', pg_temp.v('s1_code'), 'Somebody Else') ->> 'player_row_id', pg_temp.v('pA'), 'join: idempotent for the same uid');
select is((select count(*)::int || ':' || min(name) from public.players where player_id = pg_temp.g('a')), '1:Sara', 'join: no second row, name kept');
select is((pg_temp.join_as('b', pg_temp.v('s1_code'), 'sara') ->> 'display_suffix')::int, 2, 'join: second "sara" gets suffix 2 (E11)');
select is((pg_temp.join_as('e', pg_temp.v('s1_code'), '  SARA ') ->> 'display_suffix')::int, 3, 'join: third "SARA" gets suffix 3');
select is(pg_temp.join_as('e', pg_temp.v('s1_code'), 'x') ->> 'name', 'SARA', 'join: stores the cleaned name');
select is(pg_temp.join_as('f', translate(pg_temp.v('s1_code'), '0123456789', U&'\0660\0661\0662\0663\0664\0665\0666\0667\0668\0669'), 'Omar') ->> 'session_id',
          pg_temp.v('s1'), 'join: Arabic-Indic code digits accepted');
select is(pg_temp.join_as('9', ' ' || translate(pg_temp.v('s1_code'), '0123456789', U&'\06F0\06F1\06F2\06F3\06F4\06F5\06F6\06F7\06F8\06F9') || ' ', 'Nour') ->> 'session_id',
          pg_temp.v('s1'), 'join: Eastern Arabic-Indic digits and surrounding spaces accepted');
select pg_temp.setv('pG', pg_temp.join_as('7', pg_temp.v('s1_code'), 'Zed') ->> 'player_row_id');
select pg_temp.login(pg_temp.g('d'));
select is(pg_temp.try($$ select public.join_session('12a4', 'Dana') $$), 'GD001', 'join: malformed code -> GD001');
select is(pg_temp.try($$ select public.join_session('0999', 'Dana') $$), 'GD001', 'join: code below 1000 -> GD001');
select is(pg_temp.try(format($$ select public.join_session(%L, 'Dana') $$, case when pg_temp.v('s1_code') = '1000' then '1001' else '1000' end)),
          'GD001', 'join: code of no joinable session -> GD001');
select is(pg_temp.try(format($$ select public.join_session(%L, 'Sam!') $$, pg_temp.v('s1_code'))), 'GD002', 'join: invalid name -> GD002');
select is(pg_temp.try(format($$ select public.join_session(%L, 'ass') $$, pg_temp.v('s1_code'))), 'GD003', 'join: blocked name -> GD003');
select is((select count(*)::int from public.players where player_id = pg_temp.g('d')), 0, 'join: nothing stored after a refused name (E28)');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is(pg_temp.try(format($$ select public.join_session(%L, 'Dana') $$, pg_temp.v('s1_code'))), 'GD012', 'join: no auth.uid() -> GD012');

-- ============ admin_remove_player (lobby only) ============
select pg_temp.as_admin();
select is(pg_temp.try(format($$ select public.admin_remove_player(%L) $$, pg_temp.v('pG'))), 'ok', 'remove_player in lobby');
select is((select status::text || ':' || (removed_at is not null) from public.players where id = pg_temp.v('pG')::uuid), 'removed:true', 'remove: status + removed_at');
select is(pg_temp.try(format($$ select public.admin_remove_player(%L) $$, pg_temp.v('pG'))), 'ok', 'remove: idempotent');
select is(pg_temp.try($$ select public.admin_remove_player(gen_random_uuid()) $$), 'GD010', 'remove: unknown player -> GD010');
select pg_temp.login(pg_temp.g('7'));
select is(pg_temp.try(format($$ select public.join_session(%L, 'Zed') $$, pg_temp.v('s1_code'))), 'GD004', 'join: removed uid -> GD004 (E5)');
select is((select count(*)::int from public.sessions), 1, 'removed player still sees own session (to show "Removed by host")');

-- ============ admin_start_session ============
select pg_temp.as_admin();
select pg_temp.setv('r1', j ->> 'round_id'), pg_temp.setv('s2', j ->> 'pending_session_id'), pg_temp.setv('s2_code', j ->> 'pending_code')
  from public.admin_start_session(pg_temp.v('s1')::uuid) j;
select pg_temp.setv('r2', id::text) from public.rounds where session_id = pg_temp.v('s1')::uuid and round_no = 2;
select pg_temp.setv('r3', id::text) from public.rounds where session_id = pg_temp.v('s1')::uuid and round_no = 3;
select is((select status::text || ':' || current_round || ':' || (started_at is not null) from public.sessions where id = pg_temp.v('s1')::uuid),
          'playing:1:true', 'start: session playing, current_round 1, started_at');
select is(array(select round_no || ':' || game || ':' || status || ':' || (started_at is not null)
                  from public.rounds where session_id = pg_temp.v('s1')::uuid order by round_no),
          array['1:stop_the_clock:playing:true', '2:simon:upcoming:false', '3:trivia:upcoming:false'],
          'start: rounds 1..n from the lineup, round 1 playing');
select is((select id::text from public.rounds where session_id = pg_temp.v('s1')::uuid and round_no = 1), pg_temp.v('r1'), 'start: returns round 1 id');
select is((pg_temp.sess(pg_temp.v('s2'))).status::text, 'pending', 'start: next session created as pending');
select is((pg_temp.sess(pg_temp.v('s2'))).lineup, (pg_temp.sess(pg_temp.v('s1'))).lineup, 'start: pending has the same lineup');
select is((pg_temp.sess(pg_temp.v('s2'))).code, pg_temp.v('s2_code'), 'start: returns the pending code');
select isnt(pg_temp.v('s2_code'), pg_temp.v('s1_code'), 'start: pending code differs from the running code');
select is(pg_temp.try(format($$ select public.admin_start_session(%L) $$, pg_temp.v('s1'))), 'GD010', 'start: second call -> GD010');
select is(pg_temp.try(format($$ select public.admin_remove_player(%L) $$, pg_temp.v('pA'))), 'GD010', 'remove after start -> GD010');

-- invariants (partial unique indexes)
select pg_temp.as_postgres();
select is(split_part(pg_temp.try(format($$ insert into public.sessions (event_day_id, code, status, lineup) values (%L, '4321', 'lobby', '{simon}') $$,
                             private.current_event_day_id())), ':', 1),
          '23505', 'two joinable sessions are impossible');
select is(split_part(pg_temp.try(format($$ insert into public.sessions (event_day_id, code, status, lineup) values (%L, '4321', 'results', '{simon}') $$,
                             private.current_event_day_id())), ':', 1),
          '23505', 'two running sessions are impossible');

-- late joiners
select pg_temp.login(pg_temp.g('8'));
select is(pg_temp.try(format($$ select public.join_session(%L, 'Late') $$, pg_temp.v('s1_code'))), 'GD001', 'join: running session code -> GD001 (E6)');
select pg_temp.setv('jC', pg_temp.join_as('c', pg_temp.v('s2_code'), 'Lina')::text);
select is(pg_temp.v('jC')::jsonb ->> 'session_status', 'pending', 'join: pending session takes late joiners');
select pg_temp.as_admin();
select is(pg_temp.try(format($$ select public.admin_remove_player(%L) $$, pg_temp.v('jC')::jsonb ->> 'player_row_id')), 'GD010', 'remove in a pending session -> GD010');

-- while playing
select is((select id::text || ':' || status from public.admin_open_lobby('{simon}')), pg_temp.v('s2') || ':pending',
          'open_lobby while playing: returns the pending session, not flipped');
select is(pg_temp.try(format($$ select public.admin_set_lineup(%L, '{simon}') $$, pg_temp.v('s1'))), 'GD010', 'set_lineup on a playing session -> GD010');
select is(pg_temp.try(format($$ select public.admin_set_lineup(%L, '{simon,trivia,odd_one_out}') $$, pg_temp.v('s2'))), 'ok', 'set_lineup on the pending session (E20)');
select is(pg_temp.try($$ select public.admin_new_session() $$), 'GD010', 'new_session while playing -> GD010');
select is(pg_temp.try(format($$ select public.admin_show_day_board(%L) $$, pg_temp.v('s1'))), 'GD010', 'show_day_board while playing -> GD010');
select is(pg_temp.try(format($$ select public.admin_start_round(%L) $$, pg_temp.v('r2'))), 'GD010', 'start_round while the previous round plays -> GD010');
select is(pg_temp.try($$ select public.admin_start_new_day('Day 2') $$), 'GD010', 'start_new_day while playing -> GD010');

-- ============ score trigger state rules ============
select pg_temp.login(pg_temp.g('d'));
select is(pg_temp.try(format($$ insert into public.scores (round_id, player_id, score, duration_ms, raw) values (%L, auth.uid(), 500, 20000, %L) $$,
                             pg_temp.v('r1'), pg_temp.v('stc_raw'))), 'GD005', 'score from a non-member -> GD005');
select pg_temp.login(pg_temp.g('7'));
select is(pg_temp.try(format($$ insert into public.scores (round_id, player_id, score, duration_ms, raw) values (%L, auth.uid(), 500, 20000, %L) $$,
                             pg_temp.v('r1'), pg_temp.v('stc_raw'))), 'GD005', 'score from a removed player -> GD005');
select pg_temp.login(pg_temp.g('a'));
select is(pg_temp.try(format($$ insert into public.scores (round_id, player_id, score, duration_ms, raw) values (%L, auth.uid(), 500, 20000, %L) $$,
                             pg_temp.v('r2'), '{"level":3,"avg_gap_ms":500,"taps":6,"ended":"mistake"}')), 'GD006', 'score for an upcoming round -> GD006');
select is(pg_temp.try(format($$ insert into public.scores (round_id, player_id, score, duration_ms, raw) values (gen_random_uuid(), auth.uid(), 500, 20000, %L) $$,
                             pg_temp.v('stc_raw'))), 'GD005', 'score for an unknown round -> GD005');

-- ============ admin_end_round ============
select pg_temp.as_admin();
select is(pg_temp.try(format($$ select public.admin_end_round(%L, null) $$, pg_temp.v('r1'))), 'GD010', 'end_round: null reason -> GD010');
select is(pg_temp.try(format($$ select public.admin_end_round(%L, 'all_finished') $$, pg_temp.v('r1'))), 'ok', 'end_round: playing -> done');
select is((select status || ':' || end_reason || ':' || (ended_at is not null) from public.rounds where id = pg_temp.v('r1')::uuid),
          'done:all_finished:true', 'end_round: status, end_reason, ended_at');
select is((select status::text || ':' || current_round from public.sessions where id = pg_temp.v('s1')::uuid), 'playing:1', 'end_round: not the last round, session keeps playing');
select is(pg_temp.try(format($$ select public.admin_end_round(%L, 'force_end') $$, pg_temp.v('r1'))), 'ok', 'end_round: second call is a no-op');
select is((pg_temp.rnd(pg_temp.v('r1'))).end_reason::text, 'all_finished', 'end_round: second call changed nothing');
select is(pg_temp.try(format($$ select public.admin_end_round(%L, 'force_end') $$, pg_temp.v('r3'))), 'GD010', 'end_round on an upcoming round -> GD010');
select is(pg_temp.try(format($$ select public.admin_start_round(%L) $$, pg_temp.v('r3'))), 'GD010', 'start_round when the previous round is not done -> GD010');
select is(pg_temp.try($$ select public.admin_end_round(gen_random_uuid(), 'force_end') $$), 'GD010', 'end_round: unknown round -> GD010');

-- ============ late-score window (15 s after ended_at) ============
select pg_temp.as_postgres();
update public.rounds set ended_at = now() - interval '14 seconds' where id = pg_temp.v('r1')::uuid;
select pg_temp.login(pg_temp.g('a'));
select is(pg_temp.try(format($$ insert into public.scores (round_id, player_id, score, duration_ms, raw) values (%L, auth.uid(), 500, 20000, %L) $$,
                             pg_temp.v('r1'), pg_temp.v('stc_raw'))), 'ok', 'late score within 15 s of round end is accepted (E22)');
select pg_temp.as_postgres();
update public.rounds set ended_at = now() - interval '16 seconds' where id = pg_temp.v('r1')::uuid;
select pg_temp.login(pg_temp.g('b'));
select is(pg_temp.try(format($$ insert into public.scores (round_id, player_id, score, duration_ms, raw) values (%L, auth.uid(), 500, 20000, %L) $$,
                             pg_temp.v('r1'), pg_temp.v('stc_raw'))), 'GD007', 'score more than 15 s after round end -> GD007 (E14)');

-- ============ admin_start_round / last round -> results ============
select pg_temp.as_admin();
select is(pg_temp.try(format($$ select public.admin_start_round(%L) $$, pg_temp.v('r2'))), 'ok', 'start_round: upcoming -> playing');
select is((select status || ':' || (started_at is not null) from public.rounds where id = pg_temp.v('r2')::uuid), 'playing:true', 'start_round: status, started_at');
select is((pg_temp.sess(pg_temp.v('s1'))).current_round, 2::smallint, 'start_round: sessions.current_round follows');
select is(pg_temp.try(format($$ select public.admin_start_round(%L) $$, pg_temp.v('r2'))), 'GD010', 'start_round: second call -> GD010');
select is(pg_temp.try(format($$ select public.admin_start_round(%L) $$, pg_temp.v('r1'))), 'GD010', 'start_round on a done round -> GD010');
select is(pg_temp.try(format($$ select public.admin_end_round(%L, 'time_cap') $$, pg_temp.v('r2'))), 'ok', 'end_round 2 (time_cap)');
select is(pg_temp.try(format($$ select public.admin_start_round(%L) $$, pg_temp.v('r3'))), 'ok', 'start_round 3');
select is(pg_temp.try(format($$ select public.admin_end_round(%L, 'force_end') $$, pg_temp.v('r3'))), 'ok', 'end_round 3 (force_end)');
select is((select status::text || ':' || coalesce(current_round::text, 'null') || ':' || (ended_at is not null) from public.sessions where id = pg_temp.v('s1')::uuid),
          'results:null:true', 'last round done: session results, current_round null, ended_at');
select is(array(select end_reason::text from public.rounds where session_id = pg_temp.v('s1')::uuid order by round_no),
          array['all_finished', 'time_cap', 'force_end'], 'every end reason recorded');
select is(pg_temp.try(format($$ select public.admin_end_round(%L, 'force_end') $$, pg_temp.v('r3'))), 'ok', 'end_round on the last done round: no-op');

-- ============ admin_show_day_board ============
select is(pg_temp.try(format($$ select public.admin_show_day_board(%L) $$, pg_temp.v('s2'))), 'GD010', 'show_day_board on a pending session -> GD010');
select is(pg_temp.try(format($$ select public.admin_show_day_board(%L) $$, pg_temp.v('s1'))), 'ok', 'show_day_board on results');
select isnt((pg_temp.sess(pg_temp.v('s1'))).day_board_shown_at, null, 'show_day_board: day_board_shown_at set');
select is(pg_temp.try(format($$ select public.admin_show_day_board(%L) $$, pg_temp.v('s1'))), 'ok', 'show_day_board: second call ok');
select is((pg_temp.sess(pg_temp.v('s1'))).status::text, 'results', 'show_day_board keeps results');

-- ============ admin_new_session ============
select is((select id::text || ':' || status from public.admin_new_session()), pg_temp.v('s2') || ':lobby', 'new_session: pending -> lobby');
select is((select status::text || ':' || (closed_at is not null) from public.sessions where id = pg_temp.v('s1')::uuid), 'closed:true', 'new_session: results -> closed');
select isnt((pg_temp.sess(pg_temp.v('s2'))).opened_at, null, 'new_session: opened_at set');
select is((pg_temp.sess(pg_temp.v('s2'))).lineup, '{simon,trivia,odd_one_out}'::public.game_id[], 'new_session: lineup changed during play is kept');
select is((select id::text || ':' || status from public.admin_new_session()), pg_temp.v('s2') || ':lobby', 'new_session: second call returns the same lobby');
select pg_temp.login(pg_temp.g('c'));
select is((select status::text from public.sessions where id = pg_temp.v('s2')::uuid), 'lobby', 'late joiner is now in the lobby');
select pg_temp.login(pg_temp.g('a'));
select is((select status::text from public.sessions where id = pg_temp.v('s1')::uuid), 'closed', 'players of the finished session see it closed');
select pg_temp.as_admin();
select is((select id::text from public.admin_open_lobby('{simon}')), pg_temp.v('s2'), 'open_lobby with a lobby open: returns it');

-- ============ admin_start_new_day ============
select pg_temp.setv('day1', private.current_event_day_id()::text);
select is((select label || ':' || is_current from public.admin_start_new_day('  Day 2 ')), 'Day 2:true', 'start_new_day: new current day');
select is((pg_temp.sess(pg_temp.v('s2'))).status::text, 'closed', 'start_new_day: closes the joinable session');
select is((select is_current::text || ':' || (ended_at is not null) from public.event_days where id = pg_temp.v('day1')::uuid), 'false:true', 'start_new_day: old day ended');
select is((select count(*)::int from public.event_days where is_current), 1, 'start_new_day: one current day');
select pg_temp.login(pg_temp.g('a'));
select is((select count(*)::int from public.scores), 0, 'guests no longer see the previous day''s scores');
select pg_temp.as_admin();
select is((select count(*)::int from public.scores where event_day_id = pg_temp.v('day1')::uuid), 1, 'admin still sees previous days');

-- new_session with nothing pending: a lobby in the new day with the last lineup
select pg_temp.as_postgres();
update public.sessions set created_at = now() - interval '1 hour' where id <> pg_temp.v('s2')::uuid;
select pg_temp.as_admin();
select pg_temp.setv('s3', s.id::text), pg_temp.setv('s3_code', s.code) from public.admin_new_session() s;
select is((select status::text || ':' || lineup::text || ':' || (event_day_id = private.current_event_day_id())
             from public.sessions where id = pg_temp.v('s3')::uuid),
          'lobby:{simon,trivia,odd_one_out}:true', 'new_session with none pending: lobby with the last lineup in the current day');

-- a playing session blocks a new day
select pg_temp.join_as('6', pg_temp.v('s3_code'), 'Rami');
select pg_temp.as_admin();
select is(pg_temp.try(format($$ select public.admin_start_session(%L) $$, pg_temp.v('s3'))), 'ok', 'start the new day''s first session');
select is(pg_temp.try($$ select public.admin_start_new_day('Day 3') $$), 'GD010', 'start_new_day while playing -> GD010 (E25)');

-- server_now
select pg_temp.login(pg_temp.g('a'));
select is(public.server_now(), now(), 'server_now() returns the server clock');

select pg_temp.as_postgres();
select * from finish();
rollback;
