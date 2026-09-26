-- TESTING.md section 3, "Trigger bounds" for Swipe Sort (ADR-136): one passing and one failing case
-- per bound in SCORING.md section 4 (ss.*), asserting the reason code in the GD008 error detail.
-- Same method as 05_score_bounds.sql / 09_score_bounds_new_games.sql: real guest inserts through the
-- trigger, RLS and CHECK constraints, each rolled back. Base raws = docs/games/swipe-sort.md section 4.
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

select plan(38);

-- ============ Fixture: one guest in a Swipe Sort round (inserted directly, as postgres) ============
select pg_temp.setv('G', '99999999-0000-0000-0000-000000000003');
with sa as (
  insert into public.sessions (event_day_id, code, status, lineup)
  values (private.current_event_day_id(), '9003', 'closed', '{swipe_sort,color_clash,simon}') returning id
), pl as (
  insert into public.players (session_id, player_id, name, name_key)
  select id, pg_temp.v('G')::uuid, 'Tester', 'tester' from sa
), rs as (
  insert into public.rounds (session_id, round_no, game, status, started_at)
  select sa.id, 1, 'swipe_sort'::public.game_id, 'playing'::public.round_status, now() from sa
  returning id
)
select pg_temp.setv('r_ss', id::text) from rs;

-- Base (plausible) raw objects: worked examples A, B, C, D (spammer), E (idle), F in swipe-sort.md section 4.
select pg_temp.setv('ss', '{"correct":43,"wrong":1,"missed":5,"mean_swipe_ms":450}');
select pg_temp.setv('ss_b', '{"correct":33,"wrong":3,"missed":8,"mean_swipe_ms":550}');
select pg_temp.setv('ss_c', '{"correct":22,"wrong":5,"missed":12,"mean_swipe_ms":640}');
select pg_temp.setv('ss_spam', '{"correct":30,"wrong":33,"missed":0,"mean_swipe_ms":260}');
select pg_temp.setv('ss0', '{"correct":0,"wrong":0,"missed":37,"mean_swipe_ms":null}');
select pg_temp.setv('ss_f', '{"correct":46,"wrong":1,"missed":2,"mean_swipe_ms":430}');

select pg_temp.login(pg_temp.v('G')::uuid);

