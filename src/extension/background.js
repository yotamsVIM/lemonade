/**
 * Background service worker for Chrome Extension
 * Handles auto-infer coordination and background tasks
 */

let config = {
  backendUrl: 'http://localhost:3000',
  autoInfer: false,
  patientMrn: ''
};

// Load config on startup
chrome.storage.local.get(['config'], (result) => {
  if (result.config) {
    config = { ...config, ...result.config };
  }
});

// Listen for config updates
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.config) {
    config = { ...config, ...changes.config.newValue };
  }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'TOGGLE_AUTO_INFER':
      handleAutoCaptureToggle(message.enabled, sender);
      break;

    case 'AUTO_INFER_DATA':
      handleAutoCapture(message.data, sender);
      break;

    case 'AUTO_INFER_ERROR':
      console.error('[Lemonade Miner] Auto-infer error:', message.error);
      notifyPopup('AUTO_INFER_ERROR', { error: message.error });
      break;

    default:
      console.log('[Lemonade Miner] Unknown message type:', message.type);
  }
});

/**
 * Handle auto-infer toggle
 */
async function handleAutoCaptureToggle(enabled, sender) {
  console.log(`[Lemonade Miner] Auto-infer ${enabled ? 'enabled' : 'disabled'}`);

  // Get all tabs and send message to content scripts
  const tabs = await chrome.tabs.query({});

  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SET_AUTO_INFER',
        enabled: enabled
      });
    } catch (error) {
      // Tab might not have content script loaded, ignore
    }
  }
}

/**
 * Handle auto-inferd data
 */
async function handleAutoCapture(data, sender) {
  console.log(`[Lemonade Miner] Processing auto-infer: ${(data.size / 1024 / 1024).toFixed(2)}MB`);

  try {
    const tab = await chrome.tabs.get(sender.tab.id);

    const payload = {
      sourceUrl: data.url,
      htmlBlob: data.html,
      metadata: {
        title: data.title,
        timestamp: data.timestamp,
        captureMode: 'auto',
        patientMrn: config.patientMrn || undefined,
        documentSize: data.size,
        ...data.metadata
      }
    };

    const response = await fetch(`${config.backendUrl}/api/snapshots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    console.log(`[Lemonade Miner] Snapshot saved: ${result._id}`);

    // Automatically queue extraction task
    await queueExtraction(result._id);

    // Notify popup of success
    notifyPopup('AUTO_INFER_COMPLETE', { snapshotId: result._id });

    // Show notification to user
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Lemonade Miner',
      message: `Snapshot captured and queued for extraction`,
      priority: 1
    });
  } catch (error) {
    console.error('[Lemonade Miner] Auto-infer upload failed:', error);
    notifyPopup('AUTO_INFER_ERROR', { error: error.message });
  }
}

/**
 * Queue AI extraction task
 */
async function queueExtraction(snapshotId) {
  try {
    const response = await fetch(`${config.backendUrl}/api/ai-tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        taskType: 'EXTRACT',
        targetType: 'SNAPSHOT',
        targetId: snapshotId,
        priority: 'HIGH',
        input: {
          patientMrn: config.patientMrn || undefined
        }
      })
    });

    if (response.ok) {
      const task = await response.json();
      console.log(`[Lemonade Miner] Extraction task queued: ${task._id}`);
    }
  } catch (error) {
    console.error('[Lemonade Miner] Failed to queue extraction:', error);
  }
}

/**
 * Notify popup of events
 */
function notifyPopup(type, data) {
  chrome.runtime.sendMessage({ type, ...data }).catch(() => {
    // Popup might not be open, ignore
  });
}

/**
 * Handle extension icon click - ensure popup opens
 */
chrome.action.onClicked.addListener((tab) => {
  chrome.action.openPopup();
});

console.log('[Lemonade Miner] Background service worker initialized');
