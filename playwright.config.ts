import { defineConfig, devices } from '@playwright/test'

/**
 * Smoke suite against demo mode: no Firebase, the localStorage repo with its seeded groups.
 * `vite --mode e2e` never reads .env.production, and the empty VITE_FIREBASE_* values below win
 * over any .env.local (process env beats .env files in Vite), so the suite can never reach a
 * real project. The app is mobile-first, so it runs as a Pixel 7.
 *
 * Locally: `npx playwright install chromium` once, then `npx playwright test`. CI installs it with
 * `npx playwright install --with-deps chromium`. Where a Chromium is preinstalled for a different
 * Playwright version (a cloud container), point E2E_CHROMIUM at its binary instead of downloading.
 * E2E_PORT picks another port when 5174 is taken.
 */
const PORT = Number(process.env.E2E_PORT ?? 5174)
const BASE = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  // Lazy routes compile on first visit in the dev server, so give assertions a little room.
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results',
  use: { baseURL: BASE, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'android-chromium',
      use: { ...devices['Pixel 7'], launchOptions: process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {} },
    },
  ],
  webServer: {
    command: `npx vite --mode e2e --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
    env: { VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_PROJECT_ID: '', VITE_FIREBASE_APP_ID: '', VITE_USE_EMULATORS: 'false', VITE_APPCHECK_SITE_KEY: '' },
  },
})
