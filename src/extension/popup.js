// State management
let config = {
  backendUrl: 'http://localhost:3000',
  autoInfer: false,
  patientMrn: '',
  snapshotCount: 0
};

// Load config and pipeline state from storage on startup
chrome.storage.local.get(['config', 'pipelineState'], (result) => {
  if (result.config) {
    config = { ...config, ...result.config };
    updateUI();
  }

  // Restore ongoing pipeline if exists
  if (result.pipelineState && result.pipelineState.snapshotId) {
    console.log('[Popup] Restoring pipeline state:', result.pipelineState);
    currentSnapshotId = result.pipelineState.snapshotId;
    pipelineStartTime = result.pipelineState.startTime;

    // Show pipeline UI
    pipelineContainer.style.display = 'block';

    // Resume polling
    addLog('info', `Resuming pipeline for snapshot ${currentSnapshotId.substring(0, 8)}...`);
    startPipelinePolling(pipelineStartTime);
  }

  checkBackendHealth();
});

// DOM elements
const backendUrlInput = document.getElementById('backend-url');
const patientMrnInput = document.getElementById('patient-mrn');
const autoInferToggle = document.getElementById('auto-infer-toggle');
const captureBtn = document.getElementById('capture-btn');
const viewSnapshotsBtn = document.getElementById('view-snapshots');
const runE2EBtn = document.getElementById('run-e2e-btn');
const logContainer = document.getElementById('log');

// E2E Pipeline elements
const pipelineContainer = document.getElementById('pipeline-container');
const captureStatusEl = document.getElementById('capture-status');
const captureDataEl = document.getElementById('capture-data');
const oracleStatusEl = document.getElementById('oracle-status');
const oracleDataEl = document.getElementById('oracle-data');
const forgeStatusEl = document.getElementById('forge-status');
const forgeDataEl = document.getElementById('forge-data');
const testSection = document.getElementById('test-section');
const extractorCodeTextarea = document.getElementById('extractor-code');
const runCodeBtn = document.getElementById('run-code-btn');
const codeResultsEl = document.getElementById('code-results');

// Pipeline state
let currentSnapshotId = null;
let pipelinePolling = null;
let pipelineStartTime = null;

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

