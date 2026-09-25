-- 20260925000700 Three new games in the pool: How Many?, Swipe Sort and Pairs (ADR-136).
-- Spec: docs/DATA_MODEL.md section 3 (enum notes), docs/games/how-many.md, docs/games/swipe-sort.md,
-- docs/games/pairs.md, docs/plans/games-v3.md section 7.1.
--
-- Additive only: three new labels at the end of public.game_id; no existing row, lineup or label
-- changes. A new enum label can't be used in the transaction that adds it (Postgres: "unsafe use of
-- new value"), so the score bounds for these games are in the next migration,
-- 20260925000800_score_bounds_v3.sql. Until that one runs, a score for any of the three fails
-- with GD008 'game.unknown' (the bounds function's fallthrough), never silently passes.
-- No grants change: an enum type carries no privileges of its own here.

alter type public.game_id add value if not exists 'how_many';
alter type public.game_id add value if not exists 'swipe_sort';
alter type public.game_id add value if not exists 'pairs';
