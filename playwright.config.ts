import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright configuration for testing Chrome Extension
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/extension',

  // Test timeout
  timeout: 60000,

  // Expect timeout for assertions
  expect: {
    timeout: 10000
  },

  // Run tests in files in parallel
  fullyParallel: false,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Reporter to use
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL for backend API
    baseURL: 'http://localhost:3000',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium-extension',
      use: {
        ...devices['Desktop Chrome'],
        // Chrome Extension testing requires specific launch options
        launchOptions: {
          args: [
            `--disable-extensions-except=${path.resolve(__dirname, 'src/extension')}`,
            `--load-extension=${path.resolve(__dirname, 'src/extension')}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
          ],
        },
      },
    },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:3000/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      AI_WORKER_ENABLED: 'false',
      GOOGLE_API_KEY: 'dummy_key_for_testing',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/lemonade_test?directConnection=true',
    }
  },
});
