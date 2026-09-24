-- TESTING.md section 3, "Trigger bounds": one passing and one failing case per bound in SCORING.md section 4,
-- asserting the reason code in the GD008 error detail. Every case goes through a real guest insert
-- (trigger + RLS + CHECK constraints) and is rolled back, so one player can try them all.
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

select plan(102);

-- ============ Fixture: one guest in a round of every game (inserted directly, as postgres) ============
select pg_temp.setv('G', '55555555-0000-0000-0000-000000000001');
with sa as (
  insert into public.sessions (event_day_id, code, status, lineup)
  values (private.current_event_day_id(), '5001', 'closed', '{odd_one_out,stop_the_clock,simon}') returning id
), sb as (
  insert into public.sessions (event_day_id, code, status, lineup)
  values (private.current_event_day_id(), '5002', 'closed', '{perfect_circle,trivia,simon}') returning id
), pl as (
  insert into public.players (session_id, player_id, name, name_key)
  select id, pg_temp.v('G')::uuid, 'Tester', 'tester' from sa
  union all
  select id, pg_temp.v('G')::uuid, 'Tester', 'tester' from sb
), rs as (
  insert into public.rounds (session_id, round_no, game, status, started_at)
  select sa.id, x.n, x.g::public.game_id, 'playing'::public.round_status, now()
    from sa, (values (1, 'odd_one_out'), (2, 'stop_the_clock'), (3, 'simon')) x(n, g)
  union all
  select sb.id, x.n, x.g::public.game_id, 'playing'::public.round_status, now()
    from sb, (values (1, 'perfect_circle'), (2, 'trivia')) x(n, g)
  returning id, game
)
select pg_temp.setv('r_' || case game when 'odd_one_out' then 'ooo' when 'stop_the_clock' then 'stc'
                                      when 'perfect_circle' then 'pc' else game::text end, id::text)
from rs;

-- Base (plausible) raw objects per game.
select pg_temp.setv('ooo', '{"grids":[{"size":4,"find_ms":3000,"wrong_taps":0,"timed_out":false},'
                           '{"size":5,"find_ms":4000,"wrong_taps":1,"timed_out":false},'
                           '{"size":6,"find_ms":20000,"wrong_taps":0,"timed_out":true}]}');
select pg_temp.setv('stc', '{"attempts":[{"target_ms":5000,"measured_ms":5100,"missed_start":false},'
                           '{"target_ms":10000,"measured_ms":9800,"missed_start":false},'
                           '{"target_ms":7000,"measured_ms":null,"missed_start":true}]}');
select pg_temp.setv('simon', '{"level":5,"avg_gap_ms":600,"taps":12,"ended":"mistake"}');
select pg_temp.setv('simon0', '{"level":0,"avg_gap_ms":null,"taps":1,"ended":"mistake"}');
select pg_temp.setv('simon15', '{"level":15,"avg_gap_ms":400,"taps":117,"ended":"won"}');
select pg_temp.setv('pc', '{"epsilon":0.05,"sweep_deg":350,"diameter_px":300,"stroke_ms":2000,"invalid_strokes":1,"timed_out":false}');
select pg_temp.setv('pc_to', '{"epsilon":null,"sweep_deg":null,"diameter_px":null,"stroke_ms":null,"invalid_strokes":4,"timed_out":true}');
select pg_temp.setv('trivia', '{"questions":[{"id":"q01","correct":true,"answer_ms":3000,"timed_out":false},'
                              '{"id":"q02","correct":false,"answer_ms":5000,"timed_out":false},'
                              '{"id":"q03","correct":false,"answer_ms":null,"timed_out":true},'
                              '{"id":"q04","correct":true,"answer_ms":250,"timed_out":false},'
                              '{"id":"q05","correct":false,"answer_ms":10000,"timed_out":false}]}');
select pg_temp.setv('trivia0', '{"questions":[{"id":"q01","correct":false,"answer_ms":3000,"timed_out":false},'
                               '{"id":"q02","correct":false,"answer_ms":5000,"timed_out":false},'
                               '{"id":"q03","correct":false,"answer_ms":null,"timed_out":true},'
                               '{"id":"q04","correct":false,"answer_ms":250,"timed_out":false},'
                               '{"id":"q05","correct":false,"answer_ms":10000,"timed_out":false}]}');

select pg_temp.login(pg_temp.v('G')::uuid);

