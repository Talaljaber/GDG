-- 0004 Functions called from the browser with supabase.rpc(), plus their private helpers.
-- Spec: docs/DATA_MODEL.md section 6; transitions: docs/SESSION_LIFECYCLE.md section 2-section 3; names: docs/SCORING.md section 6.
-- Every function sets search_path = '' and schema-qualifies every name.
-- SECURITY DEFINER only for join_session and keepalive (ADR-110); everything else is SECURITY INVOKER.

-- ============ Private helpers ============

-- A lineup the functions accept: 1-3 distinct, non-null games in a one-dimensional array.
-- The app always sends exactly ROUNDS_PER_SESSION games; this is the floor (ADR-120).
create function private.lineup_is_valid(p public.game_id[])
returns boolean language sql immutable set search_path = '' as $$
  select p is not null
     and coalesce(array_ndims(p), 0) = 1
     and cardinality(p) between 1 and 3
     and array_position(p, null) is null
     and private.game_array_is_distinct(p)
$$;

-- Fresh session code: random 1000-9999; retry while it equals a joinable/running session's code or any
-- code used in the event day; after 20 tries allow reuse of a day's code that isn't joinable or running.
-- SECURITY INVOKER: called from admin functions, so it reads sessions under the admin's RLS.
create function private.new_session_code(p_day uuid)
returns text language plpgsql volatile set search_path = '' as $$
declare
  v text;
begin
  for i in 1..20 loop
    v := (1000 + floor(random() * 9000))::integer::text;
    if not exists (
      select 1 from public.sessions s
      where s.code = v
        and (s.event_day_id = p_day or s.status in ('pending', 'lobby', 'playing', 'results'))
    ) then
      return v;
    end if;
  end loop;
  for i in 1..1000 loop
    v := (1000 + floor(random() * 9000))::integer::text;
    if not exists (
      select 1 from public.sessions s
      where s.code = v and s.status in ('pending', 'lobby', 'playing', 'results')
    ) then
      return v;
    end if;
  end loop;
  raise exception 'no_free_code' using errcode = 'GD010';
end $$;

-- Membership payload returned by join_session.
create function private.join_payload(p public.players, s public.sessions)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'session_id',     s.id,
    'player_row_id',  p.id,
    'name',           p.name,
    'display_suffix', p.display_suffix,
    'session_status', s.status)
$$;

-- ============ Guest ============

