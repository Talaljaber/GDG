One file per area (`host.tsx`, `player.tsx`, `dashboard.tsx`, `components.tsx`), each exporting
`export const fixtures: Fixture[]` (type from `../Preview`). Fixtures pass fake props straight to
screen components; they never call Supabase. Dev only (see `src/dev/Preview.tsx`).
