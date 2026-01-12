/**
 * Content script for DOM capture
 * Runs in the context of the web page
 */

// Detect if we're in top frame or iframe
const isTopFrame = window.top === window;

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_DOM') {
    // Only top frame handles the full capture
    if (isTopFrame) {
      captureDOMSnapshot()
        .then(data => {
          sendResponse({ success: true, data });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
    }

    // Return true to indicate async response
    return true;
  }
});

// Listen for cross-frame postMessage (for iframes)
if (!isTopFrame) {
  window.addEventListener('message', async (event) => {
    // Verify message is from same extension context
    if (event.data && event.data.type === 'LEMONADE_CAPTURE_IFRAME') {
      try {
        const html = await captureOwnContent();
        // Send response back to top frame
        event.source.postMessage({
          type: 'LEMONADE_IFRAME_RESPONSE',
          iframeIndex: event.data.iframeIndex,
          success: true,
          html: html
        }, '*');
      } catch (error) {
        event.source.postMessage({
          type: 'LEMONADE_IFRAME_RESPONSE',
          iframeIndex: event.data.iframeIndex,
          success: false,
          error: error.message
        }, '*');
      }
    }
  });
}

/**
 * Capture full DOM snapshot with inline styles and computed styles
 */
async function captureDOMSnapshot() {
  console.log('[Lemonade Miner] Starting DOM capture...');

  try {
    // Wait for any pending dynamic content (AJAX, etc.)
    await waitForDynamicContent();

    // Clone the entire document
    const docClone = document.cloneNode(true);

    // Inline all computed styles to preserve visual appearance (includes shadow DOM)
    await inlineStyles(document.documentElement, docClone.documentElement);

    // Recursively capture ALL iframes/frames (same-origin and cross-origin)
    await captureAllNestedFrames(document, docClone, 0);

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
        framesCaptured: window.frames.length,
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
 * Wait for dynamic content to load (AJAX, etc.)
 */
async function waitForDynamicContent() {
  // Wait for network idle (no pending requests for 500ms)
  return new Promise((resolve) => {
    let timeout;
    const checkIdle = () => {
      // Simple heuristic: wait 2 seconds after capture request
      // This ensures most AJAX content has loaded
      clearTimeout(timeout);
      timeout = setTimeout(resolve, 2000);
    };
    checkIdle();
  });
}

/**
 * Capture this frame's own content (called from iframe)
 * RECURSIVELY captures all nested iframes/frames and shadow DOM
 */
async function captureOwnContent() {
  try {
    console.log('[Lemonade Miner] Capturing own content (recursive)...');

    // Clone this document
    const docClone = document.cloneNode(true);

    // Inline styles (includes shadow DOM capture)
    await inlineStyles(document.documentElement, docClone.documentElement);

    // RECURSIVELY capture all nested iframes/frames (same-origin and cross-origin)
    await captureAllNestedFrames(document, docClone);

    // Serialize
    const html = new XMLSerializer().serializeToString(docClone);

    console.log(`[Lemonade Miner] ✅ Captured own content: ${(html.length / 1024).toFixed(1)}KB`);
    return html;
  } catch (error) {
    console.error('[Lemonade Miner] Iframe capture failed:', error);
    throw error;
  }
}

/**
 * Capture cross-origin iframe via postMessage
 */
function captureIframeViaPostMessage(iframeWindow, iframeIndex) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(null); // Timeout - couldn't capture
    }, 5000); // 5 second timeout

    const messageHandler = (event) => {
      // Check if this is a response for our iframe
      if (event.data &&
          event.data.type === 'LEMONADE_IFRAME_RESPONSE' &&
          event.data.iframeIndex === iframeIndex) {
        cleanup();
        if (event.data.success && event.data.html) {
          resolve(event.data.html);
        } else {
          resolve(null);
        }
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      window.removeEventListener('message', messageHandler);
    };

    // Listen for response
    window.addEventListener('message', messageHandler);

    // Send capture request to iframe
    try {
      iframeWindow.postMessage({
        type: 'LEMONADE_CAPTURE_IFRAME',
        iframeIndex: iframeIndex
      }, '*');
    } catch (error) {
      cleanup();
      resolve(null);
    }
  });
}

/**
 * Recursively capture ALL nested frames (iframes/frames) at any depth
 * Handles both same-origin (direct capture) and cross-origin (postMessage)
 */
