import { defineConfig } from '@playwright/test';

// Smoke test of the built site at a 360 px phone viewport.
export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    browserName: 'chromium',
    // Set PW_CHANNEL=msedge (or chrome) to use an installed browser instead of
    // Playwright's downloaded one, e.g. where downloaded executables are blocked.
    channel: process.env.PW_CHANNEL || undefined,
    viewport: { width: 360, height: 740 },
    hasTouch: true,
    isMobile: true,
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
