import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173/xq-exercices-miniapp/';
const mobileUserAgent =
  'Mozilla/5.0 (Linux; Android 15; XQ Test Device) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.{js,ts}',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview:test',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: '390x844-touch',
      use: {
        browserName: 'chromium',
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
        userAgent: mobileUserAgent,
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: '320x568-touch',
      use: {
        browserName: 'chromium',
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        userAgent: mobileUserAgent,
        viewport: { width: 320, height: 568 },
      },
    },
  ],
});
