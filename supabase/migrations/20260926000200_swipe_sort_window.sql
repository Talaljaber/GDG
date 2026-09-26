-- 20260926000200 Swipe Sort longer item window (ADR-139, team request 2026-09-26).
-- Spec: docs/SCORING.md section 4 (bounds and reason codes), docs/games/swipe-sort.md,
-- docs/DATA_MODEL.md section 5.
--
-- private.score_bounds_violation is replaced with the same signature, so the score trigger keeps
-- calling it unchanged. The body is copied from 20260926000100_how_many_retune.sql (the last
-- definition); only the Swipe Sort branch changes:
--   * mean_swipe_ms 0-1100 (the item window now ramps 1100 -> 600 ms; was 900 -> 450, so 0-900).
-- The other Swipe Sort checks do not depend on the window and are unchanged: ss.too_many
-- (correct x (mean_swipe_ms + 150) <= 30150: every correct item plus its 150 ms gap still has to
-- fit in the 30 s clock), the formula band (22 net .. 22 net + 60) and missed <= 80 (an idle player
-- now misses 30 items, was 37). Every other game's branch is unchanged. The server still never
-- recomputes a score (ADR-113).
--
-- Additive only: no table or row changes; the bounds only widen, so every row accepted before is
-- still accepted (phones on the previous bundle keep saving during the rollout).

