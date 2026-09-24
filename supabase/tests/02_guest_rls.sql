-- TESTING.md section 3, "RLS (guest)": a guest is an anonymous user (role authenticated, JWT sub = playerId).
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

create function pg_temp.snapshot() returns text language sql as $$
  select md5(concat_ws('|',
    (select string_agg(t::text, ',' order by t.id) from public.sessions t),
    (select string_agg(t::text, ',' order by t.id) from public.rounds t),
    (select string_agg(t::text, ',' order by t.id) from public.players t),
    (select string_agg(t::text, ',' order by t.id) from public.event_days t),
    (select string_agg(t::text, ',' order by t.id) from public.scores t),
    (select string_agg(t::text, ',' order by t.name_key) from public.hidden_names t),
    (select string_agg(t::text, ',' order by t.term_key) from public.blocked_terms t)))
$$;

select plan(66);

-- ============ Fixture ============
-- Guests: A and B in session 1 (playing), C in session 2 (pending), D in nothing.
select pg_temp.setv('A', '11111111-0000-0000-0000-00000000000a');
select pg_temp.setv('B', '11111111-0000-0000-0000-00000000000b');
select pg_temp.setv('C', '11111111-0000-0000-0000-00000000000c');
select pg_temp.setv('D', '11111111-0000-0000-0000-00000000000d');
select pg_temp.setv('stc_raw', '{"attempts":[{"target_ms":5000,"measured_ms":5100,"missed_start":false},'
                               '{"target_ms":10000,"measured_ms":9800,"missed_start":false},'
                               '{"target_ms":7000,"measured_ms":null,"missed_start":true}]}');

select pg_temp.as_admin();
select pg_temp.setv('s1', s.id::text), pg_temp.setv('s1_code', s.code)
  from public.admin_open_lobby('{stop_the_clock,simon,trivia}') s;
select public.admin_hide_name('zzz', 'fixture');

select pg_temp.login(pg_temp.v('A')::uuid);
select pg_temp.setv('pA', public.join_session(pg_temp.v('s1_code'), 'Sara') ->> 'player_row_id');
select pg_temp.login(pg_temp.v('B')::uuid);
select pg_temp.setv('pB', public.join_session(pg_temp.v('s1_code'), 'Omar') ->> 'player_row_id');

select pg_temp.as_admin();
select pg_temp.setv('r1', j ->> 'round_id'), pg_temp.setv('s2', j ->> 'pending_session_id'),
       pg_temp.setv('s2_code', j ->> 'pending_code')
  from public.admin_start_session(pg_temp.v('s1')::uuid) j;
select pg_temp.setv('r2', id::text) from public.rounds where session_id = pg_temp.v('s1')::uuid and round_no = 2;

select pg_temp.login(pg_temp.v('C')::uuid);
select pg_temp.setv('pC', public.join_session(pg_temp.v('s2_code'), 'Lina') ->> 'player_row_id');

-- ============ D: joined nothing ============
select pg_temp.login(pg_temp.v('D')::uuid);
select is((select count(*)::int from public.sessions), 0, 'D: sees no sessions');
select is((select array_agg(code) from public.sessions), null, 'D: cannot read any session code without joining');
select is((select count(*)::int from public.rounds), 0, 'D: sees no rounds');
select is((select count(*)::int from public.players), 0, 'D: sees no players');
select is((select count(*)::int from public.event_days), 1, 'D: can read event days');

-- ============ C: joined session 2 only ============
select pg_temp.login(pg_temp.v('C')::uuid);
select is(array(select id::text from public.sessions), array[pg_temp.v('s2')], 'C: sees only own session');
select is((select count(*)::int from public.sessions where id = pg_temp.v('s1')::uuid), 0, 'C: cannot select a session not joined');
select is((select count(*)::int from public.rounds where session_id = pg_temp.v('s1')::uuid), 0, 'C: cannot select rounds of a session not joined');
select is((select count(*)::int from public.players where session_id = pg_temp.v('s1')::uuid), 0, 'C: cannot select players of a session not joined');
select is((select count(*)::int from public.players where session_id = pg_temp.v('s2')::uuid), 1, 'C: can select players of own session');

