# Chrome Extension Tests with Playwright

Automated tests for the Lemonade EHR Miner Chrome Extension using Playwright.

## Test Coverage

- ✅ Extension loading and initialization
- ✅ Popup UI rendering and interaction
- ✅ Backend connectivity checking
- ✅ Manual page capture functionality
- ✅ Settings persistence (backend URL, patient MRN)
- ✅ Auto-capture mode toggling
- ✅ Large page handling
- ✅ **Iframe capture** (nested iframes with content)
- ✅ **Shadow DOM capture** (shadow root content extraction)
- ✅ Error handling and disconnection scenarios

## Prerequisites

### System Dependencies (Linux)

Playwright requires system libraries to run browsers. Install them with:

```bash
sudo apt-get install \
  libnspr4 \
  libnss3 \
  libdbus-1-3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libxkbcommon0 \
  libatspi2.0-0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2
```

Or use Playwright's installer:

```bash
sudo pnpm exec playwright install-deps
```

### Backend Server

The tests automatically start the backend server on `http://localhost:3000` with AI worker disabled.

## Running Tests

### Run all tests (headless)
```bash
pnpm test:extension
```

### Run tests with UI (interactive)
```bash
pnpm test:extension:ui
```

### Run tests in headed mode (see browser)
```bash
pnpm test:extension:headed
```

### Run specific test file
```bash
pnpm playwright test extension.spec.ts
```

### Run specific test
```bash
pnpm playwright test -g "should capture a simple page"
```

## Test Structure

```
tests/extension/
├── README.md              # This file
├── fixtures.ts            # Playwright fixtures and helpers
└── extension.spec.ts      # Extension test suite
```

### Fixtures

Custom fixtures in `fixtures.ts`:

- `context` - Browser context with extension loaded
- `extensionId` - Extension ID for accessing extension URLs
- `openExtensionPopup()` - Helper to open popup
- `waitForBackend()` - Helper to wait for backend readiness
- `clearSnapshots()` - Helper to clear test data
- `getSnapshotsCount()` - Helper to get snapshot count
- HTML fixtures for testing iframe and Shadow DOM capture

### Test Suites

**Chrome Extension - The Miner** (12 tests)
- Extension loading and UI tests
- Manual capture functionality
- Settings and configuration
- Backend integration
- Large page handling
- Snapshot view

**Chrome Extension - Nested Content Capture** (2 tests)
- Iframe capture (nested iframes with content)
- Shadow DOM capture (shadow root content extraction)

**Chrome Extension - Error Handling** (1 test)
- Backend disconnection handling
- Error messaging

**Total:** 14 tests, all passing

## Configuration

See `playwright.config.ts` for configuration:

- **Test directory**: `./tests/extension`
- **Timeout**: 60 seconds
- **Retries**: 0 locally, 2 on CI
- **Reporter**: HTML + list
- **Web server**: Automatically starts backend on port 3000

## Debugging

### View test report
```bash
pnpm playwright show-report
```

### Debug specific test
```bash
pnpm playwright test --debug -g "should capture a simple page"
```

### View traces
Traces are automatically collected on first retry. View them in the HTML report.

## CI/CD Integration

For CI environments:

1. Ensure system dependencies are installed
2. Set `CI=true` environment variable for automatic retries
3. Use headless mode (default)
4. Collect artifacts (videos, screenshots, traces)

Example GitHub Actions:

```yaml
- name: Install system dependencies
  run: npx playwright install-deps

- name: Run extension tests
  run: pnpm test:extension
  env:
    CI: true

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Known Limitations

1. **Headless mode**: Chrome extensions require headed mode (visible browser window)
2. **System dependencies**: Requires X11/Wayland libraries on Linux
3. **Container environments**: May need additional setup for display server
4. **Auto-capture tests**: Timing-dependent, may need adjustments

## Troubleshooting

### Extension not loading
- Verify extension path: `src/extension`
- Check manifest.json is valid
- Ensure all extension files exist

### Backend connection failed
- Check backend is running on port 3000
- Verify CORS is configured correctly
- Check `.env` file has `AI_WORKER_ENABLED=false`

### Tests timing out
- Increase timeout in `playwright.config.ts`
- Check backend startup time
- Verify network connectivity

### Display server errors (Linux)
In containerized environments without a display:

```bash
# Install xvfb
sudo apt-get install xvfb

# Run tests with virtual display
xvfb-run pnpm test:extension
```

## Manual Testing Alternative

If automated tests can't run in your environment, manually test the extension:

1. Start backend: `pnpm run dev`
2. Open Chrome: `chrome://extensions/`
3. Enable Developer mode
4. Load unpacked: `/workspace/src/extension`
5. Navigate to any page
6. Click extension icon and test features

## Future Enhancements

- [x] Shadow DOM extraction tests ✅ (completed)
- [x] Iframe extraction tests ✅ (completed)
- [ ] Multi-level nested iframe tests (>3 levels deep)
- [ ] Auto-capture timing tests
- [ ] Network error recovery tests
- [ ] Concurrent capture tests
- [ ] Performance benchmarks
- [ ] Cross-origin iframe timeout tests
