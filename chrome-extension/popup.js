/**
 * Popup Logic - Thin client for PixSim7 backend
 *
 * Communicates with backend via background script to:
 * - Authenticate users
 * - Detect providers from current tab
 * - Display and manage accounts
 */

console.log('[Popup] Loaded');

// State
let currentProvider = null;
let currentUser = null;
let automationOptions = { presets: [], loops: [] };
let hideZeroCredits = false; // Filter for hiding accounts with 0 credits
let accountsSortBy = 'lastUsed'; // 'name', 'status', 'credits', 'lastUsed', 'success'
let accountsSortDesc = true;
const ACCOUNTS_CACHE_KEY = 'pixsim7AccountCache';
const ACCOUNTS_CACHE_SCOPE_ALL = '__all__';
const ACCOUNTS_CACHE_TTL_MS = 60 * 1000;
let accountsRequestSeq = 0;
// Unified account extended info cache (per-field TTLs)
const ACCOUNT_EXTENDED_INFO_CACHE_STORAGE_KEY = 'pixsim7AccountExtendedInfoCache';
const ACCOUNT_EXTENDED_INFO_TTLs = {
  // Keep short so UI reflects backend/task changes (Pixverse daily cap can vary).
  ad_watch_task: 5 * 60 * 1000,         // 5 minutes
  account_stats: 60 * 60 * 1000,        // 1 hour (changes infrequently)
  credits: 5 * 60 * 1000,               // 5 minutes (for future use)
};
const accountExtendedInfoCache = new Map();
const DEVICE_SELECTION_STORAGE_KEY = 'pixsim7SelectedDeviceId';
const PRESET_SELECTION_STORAGE_KEY = 'pixsim7SelectedPresetId';
const LOOP_SELECTION_STORAGE_KEY = 'pixsim7SelectedLoopId';
const FILTER_STATE_STORAGE_KEY = 'pixsim7FilterState';
let showAllProviders = false; // When true, ignore currentProvider filter
let accountJwtHealth = {
  missing: [],
  expired: [],
  providers: [],
};
  let availableDevices = [];

// ===== INIT =====

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Popup] Initializing...');

  // Setup event listeners
  setupEventListeners();

  // Load settings
  await loadSettings();

  // Setup settings sub-tabs and debug listeners
  setupSettingsSubtabs();
  setupDebugSettingsListeners();

  // Restore filter state (sort, hide empty, etc.)
  await loadFilterState();

  // Restore cached account extended info (ad status, stats, etc.)
  await loadAccountExtendedInfoCacheFromStorage();

  // Check backend connection
  await checkBackendConnection();

  // Check if logged in
  await checkLogin();

  // Restore last active tab (after login check so tab is only shown if logged in)
  await restoreLastTab();

  // Detect provider from current tab
  await detectProviderFromTab();

  // Load last import info
  await loadLastImport();

  // If popup regains focus, refresh accounts to reflect recent imports
  window.addEventListener('focus', () => {
    if (currentUser) {
      loadAccounts();
    }
  });

  // Preload automation options for Accounts tab
  await loadAutomationOptions();

  // Load devices to populate device selector in Accounts tab
  if (currentUser) {
    await loadDevices();
  }
});

// ===== EVENT LISTENERS =====