-- ============ A: joined session 1 ============
select pg_temp.login(pg_temp.v('A')::uuid);
select is((select count(*)::int from public.sessions where id = pg_temp.v('s1')::uuid), 1, 'A: can select own session');
select is((select count(*)::int from public.rounds where session_id = pg_temp.v('s1')::uuid), 3, 'A: can select own session rounds');
select is((select count(*)::int from public.players where session_id = pg_temp.v('s1')::uuid), 2, 'A: can select own session players');
select is((select count(*)::int from public.sessions where id = pg_temp.v('s2')::uuid), 0, 'A: cannot select the pending session');

-- own progress
select is(pg_temp.rows(format($$ update public.players set progress = 'playing', progress_round = 1 where id = %L $$, pg_temp.v('pA'))),
          1, 'A: can update own progress, progress_round');
select is((select progress::text || '/' || progress_round from public.players where id = pg_temp.v('pA')::uuid),
          'playing/1', 'A: progress stored');
select is(pg_temp.try(format($$ update public.players set name = 'Hacker' where id = %L $$, pg_temp.v('pA'))),
          '42501', 'A: cannot update own name');
select is(pg_temp.try(format($$ update public.players set status = 'removed', removed_at = now() where id = %L $$, pg_temp.v('pA'))),
          '42501', 'A: cannot update own status');
select is(pg_temp.try(format($$ update public.players set removed_at = now() where id = %L $$, pg_temp.v('pA'))),
          '23514', 'A: cannot set own removed_at');
select is(pg_temp.rows(format($$ update public.players set progress = 'playing', progress_round = 1 where id = %L $$, pg_temp.v('pB'))),
          0, 'A: cannot update another player');
select is((select progress::text from public.players where id = pg_temp.v('pB')::uuid), 'waiting', 'A: other player unchanged');
select is(pg_temp.try(format($$ insert into public.players (session_id, player_id, name, name_key) values (%L, %L, 'Zed', 'zed') $$,
                             pg_temp.v('s1'), pg_temp.v('A'))),
          '42501', 'A: cannot insert a player directly');

-- deletes, anywhere
select is(pg_temp.try('delete from ' || t), '42501', 'A: cannot delete from ' || t)
  from unnest(array['public.event_days','public.sessions','public.rounds','public.players','public.scores','public.keepalive']) t;
select is(pg_temp.rows('delete from public.hidden_names'), 0, 'A: delete from hidden_names affects nothing');
select is(pg_temp.rows('delete from public.blocked_terms'), 0, 'A: delete from blocked_terms affects nothing');
select is(pg_temp.try('truncate public.scores'), '42501', 'A: cannot truncate scores');

-- scores
select is(pg_temp.try(format($$ insert into public.scores (round_id, player_id, score, duration_ms, raw) values (%L, %L, 500, 20000, %L) $$,
                             pg_temp.v('r1'), pg_temp.v('B'), pg_temp.v('stc_raw'))),
          '42501', 'A: cannot insert a score for another player');
select is(pg_temp.try(format($$ insert into public.scores (round_id, player_id, score, duration_ms, raw,
                                   session_id, event_day_id, player_row_id, game, name, name_key)
                               values (%L, %L, 500, 20000, %L, %L, gen_random_uuid(), %L, 'trivia', 'Hacker', 'hacker') $$,
                             pg_temp.v('r1'), pg_temp.v('A'), pg_temp.v('stc_raw'), pg_temp.v('s2'), pg_temp.v('pC'))),
          'ok', 'A: can insert own score (client-supplied trusted columns are ignored)');
select is((select session_id::text || '|' || game || '|' || name || '|' || name_key || '|' || player_row_id
             from public.scores where player_id = pg_temp.v('A')::uuid),
          pg_temp.v('s1') || '|stop_the_clock|Sara|sara|' || pg_temp.v('pA'), 'A: trusted columns filled by the trigger');
select is((select progress::text || '/' || progress_round from public.players where id = pg_temp.v('pA')::uuid),
          'finished/1', 'A: trigger marked the player finished for round 1');
