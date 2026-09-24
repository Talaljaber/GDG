import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  console.error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local and fill them in.',
  );
}

/**
 * Browser client. Uses the publishable key only (ADR-125) — the secret key
 * never appears in code, CI, Netlify or scripts. Anonymous sign-in happens
 * on submit of a valid code + name, not on page load.
 */
/**
 * The big screen and dashboard keep their admin session under their own
 * storage key, so signing in at /host on a laptop that was also used as a
 * test phone never replaces (or reuses) a guest's anonymous session at /.
 */
const isAdminRoute =
  typeof window !== 'undefined' && /^\/(host|dashboard)(\/|$)/.test(window.location.pathname);

export const supabase = createClient<Database>(supabaseUrl ?? '', supabasePublishableKey ?? '', {
  auth: {
    persistSession: true,
    ...(isAdminRoute ? { storageKey: 'gdg.v1.admin-auth' } : {}),
  },
});