function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Login
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  // Remember selected device globally for presets/loops
  const globalDeviceSelect = document.getElementById('deviceSelect');
  if (globalDeviceSelect) {
    globalDeviceSelect.addEventListener('change', async () => {
      try {
        const value = globalDeviceSelect.value || '';
        await chrome.storage.local.set({ [DEVICE_SELECTION_STORAGE_KEY]: value });
      } catch (e) {
        console.warn('[Popup] Failed to persist selected device:', e);
      }
    });
  }

  // Remember selected preset
  const presetSelect = document.getElementById('presetSelect');
  if (presetSelect) {
    presetSelect.addEventListener('change', async () => {
      try {
        const value = presetSelect.value || '';
        await chrome.storage.local.set({ [PRESET_SELECTION_STORAGE_KEY]: value });
      } catch (e) {
        console.warn('[Popup] Failed to persist selected preset:', e);
      }
    });
  }

  // Remember selected loop
  const loopSelect = document.getElementById('loopSelect');
  if (loopSelect) {
    loopSelect.addEventListener('change', async () => {
      try {
        const value = loopSelect.value || '';
        await chrome.storage.local.set({ [LOOP_SELECTION_STORAGE_KEY]: value });
      } catch (e) {
        console.warn('[Popup] Failed to persist selected loop:', e);
      }
    });
  }

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  // Refresh accounts
  const refreshBtn = document.getElementById('refreshBtn');
  const refreshBtnTop = document.getElementById('refreshBtnTop');
  const refreshAdBtn = document.getElementById('refreshAdStatusBtn');
  const refreshAdBtnTop = document.getElementById('refreshAdStatusBtnTop');

  const handleRefreshClick = () => {
    if (currentUser) {
      syncCreditsThrottled('manual-refresh', { force: true });
    }
  };
  if (refreshBtn) refreshBtn.addEventListener('click', handleRefreshClick);
  if (refreshBtnTop) refreshBtnTop.addEventListener('click', handleRefreshClick);

  const handleRefreshAdStatusClick = () => {
    if (currentUser) {
      refreshAdStatusForVisibleAccounts().catch(() => {});
    }
  };
  if (refreshAdBtn) refreshAdBtn.addEventListener('click', handleRefreshAdStatusClick);
  if (refreshAdBtnTop) refreshAdBtnTop.addEventListener('click', handleRefreshAdStatusClick);

  // Import cookies
  document.getElementById('importBtn').addEventListener('click', handleImportCookies);

  // Save settings
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

  // Reset settings
  document.getElementById('resetSettingsBtn').addEventListener('click', resetSettings);

  // Connection indicator click - retry connection
  document.getElementById('connectionIndicator').addEventListener('click', checkBackendConnection);

  // Open video player button - opens as floating popup window
  const openPlayerBtn = document.getElementById('openPlayerBtn');
  if (openPlayerBtn) {
    openPlayerBtn.addEventListener('click', () => {
      chrome.windows.create({
        url: chrome.runtime.getURL('player.html'),
        type: 'popup',
        width: 640,
        height: 520,
        top: 100,
        left: Math.max(100, screen.width - 700),
      });
    });
  }

  // Listen for updates from content/background to refresh accounts/credits
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !message.action) return;

    if (message.action === 'accountsUpdated') {
      if (currentUser) {
        clearAccountsCache(message.providerId || null).catch(() => {});
        loadAccounts();
        if (message.email) {
          showLastImport(`Updated ${message.email}`);
        }
      }
    } else if (message.action === 'sessionStatus') {
      // Best-effort feedback after Login to indicate whether the
      // provider tab appears authenticated from the browser's POV.
      if (message.isAuthenticated) {
        showToast('success', 'Browser session looks authenticated');
      } else {
        showToast('error', 'Browser session not authenticated yet; you may need to log in manually');
      }
    } else if (message.action === 'forceLogout') {
      // Backend returned 401 - token expired or revoked
      console.warn('[Popup] Force logout - session expired');
      currentUser = null;
      currentProvider = null;
      showLogin();
      showToast('error', 'Session expired. Please log in again.');
    }
  });

  // Automation toolbar refresh
  const presetRefreshBtn = document.getElementById('presetRefreshBtn');
  const loopRefreshBtn = document.getElementById('loopRefreshBtn');
  if (presetRefreshBtn) presetRefreshBtn.addEventListener('click', loadAutomationOptions);
  if (loopRefreshBtn) loopRefreshBtn.addEventListener('click', loadAutomationOptions);

  // Copy token button
  const copyTokenBtn = document.getElementById('copyTokenBtn');
  if (copyTokenBtn) copyTokenBtn.addEventListener('click', handleCopyToken);

  // Scan devices button
  const scanDevicesBtn = document.getElementById('scanDevicesBtn');
  if (scanDevicesBtn) scanDevicesBtn.addEventListener('click', handleScanDevices);

  const reauthBtn = document.getElementById('reauthBtn');
  if (reauthBtn) reauthBtn.addEventListener('click', handleReauthMissingJwt);
}

// ===== TAB MANAGEMENT =====

const LAST_TAB_STORAGE_KEY = 'pixsim7LastActiveTab';

function switchTab(tabId) {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  // Update tab panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-${tabId}`);
  });

  // Save last active tab to storage
  chrome.storage.local.set({ [LAST_TAB_STORAGE_KEY]: tabId }).catch(() => {
    console.warn('[Popup] Failed to save last active tab');
  });

  // Load accounts when switching to Accounts tab
  if (tabId === 'accounts' && currentUser) {
    showAutomationToolbar(true);
    loadAutomationOptions();
    // Clear cache to force fresh fetch on tab entry
    const effectiveProviderId = showAllProviders ? null : (currentProvider?.provider_id || null);
    clearAccountsCache(effectiveProviderId).catch(() => {});
    loadAccounts();
  }

  // Update devices tab UI when switching to it
  if (tabId === 'devices') {
    updateDevicesTab();
  }
}

