-- TESTING.md section 3, "Trigger bounds" for Pairs (ADR-136, docs/games/pairs.md section 5,
-- SCORING.md section 4): one passing and one failing case per bound, in check order, asserting the
-- reason code in the GD008 error detail (PR-T5 to PR-T7 among them). Same method as
-- 09_score_bounds_new_games.sql: real guest inserts through the trigger, RLS and CHECK constraints,
-- each rolled back.
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

-- Submit a Pairs score as the current guest; always rolled back.
-- Returns 'ok', 'GD008:<reason>', or '<sqlstate>'.
create function pg_temp.sub(p_score integer, p_raw jsonb) returns text language plpgsql as $$
declare st text; dt text;
begin
  insert into public.scores (round_id, player_id, score, duration_ms, raw)
  values (pg_temp.v('r_pr')::uuid, (select auth.uid()), p_score, 62000, p_raw);
  raise exception 'probe_ok' using errcode = 'GDZ99';
exception
  when sqlstate 'GDZ99' then return 'ok';
  when others then
    get stacked diagnostics st = returned_sqlstate, dt = pg_exception_detail;
    return st || coalesce(nullif(':' || dt, ':'), '');
end $$;
-- a raw from its three fields (clear_ms as JSON text, so 'null' and '"x"' work)
create function pg_temp.r(m text, x text, c text) returns jsonb language sql immutable as $$
  select ('{"matched":' || m || ',"misses":' || x || ',"clear_ms":' || c || '}')::jsonb $$;

select plan(45);

-- ============ Fixture: one guest in a Pairs round (inserted directly, as postgres) ============
select pg_temp.setv('G', '99999999-0000-0000-0000-000000000012');
with sa as (
  insert into public.sessions (event_day_id, code, status, lineup)
  values (private.current_event_day_id(), '9012', 'closed', '{pairs,color_clash,simon}') returning id
), pl as (
  insert into public.players (session_id, player_id, name, name_key)
  select id, pg_temp.v('G')::uuid, 'Tester', 'tester' from sa
), rs as (
  insert into public.rounds (session_id, round_no, game, status, started_at)
  select sa.id, 1, 'pairs'::public.game_id, 'playing'::public.round_status, now() from sa
  returning id
)
select pg_temp.setv('r_pr', id::text) from rs;

select pg_temp.login(pg_temp.v('G')::uuid);

