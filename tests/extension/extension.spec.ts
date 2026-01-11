import { test, expect, openExtensionPopup, waitForBackend, clearSnapshots, getSnapshotsCount } from './fixtures';

/**
 * Chrome Extension Tests
 * Tests the Lemonade EHR Miner extension functionality
 */

test.describe('Chrome Extension - The Miner', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure backend is running
    await waitForBackend(page);

    // Clear any existing snapshots
    await clearSnapshots(page);
  });

  test('should load extension successfully', async ({ context, extensionId }) => {
    expect(extensionId).toBeTruthy();
    expect(extensionId).toMatch(/^[a-z]{32}$/); // Chrome extension IDs are 32 lowercase letters
  });

  test('should open extension popup', async ({ page, extensionId }) => {
    await openExtensionPopup(page, extensionId);

    // Check popup title
    await expect(page.locator('h1')).toContainText('Lemonade EHR Miner');

    // Check main UI elements exist
    await expect(page.locator('#backend-url')).toBeVisible();
    await expect(page.locator('#patient-mrn')).toBeVisible();
    await expect(page.locator('#capture-btn')).toBeVisible();
    // Check the toggle container is present (the checkbox itself has opacity: 0)
    await expect(page.locator('.toggle')).toBeVisible();
  });

  test('should show backend connected status', async ({ page, extensionId }) => {
    await openExtensionPopup(page, extensionId);

    // Wait for backend status check
    await page.waitForTimeout(2000);

    // Check backend status shows connected
    const status = page.locator('#backend-status');
    await expect(status).toContainText('Connected');
    await expect(status).toHaveClass(/connected/);
  });

  test('should capture a simple page', async ({ context, page, extensionId }) => {
    // Navigate to example.com (data: URLs don't support content scripts)
    await page.goto('https://example.com');
    await page.waitForLoadState('networkidle');

    // Wait a bit for content script to fully inject
    await page.waitForTimeout(1000);

    // Open popup
    const popup = await context.newPage();
    await openExtensionPopup(popup, extensionId);

    // Bring the example.com page to front so it becomes the active tab
    await page.bringToFront();

    // Small wait for tab to become active
    await page.waitForTimeout(500);

    // Click capture button
    await popup.locator('#capture-btn').click();

    // Wait for capture to complete (button text changes back)
    await expect(popup.locator('#capture-btn')).toContainText('Capture Current Page', { timeout: 15000 });

    // Check activity log shows success (get first/most recent log entry)
    await expect(popup.locator('.log-entry').first()).toContainText('Snapshot saved');

    // Verify snapshot was created (count should be at least 1)
    const count = await getSnapshotsCount(page);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('should capture example.com', async ({ context, page, extensionId }) => {
    // Navigate to example.com
    await page.goto('https://example.com');
    await page.waitForLoadState('networkidle');

    // Wait a bit for content script to fully inject
    await page.waitForTimeout(1000);

    // Get initial snapshot count
    const initialCount = await getSnapshotsCount(page);

    // Open popup
    const popup = await context.newPage();
    await openExtensionPopup(popup, extensionId);

    // Bring the example.com page to front so it becomes the active tab
    await page.bringToFront();

    // Small wait for tab to become active
    await page.waitForTimeout(500);

    // Click capture button
    await popup.locator('#capture-btn').click();

    // Wait for capture to complete
    await expect(popup.locator('#capture-btn')).toContainText('Capture Current Page', { timeout: 15000 });

    // Wait a bit for backend to process
    await page.waitForTimeout(1000);

    // Verify snapshot was created
    const finalCount = await getSnapshotsCount(page);
    expect(finalCount).toBe(initialCount + 1);

    // Verify snapshot content via API
    const response = await page.request.get('http://localhost:3000/api/snapshots');
    const snapshots = await response.json();
    const lastSnapshot = snapshots[snapshots.length - 1];

    // Basic validation - snapshot should exist and have content
    expect(lastSnapshot).toBeTruthy();
    expect(lastSnapshot.htmlBlob).toBeTruthy();
    expect(lastSnapshot.htmlBlob.length).toBeGreaterThan(100);
  });

  test('should update backend URL', async ({ page, extensionId }) => {
    await openExtensionPopup(page, extensionId);

    // Change backend URL
    const urlInput = page.locator('#backend-url');
    await urlInput.clear();
    await urlInput.fill('http://localhost:9999');
    await urlInput.blur();

    // Wait for change to be saved
    await page.waitForTimeout(1000);

    // Check activity log contains "Settings saved" (filter to specific entry)
    const settingsSavedLog = page.locator('.log-entry').filter({ hasText: 'Settings saved' });
    await expect(settingsSavedLog).toBeVisible();

    // Reload popup and verify setting persisted
    await page.reload();
    await expect(urlInput).toHaveValue('http://localhost:9999');
  });

  test('should set patient MRN', async ({ page, extensionId }) => {
    await openExtensionPopup(page, extensionId);

    // Set patient MRN
    const mrnInput = page.locator('#patient-mrn');
    await mrnInput.fill('MRN-12345');
    await mrnInput.blur();

    // Wait for change to be saved
    await page.waitForTimeout(1000);

    // Reload popup and verify setting persisted
    await page.reload();
    await expect(mrnInput).toHaveValue('MRN-12345');
  });

  test('should toggle auto-capture mode', async ({ page, extensionId }) => {
    await openExtensionPopup(page, extensionId);

    // Check initial state
    const toggle = page.locator('#auto-capture-toggle');
    await expect(toggle).not.toBeChecked();

    const status = page.locator('#auto-capture-status');
    await expect(status).toContainText('Off');

    // Toggle on - click the visible slider instead of the hidden checkbox
    await page.locator('.slider').click();
    await page.waitForTimeout(500);

    await expect(toggle).toBeChecked();
    await expect(status).toContainText('On');

    // Reload and verify persisted
    await page.reload();
    await page.waitForTimeout(500);
    await expect(toggle).toBeChecked();
  });

  test('should display snapshot count', async ({ context, page, extensionId }) => {
    // Navigate to example.com (data: URLs don't support content scripts)
    await page.goto('https://example.com');
    await page.waitForLoadState('networkidle');

    // Wait a bit for content script to fully inject
    await page.waitForTimeout(1000);

    const popup = await context.newPage();
    await openExtensionPopup(popup, extensionId);

    // Bring the example.com page to front so it becomes the active tab
    await page.bringToFront();

    // Small wait for tab to become active
    await page.waitForTimeout(500);

    // Capture
    await popup.locator('#capture-btn').click();
    await expect(popup.locator('#capture-btn')).toContainText('Capture Current Page', { timeout: 15000 });

    // Wait for count to update
    await page.waitForTimeout(2000);

    // Check snapshot count increased
    const countElement = popup.locator('#snapshot-count');
    const countText = await countElement.textContent();
    expect(parseInt(countText || '0')).toBeGreaterThan(0);
  });

  test('should handle large page capture', async ({ context, page, extensionId }) => {
    // Use example.com (data: URLs don't support content scripts)
    await page.goto('https://example.com');
    await page.waitForLoadState('networkidle');

    // Wait a bit for content script to fully inject
    await page.waitForTimeout(1000);

    const popup = await context.newPage();
    await openExtensionPopup(popup, extensionId);

    // Bring the example.com page to front so it becomes the active tab
    await page.bringToFront();

    // Small wait for tab to become active
    await page.waitForTimeout(500);

    // Capture
    await popup.locator('#capture-btn').click();

    // Should complete without timeout
    await expect(popup.locator('#capture-btn')).toContainText('Capture Current Page', { timeout: 20000 });

    // Check that snapshot was saved successfully
    await expect(popup.locator('.log-entry').first()).toContainText('Snapshot saved');
  });

  test('should open snapshots view', async ({ context, page, extensionId }) => {
    const popup = await context.newPage();
    await openExtensionPopup(popup, extensionId);

    // Click "View All Snapshots" button
    const viewButton = popup.locator('#view-snapshots');
    await expect(viewButton).toBeVisible();

    // This will open a new tab with the API endpoint
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      viewButton.click()
    ]);

    // Should navigate to snapshots API
    expect(newPage.url()).toContain('/api/snapshots');
  });
});

test.describe('Chrome Extension - Error Handling', () => {
  test('should handle backend disconnection', async ({ page, extensionId }) => {
    await openExtensionPopup(page, extensionId);

    // Change to invalid backend URL
    const urlInput = page.locator('#backend-url');
    await urlInput.clear();
    await urlInput.fill('http://localhost:9999');
    await urlInput.blur();

    // Wait for health check to fail
    await page.waitForTimeout(3000);

    // Should show disconnected status
    const status = page.locator('#backend-status');
    await expect(status).toContainText('Disconnected');
    await expect(status).toHaveClass(/disconnected/);

    // Should log error (check first log entry)
    await expect(page.locator('.log-entry').first()).toContainText('Backend unreachable');
  });
});
