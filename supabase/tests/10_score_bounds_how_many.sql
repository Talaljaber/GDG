-- TESTING.md section 3, "Trigger bounds" for How Many? (ADR-136): one passing and one failing case
-- per bound in SCORING.md section 4 / docs/games/how-many.md section 5, asserting the reason code in
-- the GD008 error detail, plus the worked examples A-F with their documented scores. Same method as
-- 05/09: real guest inserts through the trigger, RLS and CHECK constraints, each rolled back.
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

-- Submit a How Many? score as the current guest; always rolled back.
-- Returns 'ok', 'GD008:<reason>', or '<sqlstate>'.
create function pg_temp.sub(p_score integer, p_raw jsonb) returns text language plpgsql as $$
declare st text; dt text;
begin
  insert into public.scores (round_id, player_id, score, duration_ms, raw)
  values (pg_temp.v('r_hm')::uuid, (select auth.uid()), p_score, 40000, p_raw);
  raise exception 'probe_ok' using errcode = 'GDZ99';
exception
  when sqlstate 'GDZ99' then return 'ok';
  when others then
    get stacked diagnostics st = returned_sqlstate, dt = pg_exception_detail;
    return st || coalesce(nullif(':' || dt, ':'), '');
end $$;
create function pg_temp.b(k text) returns jsonb language sql stable as $$ select pg_temp.v(k)::jsonb $$;
-- base raw k with the JSON value at path p (e.g. '{rounds,0,guess}') replaced
create function pg_temp.set(k text, p text, val text) returns jsonb language sql stable as $$
  select jsonb_set(pg_temp.b(k), p::text[], val::jsonb) $$;
create function pg_temp.set2(k text, p1 text, v1 text, p2 text, v2 text) returns jsonb language sql stable as $$
  select jsonb_set(pg_temp.set(k, p1, v1), p2::text[], v2::jsonb) $$;
-- raw built from three (true_count, guess, answer_ms) triples; timed_out = answer_ms is null
create function pg_temp.hm(n1 int, g1 int, a1 int, n2 int, g2 int, a2 int, n3 int, g3 int, a3 int)
returns jsonb language sql immutable as $$
  select jsonb_build_object('rounds', jsonb_build_array(
    jsonb_build_object('true_count', n1, 'guess', g1, 'answer_ms', a1, 'timed_out', a1 is null),
    jsonb_build_object('true_count', n2, 'guess', g2, 'answer_ms', a2, 'timed_out', a2 is null),
    jsonb_build_object('true_count', n3, 'guess', g3, 'answer_ms', a3, 'timed_out', a3 is null))) $$;

select plan(50);

-- ============ Fixture: one guest in a How Many? round (inserted directly, as postgres) ============
select pg_temp.setv('G', '99999999-0000-0000-0000-000000000010');
with sa as (
  insert into public.sessions (event_day_id, code, status, lineup)
  values (private.current_event_day_id(), '9010', 'closed', '{how_many,swipe_sort,pairs}') returning id
), pl as (
  insert into public.players (session_id, player_id, name, name_key)
  select id, pg_temp.v('G')::uuid, 'Tester', 'tester' from sa
), rs as (
  insert into public.rounds (session_id, round_no, game, status, started_at)
  select sa.id, 1, 'how_many'::public.game_id, 'playing'::public.round_status, now() from sa
  returning id
)
select pg_temp.setv('r_hm', id::text) from rs;

-- The worked examples of docs/games/how-many.md section 4 (N = 12, 27, 55).
select pg_temp.setv('a', pg_temp.hm(12, 11, 2400, 27, 24, 4100, 55, 46, 6800)::text);
select pg_temp.setv('b', pg_temp.hm(12, 10, 3100, 27, 22, 5200, 55, 42, 7300)::text);
select pg_temp.setv('c', pg_temp.hm(12, 9, 2900, 27, 18, 6100, 55, 30, 8800)::text);
select pg_temp.setv('d', pg_temp.hm(12, null, null, 27, null, null, 55, null, null)::text);
select pg_temp.setv('e', pg_temp.hm(12, 12, 1900, 27, null, null, 55, 50, 5400)::text);
select pg_temp.setv('f', pg_temp.hm(12, 12, 1800, 27, 27, 3300, 55, 53, 4700)::text);

