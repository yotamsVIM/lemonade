// State management
let config = {
  backendUrl: 'http://localhost:3000',
  autoCapture: false,
  patientMrn: '',
  snapshotCount: 0
};

// Load config from storage on startup
chrome.storage.local.get(['config'], (result) => {
  if (result.config) {
    config = { ...config, ...result.config };
    updateUI();
  }
  checkBackendHealth();
});

// DOM elements
const backendUrlInput = document.getElementById('backend-url');
const patientMrnInput = document.getElementById('patient-mrn');
const autoCaptureToggle = document.getElementById('auto-capture-toggle');
const captureBtn = document.getElementById('capture-btn');
const viewSnapshotsBtn = document.getElementById('view-snapshots');
const logContainer = document.getElementById('log');

// Event listeners
backendUrlInput.addEventListener('change', (e) => {
  config.backendUrl = e.target.value;
  saveConfig();
  checkBackendHealth();
});

patientMrnInput.addEventListener('change', (e) => {
  config.patientMrn = e.target.value;
  saveConfig();
});

autoCaptureToggle.addEventListener('change', (e) => {
  config.autoCapture = e.target.checked;
  saveConfig();
  updateUI();

  // Send message to background script
  chrome.runtime.sendMessage({
    type: 'TOGGLE_AUTO_CAPTURE',
    enabled: config.autoCapture
  });
});

captureBtn.addEventListener('click', async () => {
  captureBtn.disabled = true;
  captureBtn.textContent = '⏳ Capturing...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'CAPTURE_DOM'
    });

    if (response.success) {
      // Send to backend
      await sendSnapshot(response.data, tab.url);
    } else {
      addLog('error', response.error || 'Failed to capture DOM');
    }
  } catch (error) {
    addLog('error', `Capture failed: ${error.message}`);
  } finally {
    captureBtn.disabled = false;
    captureBtn.textContent = '📸 Capture Current Page';
  }
});

viewSnapshotsBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: `${config.backendUrl}/api/snapshots`
  });
});

// Functions
function saveConfig() {
  chrome.storage.local.set({ config }, () => {
    addLog('info', 'Settings saved');
  });
}

function updateUI() {
  backendUrlInput.value = config.backendUrl;
  patientMrnInput.value = config.patientMrn;
  autoCaptureToggle.checked = config.autoCapture;

  document.getElementById('auto-capture-status').textContent =
    config.autoCapture ? 'On' : 'Off';
  document.getElementById('snapshot-count').textContent =
    config.snapshotCount;
}

async function checkBackendHealth() {
  try {
    const response = await fetch(`${config.backendUrl}/health`);
    const data = await response.json();

    if (data.status === 'ok') {
      document.getElementById('backend-status').textContent = 'Connected';
      document.getElementById('backend-status').className = 'status-badge connected';
      addLog('success', 'Backend connected');

      // Get snapshot count
      await updateSnapshotCount();
    } else {
      throw new Error('Backend health check failed');
    }
  } catch (error) {
    document.getElementById('backend-status').textContent = 'Disconnected';
    document.getElementById('backend-status').className = 'status-badge disconnected';
    addLog('error', `Backend unreachable: ${error.message}`);
  }
}

async function updateSnapshotCount() {
  try {
    const response = await fetch(`${config.backendUrl}/api/snapshots`);
    const snapshots = await response.json();
    config.snapshotCount = snapshots.length;
    document.getElementById('snapshot-count').textContent = config.snapshotCount;
  } catch (error) {
    // Silently fail
  }
}

async function sendSnapshot(domData, sourceUrl) {
  try {
    addLog('info', `Sending snapshot (${(domData.html.length / 1024 / 1024).toFixed(2)}MB)...`);

    const payload = {
      sourceUrl: sourceUrl,
      htmlBlob: domData.html,
      metadata: {
        title: domData.title,
        timestamp: new Date().toISOString(),
        captureMode: config.autoCapture ? 'auto' : 'manual',
        patientMrn: config.patientMrn || undefined,
        documentSize: domData.html.length,
        userAgent: navigator.userAgent
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

    addLog('success', `Snapshot saved (ID: ${result.id.substring(0, 8)}...)`);
    config.snapshotCount++;
    updateUI();

    // Trigger AI extraction if configured
    if (config.autoCapture) {
      await triggerExtraction(result.id);
    }
  } catch (error) {
    addLog('error', `Upload failed: ${error.message}`);
    throw error;
  }
}

async function triggerExtraction(snapshotId) {
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
      addLog('info', `Extraction queued (Task: ${task._id.substring(0, 8)}...)`);
    }
  } catch (error) {
    addLog('error', `Failed to queue extraction: ${error.message}`);
  }
}

function addLog(type, message) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';

  const time = new Date().toLocaleTimeString();
  const typeClass = type === 'error' ? 'log-error' : type === 'success' ? 'log-success' : '';

  entry.innerHTML = `
    <span class="log-time">[${time}]</span>
    <span class="log-message ${typeClass}">${message}</span>
  `;

  logContainer.insertBefore(entry, logContainer.firstChild);

  // Keep only last 20 entries
  while (logContainer.children.length > 20) {
    logContainer.removeChild(logContainer.lastChild);
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AUTO_CAPTURE_COMPLETE') {
    addLog('success', 'Auto-capture completed');
    config.snapshotCount++;
    updateUI();
  } else if (message.type === 'AUTO_CAPTURE_ERROR') {
    addLog('error', `Auto-capture failed: ${message.error}`);
  }
});
