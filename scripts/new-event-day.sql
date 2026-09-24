-- Starts a new event day, so every day board (leaderboard) starts empty (ADR-109, ADR-023).
-- Same effect as Dashboard → Days → "Start new event day". Maintainer only: paste into the
-- Dashboard → SQL editor of the project and set the two values below.
--
-- Nothing is deleted: the old day, its sessions and scores stay in dashboard history (ADR-109).
-- Day boards only show the current day, so they are empty right after this.
-- It also closes any open lobby/pending/results session (the next session starts fresh).
-- Refuses (GD010) while a session is playing: end it on /host first.
-- Never during an event day's play; run it before the booth opens.

begin;

-- 1. Optional: rename the day being closed, e.g. so test data is obvious in history.
--    Set v_old_label to '' to keep its current label.
do $$
declare
  v_old_label text := 'Test – before event';
begin
  if v_old_label <> '' then
    update public.event_days set label = left(v_old_label, 40) where is_current;
  end if;
end $$;

-- 2. Act as the admin for this transaction only (the SQL editor runs as the owner, and the
--    admin functions check app_metadata.role = 'admin' in the JWT; ADR-101).
select set_config('request.jwt.claims',
  '{"role":"authenticated","app_metadata":{"role":"admin"}}', true);
set local role authenticated;

-- 3. Close the current day and open the new one (label: 1-40 characters).
select id, label, started_at from public.admin_start_new_day('Day 1');

commit;

-- Check: the new day is current and its day boards are empty (the app reads v_day_board for the
-- current day only; older days stay in the view for history).
select d.label, d.started_at,
       (select count(*) from public.v_day_board b where b.event_day_id = d.id) as day_board_rows,
       (select count(*) from public.event_days) as days_in_history
  from public.event_days d
 where d.is_current;
