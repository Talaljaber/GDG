-- 0005 Views. Spec: docs/DATA_MODEL.md section 7; ordering: docs/SCORING.md section 5.
-- security_invoker = true, so the caller's RLS applies. Realtime can't subscribe to views.

-- Live board for one round (and, filtered by session, the building block for session totals).
create view public.v_round_board with (security_invoker = true) as
select s.round_id, s.session_id, s.game, s.player_row_id, s.name, s.display_suffix,
       s.score, s.created_at
from public.scores s
where not exists (select 1 from public.hidden_names h where h.name_key = s.name_key);

-- Session leaderboard: total of visible round scores per player.
create view public.v_session_board with (security_invoker = true) as
select s.session_id, s.player_row_id, s.name, s.display_suffix,
       sum(s.score)::int           as total,          -- 0-3000
       count(*)::int               as rounds_scored,
       sum(s.duration_ms)::bigint  as total_duration_ms,
       min(p.joined_at)            as joined_at
from public.scores s
join public.players p on p.id = s.player_row_id
where not exists (select 1 from public.hidden_names h where h.name_key = s.name_key)
group by s.session_id, s.player_row_id, s.name, s.display_suffix;

-- Day board: best score per (event day, game, name key). Ties: earliest achieved wins (ADR-105).
create view public.v_day_board with (security_invoker = true) as
select distinct on (s.event_day_id, s.game, s.name_key)
       s.event_day_id, s.game, s.name_key, s.name, s.score, s.created_at as achieved_at
from public.scores s
where not exists (select 1 from public.hidden_names h where h.name_key = s.name_key)
order by s.event_day_id, s.game, s.name_key, s.score desc, s.created_at asc;

-- Privileges: read-only for signed-in users; nothing for anon (whatever the default privileges are).
revoke all on public.v_round_board, public.v_session_board, public.v_day_board from anon, authenticated;
grant select on public.v_round_board, public.v_session_board, public.v_day_board to authenticated;