create function public.join_session(p_code text, p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_code   text;
  v_name   text;
  v_key    text;
  v_count  integer;
  s        public.sessions%rowtype;
  p        public.players%rowtype;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'GD012';
  end if;

  -- Code: NFKC (full-width digits), Arabic-Indic and Eastern Arabic-Indic digits to ASCII, no whitespace.
  v_code := regexp_replace(
              translate(normalize(coalesce(p_code, ''), NFKC),
                        E'\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'
                        || E'\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9',
                        '01234567890123456789'),
              '\s', '', 'g');
  if v_code !~ '^[1-9][0-9]{3}$' then
    raise exception 'code_invalid' using errcode = 'GD001';
  end if;

  select * into s from public.sessions
    where code = v_code and status in ('pending', 'lobby')
    for update;
  if not found then
    raise exception 'code_invalid' using errcode = 'GD001';
  end if;

  -- Idempotent for the same auth.uid(): return the existing row, or refuse a removed player.
  select * into p from public.players where session_id = s.id and player_id = v_uid;
  if found then
    if p.status = 'removed' then
      raise exception 'removed' using errcode = 'GD004';
    end if;
    return private.join_payload(p, s);
  end if;

  -- Name rules: SCORING.md section 6.
  v_name := private.clean_name(p_name);
  if char_length(v_name) not between 1 and 12
     or v_name !~ '^[A-Za-z0-9\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0621-\u063A\u0641-\u064A\u0660-\u0669\u06F0-\u06F9 ]+$'
  then
    raise exception 'name_invalid' using errcode = 'GD002';
  end if;

  v_key := private.name_key(v_name);
  if exists (
    select 1 from public.blocked_terms b
    where (b.match = 'substring' and position(b.term_key in replace(v_key, ' ', '')) > 0)
       or (b.match = 'word'      and b.term_key = any (string_to_array(v_key, ' ')))
       or (b.match = 'word'      and b.term_key = replace(v_key, ' ', ''))
  ) then
    raise exception 'name_blocked' using errcode = 'GD003';
  end if;

  -- Display suffix: the n-th row (n >= 2) with this key in the session shows as "name n".
  -- Counts every row (removed ones too) so a suffix is never handed out twice.
  select count(*) into v_count from public.players where session_id = s.id and name_key = v_key;

  insert into public.players (session_id, player_id, name, name_key, display_suffix)
  values (s.id, v_uid, v_name, v_key, case when v_count + 1 >= 2 then v_count + 1 end)
  returning * into p;

  return private.join_payload(p, s);
end $$;

-- ============ Utility ============

create function public.server_now()
returns timestamptz language sql stable set search_path = '' as $$
  select now()
$$;

create function public.keepalive()
returns void language sql security definer set search_path = '' as $$
  update public.keepalive set pinged_at = now() where id = 1;
$$;

-- ============ Admin (SECURITY INVOKER; writes pass only through admin RLS policies) ============

create function public.admin_open_lobby(p_lineup public.game_id[])
returns public.sessions language plpgsql security invoker set search_path = '' as $$
declare
  v_day uuid;
  s     public.sessions%rowtype;
begin
  if not private.is_admin() then raise exception 'not_admin' using errcode = 'GD009'; end if;
  if not private.lineup_is_valid(p_lineup) then
    raise exception 'lineup_invalid' using errcode = 'GD011';
  end if;
  v_day := private.current_event_day_id();
  if v_day is null then raise exception 'no_current_day' using errcode = 'GD010'; end if;

  select * into s from public.sessions where status in ('pending', 'lobby') for update;
  if found then
    if s.status = 'pending'
       and not exists (select 1 from public.sessions where status in ('playing', 'results')) then
      update public.sessions set status = 'lobby', opened_at = now()
        where id = s.id returning * into s;
    end if;
    return s;
  end if;

  begin
    insert into public.sessions (event_day_id, code, status, lineup, opened_at)
    values (v_day, private.new_session_code(v_day), 'lobby', p_lineup, now())
    returning * into s;
  exception when unique_violation then
    -- a concurrent call (second host tab) created the joinable session first
    select * into s from public.sessions where status in ('pending', 'lobby');
  end;
  return s;
end $$;

create function public.admin_set_lineup(p_session uuid, p_lineup public.game_id[])
returns void language plpgsql security invoker set search_path = '' as $$
declare s public.sessions%rowtype;
begin
  if not private.is_admin() then raise exception 'not_admin' using errcode = 'GD009'; end if;
  if not private.lineup_is_valid(p_lineup) then
    raise exception 'lineup_invalid' using errcode = 'GD011';
  end if;
  select * into s from public.sessions where id = p_session for update;
  if not found or s.status not in ('pending', 'lobby') then
    raise exception 'invalid_state' using errcode = 'GD010';
  end if;
  update public.sessions set lineup = p_lineup where id = p_session;
end $$;

create function public.admin_remove_player(p_player_row uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  p public.players%rowtype;
  s public.sessions%rowtype;
begin
  if not private.is_admin() then raise exception 'not_admin' using errcode = 'GD009'; end if;
  select * into p from public.players where id = p_player_row;
  if not found then raise exception 'invalid_state' using errcode = 'GD010'; end if;
  select * into s from public.sessions where id = p.session_id for update;
  if s.status <> 'lobby' then raise exception 'invalid_state' using errcode = 'GD010'; end if;
  if p.status = 'removed' then return; end if;   -- idempotent
  update public.players set status = 'removed', removed_at = now() where id = p_player_row;
end $$;

create function public.admin_start_session(p_session uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  s        public.sessions%rowtype;
  v_round  uuid;
  v_next   public.sessions%rowtype;
begin
  if not private.is_admin() then raise exception 'not_admin' using errcode = 'GD009'; end if;
  select * into s from public.sessions where id = p_session for update;
  if not found or s.status <> 'lobby' then
    raise exception 'invalid_state' using errcode = 'GD010';
  end if;
  if not exists (select 1 from public.players where session_id = s.id and status = 'joined') then
    raise exception 'invalid_state' using errcode = 'GD010';
  end if;
  if exists (select 1 from public.sessions where status in ('playing', 'results')) then
    raise exception 'invalid_state' using errcode = 'GD010';   -- close the running session first
  end if;

  update public.sessions set status = 'playing', started_at = now(), current_round = 1 where id = s.id;

  for i in 1..cardinality(s.lineup) loop
    insert into public.rounds (session_id, round_no, game, status, started_at)
    values (s.id, i, s.lineup[i],
            case when i = 1 then 'playing' else 'upcoming' end::public.round_status,
            case when i = 1 then now() end);
  end loop;
  select id into v_round from public.rounds where session_id = s.id and round_no = 1;

  insert into public.sessions (event_day_id, code, status, lineup)
  values (s.event_day_id, private.new_session_code(s.event_day_id), 'pending', s.lineup)
  returning * into v_next;

  return jsonb_build_object(
    'round_id',           v_round,
    'pending_session_id', v_next.id,
    'pending_code',       v_next.code);
end $$;

create function public.admin_end_round(p_round uuid, p_reason public.round_end_reason)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_sid uuid;
  s     public.sessions%rowtype;
  r     public.rounds%rowtype;
begin
  if not private.is_admin() then raise exception 'not_admin' using errcode = 'GD009'; end if;
  if p_reason is null then raise exception 'invalid_state' using errcode = 'GD010'; end if;
  select session_id into v_sid from public.rounds where id = p_round;
  if not found then raise exception 'invalid_state' using errcode = 'GD010'; end if;
  select * into s from public.sessions where id = v_sid for update;   -- lock order: session, then round
  select * into r from public.rounds where id = p_round for update;

  if r.status = 'done' then return; end if;   -- idempotent
  if r.status <> 'playing' then raise exception 'invalid_state' using errcode = 'GD010'; end if;

  update public.rounds set status = 'done', ended_at = now(), end_reason = p_reason where id = r.id;

  if not exists (select 1 from public.rounds where session_id = s.id and round_no > r.round_no) then
    update public.sessions set status = 'results', ended_at = now(), current_round = null where id = s.id;
  end if;
end $$;

create function public.admin_start_round(p_round uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_sid uuid;
  s     public.sessions%rowtype;
  r     public.rounds%rowtype;
begin
  if not private.is_admin() then raise exception 'not_admin' using errcode = 'GD009'; end if;
  select session_id into v_sid from public.rounds where id = p_round;
  if not found then raise exception 'invalid_state' using errcode = 'GD010'; end if;
  select * into s from public.sessions where id = v_sid for update;
  select * into r from public.rounds where id = p_round for update;

  if s.status <> 'playing' or r.status <> 'upcoming' then
    raise exception 'invalid_state' using errcode = 'GD010';
  end if;
  if not exists (
    select 1 from public.rounds
    where session_id = s.id and round_no = r.round_no - 1 and status = 'done'
  ) then
    raise exception 'invalid_state' using errcode = 'GD010';
  end if;

  update public.rounds set status = 'playing', started_at = now() where id = r.id;
  update public.sessions set current_round = r.round_no where id = s.id;
end $$;

create function public.admin_show_day_board(p_session uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare s public.sessions%rowtype;
begin
  if not private.is_admin() then raise exception 'not_admin' using errcode = 'GD009'; end if;
  select * into s from public.sessions where id = p_session for update;
  if not found or s.status <> 'results' then
    raise exception 'invalid_state' using errcode = 'GD010';
  end if;
  -- idempotent: a second tap keeps the first timestamp
  update public.sessions set day_board_shown_at = coalesce(day_board_shown_at, now()) where id = s.id;
end $$;

create function public.admin_new_session()
returns public.sessions language plpgsql security invoker set search_path = '' as $$
declare
  v_day    uuid;
  run      public.sessions%rowtype;
  j        public.sessions%rowtype;
  v_lineup public.game_id[];
begin
  if not private.is_admin() then raise exception 'not_admin' using errcode = 'GD009'; end if;
  v_day := private.current_event_day_id();
  if v_day is null then raise exception 'no_current_day' using errcode = 'GD010'; end if;

  select * into run from public.sessions where status in ('playing', 'results') for update;
  if found then
    if run.status = 'playing' then raise exception 'invalid_state' using errcode = 'GD010'; end if;
    update public.sessions set status = 'closed', closed_at = now() where id = run.id;
  end if;

  select * into j from public.sessions where status in ('pending', 'lobby') for update;
  if found then
    if j.status = 'pending' then
      update public.sessions set status = 'lobby', opened_at = now() where id = j.id returning * into j;
    end if;
    return j;
  end if;

  select lineup into v_lineup from public.sessions order by created_at desc, id desc limit 1;
  if v_lineup is null then raise exception 'invalid_state' using errcode = 'GD010'; end if;

  insert into public.sessions (event_day_id, code, status, lineup, opened_at)
  values (v_day, private.new_session_code(v_day), 'lobby', v_lineup, now())
  returning * into j;
  return j;
end $$;

create function public.admin_hide_name(p_name_key text, p_note text default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'not_admin' using errcode = 'GD009'; end if;
  insert into public.hidden_names (name_key, note)
  values (private.name_key(p_name_key), p_note)
  on conflict (name_key) do update set note = coalesce(excluded.note, public.hidden_names.note);
end $$;

create function public.admin_unhide_name(p_name_key text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'not_admin' using errcode = 'GD009'; end if;
  delete from public.hidden_names where name_key = private.name_key(p_name_key);
end $$;

create function public.admin_add_blocked_term(
  p_term text, p_match public.term_match default 'word', p_lang text default 'any')
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'not_admin' using errcode = 'GD009'; end if;
  insert into public.blocked_terms (term_key, match, lang)
  values (replace(private.name_key(p_term), ' ', ''), coalesce(p_match, 'word'), coalesce(p_lang, 'any'))
  on conflict (term_key) do update set match = excluded.match, lang = excluded.lang;
end $$;

create function public.admin_remove_blocked_term(p_term_key text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'not_admin' using errcode = 'GD009'; end if;
  delete from public.blocked_terms where term_key = replace(private.name_key(p_term_key), ' ', '');
end $$;

create function public.admin_start_new_day(p_label text)
returns public.event_days language plpgsql security invoker set search_path = '' as $$
declare d public.event_days%rowtype;
begin
  if not private.is_admin() then raise exception 'not_admin' using errcode = 'GD009'; end if;
  perform 1 from public.sessions where status in ('pending', 'lobby', 'playing', 'results') for update;
  if exists (select 1 from public.sessions where status = 'playing') then
    raise exception 'invalid_state' using errcode = 'GD010';
  end if;
  update public.sessions set status = 'closed', closed_at = now()
    where status in ('results', 'pending', 'lobby');
  update public.event_days set is_current = false, ended_at = now() where is_current;
  insert into public.event_days (label) values (btrim(p_label)) returning * into d;
  return d;
end $$;

-- ============ Execute privileges ============
-- Revoked from public and anon, granted to authenticated; keepalive also to anon.
revoke all on function public.join_session(text, text)                                  from public, anon;
revoke all on function public.server_now()                                              from public, anon;
revoke all on function public.keepalive()                                               from public, anon;
revoke all on function public.admin_open_lobby(public.game_id[])                        from public, anon;
revoke all on function public.admin_set_lineup(uuid, public.game_id[])                  from public, anon;
revoke all on function public.admin_remove_player(uuid)                                 from public, anon;
revoke all on function public.admin_start_session(uuid)                                 from public, anon;
revoke all on function public.admin_end_round(uuid, public.round_end_reason)            from public, anon;
revoke all on function public.admin_start_round(uuid)                                   from public, anon;
revoke all on function public.admin_show_day_board(uuid)                                from public, anon;
revoke all on function public.admin_new_session()                                       from public, anon;
revoke all on function public.admin_hide_name(text, text)                               from public, anon;
revoke all on function public.admin_unhide_name(text)                                   from public, anon;
revoke all on function public.admin_add_blocked_term(text, public.term_match, text)     from public, anon;
revoke all on function public.admin_remove_blocked_term(text)                           from public, anon;
revoke all on function public.admin_start_new_day(text)                                 from public, anon;

grant execute on function public.join_session(text, text)                               to authenticated;
grant execute on function public.server_now()                                           to authenticated;
grant execute on function public.keepalive()                                            to authenticated, anon;
grant execute on function public.admin_open_lobby(public.game_id[])                     to authenticated;
grant execute on function public.admin_set_lineup(uuid, public.game_id[])               to authenticated;
grant execute on function public.admin_remove_player(uuid)                              to authenticated;
grant execute on function public.admin_start_session(uuid)                              to authenticated;
grant execute on function public.admin_end_round(uuid, public.round_end_reason)         to authenticated;
grant execute on function public.admin_start_round(uuid)                                to authenticated;
grant execute on function public.admin_show_day_board(uuid)                             to authenticated;
grant execute on function public.admin_new_session()                                    to authenticated;
grant execute on function public.admin_hide_name(text, text)                            to authenticated;
grant execute on function public.admin_unhide_name(text)                                to authenticated;
grant execute on function public.admin_add_blocked_term(text, public.term_match, text)  to authenticated;
grant execute on function public.admin_remove_blocked_term(text)                        to authenticated;
grant execute on function public.admin_start_new_day(text)                              to authenticated;
