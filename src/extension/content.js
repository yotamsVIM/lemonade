/**
 * Content script for DOM capture
 * Runs in the context of the web page
 */

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_DOM') {
    captureDOMSnapshot()
      .then(data => {
        sendResponse({ success: true, data });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });

    // Return true to indicate async response
    return true;
  }
});

/**
 * Capture full DOM snapshot with inline styles and computed styles
 */
async function captureDOMSnapshot() {
  console.log('[Lemonade Miner] Starting DOM capture...');

  try {
    // Clone the entire document
    const docClone = document.cloneNode(true);

    // Inline all computed styles to preserve visual appearance
    await inlineStyles(document.documentElement, docClone.documentElement);

    // Serialize to HTML string
    const html = new XMLSerializer().serializeToString(docClone);

    const snapshot = {
      html: html,
      title: document.title,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      size: html.length,
      metadata: {
        domain: window.location.hostname,
        pathname: window.location.pathname,
        characterCount: document.body.innerText.length,
        elementCount: document.getElementsByTagName('*').length,
        hasFrames: window.frames.length > 0,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      }
    };

    console.log(`[Lemonade Miner] Captured ${(snapshot.size / 1024 / 1024).toFixed(2)}MB`);

    return snapshot;
  } catch (error) {
    console.error('[Lemonade Miner] Capture failed:', error);
    throw error;
  }
}

/**
 * Recursively inline computed styles for all elements
 * This preserves the visual appearance independent of external CSS
 */
async function inlineStyles(sourceElement, targetElement) {
  // Get computed style for source element
  const computedStyle = window.getComputedStyle(sourceElement);

  // Critical styles to preserve
  const criticalStyles = [
    'display',
    'position',
    'top',
    'left',
    'right',
    'bottom',
    'width',
    'height',
    'margin',
    'padding',
    'border',
    'font-family',
    'font-size',
    'font-weight',
    'color',
    'background-color',
    'background-image',
    'visibility',
    'opacity',
    'z-index'
  ];

  // Build inline style string
  let styleString = '';
  for (const property of criticalStyles) {
    const value = computedStyle.getPropertyValue(property);
    if (value) {
      styleString += `${property}: ${value}; `;
    }
  }

  if (styleString && targetElement.setAttribute) {
    targetElement.setAttribute('style', styleString);
  }

  // Recursively process child elements
  const sourceChildren = sourceElement.children;
  const targetChildren = targetElement.children;

  for (let i = 0; i < sourceChildren.length && i < targetChildren.length; i++) {
    await inlineStyles(sourceChildren[i], targetChildren[i]);
  }
}

/**
 * Listen for auto-capture triggers
 */
let autoCaptureEnabled = false;
let lastCapture = 0;
const CAPTURE_THROTTLE = 5000; // 5 seconds minimum between auto-captures

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SET_AUTO_CAPTURE') {
    autoCaptureEnabled = message.enabled;
    console.log(`[Lemonade Miner] Auto-capture ${autoCaptureEnabled ? 'enabled' : 'disabled'}`);

    if (autoCaptureEnabled) {
      setupAutoCaptureListeners();
    } else {
      removeAutoCaptureListeners();
    }
  }
});

// Auto-capture triggers
let captureObserver = null;

function setupAutoCaptureListeners() {
  // Trigger capture on significant DOM changes (e.g., page navigation in SPA)
  captureObserver = new MutationObserver((mutations) => {
    // Check if this is a significant change
    const significantChange = mutations.some(mutation =>
      mutation.type === 'childList' && mutation.addedNodes.length > 10
    );

    if (significantChange) {
      throttledAutoCapture();
    }
  });

  captureObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Also trigger on URL changes (for SPAs)
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      throttledAutoCapture();
    }
  }, 1000);
}

function removeAutoCaptureListeners() {
  if (captureObserver) {
    captureObserver.disconnect();
    captureObserver = null;
  }
}

async function throttledAutoCapture() {
  const now = Date.now();
  if (now - lastCapture < CAPTURE_THROTTLE) {
    console.log('[Lemonade Miner] Auto-capture throttled');
    return;
  }

  lastCapture = now;
  console.log('[Lemonade Miner] Auto-capture triggered');

  try {
    const data = await captureDOMSnapshot();

    // Send to background script for processing
    chrome.runtime.sendMessage({
      type: 'AUTO_CAPTURE_DATA',
      data: data
    });
  } catch (error) {
    console.error('[Lemonade Miner] Auto-capture failed:', error);
    chrome.runtime.sendMessage({
      type: 'AUTO_CAPTURE_ERROR',
      error: error.message
    });
  }
}

console.log('[Lemonade Miner] Content script loaded');
