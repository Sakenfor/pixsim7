/**
 * Devices management module
 *
 * Handles device loading and scanning.
 */


async function updateDevicesTab() {
  const result = await chrome.storage.local.get(['pixsim7Token']);
  const tokenCopySection = document.getElementById('tokenCopySection');
  const loginRequiredMessage = document.getElementById('loginRequiredMessage');
  const deviceScanSection = document.getElementById('deviceScanSection');

  if (result.pixsim7Token) {
    // Show token copy section, hide login message
    tokenCopySection.classList.remove('hidden');
    deviceScanSection.classList.remove('hidden');
    loginRequiredMessage.classList.add('hidden');

    // Fetch and display devices
    await loadDevices();
  } else {
    // Hide token copy section, show login message
    tokenCopySection.classList.add('hidden');
    deviceScanSection.classList.add('hidden');
    loginRequiredMessage.classList.remove('hidden');
  }
}

async function loadDevices() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getDevices' });

    if (response && response.success) {
      availableDevices = response.data || [];
      displayDevices(availableDevices);
      await populateGlobalDeviceSelect();
    } else {
      console.error('[Devices] Failed to load devices:', response?.error);
    }
  } catch (error) {
    console.error('[Devices] Error loading devices:', error);
  }
}

async function populateGlobalDeviceSelect() {
  const selectElement = document.getElementById('deviceSelect');
  if (!selectElement) return;

  // Clear and add no device option
  selectElement.innerHTML = '<option value="">No Device</option>';

  // Add available devices
  availableDevices.forEach(device => {
    const option = document.createElement('option');
    option.value = device.id || device.adb_id;
    option.textContent = `${device.name || device.adb_id}`;
    if (device.status !== 'online') {
      option.disabled = true;
      option.textContent += ' (offline)';
      option.style.color = '#6b7280';
    }
    selectElement.appendChild(option);
  });

  // Restore previously selected device if it still exists and is online
  try {
    const stored = await chrome.storage.local.get(DEVICE_SELECTION_STORAGE_KEY);
    const savedId = stored[DEVICE_SELECTION_STORAGE_KEY] || '';
    if (savedId) {
      const options = Array.from(selectElement.options);
      const match = options.find(
        (opt) => opt.value === savedId && !opt.disabled,
      );
      if (match) {
        selectElement.value = savedId;
      }
    }
  } catch (e) {
    console.warn('[Popup] Failed to restore selected device:', e);
  }
}

function displayDevices(devices) {
  // Find or create devices list container
  let devicesList = document.getElementById('devicesList');
  if (!devicesList) {
    // Insert devices list after token copy section
    const tokenCopySection = document.getElementById('tokenCopySection');
    devicesList = document.createElement('div');
    devicesList.id = 'devicesList';
    devicesList.style.marginBottom = '12px';
    tokenCopySection.parentNode.insertBefore(devicesList, tokenCopySection.nextSibling);
  }

  if (!devices || devices.length === 0) {
    devicesList.innerHTML = '<div class="info-box">No devices found. Run device_agent.py to register devices.</div>';
    return;
  }

  devicesList.innerHTML = `
    <div class="section-title">📱 Connected Devices (${devices.length})</div>
    ${devices.map(device => `
      <div class="device-card">
        <div class="device-info">
          <div class="device-name">${device.name || device.adb_id}</div>
          <div class="device-serial">${device.adb_id}</div>
          ${device.device_type ? `<div style="font-size: 9px; color: #9ca3af; margin-top: 2px;">${device.device_type}</div>` : ''}
        </div>
        <div class="device-status ${device.status}">${device.status || 'offline'}</div>
      </div>
    `).join('')}
  `;
}

async function handleScanDevices() {
  const btn = document.getElementById('scanDevicesBtn');
  btn.disabled = true;
  btn.textContent = '🔍 Scanning...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'apiRequest',
      path: '/automation/devices/scan',
      method: 'POST'
    });

    if (response && response.success) {
      const stats = response.data;
      showToast('success', `Scan complete! Found ${stats.scanned} devices. Added: ${stats.added}, Updated: ${stats.updated}`);
      await loadDevices();
    } else {
      showToast('error', 'Device scan failed: ' + (response?.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('[Devices] Scan failed:', error);
    showToast('error', 'Scan failed: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Scan for ADB Devices (BlueStacks, Emulators)';
  }
}

async function handleCopyToken() {
  try {
    const result = await chrome.storage.local.get(['pixsim7Token']);

    if (result.pixsim7Token) {
      await navigator.clipboard.writeText(result.pixsim7Token);
      showToast('success', 'Auth token copied to clipboard!');
    } else {
      showToast('error', 'No auth token found. Please login first.');
    }
  } catch (error) {
    console.error('[Devices] Failed to copy token:', error);
    showToast('error', 'Failed to copy token: ' + error.message);
  }
}

// ===== CONNECTION CHECK =====

async function checkBackendConnection() {
  const indicator = document.getElementById('connectionIndicator');
  indicator.className = 'connection-indicator checking';
  indicator.title = 'Checking connection...';

  try {
    const settings = await chrome.storage.local.get({ backendUrl: 'http://10.243.48.125:8001' });

    // Try to fetch health endpoint
    const response = await fetch(`${settings.backendUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000) // 3 second timeout
    });

    if (response.ok) {
      const data = await response.json();
      indicator.className = 'connection-indicator connected';
      indicator.title = `Connected to ${settings.backendUrl}\nStatus: ${data.status}\nProviders: ${data.providers?.join(', ') || 'none'}`;

      // Hide backend offline warning if visible
      const backendWarning = document.getElementById('backendOfflineWarning');
      if (backendWarning) {
        backendWarning.classList.add('hidden');
      }

      return true;
    } else {
      throw new Error(`Server returned ${response.status}`);
    }
  } catch (error) {
    const settings = await chrome.storage.local.get({ backendUrl: 'http://10.243.48.125:8001' });
    indicator.className = 'connection-indicator disconnected';
    indicator.title = `Cannot connect to ${settings.backendUrl}\nError: ${error.message}\nClick to retry`;

    // Show error message
    console.error('[Popup] Backend connection failed:', error);

    // Show warning in login section if visible
    const loginSection = document.getElementById('loginSection');
    const backendWarning = document.getElementById('backendOfflineWarning');
    if (loginSection && !loginSection.classList.contains('hidden') && backendWarning) {
      backendWarning.classList.remove('hidden');
    }

    return false;
  }
}

// Export main functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { loadDevices, handleScanDevices, checkBackendConnection };
}
