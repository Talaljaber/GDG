-- 20260925000400 Throttle wrong join codes per identity (ADR-130; docs/SECURITY.md T18).
-- Spec: docs/DATA_MODEL.md section 3 (private.join_attempts), section 5 (GD001/GD013) and section 6 (join_session).
--
-- Codes are 4 digits (ADR-111) and guesses were free: one guest could try all 9,000 in about 25 s.
-- From here on, 5 wrong codes by one auth.uid() within a rolling 60 s lock that identity out of
-- join_session for 30 s. The key is auth.uid(), never the IP: booth guests share carrier NAT.
--
-- A raise rolls back everything the call wrote, so a wrong code can't be logged and raised at the
-- same time. join_session therefore RETURNS the two throttle-related outcomes as data:
--   {"error": "GD001"}                          wrong or unknown code (logged)
--   {"error": "GD013", "retry_after_s": <int>}  locked; the code is not even looked at (not logged)
-- Success still returns {session_id, player_row_id, name, display_suffix, session_status}
-- (no "error" key). Every other failure (GD002, GD003, GD004, GD012) still raises as before.
--
-- Same signature, so create or replace keeps the function's grants; they are restated below anyway.
-- Additive only: one new table in the unexposed private schema, no change to existing rows.

-- ============ Attempt log ============
-- One row per wrong code. Read and written only inside join_session (SECURITY DEFINER, owner postgres).
-- No FK to auth.users: anonymous users are purged after the event (SECURITY.md section 6).
create table private.join_attempts (
  id         bigint generated always as identity primary key,
  player_id  uuid not null,
  at         timestamptz not null default now()
);
create index join_attempts_player_at on private.join_attempts (player_id, at);
create index join_attempts_at        on private.join_attempts (at);

comment on table private.join_attempts is
  'ADR-130: wrong join codes per auth.uid(); rows older than 10 minutes are purged by join_session.';

-- RLS on, no policies: nobody but the table owner (and so join_session) sees a row. The cloud's
-- default privileges grant ALL on new objects to anon/authenticated, and authenticated has USAGE on
-- schema private (policies call its helpers), so revoke explicitly.
alter table private.join_attempts enable row level security;
revoke all on table    private.join_attempts        from public, anon, authenticated;
revoke all on sequence private.join_attempts_id_seq from public, anon, authenticated;

-- ============ join_session ============

create or replace function public.join_session(p_code text, p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c_max_wrong constant integer  := 5;                     -- wrong codes ...
  c_window    constant interval := interval '60 seconds'; -- ... within this rolling window ...
  c_lock      constant interval := interval '30 seconds'; -- ... lock the identity for this long
  c_keep      constant interval := interval '10 minutes'; -- log rows older than this are purged
  v_uid    uuid := (select auth.uid());
  v_until  timestamptz;
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

  -- Throttle (ADR-130). One call at a time per identity, so parallel calls can't all pass the count.
  perform pg_catalog.pg_advisory_xact_lock(130, pg_catalog.hashtext(v_uid::text));

  -- Locked until 30 s after a wrong code that was the 5th (or later) wrong code within 60 s.
  -- Checked before the code: while locked, even the right code gets the wait result.
  select max(a.at) + c_lock into v_until
    from private.join_attempts a
   where a.player_id = v_uid
     and a.at > now() - c_lock
     and (select count(*) from private.join_attempts b
           where b.player_id = v_uid and b.at > a.at - c_window and b.at <= a.at) >= c_max_wrong;
  if v_until > now() then
    return jsonb_build_object(
      'error',         'GD013',
      'retry_after_s', greatest(1, ceil(extract(epoch from v_until - now())))::integer);
  end if;

  -- Code: NFKC (full-width digits), Arabic-Indic and Eastern Arabic-Indic digits to ASCII, no whitespace.
  v_code := regexp_replace(
              translate(normalize(coalesce(p_code, ''), NFKC),
                        E'\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'
                        || E'\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9',
                        '01234567890123456789'),
              '\s', '', 'g');
  if v_code ~ '^[1-9][0-9]{3}$' then
    select * into s from public.sessions
      where code = v_code and status in ('pending', 'lobby')
      for update;
  end if;

  -- Wrong, malformed or no-longer-joinable code: log it and return it as data (a raise would roll
  -- the log row back). Old rows are purged here, opportunistically; no cron.
  if s.id is null then
    delete from private.join_attempts where at < now() - c_keep;
    insert into private.join_attempts (player_id) values (v_uid);
    return jsonb_build_object('error', 'GD001');
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

revoke all on function public.join_session(text, text) from public, anon;
grant execute on function public.join_session(text, text) to authenticated;
