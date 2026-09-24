-- 20260925000200 Bound the size of scores.raw (Phase 6 security review; docs/SECURITY.md T16).
-- Spec: docs/DATA_MODEL.md section 3 (scores) and section 5 (the trigger ignores extra raw keys).
--
-- The bounds trigger checks the keys each game needs and ignores extra keys, and nothing limited
-- the size of the jsonb, so one guest could store several MB per score (an 8 MB raw was accepted
-- in the review). The Free plan's 500 MB database limit puts the project into read-only mode when
-- exceeded, the host downloads every raw of a round for the Stop the Clock reveal, and score inserts
-- are fanned out over Realtime. A real raw is under 500 bytes (the largest, Trivia, is about 380);
-- 4096 bytes leaves ample room for new keys.
--
-- Additive only: a CHECK constraint, added NOT VALID and validated only if every existing row
-- already complies (history is never rewritten). Violations raise 23514 (check_violation); the app
-- never sends a raw this large, so no client mapping is needed.

alter table public.scores
  add constraint scores_raw_size check (octet_length(raw::text) <= 4096) not valid;

do $$
begin
  if not exists (select 1 from public.scores where octet_length(raw::text) > 4096) then
    alter table public.scores validate constraint scores_raw_size;
  end if;
end $$;

comment on constraint scores_raw_size on public.scores is
  'SECURITY.md T16: raw (per-game evidence, SCORING.md section 4) is at most 4096 bytes as text.';