select is(pg_temp.sub(g, sc, dur, raw), want, descr)
from (values
  -- ---------------- Odd One Out ----------------
  ('ooo', 300, 30000, pg_temp.b('ooo'),                                               'ok',              'ooo.shape pass: 3 grids, sizes [4,5,6]'),
  ('ooo', 300, 30000, pg_temp.set2('ooo', '{grids,1,size}', '6', '{grids,2,size}', '5'), 'GD008:ooo.shape', 'ooo.shape fail: sizes [4,6,5]'),
  ('ooo', 300, 30000, jsonb_set(pg_temp.b('ooo'), '{grids}', (pg_temp.b('ooo') -> 'grids') - 2), 'GD008:ooo.shape', 'ooo.shape fail: 2 grids'),
  ('ooo', 300, 30000, '[]'::jsonb,                                                    'GD008:ooo.shape', 'ooo.shape fail: raw is not an object'),
  ('ooo', 300, 30000, pg_temp.b('ooo') #- '{grids,0,timed_out}',                      'GD008:ooo.shape', 'ooo.shape fail: missing timed_out'),
  ('ooo', 300, 30000, pg_temp.set('ooo', '{grids,0,find_ms}', '"3000"'),              'GD008:ooo.shape', 'ooo.shape fail: find_ms is a string'),
  ('ooo', 300, 30000, pg_temp.set('ooo', '{grids,0,wrong_taps}', '50'),               'ok',              'ooo.taps pass: wrong_taps 50'),
  ('ooo', 300, 30000, pg_temp.set('ooo', '{grids,0,wrong_taps}', '51'),               'GD008:ooo.taps',  'ooo.taps fail: wrong_taps 51'),
  ('ooo', 300, 30000, pg_temp.set('ooo', '{grids,1,wrong_taps}', '-1'),               'GD008:ooo.taps',  'ooo.taps fail: wrong_taps -1'),
  ('ooo', 300, 30000, pg_temp.set('ooo', '{grids,0,find_ms}', '250'),                 'ok',              'ooo.find_ms pass: 250'),
  ('ooo', 300, 30000, pg_temp.set('ooo', '{grids,1,find_ms}', '20000'),               'ok',              'ooo.find_ms pass: 20000 without timeout'),
  ('ooo', 300, 30000, pg_temp.set('ooo', '{grids,0,find_ms}', '249'),                 'GD008:ooo.find_ms', 'ooo.find_ms fail: 249'),
  ('ooo', 300, 30000, pg_temp.set('ooo', '{grids,1,find_ms}', '20001'),               'GD008:ooo.find_ms', 'ooo.find_ms fail: 20001'),
  ('ooo', 300, 30000, pg_temp.set2('ooo', '{grids,0,timed_out}', 'true', '{grids,0,find_ms}', '20000'), 'ok', 'ooo.timeout pass: timed out at 20000'),
  ('ooo', 300, 30000, pg_temp.set('ooo', '{grids,2,find_ms}', '19999'),               'GD008:ooo.timeout', 'ooo.timeout fail: timed out but find_ms 19999'),
  -- ---------------- Stop the Clock ----------------
  ('stc', 100, 40000, pg_temp.b('stc'),                                               'ok',              'stc.shape pass: 3 attempts, targets [5000,10000,7000]'),
  ('stc', 100, 40000, pg_temp.set2('stc', '{attempts,0,target_ms}', '10000', '{attempts,1,target_ms}', '5000'), 'GD008:stc.shape', 'stc.shape fail: targets out of order'),
  ('stc', 100, 40000, jsonb_set(pg_temp.b('stc'), '{attempts}', (pg_temp.b('stc') -> 'attempts') - 2), 'GD008:stc.shape', 'stc.shape fail: 2 attempts'),
  ('stc', 100, 40000, pg_temp.set('stc', '{attempts,0,measured_ms}', '5100.5'),       'GD008:stc.shape', 'stc.shape fail: measured_ms not an integer'),
  ('stc', 100, 40000, pg_temp.b('stc') #- '{attempts,1,measured_ms}',                 'GD008:stc.shape', 'stc.shape fail: measured_ms missing'),
  ('stc', 100, 40000, pg_temp.set2('stc', '{attempts,2,measured_ms}', '7000', '{attempts,2,missed_start}', 'false'), 'ok', 'stc.missed pass: all measured'),
  ('stc', 100, 40000, pg_temp.set('stc', '{attempts,2,missed_start}', 'false'),       'GD008:stc.missed', 'stc.missed fail: null without missed_start'),
  ('stc', 100, 40000, pg_temp.set('stc', '{attempts,0,missed_start}', 'true'),        'GD008:stc.missed', 'stc.missed fail: measured with missed_start'),
  ('stc', 100, 40000, pg_temp.set('stc', '{attempts,0,measured_ms}', '15000'),        'ok',              'stc.range pass: target + 10000'),
  ('stc', 100, 40000, pg_temp.set('stc', '{attempts,0,measured_ms}', '0'),            'ok',              'stc.range pass: 0'),
  ('stc', 100, 40000, pg_temp.set('stc', '{attempts,0,measured_ms}', '15001'),        'GD008:stc.range', 'stc.range fail: target + 10001'),
  ('stc', 100, 40000, pg_temp.set('stc', '{attempts,1,measured_ms}', '20001'),        'GD008:stc.range', 'stc.range fail: 20001 for the 10 s target'),
  ('stc', 100, 40000, pg_temp.set('stc', '{attempts,0,measured_ms}', '-1'),           'GD008:stc.range', 'stc.range fail: negative'),
  ('stc', 990, 40000, pg_temp.b('stc'),                                               'ok',              'stc.score_above_990 pass: 990'),
  ('stc', 991, 40000, pg_temp.b('stc'),                                               'GD008:stc.score_above_990', 'stc.score_above_990 fail: 991'),
  -- ---------------- Simon ----------------
  ('simon', 340, 20000, pg_temp.b('simon'),                                           'ok',              'simon base passes'),
  ('simon', 340, 20000, pg_temp.b('simon') - 'ended',                                 'GD008:simon.shape', 'simon.shape fail: ended missing'),
  ('simon', 340, 20000, pg_temp.set('simon', '{ended}', '"quit"'),                    'GD008:simon.shape', 'simon.shape fail: unknown ended'),
  ('simon', 340, 20000, pg_temp.set('simon', '{level}', '"5"'),                       'GD008:simon.shape', 'simon.shape fail: level is a string'),
  ('simon',   0,  1000, pg_temp.b('simon0'),                                          'ok',              'simon.level pass: 0'),
  ('simon', 192,  1800, pg_temp.set('simon', '{level}', '3'),                         'ok',              'simon.level pass: 3'),
  ('simon', 128, 20000, pg_temp.set('simon', '{level}', '2'),                         'GD008:simon.level', 'simon.level fail: 2'),
  ('simon', 1000, 90000, pg_temp.set('simon15', '{level}', '16'),                     'GD008:simon.level', 'simon.level fail: 16'),
  ('simon',   0,  5000, pg_temp.set('simon0', '{ended}', '"timeout"'),                'ok',              'simon.zero pass: level 0, score 0'),
  ('simon',  10,  5000, pg_temp.b('simon0'),                                          'GD008:simon.zero', 'simon.zero fail: level 0, score 10'),
  ('simon', 340, 20000, pg_temp.set('simon', '{avg_gap_ms}', '120'),                  'ok',              'simon.gap pass: 120'),
  ('simon', 340, 20000, pg_temp.set('simon', '{avg_gap_ms}', '119'),                  'GD008:simon.gap', 'simon.gap fail: 119'),
  ('simon', 340, 20000, pg_temp.set('simon', '{avg_gap_ms}', 'null'),                 'GD008:simon.gap', 'simon.gap fail: null gap at level 5'),
  ('simon', 320, 20000, pg_temp.b('simon'),                                           'ok',              'simon.formula_band pass: 64 x 5 + 0'),
  ('simon', 360, 20000, pg_temp.b('simon'),                                           'ok',              'simon.formula_band pass: 64 x 5 + 40'),
  ('simon', 319, 20000, pg_temp.b('simon'),                                           'GD008:simon.formula_band', 'simon.formula_band fail: 64 x 5 - 1'),
  ('simon', 361, 20000, pg_temp.b('simon'),                                           'GD008:simon.formula_band', 'simon.formula_band fail: 64 x 5 + 41'),
  ('simon', 1000, 53400, pg_temp.b('simon15'),                                        'ok',              'simon.won pass: level 15 won'),
  ('simon', 1000, 60000, pg_temp.set('simon15', '{ended}', '"cap"'),                  'GD008:simon.won', 'simon.won fail: level 15 not won'),
  ('simon', 900, 60000, pg_temp.set('simon15', '{level}', '14'),                      'GD008:simon.won', 'simon.won fail: won below level 15'),
  ('simon', 660, 26720, pg_temp.set('simon', '{level}', '10'),                        'ok',              'simon.too_fast pass: level 10 at 26720 ms'),
  ('simon', 660, 26719, pg_temp.set('simon', '{level}', '10'),                        'GD008:simon.too_fast', 'simon.too_fast fail: level 10 at 26719 ms'),
  ('simon', 1000, 53399, pg_temp.b('simon15'),                                        'GD008:simon.too_fast', 'simon.too_fast fail: level 15 at 53399 ms'),
  -- ---------------- Perfect Circle ----------------
  ('pc', 700, 5000, pg_temp.b('pc'),                                                  'ok',              'pc base passes'),
  ('pc', 700, 5000, pg_temp.b('pc') - 'diameter_px',                                  'GD008:pc.shape',  'pc.shape fail: diameter_px missing'),
  ('pc', 700, 5000, pg_temp.set('pc', '{epsilon}', '"0.05"'),                         'GD008:pc.shape',  'pc.shape fail: epsilon is a string'),
  ('pc', 700, 5000, pg_temp.set('pc', '{invalid_strokes}', '1.5'),                    'GD008:pc.shape',  'pc.shape fail: invalid_strokes not an integer'),
  ('pc', 700, 5000, pg_temp.set('pc', '{invalid_strokes}', '3'),                      'ok',              'pc.invalid pass: 3 without timeout'),
  ('pc',   0, 30000, pg_temp.b('pc_to'),                                              'ok',              'pc.invalid pass: 4 with timeout'),
  ('pc', 700, 5000, pg_temp.set('pc', '{invalid_strokes}', '4'),                      'GD008:pc.invalid', 'pc.invalid fail: 4 without timeout'),
  ('pc',   0, 30000, pg_temp.set('pc_to', '{invalid_strokes}', '5'),                  'GD008:pc.invalid', 'pc.invalid fail: 5 with timeout'),
  ('pc', 700, 5000, pg_temp.set('pc', '{invalid_strokes}', '-1'),                     'GD008:pc.invalid', 'pc.invalid fail: negative'),
  ('pc',   0, 30000, pg_temp.set('pc_to', '{invalid_strokes}', '0'),                  'ok',              'pc.timeout pass: timed out, score 0'),
  ('pc',   1, 30000, pg_temp.b('pc_to'),                                              'GD008:pc.timeout', 'pc.timeout fail: timed out, score 1'),
  ('pc', 700, 5000, pg_temp.set('pc', '{epsilon}', '0.005'),                          'ok',              'pc.too_perfect pass: 0.005'),
  ('pc', 700, 5000, pg_temp.set('pc', '{epsilon}', '0.0049'),                         'GD008:pc.too_perfect', 'pc.too_perfect fail: 0.0049'),
  ('pc', 700, 5000, pg_temp.set('pc', '{epsilon}', 'null'),                           'GD008:pc.too_perfect', 'pc.too_perfect fail: null without timeout'),
  ('pc', 700, 5000, pg_temp.set('pc', '{sweep_deg}', '300'),                          'ok',              'pc.sweep pass: 300'),
  ('pc', 700, 5000, pg_temp.set('pc', '{sweep_deg}', '450'),                          'ok',              'pc.sweep pass: 450'),
  ('pc', 700, 5000, pg_temp.set('pc', '{sweep_deg}', '299.9'),                        'GD008:pc.sweep',  'pc.sweep fail: 299.9'),
  ('pc', 700, 5000, pg_temp.set('pc', '{sweep_deg}', '450.1'),                        'GD008:pc.sweep',  'pc.sweep fail: 450.1'),
  ('pc', 700, 5000, pg_temp.set('pc', '{stroke_ms}', '300'),                          'ok',              'pc.stroke_ms pass: 300'),
  ('pc', 700, 5000, pg_temp.set('pc', '{stroke_ms}', '10000'),                        'ok',              'pc.stroke_ms pass: 10000'),
  ('pc', 700, 5000, pg_temp.set('pc', '{stroke_ms}', '299'),                          'GD008:pc.stroke_ms', 'pc.stroke_ms fail: 299'),
  ('pc', 700, 5000, pg_temp.set('pc', '{stroke_ms}', '10001'),                        'GD008:pc.stroke_ms', 'pc.stroke_ms fail: 10001'),
  ('pc', 975, 5000, pg_temp.b('pc'),                                                  'ok',              'pc.score_above_975 pass: 975'),
  ('pc', 976, 5000, pg_temp.b('pc'),                                                  'GD008:pc.score_above_975', 'pc.score_above_975 fail: 976'),
  -- ---------------- Trivia ----------------
  ('trivia', 368, 50000, pg_temp.b('trivia'),                                         'ok',              'trivia.shape pass: 5 distinct ids'),
  ('trivia', 368, 50000, jsonb_set(pg_temp.b('trivia'), '{questions}', (pg_temp.b('trivia') -> 'questions') - 4), 'GD008:trivia.shape', 'trivia.shape fail: 4 questions'),
  ('trivia', 368, 50000, pg_temp.set('trivia', '{questions,4,id}', '"q01"'),          'GD008:trivia.shape', 'trivia.shape fail: duplicate id'),
  ('trivia', 368, 50000, pg_temp.b('trivia') #- '{questions,1,answer_ms}',            'GD008:trivia.shape', 'trivia.shape fail: answer_ms missing'),
  ('trivia', 368, 50000, pg_temp.set('trivia', '{questions,0,id}', '7'),              'GD008:trivia.shape', 'trivia.shape fail: id not a string'),
  ('trivia', 368, 50000, pg_temp.set2('trivia', '{questions,2,answer_ms}', '9000', '{questions,2,timed_out}', 'false'), 'ok', 'trivia.timeout pass: all answered'),
  ('trivia', 368, 50000, pg_temp.set('trivia', '{questions,2,answer_ms}', '3000'),    'GD008:trivia.timeout', 'trivia.timeout fail: timed out with an answer time'),
  ('trivia', 368, 50000, pg_temp.set('trivia', '{questions,1,answer_ms}', 'null'),    'GD008:trivia.timeout', 'trivia.timeout fail: null answer without timeout'),
  ('trivia', 368, 50000, pg_temp.set('trivia', '{questions,1,answer_ms}', '0'),       'ok',              'trivia.range pass: wrong answer at 0 ms'),
  ('trivia', 368, 50000, pg_temp.set('trivia', '{questions,1,answer_ms}', '10001'),   'GD008:trivia.range', 'trivia.range fail: 10001'),
  ('trivia', 368, 50000, pg_temp.set('trivia', '{questions,1,answer_ms}', '-1'),      'GD008:trivia.range', 'trivia.range fail: negative'),
  ('trivia', 368, 50000, pg_temp.set('trivia', '{questions,0,answer_ms}', '250'),     'ok',              'trivia.too_fast pass: correct at 250 ms'),
  ('trivia', 368, 50000, pg_temp.set('trivia', '{questions,0,answer_ms}', '249'),     'GD008:trivia.too_fast', 'trivia.too_fast fail: correct at 249 ms'),
  ('trivia',   0, 50000, pg_temp.b('trivia0'),                                        'ok',              'trivia.zero pass: no correct answers, score 0'),
  ('trivia',  50, 50000, pg_temp.b('trivia0'),                                        'GD008:trivia.zero', 'trivia.zero fail: no correct answers, score 50'),
  ('trivia', 988, 50000, pg_temp.b('trivia'),                                         'ok',              'trivia.score_above_988 pass: 988'),
  ('trivia', 989, 50000, pg_temp.b('trivia'),                                         'GD008:trivia.score_above_988', 'trivia.score_above_988 fail: 989'),
  -- ---------------- Common CHECK constraints ----------------
  ('ooo', 1000, 30000, pg_temp.b('ooo'),                                              'ok',              'score 1000 allowed'),
  ('ooo', 1001, 30000, pg_temp.b('ooo'),                                              '23514',           'score 1001 -> check violation'),
  ('ooo',   -1, 30000, pg_temp.b('ooo'),                                              '23514',           'score -1 -> check violation'),
  ('ooo',  300, 130000, pg_temp.b('ooo'),                                             'ok',              'duration_ms 130000 allowed'),
  ('ooo',  300, 130001, pg_temp.b('ooo'),                                             '23514',           'duration_ms 130001 -> check violation'),
  ('ooo',  300,  -1, pg_temp.b('ooo'),                                                '23514',           'duration_ms -1 -> check violation')
) t(g, sc, dur, raw, want, descr);

select pg_temp.as_postgres();
select is((select count(*)::int from public.scores), 0, 'every probe was rolled back');
select is(private.simon_min_playback_ms(10) || '/' || private.simon_min_playback_ms(15) || '/' || private.simon_min_playback_ms(0),
          '26720/53400/0', 'min_playback_ms matches simon.md (26 720 ms at 10, 53 400 ms at 15)');

select * from finish();
rollback;