select pg_temp.login(pg_temp.v('G')::uuid);

select is(pg_temp.sub(sc, raw), want, descr)
from (values
  -- ---------------- worked examples ----------------
  (813, pg_temp.b('a'), 'ok', 'example A (strong) 11, 24, 46 -> 813'),
  (578, pg_temp.b('b'), 'ok', 'example B (typical) 10, 22, 42 -> 578'),
  (164, pg_temp.b('c'), 'ok', 'example C (weak) 9, 18, 30 -> 164'),
  (0, pg_temp.b('d'), 'ok', 'example D (idle) three nulls -> 0'),
  (636, pg_temp.b('e'), 'ok', 'example E (one timeout) 12, null, 50 -> 636'),
  (1000, pg_temp.b('f'), 'ok', 'example F (near-perfect) 12, 27, 53 -> 1000'),
  -- ---------------- hm.shape ----------------
  (813, '[]'::jsonb, 'GD008:hm.shape', 'hm.shape fail: raw is not an object'),
  (813, '{}'::jsonb, 'GD008:hm.shape', 'hm.shape fail: rounds missing'),
  (813, jsonb_build_object('rounds', (pg_temp.b('a') -> 'rounds') - 2), 'GD008:hm.shape', 'hm.shape fail: two rounds'),
  (813, jsonb_build_object('rounds', (pg_temp.b('a') -> 'rounds') || jsonb_build_array(pg_temp.b('a') -> 'rounds' -> 0)),
        'GD008:hm.shape', 'hm.shape fail: four rounds'),
  (813, pg_temp.set('a', '{rounds,1}', '5'), 'GD008:hm.shape', 'hm.shape fail: a round is not an object'),
  (813, pg_temp.b('a') #- '{rounds,0,guess}', 'GD008:hm.shape', 'hm.shape fail: guess missing'),
  (813, pg_temp.b('a') #- '{rounds,2,answer_ms}', 'GD008:hm.shape', 'hm.shape fail: answer_ms missing'),
  (813, pg_temp.set('a', '{rounds,0,true_count}', '"12"'), 'GD008:hm.shape', 'hm.shape fail: true_count is a string'),
  (813, pg_temp.set('a', '{rounds,1,guess}', '24.5'), 'GD008:hm.shape', 'hm.shape fail: guess not an integer'),
  (813, pg_temp.set('a', '{rounds,2,timed_out}', '"false"'), 'GD008:hm.shape', 'hm.shape fail: timed_out is a string'),
  -- ---------------- hm.range ----------------
  (0, pg_temp.set('a', '{rounds,0,true_count}', '15'), 'ok', 'hm.range pass: true_count 15 on flash 1'),
  (0, pg_temp.set('a', '{rounds,0,true_count}', '16'), 'GD008:hm.range', 'hm.range fail: true_count 16 on flash 1 (HM-T10)'),
  (0, pg_temp.set('a', '{rounds,0,true_count}', '7'), 'GD008:hm.range', 'hm.range fail: true_count 7 on flash 1'),
  (0, pg_temp.set('a', '{rounds,1,true_count}', '20'), 'ok', 'hm.range pass: true_count 20 on flash 2'),
  (0, pg_temp.set('a', '{rounds,1,true_count}', '19'), 'GD008:hm.range', 'hm.range fail: true_count 19 on flash 2'),
  (0, pg_temp.set('a', '{rounds,1,true_count}', '36'), 'GD008:hm.range', 'hm.range fail: true_count 36 on flash 2'),
  (0, pg_temp.set('a', '{rounds,2,true_count}', '70'), 'ok', 'hm.range pass: true_count 70 on flash 3'),
  (0, pg_temp.set('a', '{rounds,2,true_count}', '71'), 'GD008:hm.range', 'hm.range fail: true_count 71 on flash 3'),
  (0, pg_temp.set('a', '{rounds,2,true_count}', '12'), 'GD008:hm.range', 'hm.range fail: flash 1''s count on flash 3'),
  (0, pg_temp.set('a', '{rounds,2,guess}', '999'), 'ok', 'hm.range pass: guess 999'),
  (0, pg_temp.set('a', '{rounds,2,guess}', '1000'), 'GD008:hm.range', 'hm.range fail: guess 1000'),
  (0, pg_temp.set('a', '{rounds,0,guess}', '-1'), 'GD008:hm.range', 'hm.range fail: guess -1'),
  (0, pg_temp.set('a', '{rounds,1,answer_ms}', '10000'), 'ok', 'hm.range pass: answer_ms 10000'),
  (0, pg_temp.set('a', '{rounds,1,answer_ms}', '10001'), 'GD008:hm.range', 'hm.range fail: answer_ms 10001'),
  -- ---------------- hm.timeout ----------------
  (0, pg_temp.set('a', '{rounds,0,answer_ms}', 'null'), 'GD008:hm.timeout', 'hm.timeout fail: no answer_ms but not timed out'),
  (0, pg_temp.set('a', '{rounds,0,timed_out}', 'true'), 'GD008:hm.timeout', 'hm.timeout fail: timed out with an answer_ms'),
  (0, pg_temp.set('a', '{rounds,1,guess}', 'null'), 'GD008:hm.timeout', 'hm.timeout fail: null guess not timed out (HM-T10)'),
  (813, pg_temp.set2('a', '{rounds,2,answer_ms}', 'null', '{rounds,2,timed_out}', 'true'), 'ok',
        'hm.timeout pass: typed digits auto-submitted at the timeout'),
  -- ---------------- hm.too_fast ----------------
  (813, pg_temp.set('a', '{rounds,1,answer_ms}', '300'), 'ok', 'hm.too_fast pass: 300 ms'),
  (813, pg_temp.set('a', '{rounds,1,answer_ms}', '299'), 'GD008:hm.too_fast', 'hm.too_fast fail: 299 ms (HM-T7)'),
  (0, pg_temp.set('a', '{rounds,0,answer_ms}', '0'), 'GD008:hm.too_fast', 'hm.too_fast fail: 0 ms'),
  -- ---------------- hm.too_perfect ----------------
  (1000, pg_temp.hm(12, 12, 1800, 27, 27, 3300, 55, 55, 4700), 'GD008:hm.too_perfect', 'hm.too_perfect fail: three exact (HM-T8)'),
  (0, pg_temp.hm(12, 12, 1800, 27, 27, 3300, 55, 55, 4700), 'GD008:hm.too_perfect', 'hm.too_perfect fail: three exact even at score 0'),
  (1000, pg_temp.hm(12, 12, 1800, 27, 27, 3300, 55, 54, 4700), 'ok', 'hm.too_perfect pass: two exact + one off'),
  (1000, pg_temp.hm(12, 12, 1800, 27, 27, 3300, 55, 55, null), 'GD008:hm.too_perfect', 'hm.too_perfect fail: three exact, one auto-submitted'),
  -- ---------------- hm.formula_band ----------------
  (814, pg_temp.b('a'), 'ok', 'hm.formula_band pass: example A + 1'),
  (815, pg_temp.b('a'), 'GD008:hm.formula_band', 'hm.formula_band fail: example A + 2 (HM-T9)'),
  (700, pg_temp.b('a'), 'ok', 'hm.formula_band pass: under-reported 700 (upper side only)'),
  (637, pg_temp.b('e'), 'ok', 'hm.formula_band pass: example E + 1'),
  (638, pg_temp.b('e'), 'GD008:hm.formula_band', 'hm.formula_band fail: example E + 2'),
  (1, pg_temp.b('d'), 'ok', 'hm.formula_band pass: idle + 1'),
  (2, pg_temp.b('d'), 'GD008:hm.formula_band', 'hm.formula_band fail: idle scores 2')
) t(sc, raw, want, descr);

select pg_temp.as_postgres();
select is((select count(*)::int from public.scores), 0, 'every probe was rolled back');
select ok(not has_function_privilege('authenticated', 'private.score_bounds_violation(public.game_id, integer, integer, jsonb)', 'EXECUTE'),
          'guests cannot call the bounds function directly (only the definer trigger does)');

select * from finish();
rollback;
