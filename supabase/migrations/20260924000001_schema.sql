-- 0001 Schema: types, private schema + immutable helpers, tables.
-- Spec: docs/DATA_MODEL.md section 3. Name rules: docs/SCORING.md section 6.
-- This file is ASCII only: non-ASCII characters are written as \uXXXX escapes
-- (regex escapes in plain literals, E'' escapes for translate()).

-- ============ Types ============
create type public.game_id          as enum ('odd_one_out','stop_the_clock','simon','perfect_circle','trivia');
create type public.session_status   as enum ('pending','lobby','playing','results','closed');
create type public.round_status     as enum ('upcoming','playing','done');
create type public.round_end_reason as enum ('all_finished','time_cap','force_end');
create type public.player_status    as enum ('joined','removed');
create type public.player_progress  as enum ('waiting','playing','finished');
create type public.term_match       as enum ('word','substring');

-- ============ Private schema (not exposed via the Data API) ============
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;   -- so RLS policies evaluated as the guest can call the helpers

-- ============ Helpers (immutable, used in constraints) ============
create function private.game_array_is_distinct(a public.game_id[])
returns boolean language sql immutable set search_path = '' as $$
  select cardinality(a) = (select count(distinct x) from unnest(a) x)
$$;

-- Cleaned display name: NFKC, strip Arabic diacritics (tashkeel U+064B-U+065F, U+0670) and tatweel (U+0640),
-- collapse whitespace, trim. Rules and test vectors: SCORING.md section 6.
create function private.clean_name(p text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
           regexp_replace(normalize(coalesce(p, ''), NFKC), '[\u064B-\u065F\u0670\u0640]', '', 'g'),
           '\s+', ' ', 'g'))
$$;

-- Name key: cleaned name, lower-cased, Arabic letter variants unified, all digits to ASCII.
--   U+0623 U+0625 U+0622 U+0671 -> U+0627 (alef), U+0649 -> U+064A (yeh), U+0629 -> U+0647 (heh),
--   U+0624 -> U+0648 (waw), U+0626 -> U+064A (yeh), U+0660-U+0669 and U+06F0-U+06F9 -> 0-9.
create function private.name_key(p text)
returns text language sql immutable set search_path = '' as $$
  select translate(lower(private.clean_name(p)),
                   E'\u0623\u0625\u0622\u0671\u0649\u0629\u0624\u0626'
                   || E'\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'
                   || E'\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9',
                   E'\u0627\u0627\u0627\u0627\u064A\u0647\u0648\u064A'
                   || '01234567890123456789')
$$;

-- ============ Tables ============
create table public.event_days (
  id          uuid primary key default gen_random_uuid(),
  label       text not null check (char_length(label) between 1 and 40),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  is_current  boolean not null default true,
  check (not (is_current and ended_at is not null))
);
create unique index event_days_one_current on public.event_days ((true)) where is_current;

create table public.sessions (
  id                  uuid primary key default gen_random_uuid(),
  event_day_id        uuid not null references public.event_days(id),
  code                text not null check (code ~ '^[1-9][0-9]{3}$'),
  status              public.session_status not null,
  lineup              public.game_id[] not null
                        check (cardinality(lineup) between 1 and 3 and private.game_array_is_distinct(lineup)),
  current_round       smallint check (current_round between 1 and 3),
  created_at          timestamptz not null default now(),
  opened_at           timestamptz,           -- became 'lobby'
  started_at          timestamptz,           -- became 'playing'
  ended_at            timestamptz,           -- became 'results'
  day_board_shown_at  timestamptz,           -- host tapped Show day board
  closed_at           timestamptz            -- became 'closed'
);
-- At most one joinable and one running session at any time (ADR-108).
create unique index sessions_one_joinable on public.sessions ((true)) where status in ('pending','lobby');
create unique index sessions_one_running  on public.sessions ((true)) where status in ('playing','results');
create index sessions_day_idx on public.sessions (event_day_id, created_at);

create table public.rounds (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id),
  round_no    smallint not null check (round_no between 1 and 3),
  game        public.game_id not null,
  status      public.round_status not null default 'upcoming',
  started_at  timestamptz,
  ended_at    timestamptz,
  end_reason  public.round_end_reason,
  unique (session_id, round_no),
  unique (session_id, game),
  check ((status = 'done') = (ended_at is not null and end_reason is not null))
);

create table public.players (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id),
  player_id       uuid not null,   -- = auth.uid() of the anonymous user. No FK to auth.users on purpose:
                                   -- history must survive any cleanup of anonymous users.
  name            text not null check (char_length(name) between 1 and 12),
  name_key        text not null,
  display_suffix  smallint check (display_suffix >= 2),
  status          public.player_status   not null default 'joined',
  progress        public.player_progress not null default 'waiting',
  progress_round  smallint check (progress_round between 1 and 3),
  joined_at       timestamptz not null default now(),
  removed_at      timestamptz,
  unique (session_id, player_id),
  check ((status = 'removed') = (removed_at is not null))
);
create index players_session_key_idx on public.players (session_id, name_key);
create index players_player_idx      on public.players (player_id);

create table public.scores (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references public.rounds(id),
  player_id       uuid not null,                              -- must equal auth.uid() (RLS)
  score           integer not null check (score between 0 and 1000),
  duration_ms     integer not null check (duration_ms between 0 and 130000),
  raw             jsonb   not null,                           -- per-game shape, SCORING.md section 4
  client_version  text    check (char_length(client_version) <= 40),
  -- trusted columns, always overwritten by trigger scores_fill_and_validate:
  session_id      uuid not null references public.sessions(id),
  event_day_id    uuid not null references public.event_days(id),
  player_row_id   uuid not null references public.players(id),
  game            public.game_id not null,
  name            text not null,
  name_key        text not null,
  display_suffix  smallint,
  created_at      timestamptz not null default now(),
  unique (round_id, player_id)                                -- ADR-019: one score per player per round
);
create index scores_day_board_idx on public.scores (event_day_id, game, name_key, score desc, created_at);
create index scores_session_idx   on public.scores (session_id);
create index scores_player_row_idx on public.scores (player_row_id);

create table public.hidden_names (
  name_key   text primary key,
  note       text check (char_length(note) <= 200),
  hidden_at  timestamptz not null default now()
);

create table public.blocked_terms (
  term_key   text primary key check (char_length(term_key) >= 1),  -- stored as private.name_key(term), spaces removed;
                                                                   -- never empty (an empty substring term would block every name)
  match      public.term_match not null default 'word',
  lang       text not null check (lang in ('ar','en','any')),
  added_at   timestamptz not null default now()
);

create table public.keepalive (
  id         smallint primary key check (id = 1),
  pinged_at  timestamptz not null default now()
);
insert into public.keepalive (id) values (1);