select is(pg_temp.try(format($$ insert into public.scores (round_id, player_id, score, duration_ms, raw) values (%L, %L, 600, 20000, %L) $$,
                             pg_temp.v('r1'), pg_temp.v('A'), pg_temp.v('stc_raw'))),
          '23505', 'A: second score for the same round -> 23505');
select is(pg_temp.try($$ update public.scores set score = 1000 $$), '42501', 'A: cannot update scores (own or others)');
select is(pg_temp.try($$ delete from public.scores where player_id = auth.uid() $$), '42501', 'A: cannot delete own score');

-- admin-only tables
select is(pg_temp.try(format($$ insert into public.sessions (event_day_id, code, status, lineup) values (%L, '4242', 'lobby', '{simon}') $$,
                             (select id from public.event_days where is_current))),
          '42501', 'A: cannot insert sessions');
select is(pg_temp.rows(format($$ update public.sessions set lineup = '{simon}' where id = %L $$, pg_temp.v('s1'))), 0, 'A: cannot update sessions');
select is(pg_temp.try(format($$ insert into public.rounds (session_id, round_no, game) values (%L, 3, 'perfect_circle') $$, pg_temp.v('s1'))),
          '42501', 'A: cannot insert rounds');
select is(pg_temp.rows(format($$ update public.rounds set status = 'upcoming' where session_id = %L $$, pg_temp.v('s1'))), 0, 'A: cannot update rounds');
select is(pg_temp.try($$ insert into public.event_days (label, is_current) values ('Mine', false) $$), '42501', 'A: cannot insert event_days');
select is(pg_temp.rows($$ update public.event_days set label = 'Mine' $$), 0, 'A: cannot update event_days');
select is(pg_temp.try($$ insert into public.hidden_names (name_key) values ('omar') $$), '42501', 'A: cannot insert hidden_names');
select is(pg_temp.try($$ insert into public.blocked_terms (term_key, lang) values ('sara', 'en') $$), '42501', 'A: cannot insert blocked_terms');
select is(pg_temp.rows($$ update public.blocked_terms set match = 'substring' $$), 0, 'A: cannot update blocked_terms');
select is((select count(*)::int from public.blocked_terms), 0, 'A: cannot read blocked_terms');
select is((select count(*)::int from public.hidden_names), 1, 'A: can read hidden_names');

-- boards: current day scores are readable by any signed-in user
select is((select name from public.v_round_board where round_id = pg_temp.v('r1')::uuid), 'Sara', 'A: round board shows own score');
select pg_temp.login(pg_temp.v('C')::uuid);
select is((select count(*)::int from public.scores), 1, 'C: can read current-day scores of other sessions');
select is((select count(*)::int from public.v_day_board), 1, 'C: day board readable');

-- ============ admin functions as a guest: GD009, no change ============
select pg_temp.as_postgres();
select pg_temp.setv('snap', pg_temp.snapshot());
select pg_temp.login(pg_temp.v('A')::uuid);
select is(pg_temp.try(q), 'GD009', 'guest: ' || split_part(q, '(', 1) || ' raises GD009')
  from unnest(array[
    $$select public.admin_open_lobby('{simon}')$$,
    format($$select public.admin_set_lineup(%L, '{simon}')$$, pg_temp.v('s1')),
    format($$select public.admin_remove_player(%L)$$, pg_temp.v('pB')),
    format($$select public.admin_start_session(%L)$$, pg_temp.v('s2')),
    format($$select public.admin_end_round(%L, 'force_end')$$, pg_temp.v('r1')),
    format($$select public.admin_start_round(%L)$$, pg_temp.v('r2')),
    format($$select public.admin_show_day_board(%L)$$, pg_temp.v('s1')),
    $$select public.admin_new_session()$$,
    $$select public.admin_hide_name('sara', null)$$,
    $$select public.admin_unhide_name('zzz')$$,
    $$select public.admin_add_blocked_term('sara', 'word', 'en')$$,
    $$select public.admin_remove_blocked_term('ass')$$,
    $$select public.admin_start_new_day('Day 2')$$]) q;
select pg_temp.as_postgres();
select is(pg_temp.snapshot(), pg_temp.v('snap'), 'guest admin calls changed nothing');

select * from finish();
rollback;
