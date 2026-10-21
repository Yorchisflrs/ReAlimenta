import { defineConfig } from '@playwright/test';

process.env.REALIMENTA_UI_RUN_ID ||= Date.now().toString(36);

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 12_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: 'docs/evidencias/ui-playwright.json' }]
  ],
  use: {
    baseURL: process.env.UI_BASE_URL || 'http://127.0.0.1:3000',
    browserName: 'chromium',
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    },
    viewport: { width: 1440, height: 1000 },
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
});