autoInferToggle.addEventListener('change', (e) => {
  config.autoInfer = e.target.checked;
  saveConfig();
  updateUI();

  // Send message to background script
  chrome.runtime.sendMessage({
    type: 'TOGGLE_AUTO_INFER',
    enabled: config.autoInfer
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

runE2EBtn.addEventListener('click', async () => {
  runE2EBtn.disabled = true;
  runE2EBtn.textContent = '⏳ Starting Pipeline...';

  const startTime = performance.now();

  try {
    // Reset UI
    pipelineContainer.style.display = 'block';
    testSection.style.display = 'none';
    resetPipelineUI();

    // Step 1: Capture
    addLog('info', 'Starting E2E pipeline...');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    captureStatusEl.textContent = '⏳';
    const captureResponse = await chrome.tabs.sendMessage(tab.id, {
      type: 'CAPTURE_DOM'
    });

    if (!captureResponse.success) {
      throw new Error(captureResponse.error || 'Capture failed');
    }

    const captureEndTime = performance.now();
    const captureDuration = ((captureEndTime - startTime) / 1000).toFixed(2);

    // Step 2: Send to backend
    await sendSnapshot(captureResponse.data, tab.url);
    captureStatusEl.textContent = '✅';
    captureDataEl.textContent = `⏱️ Duration: ${captureDuration}s\nSize: ${(captureResponse.data.html.length / 1024 / 1024).toFixed(2)}MB\nURL: ${tab.url}`;
    captureDataEl.classList.add('visible');

    // Step 3: Trigger AI extraction for E2E pipeline (always, regardless of auto-infer setting)
    if (currentSnapshotId) {
      await triggerExtraction(currentSnapshotId);
    }

    // Step 4: Save pipeline state and start polling
    pipelineStartTime = startTime;
    savePipelineState();
    addLog('info', `Polling pipeline status for snapshot ${currentSnapshotId.substring(0, 8)}...`);
    startPipelinePolling(startTime);
  } catch (error) {
    addLog('error', `E2E pipeline failed: ${error.message}`);
    captureStatusEl.textContent = '❌';

    // Clear pipeline state on error
    clearPipelineState();
  } finally {
    runE2EBtn.disabled = false;
    runE2EBtn.textContent = '🚀 Run E2E Pipeline';
  }
});

runCodeBtn.addEventListener('click', async () => {
  runCodeBtn.disabled = true;
  runCodeBtn.textContent = '⏳ Running...';
  codeResultsEl.classList.remove('visible', 'success', 'error');

  const startTime = performance.now();

  try {
    const code = extractorCodeTextarea.value;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send code to content script for execution
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'RUN_EXTRACTOR_CODE',
      code: code
    });

    const executionTime = (performance.now() - startTime).toFixed(2);

    if (response.success) {
      const resultText = `⏱️ Execution time: ${executionTime}ms\n\n${JSON.stringify(response.data, null, 2)}`;
      codeResultsEl.textContent = resultText;
      codeResultsEl.classList.add('visible', 'success');
      addLog('success', `Extractor executed in ${executionTime}ms`);
    } else {
      codeResultsEl.textContent = `⏱️ Execution time: ${executionTime}ms\n\nError: ${response.error}`;
      codeResultsEl.classList.add('visible', 'error');
      addLog('error', `Code execution failed after ${executionTime}ms: ${response.error}`);
    }
  } catch (error) {
    const executionTime = (performance.now() - startTime).toFixed(2);
    codeResultsEl.textContent = `⏱️ Execution time: ${executionTime}ms\n\nError: ${error.message}`;
    codeResultsEl.classList.add('visible', 'error');
    addLog('error', `Code execution failed after ${executionTime}ms: ${error.message}`);
  } finally {
    runCodeBtn.disabled = false;
    runCodeBtn.textContent = '▶️ Run Code';
  }
});

// Functions
function saveConfig() {
  chrome.storage.local.set({ config }, () => {
    addLog('info', 'Settings saved');
  });
}

function savePipelineState() {
  if (currentSnapshotId) {
    chrome.storage.local.set({
      pipelineState: {
        snapshotId: currentSnapshotId,
        startTime: pipelineStartTime
      }
    });
  }
}

function clearPipelineState() {
  chrome.storage.local.remove('pipelineState');
}

function updateUI() {
  backendUrlInput.value = config.backendUrl;
  patientMrnInput.value = config.patientMrn;
  autoInferToggle.checked = config.autoInfer;

  document.getElementById('auto-infer-status').textContent =
    config.autoInfer ? 'On' : 'Off';
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
        captureMode: config.autoInfer ? 'auto' : 'manual',
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
    currentSnapshotId = result.id; // Store for E2E pipeline

    addLog('success', `Snapshot saved (ID: ${result.id.substring(0, 8)}...)`);
    config.snapshotCount++;
    updateUI();

    // Trigger AI extraction if configured
    if (config.autoInfer) {
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

// E2E Pipeline Functions
function resetPipelineUI() {
  captureStatusEl.textContent = '⏳';
  oracleStatusEl.textContent = '⏳';
  forgeStatusEl.textContent = '⏳';
  captureDataEl.textContent = '';
  oracleDataEl.textContent = '';
  forgeDataEl.textContent = '';
  captureDataEl.classList.remove('visible');
  oracleDataEl.classList.remove('visible');
  forgeDataEl.classList.remove('visible');
  codeResultsEl.classList.remove('visible', 'success', 'error');
}

function startPipelinePolling(pipelineStartTime) {
  if (pipelinePolling) {
    clearInterval(pipelinePolling);
  }

  // Poll every 2 seconds
  pipelinePolling = setInterval(async () => {
    try {
      const response = await fetch(`${config.backendUrl}/api/snapshots/${currentSnapshotId}/pipeline-status`);
      if (!response.ok) {
        throw new Error('Failed to fetch pipeline status');
      }

      const status = await response.json();
      updatePipelineUI(status);

      // Stop polling if all stages complete
      if (status.stages.forge.status === 'completed') {
        clearInterval(pipelinePolling);
        pipelinePolling = null;

        const totalDuration = ((performance.now() - pipelineStartTime) / 1000).toFixed(2);
        addLog('success', `🎉 E2E pipeline completed in ${totalDuration}s total!`);

        // Clear pipeline state from storage
        clearPipelineState();
      }
    } catch (error) {
      addLog('error', `Pipeline polling failed: ${error.message}`);
      clearInterval(pipelinePolling);
      pipelinePolling = null;

      // Clear pipeline state on error
      clearPipelineState();
    }
  }, 2000);
}

function updatePipelineUI(pipelineStatus) {
  const { stages } = pipelineStatus;

  // Calculate durations
  const captureTime = stages.capture.timestamp ? new Date(stages.capture.timestamp) : null;
  const oracleTime = stages.oracle.timestamp ? new Date(stages.oracle.timestamp) : null;
  const forgeTime = stages.forge.timestamp ? new Date(stages.forge.timestamp) : null;

  // Update Oracle status
  if (stages.oracle.status === 'completed') {
    oracleStatusEl.textContent = '✅';
    if (stages.oracle.data) {
      const duration = oracleTime && captureTime
        ? ((oracleTime - captureTime) / 1000).toFixed(2)
        : 'N/A';

      oracleDataEl.textContent = `⏱️ Duration: ${duration}s\n\n${JSON.stringify(stages.oracle.data, null, 2)}`;
      oracleDataEl.classList.add('visible');

      if (!oracleDataEl.dataset.logged) {
        addLog('success', `Oracle extraction completed in ${duration}s`);
        oracleDataEl.dataset.logged = 'true';
      }
    }
  } else if (stages.oracle.status === 'processing') {
    oracleStatusEl.textContent = '⏳';
  }

  // Update Forge status
  if (stages.forge.status === 'completed') {
    forgeStatusEl.textContent = '✅';
    if (stages.forge.data && stages.forge.data.code) {
      const duration = forgeTime && oracleTime
        ? ((forgeTime - oracleTime) / 1000).toFixed(2)
        : 'N/A';

      forgeDataEl.textContent = `⏱️ Duration: ${duration}s\nGenerated: ${stages.forge.data.code.length} characters\nVerified: ${stages.forge.data.verified}`;
      forgeDataEl.classList.add('visible');

      // Show test section
      testSection.style.display = 'block';
      extractorCodeTextarea.value = stages.forge.data.code;

      if (!forgeDataEl.dataset.logged) {
        addLog('success', `Forge code generation completed in ${duration}s`);
        forgeDataEl.dataset.logged = 'true';
      }
    }
  } else if (stages.forge.status === 'processing') {
    forgeStatusEl.textContent = '⏳';
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AUTO_INFER_COMPLETE') {
    addLog('success', 'Auto-infer completed');
    config.snapshotCount++;
    updateUI();
  } else if (message.type === 'AUTO_INFER_ERROR') {
    addLog('error', `Auto-infer failed: ${message.error}`);
  }
});
