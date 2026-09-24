-- 20260925000300 A session is exactly 3 distinct games (ADR-012, ADR-120; PHASES.md Phase 3).
-- Spec: docs/DATA_MODEL.md section 3 (sessions.lineup) and section 6 (lineup rule).
--
-- Phases 1-2 ran 1-round sessions, so sessions.lineup allowed 1-3 games. From here on:
--   * the functions accept only exactly 3 distinct games (private.lineup_is_valid, used by
--     admin_open_lobby and admin_set_lineup; admin_new_session copies the last lineup);
--   * a new check constraint sessions_lineup_three requires cardinality(lineup) = 3.
--
-- Existing rows are history and are left as they are: the constraint is added NOT VALID (checked
-- for new and updated rows only) and validated only if every existing row already complies.
-- Postgres checks a CHECK constraint on every UPDATE of a row, whatever columns change, so an old
-- 1-game session that is still open (pending/lobby/results) could never be advanced or closed
-- again. Those, and only those, are closed here (status/closed_at only; nothing is deleted, the
-- same transition admin_new_session / admin_start_new_day make). A 1-game session that is still
-- `playing` aborts the migration: finish it first (migrations never run during play, ADR-119).
-- Closed rows are never updated again by any function, so they keep their 1-game lineups.

do $$
begin
  if exists (select 1 from public.sessions where status = 'playing' and cardinality(lineup) <> 3) then
    raise exception 'a session with a lineup of other than 3 games is playing; end it before migrating';
  end if;
end $$;

update public.sessions
   set status = 'closed', closed_at = now()
 where status in ('pending', 'lobby', 'results')
   and cardinality(lineup) <> 3;

alter table public.sessions
  add constraint sessions_lineup_three check (cardinality(lineup) = 3) not valid;

do $$
begin
  if not exists (select 1 from public.sessions where cardinality(lineup) <> 3) then
    alter table public.sessions validate constraint sessions_lineup_three;
  end if;
end $$;

-- The lineup rule for admin_open_lobby / admin_set_lineup: exactly 3 distinct, non-null games in a
-- one-dimensional array, else GD011 (was 1-3 during the slice).
create or replace function private.lineup_is_valid(p public.game_id[])
returns boolean language sql immutable set search_path = '' as $$
  select p is not null
     and coalesce(array_ndims(p), 0) = 1
     and cardinality(p) = 3
     and array_position(p, null) is null
     and private.game_array_is_distinct(p)
$$;

comment on constraint sessions_lineup_three on public.sessions is
  'ADR-012: exactly 3 distinct games (distinctness: the original lineup check). NOT VALID when older 1-game rows exist.';
