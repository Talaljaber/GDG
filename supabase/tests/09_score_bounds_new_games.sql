-- TESTING.md section 3, "Trigger bounds" for the games added by ADR-134 (Close the Brackets, Color
-- Clash): one passing and one failing case per bound in SCORING.md section 4, asserting the reason
-- code in the GD008 error detail. Same method as 05_score_bounds.sql: real guest inserts through the
-- trigger, RLS and CHECK constraints, each rolled back.
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
create function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.v(k text) returns text language sql stable as $$ select current_setting('t.' || k) $$;
create function pg_temp.setv(k text, val text) returns text language sql as $$ select set_config('t.' || k, val, true) $$;
-- ------------------------------------------------------------------

-- Submit a score for the round of game g as the current guest; always rolled back.
-- Returns 'ok', 'GD008:<reason>', or '<sqlstate>'.
create function pg_temp.sub(g text, p_score integer, p_dur integer, p_raw jsonb) returns text language plpgsql as $$
declare st text; dt text;
begin
  insert into public.scores (round_id, player_id, score, duration_ms, raw)
  values (pg_temp.v('r_' || g)::uuid, (select auth.uid()), p_score, p_dur, p_raw);
  raise exception 'probe_ok' using errcode = 'GDZ99';
exception
  when sqlstate 'GDZ99' then return 'ok';
  when others then
    get stacked diagnostics st = returned_sqlstate, dt = pg_exception_detail;
    return st || coalesce(nullif(':' || dt, ':'), '');
end $$;
-- base raw k with the JSON value at path p replaced
create function pg_temp.set(k text, p text, val text) returns jsonb language sql stable as $$
  select jsonb_set(pg_temp.v(k)::jsonb, p::text[], val::jsonb) $$;
create function pg_temp.set2(k text, p1 text, v1 text, p2 text, v2 text) returns jsonb language sql stable as $$
  select jsonb_set(pg_temp.set(k, p1, v1), p2::text[], v2::jsonb) $$;
create function pg_temp.b(k text) returns jsonb language sql stable as $$ select pg_temp.v(k)::jsonb $$;

select plan(56);

-- ============ Fixture: one guest in a round of each new game (inserted directly, as postgres) ============
select pg_temp.setv('G', '99999999-0000-0000-0000-000000000001');
with sa as (
  insert into public.sessions (event_day_id, code, status, lineup)
  values (private.current_event_day_id(), '9001', 'closed', '{close_brackets,color_clash,simon}') returning id
), pl as (
  insert into public.players (session_id, player_id, name, name_key)
  select id, pg_temp.v('G')::uuid, 'Tester', 'tester' from sa
), rs as (
  insert into public.rounds (session_id, round_no, game, status, started_at)
  select sa.id, x.n, x.g::public.game_id, 'playing'::public.round_status, now()
    from sa, (values (1, 'close_brackets'), (2, 'color_clash')) x(n, g)
  returning id, game
)
select pg_temp.setv('r_' || case game when 'close_brackets' then 'cb' else 'cc' end, id::text)
from rs;

-- Base (plausible) raw objects: the worked examples in docs/games/close-brackets.md and color-clash.md section 4.
select pg_temp.setv('cb', '{"solved":9,"failed":1,"timeouts":0,"solve_ms":23562}');
select pg_temp.setv('cb0', '{"solved":0,"failed":2,"timeouts":2,"solve_ms":null}');
select pg_temp.setv('cc', '{"correct":32,"wrong":1,"timeouts":0,"mean_rt_ms":630}');
select pg_temp.setv('cc0', '{"correct":0,"wrong":0,"timeouts":9,"mean_rt_ms":null}');
select pg_temp.setv('cc_spam', '{"correct":12,"wrong":24,"timeouts":0,"mean_rt_ms":300}');

select pg_temp.login(pg_temp.v('G')::uuid);

