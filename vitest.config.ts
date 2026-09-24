import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      // Playwright specs run with `npm run e2e`, not Vitest.
      exclude: [...configDefaults.exclude, 'e2e/**'],
    },
  }),
);
