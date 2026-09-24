import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Only these names reach the browser bundle. SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are listed
  // by full name so SUPABASE_SECRET_KEY and SUPABASE_JWKS_URL are never exposed (ADR-125).
  envPrefix: ['VITE_', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // React and supabase-js change far less often than app code; splitting them into their
        // own chunks lets a repeat guest's phone reuse the cached vendor chunk across deploys
        // (PRD §6 keeps the initial phone download under budget).
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
  // The Playwright web server (E2E_NO_HMR=1) never hot-reloads: a file saved mid-run would
  // otherwise reload every test phone and host page (playwright.config.ts).
  server: process.env.E2E_NO_HMR ? { hmr: false, watch: { ignored: ['**/*'] } } : undefined,
});