async function restoreLastTab() {
  // Only restore tab if logged in
  if (!currentUser) return;

  try {
    const result = await chrome.storage.local.get(LAST_TAB_STORAGE_KEY);
    const lastTab = result[LAST_TAB_STORAGE_KEY];

    if (lastTab) {
      console.log('[Popup] Restoring last tab:', lastTab);
      switchTab(lastTab);
    }
  } catch (e) {
    console.warn('[Popup] Failed to restore last tab:', e);
  }
}

// ===== PROVIDER DETECTION =====

async function detectProviderFromTab() {
  try {
    // Get current tab URL
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url) {
      showNoProvider();
      return;
    }

    // Ask backend to detect provider
    const response = await chrome.runtime.sendMessage({
      action: 'detectProvider',
      url: tab.url,
    });

    if (response.success && response.data.detected) {
      currentProvider = response.data.provider;
      showProvider(currentProvider);

      // Reload accounts if logged in
      if (currentUser) {
        await loadAutomationOptions();
        await loadAccounts();
      }
    } else {
      currentProvider = null;
      showNoProvider();
    }
  } catch (error) {
    console.error('[Popup] Provider detection error:', error);
    showNoProvider();
  }
}

function showProvider(provider) {
  document.getElementById('providerInfo').classList.remove('hidden');
  document.getElementById('noProviderInfo').classList.add('hidden');
  document.getElementById('detectedProvider').textContent = provider.name;
}

function showNoProvider() {
  document.getElementById('providerInfo').classList.add('hidden');
  document.getElementById('noProviderInfo').classList.remove('hidden');
}

// ===== ACCOUNTS =====

function showToast(type, message, timeoutMs = 2500) {
  try {
    const container = document.getElementById('toastContainer');
    if (!container) return alert(message);
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => { el.remove(); }, timeoutMs);
  } catch (e) {
    // Fallback
    alert(message);
  }
}

function showAccountsError(message) {
  const accountsError = document.getElementById('accountsError');
  accountsError.textContent = message;
  accountsError.classList.remove('hidden');
}

// ===== SETTINGS =====

async function handleImportCookies() {
  if (!currentProvider) {
    showError('No provider detected on current tab');
    return;
  }

  const btn = document.getElementById('importBtn');
  btn.disabled = true;
  btn.textContent = '📥 Importing...';

  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send import message to content script on that tab
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'manualImport'
    });

    if (response.success) {
      btn.textContent = EMOJI_STATES.IMPORTED;

      // Show import info
      showLastImport(`Imported from ${currentProvider.name}`);

      // Reload accounts
      await loadAccounts();

      setTimeout(() => {
        btn.textContent = EMOJI_STATES.IMPORT_PROMPT;
      }, 2000);
    } else {
      showError(response.error || 'Import failed');
      btn.textContent = EMOJI_STATES.IMPORT_PROMPT;
    }
  } catch (error) {
    console.error('[Popup] Import error:', error);
    showError(`Import error: ${error.message}`);
    btn.textContent = EMOJI_STATES.IMPORT_PROMPT;
  } finally {
    btn.disabled = false;
  }
}

function showLastImport(message) {
  const lastImportInfo = document.getElementById('lastImportInfo');
  const lastImportText = document.getElementById('lastImportText');

  lastImportText.textContent = message;
  lastImportInfo.classList.remove('hidden');

  // Store in extension storage
  chrome.storage.local.set({
    lastImport: {
      message,
      timestamp: new Date().toISOString()
    }
  });
}

async function loadLastImport() {
  const result = await chrome.storage.local.get('lastImport');
  if (result.lastImport) {
    const date = new Date(result.lastImport.timestamp);
    const timeAgo = getTimeAgo(date);
    showLastImport(`${result.lastImport.message} (${timeAgo})`);
  }
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ===== FILTER STATE PERSISTENCE =====

async function loadFilterState() {
  try {
    const stored = await chrome.storage.local.get(FILTER_STATE_STORAGE_KEY);
    const state = stored[FILTER_STATE_STORAGE_KEY] || {};
    hideZeroCredits = state.hideZeroCredits ?? false;
    accountsSortBy = state.accountsSortBy ?? 'lastUsed';
    accountsSortDesc = state.accountsSortDesc ?? true;
    showAllProviders = state.showAllProviders ?? false;
    console.log('[Popup] Loaded filter state:', { hideZeroCredits, accountsSortBy, accountsSortDesc, showAllProviders });
  } catch (e) {
    console.warn('[Popup] Failed to load filter state:', e);
  }
}

async function saveFilterState() {
  try {
    await chrome.storage.local.set({
      [FILTER_STATE_STORAGE_KEY]: {
        hideZeroCredits,
        accountsSortBy,
        accountsSortDesc,
        showAllProviders,
      }
    });
  } catch (e) {
    console.warn('[Popup] Failed to save filter state:', e);
  }
}

// ===== UTILITIES =====

function showError(message) {
  showToast('error', message);
}
