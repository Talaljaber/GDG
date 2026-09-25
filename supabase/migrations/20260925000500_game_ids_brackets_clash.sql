-- 20260925000500 Two new games in the pool: Close the Brackets and Color Clash (ADR-134).
-- Spec: docs/DATA_MODEL.md section 2 (enums), docs/games/close-brackets.md, docs/games/color-clash.md.
--
-- Additive only: two new labels at the end of public.game_id; no existing row, lineup or label
-- changes. A new enum label can't be used in the transaction that adds it (Postgres: "unsafe use of
-- new value"), so the score bounds for these games are in the next migration,
-- 20260925000600_score_bounds_brackets_clash.sql. Until that one runs, a score for either game fails
-- with GD008 'game.unknown' (the bounds function's fallthrough), never silently passes.
-- No grants change: an enum type carries no privileges of its own here.

alter type public.game_id add value if not exists 'close_brackets';
alter type public.game_id add value if not exists 'color_clash';
