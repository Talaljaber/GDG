-- 0007 Seed data. Spec: docs/DATA_MODEL.md section 10.

-- One current event day.
insert into public.event_days (label, is_current)
select 'Day 1', true
where not exists (select 1 from public.event_days where is_current);

-- blocked_terms starter list.
-- ============================================================================================
-- PLACEHOLDER ONLY. The real Arabic + English list is owned by the team (OQ-13) and replaces
-- this in a follow-up migration (or is edited live from the dashboard, ADR-114). These few
-- obvious English terms exist so the blocklist path is exercised end to end.
-- Stored with admin_add_blocked_term semantics: private.name_key(term) with spaces removed.
-- Whole-word ('word') matching, so e.g. 'ass' does not block Hassan, Assem, Anass, Cassandra.
-- ============================================================================================
insert into public.blocked_terms (term_key, match, lang)
select replace(private.name_key(t), ' ', ''), 'word', 'en'
from unnest(array['fuck', 'shit', 'bitch', 'cunt', 'ass', 'porn']) as t
on conflict (term_key) do nothing;
