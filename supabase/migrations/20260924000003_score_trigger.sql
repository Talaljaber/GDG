-- 0003 Score trigger: bounds function, fill-and-validate trigger, mark-finished trigger.
-- Spec: docs/DATA_MODEL.md section 5; bounds and reason codes: docs/SCORING.md section 4 (ADR-113).
-- The server never recomputes a score; it only rejects impossible submissions.

-- ============ JSON helpers (tolerant: never raise, return null on a wrong type) ============

-- Integer value of a JSON number with no fractional part (null otherwise).
create function private.j_int(j jsonb)
returns bigint language plpgsql immutable set search_path = '' as $$
declare n numeric;
begin
  if jsonb_typeof(j) is distinct from 'number' then return null; end if;
  n := (j #>> '{}')::numeric;
  if n <> trunc(n) or abs(n) > 2147483647 then return null; end if;
  return n::bigint;
end $$;

-- Numeric value of a JSON number (null otherwise).
create function private.j_num(j jsonb)
returns numeric language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(j) is distinct from 'number' then return null; end if;
  return (j #>> '{}')::numeric;
end $$;

-- Boolean value of a JSON boolean (null otherwise).
create function private.j_bool(j jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(j) is distinct from 'boolean' then return null; end if;
  return (j #>> '{}')::boolean;
end $$;

-- Key k of object o is present and is JSON null or an integer.
create function private.j_is_int_or_null(o jsonb, k text)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(o) is distinct from 'object' or not (o ? k) then return false; end if;
  return jsonb_typeof(o -> k) = 'null' or private.j_int(o -> k) is not null;
end $$;

-- Key k of object o is present and is JSON null or a number.
create function private.j_is_num_or_null(o jsonb, k text)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(o) is distinct from 'object' or not (o ? k) then return false; end if;
  return jsonb_typeof(o -> k) in ('null', 'number');
end $$;

-- Simon: minimum total playback time up to level L (SCORING.md section 4):
--   min_playback_ms(L) = sum_{k=3..L} k * (max(250, 450 - 20*(k-3)) + 150); 0 for L < 3.
--   e.g. 26720 ms for L = 10, 53400 ms for L = 15.
create function private.simon_min_playback_ms(p_level integer)
returns integer language sql immutable set search_path = '' as $$
  select coalesce(sum(k * (greatest(250, 450 - 20 * (k - 3)) + 150)), 0)::integer
  from generate_series(3, coalesce(p_level, 0)) k
$$;

-- ============ Bounds ============
-- Returns null when the submission is plausible, or a short reason code (SCORING.md section 4).
-- One branch per game, one check per bound, in the order of the SCORING.md section 4 table.
-- A raw value that is not the game's JSON shape (not an object, missing keys, wrong types)
-- fails with '<game prefix>.shape'.
create function private.score_bounds_violation(
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
  end if;

  return 'game.unknown';
end $$;

-- ============ Triggers ============
create function private.scores_fill_and_validate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r  public.rounds%rowtype;
  p  public.players%rowtype;
  s  public.sessions%rowtype;
  why text;
begin
  select * into r from public.rounds where id = new.round_id;
  if not found then raise exception 'not_in_session' using errcode = 'GD005'; end if;
  select * into s from public.sessions where id = r.session_id;
  select * into p from public.players
    where session_id = r.session_id and player_id = new.player_id;
  if not found or p.status = 'removed' then
    raise exception 'not_in_session' using errcode = 'GD005';
  end if;
  if r.status = 'upcoming' then
    raise exception 'round_not_open' using errcode = 'GD006';
  end if;
  if r.status = 'done' and now() > r.ended_at + interval '15 seconds' then
    raise exception 'round_closed' using errcode = 'GD007';
  end if;

  -- trusted columns (client values are ignored)
  new.session_id     := r.session_id;
  new.event_day_id   := s.event_day_id;
  new.game           := r.game;
  new.player_row_id  := p.id;
  new.name           := p.name;
  new.name_key       := p.name_key;
  new.display_suffix := p.display_suffix;
  new.created_at     := now();

  why := private.score_bounds_violation(r.game, new.score, new.duration_ms, new.raw);
  if why is not null then
    raise exception 'impossible_score' using errcode = 'GD008', detail = why;
  end if;
  return new;
end $$;

create trigger scores_fill_and_validate
  before insert on public.scores
  for each row execute function private.scores_fill_and_validate();

-- After a score lands, mark the player finished for that round (keeps the host's "x/y finished" honest).
create function private.scores_mark_finished()
returns trigger language plpgsql security definer set search_path = '' as $$
declare rn smallint;
begin
  select round_no into rn from public.rounds where id = new.round_id;
  update public.players set progress = 'finished', progress_round = rn where id = new.player_row_id;
  return null;
end $$;

create trigger scores_mark_finished
  after insert on public.scores
  for each row execute function private.scores_mark_finished();