async function captureAllNestedFrames(sourceDoc, clonedDoc, depth = 0) {
  const indent = '  '.repeat(depth);
  // Query both iframe and frame elements (framesets use <frame>)
  const frames = sourceDoc.querySelectorAll('iframe, frame');
  const frameClones = clonedDoc.querySelectorAll('iframe, frame');

  if (frames.length === 0) return;

  console.log(`${indent}[Lemonade Miner] Found ${frames.length} nested frame(s) at depth ${depth}`);

  for (let i = 0; i < frames.length; i++) {
    try {
      const frame = frames[i];
      const frameClone = frameClones[i];

      if (!frameClone) {
        console.warn(`${indent}  ⚠️ Frame ${i}: No corresponding clone element`);
        continue;
      }

      const frameName = frame.tagName.toLowerCase();
      const frameId = frame.id ? `#${frame.id}` : '';
      const frameInfo = `<${frameName}${frameId}>`;

      // Try same-origin access first
      let frameDoc = null;
      let isSameOrigin = false;

      try {
        frameDoc = frame.contentDocument;
        if (frameDoc) {
          isSameOrigin = true;
        }
      } catch (e) {
        // Cross-origin - will use postMessage
      }

      if (isSameOrigin && frameDoc) {
        // SAME-ORIGIN: Direct capture
        // Check for body, frameset, or documentElement
        const frameContent = frameDoc.body || frameDoc.querySelector('frameset') || frameDoc.documentElement;

        // Only skip if truly empty (no children and no text)
        const isEmpty = !frameContent ||
                       (frameContent.children.length === 0 && frameContent.textContent.trim().length === 0);

        if (isEmpty) {
          console.log(`${indent}  → Frame ${i} ${frameInfo}: Empty, skipping`);
          continue;
        }

        console.log(`${indent}  → Frame ${i} ${frameInfo}: Same-origin, capturing directly...`);

        // Clone frame content
        const frameContentClone = frameDoc.cloneNode(true);

        // Inline styles (includes shadow DOM capture)
        if (frameDoc.documentElement && frameContentClone.documentElement) {
          await inlineStyles(frameDoc.documentElement, frameContentClone.documentElement);
        }

        // RECURSIVELY capture deeper nested frames
        await captureAllNestedFrames(frameDoc, frameContentClone, depth + 1);

        // Serialize and store
        const frameHtml = new XMLSerializer().serializeToString(frameContentClone);
        frameClone.setAttribute('data-captured', 'true');
        frameClone.setAttribute('data-iframe-content', frameHtml);
        console.log(`${indent}  ✅ Frame ${i} ${frameInfo}: Captured ${(frameHtml.length / 1024).toFixed(1)}KB`);

      } else {
        // CROSS-ORIGIN: Use postMessage
        console.log(`${indent}  → Frame ${i} ${frameInfo}: Cross-origin, using postMessage...`);

        const frameWindow = frame.contentWindow;
        if (!frameWindow) {
          console.warn(`${indent}  ⚠️ Frame ${i}: Cannot access contentWindow`);
          continue;
        }

        try {
          const frameHtml = await captureIframeViaPostMessage(frameWindow, i);
          if (frameHtml) {
            frameClone.setAttribute('data-captured', 'true');
            frameClone.setAttribute('data-iframe-content', frameHtml);
            console.log(`${indent}  ✅ Frame ${i} ${frameInfo}: Captured ${(frameHtml.length / 1024).toFixed(1)}KB via postMessage`);
          } else {
            console.warn(`${indent}  ⚠️ Frame ${i} ${frameInfo}: No response from postMessage`);
          }
        } catch (error) {
          console.warn(`${indent}  ❌ Frame ${i} ${frameInfo}: postMessage failed - ${error.message}`);
        }
      }
    } catch (error) {
      console.warn(`${indent}  ❌ Frame ${i}: Capture failed - ${error.message}`);
    }
  }

  console.log(`${indent}[Lemonade Miner] Finished capturing frames at depth ${depth}`);
}


/**
 * Capture shadow DOM content
 */
function captureShadowDOM(sourceElement, targetElement) {
  // Check if element has a shadow root
  if (sourceElement.shadowRoot) {
    console.log(`[Lemonade Miner] Found Shadow DOM on <${sourceElement.tagName.toLowerCase()}${sourceElement.id ? '#' + sourceElement.id : ''}>`);

    try {
      // Serialize shadow root content
      const shadowContent = sourceElement.shadowRoot.innerHTML;

      // Store shadow content as a data attribute
      if (targetElement.setAttribute) {
        targetElement.setAttribute('data-shadow-root', shadowContent);
        targetElement.setAttribute('data-has-shadow', 'true');
        console.log(`[Lemonade Miner] ✅ Captured Shadow DOM (${(shadowContent.length / 1024).toFixed(1)}KB)`);
      }
    } catch (error) {
      console.warn(`[Lemonade Miner] Failed to capture shadow root:`, error.message);
    }
  }

  // Recursively check children for shadow roots
  const sourceChildren = sourceElement.children;
  const targetChildren = targetElement.children;

  for (let i = 0; i < sourceChildren.length && i < targetChildren.length; i++) {
    captureShadowDOM(sourceChildren[i], targetChildren[i]);
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

  // Capture shadow DOM content
  captureShadowDOM(sourceElement, targetElement);

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
