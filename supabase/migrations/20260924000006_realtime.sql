-- 0006 Realtime publication. Spec: docs/DATA_MODEL.md section 8 (fan-out rule ADR-112:
-- phones subscribe only to their own session's state rows and own player row; they poll boards).
alter publication supabase_realtime
  add table public.sessions, public.rounds, public.players, public.scores, public.hidden_names;
