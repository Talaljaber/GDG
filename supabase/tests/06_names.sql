-- TESTING.md section 3, "Names": the SCORING.md section 6 vectors in SQL, the blocklist "must pass" list
-- (real names containing short English terms), and blocklist matching rules (DATA_MODEL.md section 6).
-- Non-ASCII test input is written with U&'' escapes so this file stays ASCII.
begin;
-- isolate from local dev/e2e data (rolled back with the transaction)
truncate public.scores, public.players, public.rounds, public.sessions, public.hidden_names restart identity cascade;
create extension if not exists pgtap with schema extensions;

-- ---------- helpers (same preamble in every test file) ----------
create function pg_temp.login(p_sub uuid, p_admin boolean default false) returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object(
      'sub', p_sub, 'role', 'authenticated', 'aud', 'authenticated', 'is_anonymous', not p_admin,
      'app_metadata', case when p_admin then json_build_object('provider', 'email', 'role', 'admin')
                           else json_build_object('provider', 'anonymous') end)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.as_admin() returns void language sql as $$
  select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001', true) $$;
create function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.v(k text) returns text language sql stable as $$ select current_setting('t.' || k) $$;
create function pg_temp.setv(k text, val text) returns text language sql as $$ select set_config('t.' || k, val, true) $$;
-- ------------------------------------------------------------------

-- Join the open lobby as a fresh anonymous user. Returns 'ok:<stored name>:<suffix>' or the SQLSTATE.
create function pg_temp.join_new(p_name text) returns text language plpgsql as $$
declare j jsonb;
begin
  perform pg_temp.login(gen_random_uuid());
  j := public.join_session(pg_temp.v('code'), p_name);
  return 'ok:' || (j ->> 'name') || ':' || coalesce(j ->> 'display_suffix', '-');
exception when others then
  return sqlstate;
end $$;

select plan(55);

select pg_temp.as_admin();
select pg_temp.setv('code', s.code) from public.admin_open_lobby('{stop_the_clock}') s;
select pg_temp.as_postgres();

-- ============ SCORING.md section 6 vectors: clean + key ============
create temp table vec (i text, c text, k text, d text);
insert into vec
select * from (values
  ('  Sara  ',                                                        'Sara',                          'sara',                           '"  Sara  "'),
  ('SARA',                                                            'SARA',                          'sara',                           '"SARA"'),
  (U&'\0623\062D\0645\062F',                                          U&'\0623\062D\0645\062F',        U&'\0627\062D\0645\062F',         'hamza alef -> alef in key'),
  (U&'\0627\062D\0645\062F',                                          U&'\0627\062D\0645\062F',        U&'\0627\062D\0645\062F',         'plain alef'),
  (U&'\0645\064F\062D\064E\0645\0651\064E\062F',                      U&'\0645\062D\0645\062F',        U&'\0645\062D\0645\062F',         'tashkeel stripped'),
  (U&'Z\00E9 99',                                                     U&'Z\00E9 99',                   U&'z\00E9 99',                    '"Ze 99" (Latin-1)'),
  (U&'Lina\0663',                                                     U&'Lina\0663',                   'lina3',                          'Arabic-Indic digit -> ASCII in key'),
  ('Hassan',                                                          'Hassan',                        'hassan',                         '"Hassan"')
) t(i, c, k, d);
select is(private.clean_name(i), c, 'clean: ' || d) from vec;
select is(private.name_key(i), k, 'key: ' || d) from vec;

-- other normalisation details
select is(private.clean_name(U&'Sa\0640ra'), 'Sara', 'clean: tatweel removed');
select is(private.clean_name(U&'Sara\00A0 \3000Ali'), 'Sara Ali', 'clean: NFKC spaces collapsed to one space');
select is(private.clean_name(U&'\0627\0654\062D\0645\062F'), U&'\0623\062D\0645\062F', 'clean: NFKC composes alef + hamza above before diacritics are stripped');
select is(private.name_key(U&'\0649\0629\0624\0626\0671\0625\0622'), U&'\064A\0647\0648\064A\0627\0627\0627', 'key: every Arabic variant unified');
select is(private.name_key(U&'\06F1\06F2\0661\0662'), '1212', 'key: both Arabic digit sets -> ASCII');

