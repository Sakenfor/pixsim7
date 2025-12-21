/**
 * Settings management module
 *
 * Handles popup settings load/save/reset.
 */


async function loadSettings() {
  const result = await chrome.storage.local.get({
    backendUrl: 'http://10.243.48.125:8001',
    autoImport: false,
    defaultUploadProvider: 'pixverse',
  });

  document.getElementById('backendUrl').value = result.backendUrl;
  document.getElementById('autoImport').checked = result.autoImport;
  const dup = document.getElementById('defaultUploadProvider');
  if (dup) {
    await populateProvidersInSettings(result.defaultUploadProvider || 'pixverse');
  }
}

async function loadAccountExtendedInfoCacheFromStorage() {
  try {
    const stored = await chrome.storage.local.get(ACCOUNT_EXTENDED_INFO_CACHE_STORAGE_KEY);
    const raw = stored[ACCOUNT_EXTENDED_INFO_CACHE_STORAGE_KEY];
    if (!raw || typeof raw !== 'object') return;

    Object.entries(raw).forEach(([key, accountData]) => {
      const accountId = parseInt(key, 10);
      if (!Number.isFinite(accountId)) return;
      if (!accountData || typeof accountData !== 'object') return;

      // accountData structure: { ad_watch_task: {data, updatedAt}, account_stats: {data, updatedAt}, ... }
      accountExtendedInfoCache.set(accountId, accountData);
    });

    console.log('[Popup] Loaded extended info cache for', accountExtendedInfoCache.size, 'accounts');
  } catch (e) {
    console.warn('[Popup] Failed to restore account extended info cache from storage', e);
  }
}

function persistAccountExtendedInfoCache() {
  try {
    const serialized = {};
    accountExtendedInfoCache.forEach((accountData, accountId) => {
      serialized[accountId] = accountData;
    });
    chrome.storage.local.set({ [ACCOUNT_EXTENDED_INFO_CACHE_STORAGE_KEY]: serialized });
  } catch (e) {
    console.warn('[Popup] Failed to persist account extended info cache', e);
  }
}

async function saveSettings() {
  const backendUrl = document.getElementById('backendUrl').value.trim();
  const autoImport = document.getElementById('autoImport').checked;
  const defaultUploadProvider = document.getElementById('defaultUploadProvider')?.value || 'pixverse';

  if (!backendUrl) {
    showError('Backend URL cannot be empty');
    return;
  }

  await chrome.storage.local.set({
    backendUrl,
    autoImport,
    defaultUploadProvider,
  });

  const btn = document.getElementById('saveSettingsBtn');
  const originalText = btn.textContent;
  btn.textContent = EMOJI_STATES.SAVED;

  // Re-check connection with new URL
  await checkBackendConnection();

  setTimeout(() => {
    btn.textContent = originalText;
  }, 2000);
}

async function resetSettings() {
  const defaultUrl = 'http://10.243.48.125:8000';

  await chrome.storage.local.set({
    backendUrl: defaultUrl,
    autoImport: false,
    defaultUploadProvider: 'pixverse',
  });

  // Update UI
  document.getElementById('backendUrl').value = defaultUrl;
  document.getElementById('autoImport').checked = false;
  const dup = document.getElementById('defaultUploadProvider');
  if (dup) await populateProvidersInSettings('pixverse');
  const btn = document.getElementById('resetSettingsBtn');
  const originalText = btn.textContent;
  btn.textContent = EMOJI_STATES.RESET;

  // Re-check connection
  await checkBackendConnection();

  setTimeout(() => {
    btn.textContent = originalText;
  }, 2000);
}

async function populateProvidersInSettings(selectedId) {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getProviders' });
    const dup = document.getElementById('defaultUploadProvider');
    if (!dup) return;
    dup.innerHTML = '';
    const providers = (res && res.success && Array.isArray(res.data)) ? res.data : [{ provider_id: 'pixverse', name: 'Pixverse' }];
    providers.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.provider_id;
      opt.textContent = p.name || p.provider_id;
      dup.appendChild(opt);
    });
    dup.value = selectedId || providers[0].provider_id;
  } catch (e) {
    // Fallback options if API fails
    const dup = document.getElementById('defaultUploadProvider');
    if (dup) {
      dup.innerHTML = '<option value="pixverse">Pixverse</option>';
      dup.value = 'pixverse';
    }
  }
}

// ===== COOKIE IMPORT =====


// Export main functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { loadSettings, saveSettings, resetSettings };
}
