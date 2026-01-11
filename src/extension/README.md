# Lemonade EHR Miner - Chrome Extension

The **Miner** component of the Lemonade AI-EHR Integration system. This Chrome Extension captures DOM snapshots from EHR web applications and sends them to the backend for AI-powered data extraction.

## Features

- **Manual Capture**: Click-to-capture current page DOM snapshot
- **Auto-Capture Mode**: Automatically detect and capture page changes
- **Large DOM Support**: Handles EHR pages up to 50MB+
- **Style Preservation**: Inlines computed styles to maintain visual fidelity
- **Backend Integration**: Real-time communication with Lemonade backend API
- **Patient Context**: Optional MRN association for captured snapshots
- **Activity Logging**: Built-in activity log for debugging and monitoring

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   Popup UI   │  │   Content    │  │   Background    │  │
│  │  (popup.js)  │  │   Script     │  │  Service Worker │  │
│  │              │  │(content.js)  │  │ (background.js) │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘  │
│         │                 │                    │            │
│         └─────────────────┼────────────────────┘            │
│                           │                                 │
└───────────────────────────┼─────────────────────────────────┘
                            │
                            │ HTTP POST
                            │
                    ┌───────▼────────┐
                    │  Backend API   │
                    │ /api/snapshots │
                    └────────────────┘
```

## Installation

### Development Mode

1. **Ensure Backend is Running**
   ```bash
   cd /workspace
   pnpm install
   pnpm run dev
   # Backend should be running on http://localhost:3000
   ```

2. **Load Extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the `/workspace/src/extension` directory
   - The Lemonade EHR Miner extension should now appear in your extensions

3. **Verify Installation**
   - Click the extension icon in the toolbar
   - Check that "Backend: Connected" shows green
   - If disconnected, verify the backend URL is correct

### Configuration

1. **Set Backend URL**
   - Click the extension icon
   - Update "Backend URL" if different from `http://localhost:3000`
   - The extension will automatically check connectivity

2. **Set Patient MRN (Optional)**
   - Enter a patient MRN to associate captures with a specific patient
   - Leave blank for general snapshots

3. **Enable Auto-Capture (Optional)**
   - Toggle "Auto-Capture Mode" to automatically capture page changes
   - Recommended for SPAs or dynamic EHR systems

## Usage

### Manual Capture

1. Navigate to an EHR page you want to capture
2. Click the Lemonade extension icon
3. Click "📸 Capture Current Page"
4. Wait for confirmation in the activity log
5. Snapshot is automatically sent to backend and queued for AI extraction

### Auto-Capture Mode

1. Enable "Auto-Capture Mode" toggle in the extension popup
2. Navigate normally through your EHR system
3. The extension will automatically detect significant page changes
4. Captures are throttled to max 1 per 5 seconds to avoid spam
5. Each capture is automatically queued for extraction

### View Snapshots

Click "View All Snapshots" to open the backend API in a new tab and see all captured snapshots.

## How It Works

### DOM Capture Process

1. **Clone DOM Tree**: Full document clone including shadow DOM
2. **Inline Styles**: Compute and inline all critical CSS properties
3. **Serialize**: Convert DOM tree to HTML string
4. **Metadata**: Collect page metadata (URL, title, size, etc.)
5. **Send to Backend**: POST to `/api/snapshots` endpoint

### Auto-Capture Triggers

- **DOM Mutations**: Detects significant DOM changes (10+ new nodes)
- **URL Changes**: Monitors for SPA navigation
- **Throttling**: Maximum 1 capture per 5 seconds

### Data Flow

```
EHR Page → Content Script → Background Worker → Backend API → AI Queue
                ↓
         Inline Styles
         Serialize DOM
         Add Metadata
```

## Development

### File Structure

```
src/extension/
├── manifest.json         # Chrome extension manifest (v3)
├── popup.html           # Extension popup UI
├── popup.js             # Popup logic and state management
├── content.js           # DOM capture and page interaction
├── background.js        # Service worker for background tasks
├── icons/               # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md            # This file
```

### Key Technologies

- **Chrome Extension Manifest V3**: Latest extension architecture
- **Service Workers**: Background processing and coordination
- **XMLSerializer**: DOM to HTML serialization
- **MutationObserver**: DOM change detection
- **Fetch API**: Backend communication

### Testing

