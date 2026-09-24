import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e against the LOCAL Supabase stack (`.env.local`), chromium
 * only. The dev server runs on its own port so it never collides with a
 * developer's `npm run dev`. See docs/TESTING.md.
 */
const PORT = 5199;

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { VITE_PUBLIC_SHORT_URL: `http://localhost:${PORT}` },
  },
});
