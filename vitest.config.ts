import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      // Unit tests never talk to Supabase (the client is mocked); a fixed local value keeps
      // src/lib/supabase.ts from failing to load where no .env.local exists (CI, clean clones).
      env: { SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unit-test' },
      // Playwright specs run with `npm run e2e`, not Vitest. docs/ holds no unit tests: the
      // investigation folders keep their probe scripts there as records (docs/investigations/).
      exclude: [...configDefaults.exclude, 'e2e/**', 'docs/**'],
    },
  }),
);