-- ============ Validation through join_session ============
select is(pg_temp.join_new(i), w, 'join: ' || d)
from (values
  ('  Sara  ',                                 'ok:Sara:-',                          'valid "  Sara  " stored cleaned'),
  (U&'\0645\064F\062D\064E\0645\0651\064E\062F', 'ok:' || U&'\0645\062D\0645\062F' || ':-', 'valid Arabic with tashkeel stored cleaned'),
  (U&'Z\00E9 99',                              'ok:' || U&'Z\00E9 99' || ':-',       'valid Latin-1 letter + digits + space'),
  (U&'Lina\0663',                              'ok:' || U&'Lina\0663' || ':-',       'valid Arabic-Indic digit'),
  ('Abdulrahman1',                             'ok:Abdulrahman1:-',                  'valid at exactly 12 characters'),
  (U&'\0645\064F\062D\064E\0645\0651\064E\062F\0020\0639\0644\064A\064C', 'ok:' || U&'\0645\062D\0645\062F\0020\0639\0644\064A' || ':-',
                                                                                     'length counted after cleaning (15 raw, 8 cleaned)'),
  ('Abdulrahmann1',                            'GD002',                              'invalid: 13 characters'),
  ('Sam!',                                     'GD002',                              'invalid: punctuation'),
  (U&'\+01F525Ali',                            'GD002',                              'invalid: emoji'),
  ('   ',                                      'GD002',                              'invalid: only spaces'),
  (U&'\0640\0640',                             'GD002',                              'invalid: only tatweel'),
  (U&'Sa\200Cra',                              'GD002',                              'invalid: zero-width non-joiner'),
  (U&'Sara\00D7',                              'GD002',                              'invalid: multiplication sign (between Latin-1 letter ranges)'),
  (U&'\0645\062D\0645\062F\061F',              'GD002',                              'invalid: Arabic question mark'),
  (null,                                       'GD002',                              'invalid: null')
) t(i, w, d);

-- ============ Blocklist: "must pass" names (TESTING.md section 3) ============
select is(pg_temp.join_new(n), 'ok:' || n || ':-', 'must pass: ' || n)
from unnest(array['Hassan', 'Assem', 'Anass', 'Cassandra', 'Basem']) n;
select pg_temp.as_postgres();
select ok((select count(*) from public.blocked_terms where term_key = 'ass' and match = 'word') = 1,
          'the must-pass list is meaningful: the short term "ass" is on the list');

-- ============ Blocklist matching ============
select pg_temp.as_postgres();
insert into public.blocked_terms (term_key, match, lang) values
  ('badword', 'substring', 'en'),
  (replace(private.name_key(U&'\0623\0628\062C\062F'), ' ', ''), 'word', 'ar');   -- test-only Arabic term

select is(pg_temp.join_new(i), w, 'blocklist: ' || d)
from (values
  ('ass',                          'GD003',            'word: exact term'),
  ('ASS',                          'GD003',            'word: case-insensitive'),
  ('Big Ass',                      'GD003',            'word: one word of several'),
  ('a ss',                         'GD003',            'word: whole name with spaces removed'),
  ('porn',                         'GD003',            'word: another seeded term'),
  ('Sassy',                        'ok:Sassy:-',       'word: term inside a word is not blocked'),
  ('xBadWordx',                    'GD003',            'substring: inside a word'),
  ('bad word',                     'GD003',            'substring: across a space'),
  ('badwor',                       'ok:badwor:-',      'substring: partial term passes'),
  (U&'\0627\0628\062C\062F',       'GD003',            'Arabic term matched through the name key (alef variants)'),
  (U&'\0623\064E\0628\062C\062F',  'GD003',            'Arabic term matched after stripping tashkeel')
) t(i, w, d);

-- ============ Duplicate keys get display suffixes (E11) ============
select is(pg_temp.join_new(U&'\0623\062D\0645\062F'), 'ok:' || U&'\0623\062D\0645\062F' || ':-', 'suffix: first Ahmad');
select is(pg_temp.join_new(U&'\0627\062D\0645\062F'), 'ok:' || U&'\0627\062D\0645\062F' || ':2', 'suffix: alef variant shares the key -> 2');

select pg_temp.as_postgres();
select * from finish();
rollback;
