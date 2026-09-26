import { defineConfig, devices } from '@playwright/test';
import { localEnv } from '../../../../../../../../.m2/GDG/e2e/env.ts';

const PORT = 5288;
const REPO = 'c:/Users/hp/.m2/GDG';

export default defineConfig({
  testDir: '.',
  testMatch: /g1\.spec\.ts$/,
  timeout: 600_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: `${REPO}/e2e/global-setup.ts`,
  outputDir: './out',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    screenshot: 'off',
    locale: 'en-US',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    cwd: REPO,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      VITE_PUBLIC_SHORT_URL: `http://localhost:${PORT}`,
      E2E_NO_HMR: '1',
      SUPABASE_URL: localEnv().SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY: localEnv().SUPABASE_PUBLISHABLE_KEY,
    },
  },
});
