import { test as base, chromium, BrowserContext, Page } from '@playwright/test';
import path from 'path';

/**
 * Extension test fixtures
 * Provides utilities for testing Chrome Extension
 */

type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
};

export const test = base.extend<ExtensionFixtures>({
  // Override context to load extension
  context: async ({}, use) => {
    const pathToExtension = path.resolve(__dirname, '../../src/extension');
    const context = await chromium.launchPersistentContext('', {
      headless: false, // Extensions require headed mode (headless doesn't work reliably)
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });
    await use(context);
    await context.close();
  },

  // Get extension ID
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }

    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },
});

export { expect } from '@playwright/test';

/**
 * Helper to open extension popup
 */
export async function openExtensionPopup(
  page: Page,
  extensionId: string
): Promise<Page> {
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  await page.goto(popupUrl);
  return page;
}

/**
 * Helper to wait for backend health
 */
export async function waitForBackend(page: Page, baseURL: string = 'http://localhost:3000') {
  let retries = 10;
  while (retries > 0) {
    try {
      const response = await page.request.get(`${baseURL}/health`);
      if (response.ok()) {
        return true;
      }
    } catch (e) {
      // Backend not ready
    }
    await page.waitForTimeout(1000);
    retries--;
  }
  throw new Error('Backend did not start in time');
}

/**
 * Helper to clear database snapshots
 */
export async function clearSnapshots(page: Page, baseURL: string = 'http://localhost:3000') {
  try {
    const response = await page.request.get(`${baseURL}/api/snapshots`);
    if (response.ok()) {
      const snapshots = await response.json();
      for (const snapshot of snapshots) {
        await page.request.delete(`${baseURL}/api/snapshots/${snapshot._id}`);
      }
    }
  } catch (e) {
    // Ignore errors - snapshots might not exist
  }
}

/**
 * Helper to get snapshots count
 */
export async function getSnapshotsCount(page: Page, baseURL: string = 'http://localhost:3000'): Promise<number> {
  const response = await page.request.get(`${baseURL}/api/snapshots`);
  if (!response.ok()) {
    throw new Error('Failed to get snapshots');
  }
  const snapshots = await response.json();
  return snapshots.length;
}