create or replace function private.score_bounds_violation(
  p_game public.game_id, p_score integer, p_duration_ms integer, p_raw jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare
  arr     jsonb;
  e       jsonb;
  targets integer[] := array[5000, 10000, 7000];
  ids     text[] := array[]::text[];
  v_int   bigint;
  v_bool  boolean;
  lvl     bigint;
  gap     bigint;
  ended   text;
  eps     numeric;
  sweep   numeric;
  sms     bigint;
  inv     bigint;
  tout    boolean;
  any_correct boolean := false;
  -- Close the Brackets / Color Clash (ADR-134)
  n_solved bigint;
  n_failed bigint;
  n_tmo    bigint;
  s_len    bigint;
  n_ok     bigint;
  n_bad    bigint;
  rt       bigint;
  net      bigint;
  -- How Many? / Swipe Sort / Pairs (ADR-136; How Many? bands retuned by ADR-138)
  hm_lo    integer[] := array[4, 9, 14];         -- true_count band per flash (ADR-138)
  hm_hi    integer[] := array[7, 13, 18];
  -- The pre-ADR-138 bands stay accepted so phones still on the previously deployed bundle keep
  -- saving during the rollout (a phone that loaded the old bundle plays the old bands until reload).
  hm_old_lo integer[] := array[8, 20, 40];
  hm_old_hi integer[] := array[15, 35, 70];
  hm_w     numeric[] := array[0.30, 0.40, 0.50]; -- W_i: relative error that scores 0
  n_true   bigint;
  guess    bigint;
  a_ms     bigint;
  rel      numeric;
  s_sum    numeric;
  n_miss   bigint;
  n_match  bigint;
  clr      bigint;
  base     numeric;
begin
  -- ---------------- Odd One Out ----------------
  if p_game = 'odd_one_out' then
    if jsonb_typeof(p_raw) is distinct from 'object' then return 'ooo.shape'; end if;
    arr := p_raw -> 'grids';
    if jsonb_typeof(arr) is distinct from 'array' then return 'ooo.shape'; end if;
    if jsonb_array_length(arr) <> 3 then return 'ooo.shape'; end if;
    for i in 0..2 loop
      e := arr -> i;
      if jsonb_typeof(e) is distinct from 'object' then return 'ooo.shape'; end if;
      if private.j_int(e -> 'size') is distinct from (4 + i) then return 'ooo.shape'; end if;  -- sizes [4,5,6]
      if private.j_int(e -> 'find_ms') is null
         or private.j_int(e -> 'wrong_taps') is null
         or private.j_bool(e -> 'timed_out') is null then
        return 'ooo.shape';
      end if;
    end loop;
    -- wrong_taps 0-50
    for i in 0..2 loop
      if private.j_int(arr -> i -> 'wrong_taps') not between 0 and 50 then return 'ooo.taps'; end if;
    end loop;
    -- not timed out: find_ms 250-20000
    for i in 0..2 loop
      if not private.j_bool(arr -> i -> 'timed_out')
         and private.j_int(arr -> i -> 'find_ms') not between 250 and 20000 then
        return 'ooo.find_ms';
      end if;
    end loop;
    -- timed out: find_ms = 20000
    for i in 0..2 loop
      if private.j_bool(arr -> i -> 'timed_out')
         and private.j_int(arr -> i -> 'find_ms') <> 20000 then
        return 'ooo.timeout';
      end if;
    end loop;
    return null;

  -- ---------------- Stop the Clock ----------------
  elsif p_game = 'stop_the_clock' then
    if jsonb_typeof(p_raw) is distinct from 'object' then return 'stc.shape'; end if;
    arr := p_raw -> 'attempts';
    if jsonb_typeof(arr) is distinct from 'array' then return 'stc.shape'; end if;
    if jsonb_array_length(arr) <> 3 then return 'stc.shape'; end if;
    for i in 0..2 loop
      e := arr -> i;
      if jsonb_typeof(e) is distinct from 'object' then return 'stc.shape'; end if;
      if private.j_int(e -> 'target_ms') is distinct from targets[i + 1] then return 'stc.shape'; end if;
      if not private.j_is_int_or_null(e, 'measured_ms')
         or private.j_bool(e -> 'missed_start') is null then
        return 'stc.shape';
      end if;
    end loop;
    -- measured_ms null iff missed_start
    for i in 0..2 loop
      e := arr -> i;
      if (jsonb_typeof(e -> 'measured_ms') = 'null') <> private.j_bool(e -> 'missed_start') then
        return 'stc.missed';
      end if;
    end loop;
    -- measured_ms 0 .. target_ms + 10000
    for i in 0..2 loop
      v_int := private.j_int(arr -> i -> 'measured_ms');
      if v_int is not null and v_int not between 0 and targets[i + 1] + 10000 then
        return 'stc.range';
      end if;
    end loop;
    -- score <= 990 (total error >= 60 ms)
    if p_score > 990 then return 'stc.score_above_990'; end if;
    return null;

  -- ---------------- Simon ----------------
  elsif p_game = 'simon' then
    if jsonb_typeof(p_raw) is distinct from 'object' then return 'simon.shape'; end if;
    lvl := private.j_int(p_raw -> 'level');
    if lvl is null
       or not private.j_is_int_or_null(p_raw, 'avg_gap_ms')
       or private.j_int(p_raw -> 'taps') is null
       or jsonb_typeof(p_raw -> 'ended') is distinct from 'string' then
      return 'simon.shape';
    end if;
    ended := p_raw ->> 'ended';
    if ended not in ('mistake', 'timeout', 'cap', 'won') then return 'simon.shape'; end if;
    gap := private.j_int(p_raw -> 'avg_gap_ms');
    -- level is 0 or 3-15
    if not (lvl = 0 or lvl between 3 and 15) then return 'simon.level'; end if;
    -- level 0 => score 0
    if lvl = 0 and p_score <> 0 then return 'simon.zero'; end if;
    if lvl >= 3 then
      -- avg_gap_ms >= 120
      if gap is null or gap < 120 then return 'simon.gap'; end if;
      -- 0 <= score - 64 * level <= 40
      if p_score - 64 * lvl not between 0 and 40 then return 'simon.formula_band'; end if;
    end if;
    -- ended = 'won' <=> level = 15
    if (ended = 'won') <> (lvl = 15) then return 'simon.won'; end if;
    -- duration_ms >= min_playback_ms(level)
    if p_duration_ms < private.simon_min_playback_ms(lvl::integer) then return 'simon.too_fast'; end if;
    return null;

  -- ---------------- Perfect Circle ----------------
  elsif p_game = 'perfect_circle' then
    if jsonb_typeof(p_raw) is distinct from 'object' then return 'pc.shape'; end if;
    if not private.j_is_num_or_null(p_raw, 'epsilon')
       or not private.j_is_num_or_null(p_raw, 'sweep_deg')
       or not private.j_is_num_or_null(p_raw, 'diameter_px')
       or not private.j_is_int_or_null(p_raw, 'stroke_ms')
       or private.j_int(p_raw -> 'invalid_strokes') is null
       or private.j_bool(p_raw -> 'timed_out') is null then
      return 'pc.shape';
    end if;
    inv   := private.j_int(p_raw -> 'invalid_strokes');
    tout  := private.j_bool(p_raw -> 'timed_out');
    eps   := private.j_num(p_raw -> 'epsilon');
    sweep := private.j_num(p_raw -> 'sweep_deg');
    sms   := private.j_int(p_raw -> 'stroke_ms');
    -- invalid_strokes 0-4, and 0-3 unless timed out
    if inv not between 0 and 4 or (not tout and inv > 3) then return 'pc.invalid'; end if;
    if tout then
      -- timed out => score 0
      if p_score <> 0 then return 'pc.timeout'; end if;
    else
      -- epsilon >= 0.005
      if eps is null or eps < 0.005 then return 'pc.too_perfect'; end if;
      -- sweep_deg 300-450
      if sweep is null or sweep not between 300 and 450 then return 'pc.sweep'; end if;
      -- stroke_ms 300-10000
      if sms is null or sms not between 300 and 10000 then return 'pc.stroke_ms'; end if;
      -- score <= 975
      if p_score > 975 then return 'pc.score_above_975'; end if;
    end if;
    return null;

  -- ---------------- Trivia ----------------
  elsif p_game = 'trivia' then
    if jsonb_typeof(p_raw) is distinct from 'object' then return 'trivia.shape'; end if;
    arr := p_raw -> 'questions';
    if jsonb_typeof(arr) is distinct from 'array' then return 'trivia.shape'; end if;
    if jsonb_array_length(arr) <> 5 then return 'trivia.shape'; end if;
    for i in 0..4 loop
      e := arr -> i;
      if jsonb_typeof(e) is distinct from 'object' then return 'trivia.shape'; end if;
      if jsonb_typeof(e -> 'id') is distinct from 'string' or (e ->> 'id') = '' then return 'trivia.shape'; end if;
      if private.j_bool(e -> 'correct') is null
         or not private.j_is_int_or_null(e, 'answer_ms')
         or private.j_bool(e -> 'timed_out') is null then
        return 'trivia.shape';
      end if;
      if (e ->> 'id') = any (ids) then return 'trivia.shape'; end if;  -- distinct ids
      ids := ids || (e ->> 'id');
    end loop;
    -- answer_ms null iff timed out
    for i in 0..4 loop
      e := arr -> i;
      if (jsonb_typeof(e -> 'answer_ms') = 'null') <> private.j_bool(e -> 'timed_out') then
        return 'trivia.timeout';
      end if;
    end loop;
    -- answer_ms 0-10000
    for i in 0..4 loop
      v_int := private.j_int(arr -> i -> 'answer_ms');
      if v_int is not null and v_int not between 0 and 10000 then return 'trivia.range'; end if;
    end loop;
    -- correct => answer_ms >= 250 (a correct answer must have been given, so not null)
    for i in 0..4 loop
      e := arr -> i;
      v_bool := private.j_bool(e -> 'correct');
      if v_bool then
        any_correct := true;
        v_int := private.j_int(e -> 'answer_ms');
        if v_int is null or v_int < 250 then return 'trivia.too_fast'; end if;
      end if;
    end loop;
    -- no correct answers => score 0
    if not any_correct and p_score <> 0 then return 'trivia.zero'; end if;
    -- score <= 988
    if p_score > 988 then return 'trivia.score_above_988'; end if;
    return null;

  -- ---------------- Close the Brackets (ADR-134) ----------------
  elsif p_game = 'close_brackets' then
    if jsonb_typeof(p_raw) is distinct from 'object' then return 'cb.shape'; end if;
    if private.j_int(p_raw -> 'solved') is null
       or private.j_int(p_raw -> 'failed') is null
       or private.j_int(p_raw -> 'timeouts') is null
       or not private.j_is_int_or_null(p_raw, 'solve_ms') then
      return 'cb.shape';
    end if;
    n_solved := private.j_int(p_raw -> 'solved');
    n_failed := private.j_int(p_raw -> 'failed');
    n_tmo    := private.j_int(p_raw -> 'timeouts');
    sms      := private.j_int(p_raw -> 'solve_ms');
    -- solved 0-30, failed 0-50, timeouts 0-3, solve_ms 0-30000
    if n_solved not between 0 and 30
       or n_failed not between 0 and 50
       or n_tmo not between 0 and 3
       or (sms is not null and sms not between 0 and 30000) then
      return 'cb.range';
    end if;
    -- solve_ms null iff solved = 0
    if (sms is null) <> (n_solved = 0) then return 'cb.solve_ms'; end if;
    -- solved = 0 => score 0
    if n_solved = 0 then
      if p_score <> 0 then return 'cb.zero'; end if;
      return null;
    end if;
    -- S(n), the sum of the solved lengths 2, 3, ..., 8, 8, ...: n(n+3)/2 up to 7, then 35 + 8(n-7)
    s_len := case when n_solved <= 7 then n_solved * (n_solved + 3) / 2 else 35 + 8 * (n_solved - 7) end;
    -- solve_ms >= 150 ms per solved bracket (reading included)
    if sms < 150 * s_len then return 'cb.too_fast'; end if;
    -- min(1000, 15 S) <= score <= min(1000, 15 S + 100)
    if p_score not between least(1000, 15 * s_len) and least(1000, 15 * s_len + 100) then
      return 'cb.formula_band';
    end if;
    return null;

  -- ---------------- Color Clash (ADR-134) ----------------
  elsif p_game = 'color_clash' then
    if jsonb_typeof(p_raw) is distinct from 'object' then return 'cc.shape'; end if;
    if private.j_int(p_raw -> 'correct') is null
       or private.j_int(p_raw -> 'wrong') is null
       or private.j_int(p_raw -> 'timeouts') is null
       or not private.j_is_int_or_null(p_raw, 'mean_rt_ms') then
      return 'cc.shape';
    end if;
    n_ok  := private.j_int(p_raw -> 'correct');
    n_bad := private.j_int(p_raw -> 'wrong');
    n_tmo := private.j_int(p_raw -> 'timeouts');
    rt    := private.j_int(p_raw -> 'mean_rt_ms');
    -- correct 0-100, wrong 0-100, timeouts 0-10, mean_rt_ms 0-3000
    if n_ok not between 0 and 100
       or n_bad not between 0 and 100
       or n_tmo not between 0 and 10
       or (rt is not null and rt not between 0 and 3000) then
      return 'cc.range';
    end if;
    -- mean_rt_ms null iff correct = 0
    if (rt is null) <> (n_ok = 0) then return 'cc.rt'; end if;
    -- correct = 0 => score 0
    if n_ok = 0 then
      if p_score <> 0 then return 'cc.zero'; end if;
      return null;
    end if;
    -- mean_rt_ms >= 250
    if rt < 250 then return 'cc.too_fast'; end if;
    -- the correct trials fit in the 30 s game: correct x (mean_rt_ms + 300 ms gap) <= 30300
    if n_ok * (rt + 300) > 30300 then return 'cc.too_many'; end if;
    -- clamp(25 net, 0, 1000) <= score <= clamp(25 net + 75, 0, 1000), net = correct - wrong - timeouts
    net := n_ok - n_bad - n_tmo;
    if p_score not between greatest(0, least(1000, 25 * net)) and greatest(0, least(1000, 25 * net + 75)) then
      return 'cc.formula_band';
    end if;
    return null;

  -- ---------------- How Many? (ADR-136, retuned by ADR-138) ----------------
  elsif p_game = 'how_many' then
    if jsonb_typeof(p_raw) is distinct from 'object' then return 'hm.shape'; end if;
    arr := p_raw -> 'rounds';
    if jsonb_typeof(arr) is distinct from 'array' then return 'hm.shape'; end if;
    if jsonb_array_length(arr) <> 3 then return 'hm.shape'; end if;
    for i in 0..2 loop
      e := arr -> i;
      if jsonb_typeof(e) is distinct from 'object' then return 'hm.shape'; end if;
      if private.j_int(e -> 'true_count') is null
         or not private.j_is_int_or_null(e, 'guess')
         or not private.j_is_int_or_null(e, 'answer_ms')
         or private.j_bool(e -> 'timed_out') is null then
        return 'hm.shape';
      end if;
    end loop;
    -- true_count in the flash's band (4-7, 9-13, 14-18; ADR-138) or its old band (8-15, 20-35, 40-70;
    -- rollout only, see hm_old_lo), guess 0-999, answer_ms 0-15000 (ADR-138; was 0-10000)
    for i in 0..2 loop
      e := arr -> i;
      n_true := private.j_int(e -> 'true_count');
      guess  := private.j_int(e -> 'guess');
      a_ms   := private.j_int(e -> 'answer_ms');
      if (n_true not between hm_lo[i + 1] and hm_hi[i + 1]
          and n_true not between hm_old_lo[i + 1] and hm_old_hi[i + 1])
         or (guess is not null and guess not between 0 and 999)
         or (a_ms is not null and a_ms not between 0 and 15000) then
        return 'hm.range';
      end if;
    end loop;
    -- answer_ms null iff timed_out; guess null => timed_out
    for i in 0..2 loop
      e := arr -> i;
      tout := private.j_bool(e -> 'timed_out');
      if (jsonb_typeof(e -> 'answer_ms') = 'null') <> tout then return 'hm.timeout'; end if;
      if jsonb_typeof(e -> 'guess') = 'null' and not tout then return 'hm.timeout'; end if;
    end loop;
    -- not timed out => answer_ms >= 300 (a digit and OK: two taps after the pad appears)
    for i in 0..2 loop
      e := arr -> i;
      if not private.j_bool(e -> 'timed_out') and private.j_int(e -> 'answer_ms') < 300 then
        return 'hm.too_fast';
      end if;
    end loop;
    -- (ADR-138: the 'hm.too_perfect' check, three exact guesses, is removed: with the smaller
    -- counts three exact guesses are normal play.)
    -- score <= round(1000 x sum(s_i) / 3) + 1,
    -- s_i = clamp(1 - max(0, rel_i - 0.05) / (W_i - 0.05), 0, 1), rel_i = |g_i - N_i| / N_i, 0 for a null guess
    s_sum := 0;
    for i in 0..2 loop
      e := arr -> i;
      guess := private.j_int(e -> 'guess');
      if guess is not null then
        n_true := private.j_int(e -> 'true_count');
        rel := abs(guess - n_true)::numeric / n_true;
        s_sum := s_sum + greatest(0, least(1, 1 - greatest(0, rel - 0.05) / (hm_w[i + 1] - 0.05)));
      end if;
    end loop;
    if p_score > round(1000 * s_sum / 3) + 1 then return 'hm.formula_band'; end if;
    return null;

  -- ---------------- Swipe Sort (ADR-136; window ADR-139) ----------------
  elsif p_game = 'swipe_sort' then
    if jsonb_typeof(p_raw) is distinct from 'object' then return 'ss.shape'; end if;
    if private.j_int(p_raw -> 'correct') is null
       or private.j_int(p_raw -> 'wrong') is null
       or private.j_int(p_raw -> 'missed') is null
       or not private.j_is_int_or_null(p_raw, 'mean_swipe_ms') then
      return 'ss.shape';
    end if;
    n_ok   := private.j_int(p_raw -> 'correct');
    n_bad  := private.j_int(p_raw -> 'wrong');
    n_miss := private.j_int(p_raw -> 'missed');
    rt     := private.j_int(p_raw -> 'mean_swipe_ms');
    -- correct 0-120, wrong 0-120, missed 0-80, mean_swipe_ms 0-1100 (the longest item window, ADR-139)
    if n_ok not between 0 and 120
       or n_bad not between 0 and 120
       or n_miss not between 0 and 80
       or (rt is not null and rt not between 0 and 1100) then
      return 'ss.range';
    end if;
    -- mean_swipe_ms null iff correct = 0
    if (rt is null) <> (n_ok = 0) then return 'ss.rt'; end if;
    -- correct = 0 => score 0
    if n_ok = 0 then
      if p_score <> 0 then return 'ss.zero'; end if;
      return null;
    end if;
    -- mean_swipe_ms >= 200 (choice reaction plus 40 px of finger travel, measured to registration)
    if rt < 200 then return 'ss.too_fast'; end if;
    -- the correct items and their 150 ms gaps fit in 30 s: correct x (mean_swipe_ms + 150) <= 30150
    if n_ok * (rt + 150) > 30150 then return 'ss.too_many'; end if;
    -- clamp(22 net, 0, 1000) <= score <= clamp(22 net + 60, 0, 1000), net = correct - wrong - missed
    net := n_ok - n_bad - n_miss;
    if p_score not between greatest(0, least(1000, 22 * net)) and greatest(0, least(1000, 22 * net + 60)) then
      return 'ss.formula_band';
    end if;
    return null;

  -- ---------------- Pairs (ADR-136) ----------------
  elsif p_game = 'pairs' then
    if jsonb_typeof(p_raw) is distinct from 'object' then return 'pr.shape'; end if;
    if private.j_int(p_raw -> 'matched') is null
       or private.j_int(p_raw -> 'misses') is null
       or not private.j_is_int_or_null(p_raw, 'clear_ms') then
      return 'pr.shape';
    end if;
    n_match := private.j_int(p_raw -> 'matched');
    n_miss  := private.j_int(p_raw -> 'misses');
    clr     := private.j_int(p_raw -> 'clear_ms');
    -- matched 0-8, misses 0-200, clear_ms 0-60000
    if n_match not between 0 and 8
       or n_miss not between 0 and 200
       or (clr is not null and clr not between 0 and 60000) then
      return 'pr.range';
    end if;
    -- clear_ms null iff matched < 8
    if (clr is null) <> (n_match < 8) then return 'pr.clear'; end if;
    -- matched = 0 => score 0
    if n_match = 0 then
      if p_score <> 0 then return 'pr.zero'; end if;
      return null;
    end if;
    -- cleared => clear_ms >= 4000 + 700 x misses (16 taps at >= 250 ms, plus every 0.7 s mismatch lock)
    if n_match = 8 and clr < 4000 + 700 * n_miss then return 'pr.too_fast'; end if;
    -- |score - clamp(round(base - 12 misses), 0, 1000)| <= 1,
    -- base = 1000 - 6 x max(0, clear_ms - 15000) / 1000 when cleared, else 730 - 80 x (8 - matched)
    if n_match = 8 then
      base := 1000 - 6 * greatest(0, clr - 15000)::numeric / 1000;
    else
      base := 730 - 80 * (8 - n_match);
    end if;
    if abs(p_score - greatest(0, least(1000, round(base - 12 * n_miss)))) > 1 then
      return 'pr.formula_band';
    end if;
    return null;
  end if;

  return 'game.unknown';
end $$;

-- Only the score trigger (SECURITY DEFINER, owner postgres) calls this; nobody else needs it.
-- create or replace keeps the existing privileges; restated explicitly.
revoke all on function private.score_bounds_violation(public.game_id, integer, integer, jsonb)
  from public, anon, authenticated;

comment on function private.score_bounds_violation(public.game_id, integer, integer, jsonb) is
  'SCORING.md section 4: null when a submission is plausible, else a reason code (GD008 detail). Ten games (ADR-136; How Many? retuned by ADR-138; Swipe Sort window ADR-139).';