select is(pg_temp.sub(g, sc, dur, raw), want, descr)
from (values
  -- ---------------- worked examples with their documented scores ----------------
  ('ss', 864, 32000, pg_temp.b('ss'), 'ok', 'ss base passes (example A: 43 / 1 / 5 at 450 ms, SS-T1)'),
  ('ss', 514, 32000, pg_temp.b('ss_b'), 'ok', 'example B passes with 514 (SS-T2)'),
  ('ss', 113, 32000, pg_temp.b('ss_c'), 'ok', 'example C passes with 113 (SS-T3)'),
  ('ss', 1000, 32000, pg_temp.b('ss_f'), 'ok', 'example F passes with 1000 (net 43, capped)'),
  -- ---------------- ss.shape ----------------
  ('ss', 864, 32000, '[]'::jsonb, 'GD008:ss.shape', 'ss.shape fail: raw is not an object'),
  ('ss', 864, 32000, pg_temp.b('ss') - 'correct', 'GD008:ss.shape', 'ss.shape fail: correct missing'),
  ('ss', 864, 32000, pg_temp.b('ss') - 'mean_swipe_ms', 'GD008:ss.shape', 'ss.shape fail: mean_swipe_ms missing'),
  ('ss', 864, 32000, pg_temp.set('ss', '{mean_swipe_ms}', '"450"'), 'GD008:ss.shape', 'ss.shape fail: mean_swipe_ms is a string'),
  ('ss', 864, 32000, pg_temp.set('ss', '{missed}', '5.5'), 'GD008:ss.shape', 'ss.shape fail: missed not an integer'),
  ('ss', 864, 32000, pg_temp.set('ss', '{wrong}', 'true'), 'GD008:ss.shape', 'ss.shape fail: wrong is a boolean'),
  -- ---------------- ss.range ----------------
  ('ss', 1000, 32000, pg_temp.set('ss', '{correct}', '120'), 'GD008:ss.too_many', 'ss.range pass: correct 120 (then too many for 30 s)'),
  ('ss', 1000, 32000, pg_temp.set('ss', '{correct}', '121'), 'GD008:ss.range', 'ss.range fail: correct 121'),
  ('ss', 0, 32000, pg_temp.set('ss', '{correct}', '-1'), 'GD008:ss.range', 'ss.range fail: correct -1'),
  ('ss', 0, 32000, pg_temp.set('ss', '{wrong}', '120'), 'ok', 'ss.range pass: wrong 120 (net negative, score 0)'),
  ('ss', 0, 32000, pg_temp.set('ss', '{wrong}', '121'), 'GD008:ss.range', 'ss.range fail: wrong 121'),
  ('ss', 0, 32000, pg_temp.set('ss', '{missed}', '80'), 'ok', 'ss.range pass: missed 80 (net negative, score 0)'),
  ('ss', 0, 32000, pg_temp.set('ss', '{missed}', '81'), 'GD008:ss.range', 'ss.range fail: missed 81'),
  ('ss', 110, 32000, pg_temp.set('ss_c', '{mean_swipe_ms}', '900'), 'ok', 'ss.range pass: mean_swipe_ms 900 (example C, no bonus)'),
  ('ss', 110, 32000, pg_temp.set('ss_c', '{mean_swipe_ms}', '901'), 'GD008:ss.range', 'ss.range fail: mean_swipe_ms 901'),
  -- ---------------- ss.rt ----------------
  ('ss', 0, 32000, pg_temp.set('ss0', '{mean_swipe_ms}', '500'), 'GD008:ss.rt', 'ss.rt fail: no correct swipes but a mean time'),
  ('ss', 864, 32000, pg_temp.set('ss', '{mean_swipe_ms}', 'null'), 'GD008:ss.rt', 'ss.rt fail: correct swipes without a mean time'),
  -- ---------------- ss.zero ----------------
  ('ss', 0, 32000, pg_temp.b('ss0'), 'ok', 'ss.zero pass: idle (37 misses), score 0'),
  ('ss', 22, 32000, pg_temp.b('ss0'), 'GD008:ss.zero', 'ss.zero fail: no correct swipes, score 22'),
  -- ---------------- ss.too_fast (SS-T4: 40 correct, net 34, band 748..808) ----------------
  ('ss', 808, 32000, pg_temp.set2('ss', '{correct}', '40', '{mean_swipe_ms}', '200'), 'ok', 'ss.too_fast pass: 200 ms'),
  ('ss', 808, 32000, pg_temp.set2('ss', '{correct}', '40', '{mean_swipe_ms}', '199'), 'GD008:ss.too_fast', 'ss.too_fast fail: 199 ms (SS-T4)'),
  -- ---------------- ss.too_many (SS-T5: 60 correct, net 54 -> 1000) ----------------
  ('ss', 1000, 32000, pg_temp.set2('ss', '{correct}', '60', '{mean_swipe_ms}', '352'), 'ok', 'ss.too_many pass: 60 x (352 + 150) = 30120'),
  ('ss', 1000, 32000, pg_temp.set2('ss', '{correct}', '60', '{mean_swipe_ms}', '353'), 'GD008:ss.too_many', 'ss.too_many fail: 60 x (353 + 150) = 30180 (SS-T5)'),
  -- ---------------- ss.formula_band (SS-T6: net 37 -> 814..874) ----------------
  ('ss', 814, 32000, pg_temp.b('ss'), 'ok', 'ss.formula_band pass: 22 x 37 + 0'),
  ('ss', 874, 32000, pg_temp.b('ss'), 'ok', 'ss.formula_band pass: 22 x 37 + 60'),
  ('ss', 813, 32000, pg_temp.b('ss'), 'GD008:ss.formula_band', 'ss.formula_band fail: 22 x 37 - 1'),
  ('ss', 875, 32000, pg_temp.b('ss'), 'GD008:ss.formula_band', 'ss.formula_band fail: 22 x 37 + 61 (SS-T6)'),
  ('ss', 0, 32000, pg_temp.b('ss_spam'), 'ok', 'ss.formula_band pass: spammer (net -3) scores 0 (SS-T3)'),
  ('ss', 1, 32000, pg_temp.b('ss_spam'), 'GD008:ss.formula_band', 'ss.formula_band fail: spammer scores 1'),
  ('ss', 999, 32000, pg_temp.b('ss_f'), 'ok', 'ss.formula_band pass: example F at 999 (band 946..1000)'),
  ('ss', 945, 32000, pg_temp.b('ss_f'), 'GD008:ss.formula_band', 'ss.formula_band fail: example F under 22 x 43'),
  ('ss', 1001, 32000, pg_temp.b('ss_f'), 'GD008:ss.formula_band', 'ss.formula_band fail: 1001 (the band is capped at 1000; the trigger runs before the CHECK)')
) t(g, sc, dur, raw, want, descr);

select pg_temp.as_postgres();
select is((select count(*)::int from public.scores), 0, 'every probe was rolled back');
select ok(not has_function_privilege('authenticated', 'private.score_bounds_violation(public.game_id, integer, integer, jsonb)', 'EXECUTE'),
          'guests cannot call the bounds function directly (only the definer trigger does)');

select * from finish();
rollback;