-- Worked examples (docs/games/pairs.md section 4): A 8/5/34200 -> 825, B 6/9 -> 462, C 3/12 -> 186,
-- D 0/0 -> 0, E 8/3/21500 -> 925, F 8/0/14000 -> 1000, G 0/5 -> 0.
select is(pg_temp.sub(sc, raw), want, descr)
from (values
  -- ---------------- worked examples ----------------
  (825, pg_temp.r('8', '5', '34200'), 'ok', 'example A passes (825)'),
  (462, pg_temp.r('6', '9', 'null'), 'ok', 'example B passes (462)'),
  (186, pg_temp.r('3', '12', 'null'), 'ok', 'example C passes (186)'),
  (0, pg_temp.r('0', '0', 'null'), 'ok', 'example D passes (idle, 0)'),
  (925, pg_temp.r('8', '3', '21500'), 'ok', 'example E passes (925)'),
  (1000, pg_temp.r('8', '0', '14000'), 'ok', 'example F passes (1000)'),
  (0, pg_temp.r('0', '5', 'null'), 'ok', 'example G passes (no pair, 5 misses, 0)'),
  -- ---------------- pr.shape ----------------
  (825, '[]'::jsonb, 'GD008:pr.shape', 'pr.shape fail: raw is not an object'),
  (825, pg_temp.r('8', '5', '34200') - 'matched', 'GD008:pr.shape', 'pr.shape fail: matched missing'),
  (825, pg_temp.r('8', '5', '34200') - 'misses', 'GD008:pr.shape', 'pr.shape fail: misses missing'),
  (825, pg_temp.r('8', '5', '34200') - 'clear_ms', 'GD008:pr.shape', 'pr.shape fail: clear_ms missing'),
  (825, pg_temp.r('8', '5', '"34200"'), 'GD008:pr.shape', 'pr.shape fail: clear_ms is a string'),
  (825, pg_temp.r('8', '5', '34200.5'), 'GD008:pr.shape', 'pr.shape fail: clear_ms not an integer'),
  (462, pg_temp.r('6.5', '9', 'null'), 'GD008:pr.shape', 'pr.shape fail: matched not an integer'),
  (462, pg_temp.r('true', '9', 'null'), 'GD008:pr.shape', 'pr.shape fail: matched is a boolean'),
  (462, pg_temp.r('6', 'null', 'null'), 'GD008:pr.shape', 'pr.shape fail: misses is null'),
  -- ---------------- pr.range ----------------
  (825, pg_temp.r('9', '5', '34200'), 'GD008:pr.range', 'pr.range fail: matched 9 (PR-T7)'),
  (0, pg_temp.r('-1', '0', 'null'), 'GD008:pr.range', 'pr.range fail: matched -1'),
  (0, pg_temp.r('6', '200', 'null'), 'ok', 'pr.range pass: misses 200 (score clamps to 0)'),
  (0, pg_temp.r('6', '201', 'null'), 'GD008:pr.range', 'pr.range fail: misses 201'),
  (462, pg_temp.r('6', '-1', 'null'), 'GD008:pr.range', 'pr.range fail: misses -1'),
  (670, pg_temp.r('8', '5', '60000'), 'ok', 'pr.range pass: clear_ms 60000 (730 - 60)'),
  (670, pg_temp.r('8', '5', '60001'), 'GD008:pr.range', 'pr.range fail: clear_ms 60001'),
  (1000, pg_temp.r('8', '0', '-1'), 'GD008:pr.range', 'pr.range fail: clear_ms -1'),
  -- ---------------- pr.clear ----------------
  (825, pg_temp.r('8', '5', 'null'), 'GD008:pr.clear', 'pr.clear fail: matched 8 without clear_ms (PR-T7)'),
  (462, pg_temp.r('6', '9', '30000'), 'GD008:pr.clear', 'pr.clear fail: a clear time on an unfinished board'),
  -- ---------------- pr.zero ----------------
  (1, pg_temp.r('0', '5', 'null'), 'GD008:pr.zero', 'pr.zero fail: no pair, score 1'),
  (570, pg_temp.r('0', '0', 'null'), 'GD008:pr.zero', 'pr.zero fail: no pair, score 570'),
  -- ---------------- pr.too_fast ----------------
  (940, pg_temp.r('8', '5', '7500'), 'ok', 'pr.too_fast pass: 4000 + 5 x 700 = 7500 (PR-T5)'),
  (940, pg_temp.r('8', '5', '7499'), 'GD008:pr.too_fast', 'pr.too_fast fail: 7499 ms with 5 misses (PR-T5)'),
  (1000, pg_temp.r('8', '0', '4000'), 'ok', 'pr.too_fast pass: 16 taps at 250 ms, no miss'),
  (1000, pg_temp.r('8', '0', '3999'), 'GD008:pr.too_fast', 'pr.too_fast fail: 3999 ms without a miss'),
  -- ---------------- pr.formula_band ----------------
  (824, pg_temp.r('8', '5', '34200'), 'ok', 'pr.formula_band pass: example A - 1 (PR-T6)'),
  (826, pg_temp.r('8', '5', '34200'), 'ok', 'pr.formula_band pass: example A + 1 (PR-T6)'),
  (827, pg_temp.r('8', '5', '34200'), 'GD008:pr.formula_band', 'pr.formula_band fail: example A + 2 (PR-T6)'),
  (823, pg_temp.r('8', '5', '34200'), 'GD008:pr.formula_band', 'pr.formula_band fail: example A - 2'),
  (464, pg_temp.r('6', '9', 'null'), 'GD008:pr.formula_band', 'pr.formula_band fail: example B + 2'),
  (998, pg_temp.r('8', '0', '14000'), 'GD008:pr.formula_band', 'pr.formula_band fail: example F must be 999-1000'),
  (999, pg_temp.r('8', '0', '15250'), 'ok', 'pr.formula_band pass: 998.5 rounds to 999'),
  (997, pg_temp.r('8', '0', '15250'), 'GD008:pr.formula_band', 'pr.formula_band fail: 997 for 998.5'),
  (0, pg_temp.r('1', '60', 'null'), 'ok', 'pr.formula_band pass: 1 pair, 60 misses clamps to 0'),
  (2, pg_temp.r('1', '60', 'null'), 'GD008:pr.formula_band', 'pr.formula_band fail: 2 where the clamp gives 0'),
  (730, pg_temp.r('7', '0', 'null'), 'GD008:pr.formula_band', 'pr.formula_band fail: 7 pairs is 650, not a clear')
) t(sc, raw, want, descr);

select pg_temp.as_postgres();
select is((select count(*)::int from public.scores), 0, 'every probe was rolled back');
select ok(not has_function_privilege('authenticated', 'private.score_bounds_violation(public.game_id, integer, integer, jsonb)', 'EXECUTE'),
          'guests cannot call the bounds function directly (only the definer trigger does)');

select * from finish();
rollback;