select is(pg_temp.sub(g, sc, dur, raw), want, descr)
from (values
  -- ---------------- Close the Brackets ----------------
  ('cb', 838, 32000, pg_temp.b('cb'), 'ok', 'cb base passes (example A: n 9, solve_ms 23562)'),
  ('cb', 838, 32000, '[]'::jsonb, 'GD008:cb.shape', 'cb.shape fail: raw is not an object'),
  ('cb', 838, 32000, pg_temp.b('cb') - 'solved', 'GD008:cb.shape', 'cb.shape fail: solved missing'),
  ('cb', 838, 32000, pg_temp.b('cb') - 'solve_ms', 'GD008:cb.shape', 'cb.shape fail: solve_ms missing'),
  ('cb', 838, 32000, pg_temp.set('cb', '{solve_ms}', '"23562"'), 'GD008:cb.shape', 'cb.shape fail: solve_ms is a string'),
  ('cb', 838, 32000, pg_temp.set('cb', '{solved}', '9.5'), 'GD008:cb.shape', 'cb.shape fail: solved not an integer'),
  ('cb', 838, 32000, pg_temp.set('cb', '{solved}', '30'), 'GD008:cb.too_fast', 'cb.range pass: solved 30 (then too fast for 219 brackets)'),
  ('cb', 838, 32000, pg_temp.set('cb', '{solved}', '31'), 'GD008:cb.range', 'cb.range fail: solved 31'),
  ('cb', 838, 32000, pg_temp.set('cb', '{failed}', '50'), 'ok', 'cb.range pass: failed 50'),
  ('cb', 838, 32000, pg_temp.set('cb', '{failed}', '51'), 'GD008:cb.range', 'cb.range fail: failed 51'),
  ('cb', 838, 32000, pg_temp.set('cb', '{failed}', '-1'), 'GD008:cb.range', 'cb.range fail: failed -1'),
  ('cb', 838, 32000, pg_temp.set('cb', '{timeouts}', '3'), 'ok', 'cb.range pass: timeouts 3'),
  ('cb', 838, 32000, pg_temp.set('cb', '{timeouts}', '4'), 'GD008:cb.range', 'cb.range fail: timeouts 4 (CB-T8)'),
  ('cb', 838, 32000, pg_temp.set('cb', '{solve_ms}', '30000'), 'ok', 'cb.range pass: solve_ms 30000'),
  ('cb', 838, 32000, pg_temp.set('cb', '{solve_ms}', '30001'), 'GD008:cb.range', 'cb.range fail: solve_ms 30001'),
  ('cb', 0, 32000, pg_temp.set('cb0', '{solve_ms}', '1200'), 'GD008:cb.solve_ms', 'cb.solve_ms fail: nothing solved but a solve time (CB-T6)'),
  ('cb', 838, 32000, pg_temp.set('cb', '{solve_ms}', 'null'), 'GD008:cb.solve_ms', 'cb.solve_ms fail: solved without a solve time'),
  ('cb', 0, 32000, pg_temp.b('cb0'), 'ok', 'cb.zero pass: nothing solved, score 0'),
  ('cb', 10, 32000, pg_temp.b('cb0'), 'GD008:cb.zero', 'cb.zero fail: nothing solved, score 10 (CB-T7)'),
  ('cb', 838, 32000, pg_temp.set('cb', '{solve_ms}', '7650'), 'ok', 'cb.too_fast pass: 150 ms x 51 brackets'),
  ('cb', 838, 32000, pg_temp.set('cb', '{solve_ms}', '7649'), 'GD008:cb.too_fast', 'cb.too_fast fail: 7649 ms for 51 brackets (CB-T4)'),
  ('cb', 765, 32000, pg_temp.b('cb'), 'ok', 'cb.formula_band pass: 15 x 51 + 0'),
  ('cb', 865, 32000, pg_temp.b('cb'), 'ok', 'cb.formula_band pass: 15 x 51 + 100'),
  ('cb', 764, 32000, pg_temp.b('cb'), 'GD008:cb.formula_band', 'cb.formula_band fail: 15 x 51 - 1'),
  ('cb', 866, 32000, pg_temp.b('cb'), 'GD008:cb.formula_band', 'cb.formula_band fail: 15 x 51 + 101 (CB-T5)'),
  ('cb', 1000, 32000, pg_temp.set2('cb', '{solved}', '11', '{solve_ms}', '21440'), 'ok', 'cb.formula_band pass: n 11 capped at 1000 (example E)'),
  ('cb', 999, 32000, pg_temp.set2('cb', '{solved}', '11', '{solve_ms}', '21440'), 'GD008:cb.formula_band', 'cb.formula_band fail: n 11 must be 1000'),
  ('cb', 63, 32000, pg_temp.set2('cb', '{solved}', '1', '{solve_ms}', '1400'), 'ok', 'cb example D: one solve, 63'),
  -- ---------------- Color Clash ----------------
  ('cc', 821, 32000, pg_temp.b('cc'), 'ok', 'cc base passes (example A: 32 correct, 1 wrong, 630 ms)'),
  ('cc', 821, 32000, '"x"'::jsonb, 'GD008:cc.shape', 'cc.shape fail: raw is not an object'),
  ('cc', 821, 32000, pg_temp.b('cc') - 'wrong', 'GD008:cc.shape', 'cc.shape fail: wrong missing'),
  ('cc', 821, 32000, pg_temp.b('cc') - 'mean_rt_ms', 'GD008:cc.shape', 'cc.shape fail: mean_rt_ms missing'),
  ('cc', 821, 32000, pg_temp.set('cc', '{mean_rt_ms}', '630.5'), 'GD008:cc.shape', 'cc.shape fail: mean_rt_ms not an integer'),
  ('cc', 821, 32000, pg_temp.set('cc', '{correct}', 'true'), 'GD008:cc.shape', 'cc.shape fail: correct is a boolean'),
  ('cc', 821, 32000, pg_temp.set('cc', '{correct}', '101'), 'GD008:cc.range', 'cc.range fail: correct 101'),
  ('cc', 0, 32000, pg_temp.set('cc', '{wrong}', '100'), 'ok', 'cc.range pass: wrong 100 (net negative, score 0)'),
  ('cc', 0, 32000, pg_temp.set('cc', '{wrong}', '101'), 'GD008:cc.range', 'cc.range fail: wrong 101'),
  ('cc', 600, 32000, pg_temp.set('cc', '{timeouts}', '10'), 'ok', 'cc.range pass: timeouts 10'),
  ('cc', 600, 32000, pg_temp.set('cc', '{timeouts}', '11'), 'GD008:cc.range', 'cc.range fail: timeouts 11'),
  ('cc', 821, 32000, pg_temp.set('cc', '{mean_rt_ms}', '3001'), 'GD008:cc.range', 'cc.range fail: mean_rt_ms 3001'),
  ('cc', 0, 32000, pg_temp.set('cc0', '{mean_rt_ms}', '500'), 'GD008:cc.rt', 'cc.rt fail: no correct taps but a mean time'),
  ('cc', 821, 32000, pg_temp.set('cc', '{mean_rt_ms}', 'null'), 'GD008:cc.rt', 'cc.rt fail: correct taps without a mean time'),
  ('cc', 0, 32000, pg_temp.b('cc0'), 'ok', 'cc.zero pass: idle (9 timeouts), score 0'),
  ('cc', 25, 32000, pg_temp.b('cc0'), 'GD008:cc.zero', 'cc.zero fail: no correct taps, score 25'),
  ('cc', 821, 32000, pg_temp.set('cc', '{mean_rt_ms}', '250'), 'ok', 'cc.too_fast pass: 250 ms'),
  ('cc', 821, 32000, pg_temp.set('cc', '{mean_rt_ms}', '249'), 'GD008:cc.too_fast', 'cc.too_fast fail: 249 ms (CC-T4)'),
  ('cc', 1000, 32000, pg_temp.set2('cc', '{correct}', '50', '{mean_rt_ms}', '306'), 'ok', 'cc.too_many pass: 50 x (306 + 300) = 30300'),
  ('cc', 1000, 32000, pg_temp.set2('cc', '{correct}', '50', '{mean_rt_ms}', '307'), 'GD008:cc.too_many', 'cc.too_many fail: 50 x (307 + 300) = 30350 (CC-T5)'),
  ('cc', 775, 32000, pg_temp.b('cc'), 'ok', 'cc.formula_band pass: 25 x 31 + 0'),
  ('cc', 850, 32000, pg_temp.b('cc'), 'ok', 'cc.formula_band pass: 25 x 31 + 75'),
  ('cc', 774, 32000, pg_temp.b('cc'), 'GD008:cc.formula_band', 'cc.formula_band fail: 25 x 31 - 1'),
  ('cc', 851, 32000, pg_temp.b('cc'), 'GD008:cc.formula_band', 'cc.formula_band fail: 25 x 31 + 76 (CC-T6)'),
  ('cc', 0, 32000, pg_temp.b('cc_spam'), 'ok', 'cc.formula_band pass: spammer (net -12) scores 0'),
  ('cc', 1, 32000, pg_temp.b('cc_spam'), 'GD008:cc.formula_band', 'cc.formula_band fail: spammer scores 1')
) t(g, sc, dur, raw, want, descr);

select pg_temp.as_postgres();
select is((select count(*)::int from public.scores), 0, 'every probe was rolled back');
select ok(not has_function_privilege('authenticated', 'private.score_bounds_violation(public.game_id, integer, integer, jsonb)', 'EXECUTE'),
          'guests cannot call the bounds function directly (only the definer trigger does)');

select * from finish();
rollback;