The extension includes comprehensive automated tests using Playwright.

#### Running Tests

```bash
# Run all extension tests
npx playwright test

# Run specific test file
npx playwright test tests/extension/extension.spec.ts

# Run tests with UI (headed mode - required for extensions)
npx playwright test --headed

# Run specific test by name
npx playwright test -g "should capture"
```

#### Test Suite Coverage

All 12 tests passing:

1. ✅ Extension loads successfully
2. ✅ Popup opens and displays UI correctly
3. ✅ Backend connection status works
4. ✅ Simple page capture works
5. ✅ Example.com capture works
6. ✅ Backend URL can be updated
7. ✅ Patient MRN can be set
8. ✅ Auto-capture mode toggles correctly
9. ✅ Snapshot count displays correctly
10. ✅ Large page capture works
11. ✅ Snapshots view opens correctly
12. ✅ Backend disconnection is handled properly

#### Test Architecture

```
tests/extension/
├── extension.spec.ts    # Main test suite (12 tests)
├── fixtures.ts          # Custom Playwright fixtures
└── README.md           # Test documentation
```

**Custom Fixtures:**
- `context`: Browser context with extension pre-loaded
- `extensionId`: Dynamically extracted extension ID
- `openExtensionPopup()`: Helper to open extension popup
- `waitForBackend()`: Helper to wait for backend health
- `clearSnapshots()`: Helper to clean test data
- `getSnapshotsCount()`: Helper to verify snapshot creation

**Important Note:** Extension tests must run in headed mode (visible browser) as Chrome extensions require a window context and cannot run reliably in headless mode.

#### Manual Testing

1. **Manual Capture Testing**
   - Load extension in Chrome
   - Navigate to any web page
   - Test manual capture
   - Verify backend receives snapshot

2. **Auto-Capture Testing**
   - Enable auto-capture mode
   - Navigate through a multi-page site
   - Check extension logs for captures
   - Verify throttling works (max 1 per 5 sec)

3. **Large DOM Testing**
   - Navigate to a complex EHR page
   - Capture and verify size in logs
   - Check backend receives full payload

### Debugging

1. **Content Script**: Right-click page → Inspect → Console
2. **Popup**: Right-click extension icon → Inspect popup
3. **Background Worker**: `chrome://extensions/` → "Service worker" link
4. **Network**: Check browser DevTools Network tab for API calls

## Limitations

- **Max Payload Size**: Backend configured for 50MB (configurable in server.ts)
- **Auto-Capture Throttle**: 5 seconds minimum between captures
- **Style Inlining**: Only critical CSS properties are inlined
- **Cross-Origin**: Some pages may have security restrictions
- **Frames**: Nested iframes are not fully captured

## Troubleshooting

### Backend Connection Failed

- Verify backend is running: `curl http://localhost:3000/health`
- Check backend URL in extension settings
- Look for CORS errors in browser console
- Ensure `cors` is configured in backend

### Capture Failed

- Check browser console for errors
- Verify page is not blocked by CSP (Content Security Policy)
- Try refreshing the page and capturing again
- Check extension permissions in `chrome://extensions/`

### Upload Failed

- Verify backend is accepting requests
- Check payload size (may exceed 50MB limit)
- Look for network errors in DevTools
- Verify MongoDB is running and connected

### Auto-Capture Not Working

- Ensure toggle is enabled
- Check content script is loaded (refresh page after enabling)
- Verify page has significant DOM changes
- Check throttling (wait 5+ seconds between changes)

## Security Considerations

- Extension requests `<all_urls>` permission to work on any EHR system
- Captured data may contain PHI/PII - handle according to HIPAA
- Backend should use HTTPS in production
- Consider authentication/authorization for backend API
- Use encrypted storage for sensitive configuration

## Next Steps

After Phase 2 (Miner) completion, proceed to Phase 3 (Oracle):
- ✅ Extension captures DOM snapshots
- ✅ Backend receives and stores snapshots
- 🔄 Phase 3: AI extraction workflow (already implemented)
- ⏳ Phase 4: Frontend UI for viewing results

## Related Documentation

- [Backend API Documentation](../../backend/README.md)
- [AI Service Documentation](../../backend/services/README.md)
- [Implementation Notes](../../../IMPLEMENTATION_NOTES.md)
- [Original Plan](../../../plan.md)
