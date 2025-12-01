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
const PIXVERSE_STATUS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (ad watch tasks reset daily)
const PIXVERSE_STATUS_CACHE_STORAGE_KEY = 'pixsim7PixverseStatusCache';
const pixverseStatusCache = new Map();
const DEVICE_SELECTION_STORAGE_KEY = 'pixsim7SelectedDeviceId';
const PRESET_SELECTION_STORAGE_KEY = 'pixsim7SelectedPresetId';
const LOOP_SELECTION_STORAGE_KEY = 'pixsim7SelectedLoopId';
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

  // Restore cached Pixverse ad status (if any) so we can show
  // previously-fetched values without hitting the API on every popup open.
  await loadPixverseStatusCacheFromStorage();

  // Check backend connection
  await checkBackendConnection();

  // Check if logged in
  await checkLogin();

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

// ===== CREDIT SYNC (THROTTLED) =====

const CREDIT_SYNC_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const CREDIT_SYNC_TIMEOUT_MS = 2 * 60 * 1000; // watchdog for stuck in-progress flag
let creditSyncInProgress = false;
let creditSyncStartedAt = 0;

async function syncCreditsThrottled(reason, options = {}) {
  const force = options.force === true;
  const now = Date.now();

  // Guard against overlapping syncs; if the flag looks stuck, reset it.
  if (creditSyncInProgress) {
    if (creditSyncStartedAt && (now - creditSyncStartedAt) > CREDIT_SYNC_TIMEOUT_MS) {
      console.warn('[Popup] Credit sync flag appears stuck; resetting and continuing:', reason);
      creditSyncInProgress = false;
      creditSyncStartedAt = 0;
    } else {
      console.log('[Popup] Credit sync already in progress, skipping:', reason);
      return;
    }
  }

  try {
    const stored = await chrome.storage.local.get({ lastCreditSyncAt: null });
    const lastCreditSyncAt = stored.lastCreditSyncAt;

    if (!force && lastCreditSyncAt && now - lastCreditSyncAt < CREDIT_SYNC_THRESHOLD_MS) {
      console.log('[Popup] Skipping credit sync (throttled):', reason);
      return;
    }

    creditSyncInProgress = true;
    creditSyncStartedAt = now;
    console.log('[Popup] Syncing credits...', reason);

    const syncResult = await chrome.runtime.sendMessage({ action: 'syncAllCredits' });
    if (syncResult && syncResult.success) {
      console.log(`[Popup] Synced credits for ${syncResult.synced}/${syncResult.total} accounts`);
      await chrome.storage.local.set({ lastCreditSyncAt: now });

      // Clear ad status cache so it gets refreshed on next view
      pixverseStatusCache.clear();
      persistPixverseStatusCache();

      // Refresh accounts to show updated credits if Accounts tab is active
      if (currentUser && document.getElementById('tab-accounts').classList.contains('active')) {
        await loadAccounts();
      }
    } else if (syncResult && syncResult.error) {
      console.warn('[Popup] Credit sync failed:', syncResult.error);
    }
  } catch (err) {
    console.warn('[Popup] Credit sync error:', err);
  } finally {
    creditSyncInProgress = false;
    creditSyncStartedAt = 0;
  }
}

async function refreshAdStatusForVisibleAccounts() {
  try {
    // Prefer the currently detected provider_id (e.g. "pixverse") for backend filtering.
    const providerFilter = currentProvider && currentProvider.provider_id
      ? currentProvider.provider_id
      : null;

    const accounts = await chrome.runtime.sendMessage({
      action: 'getAccounts',
      providerId: providerFilter || undefined,
    });

    if (!accounts || !accounts.success || !Array.isArray(accounts.data)) {
      console.warn('[Popup] Failed to fetch accounts for ad status refresh');
      return;
    }

    const pixverseAccounts = accounts.data.filter(acc => acc.provider_id === 'pixverse');

    // Update ad-status pills for visible Pixverse account cards
    pixverseAccounts.forEach((acc) => {
      const pillEl = document.querySelector(`.account-ad-pill[data-account-id="${acc.id}"]`);
      if (pillEl) {
        attachPixverseAdStatus(acc, pillEl);
      }
    });
  } catch (err) {
    console.warn('[Popup] Error refreshing ad status:', err);
  }
}

// ===== TAB MANAGEMENT =====

function switchTab(tabId) {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  // Update tab panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-${tabId}`);
  });

  // Load accounts when switching to Accounts tab
  if (tabId === 'accounts' && currentUser) {
    showAutomationToolbar(true);
    loadAutomationOptions();
    loadAccounts();
  }

  // Update devices tab UI when switching to it
  if (tabId === 'devices') {
    updateDevicesTab();
  }
}

// ===== AUTHENTICATION =====

async function checkLogin() {
  const result = await chrome.storage.local.get(['pixsim7Token', 'currentUser']);

  if (result.pixsim7Token && result.currentUser) {
    currentUser = result.currentUser;
    showLoggedIn();
  } else if (result.pixsim7Token && !result.currentUser) {
    // Token exists but user not cached (e.g., after extension restart)
    try {
      const me = await chrome.runtime.sendMessage({ action: 'getMe' });
      if (me && me.success) {
        currentUser = me.data;
        showLoggedIn();
      } else {
        showLogin();
      }
    } catch (e) {
      showLogin();
    }
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('loginSection').classList.remove('hidden');
  document.getElementById('loggedInSection').classList.add('hidden');
  document.getElementById('notLoggedInWarning').classList.remove('hidden');
}

function showLoggedIn() {
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('loggedInSection').classList.remove('hidden');
  document.getElementById('notLoggedInWarning').classList.add('hidden');
  document.getElementById('loggedInUser').textContent = currentUser.username;

  // Load accounts when switching to Accounts tab or on login
  if (document.getElementById('tab-accounts').classList.contains('active')) {
    loadAccounts();
  }

  // Update devices tab if it's active
  if (document.getElementById('tab-devices').classList.contains('active')) {
    updateDevicesTab();
  }
}

async function handleLogin() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) {
    showError('Please enter email and password');
    return;
  }

  const loginBtn = document.getElementById('loginBtn');
  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'login',
      email,
      password,
    });

    if (response.success) {
      currentUser = response.data.user;
      showLoggedIn();
    } else {
      showError(response.error || 'Login failed');
    }
  } catch (error) {
    showError(`Login error: ${error.message}`);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login to PixSim7';
  }
}

async function handleLogout() {
  await chrome.storage.local.remove(['pixsim7Token', 'currentUser']);
  currentUser = null;
  currentProvider = null;
  showLogin();

  // Update devices tab if it's active
  if (document.getElementById('tab-devices').classList.contains('active')) {
    updateDevicesTab();
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

function formatCredits(credits, totalCredits) {
  if (!credits || Object.keys(credits).length === 0) {
    return '<span class="credits-none">No credits</span>';
  }

  // Order: show web/openapi first (Pixverse), then other known buckets.
  const order = ['web', 'openapi', 'daily', 'monthly', 'package'];
  const ordered = [];
  
  order.forEach(type => {
    if (credits[type] !== undefined) {
      ordered.push({ type, amount: credits[type] });
    }
  });
  
  // Add any remaining types not in order
  Object.entries(credits).forEach(([type, amount]) => {
    if (!order.includes(type)) {
      ordered.push({ type, amount });
    }
  });

  const parts = ordered.map(({ type, amount }) => {
    // Simple display mapping; keep keys readable
    const label =
      type === 'web' ? 'web' :
      type === 'openapi' ? 'openapi' :
      type;

    return `<span class="credit-item"><span class="credit-type">${label}</span>: <span class="credit-amount">${amount}</span></span>`;
  });

  // Show total if available and different from single credit
  if (totalCredits !== undefined && ordered.length > 1) {
    parts.push(`<span class="credit-item credit-total"><span class="credit-type">total</span>: <span class="credit-amount">${totalCredits}</span></span>`);
  }

  return parts.join('');
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  if (diff < 5000) return 'just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function handleAccountLogin(account, event) {
  console.log('[Popup] Login with account:', account.email);
  try {
    // Determine whether to reuse the current tab or open a new one.
    // Ctrl-click (or Cmd-click on macOS, or middle-click) should open
    // a new tab, preserving whatever state the current Pixverse tab
    // already has.
    const useNewTab =
      (event && (event.ctrlKey || event.metaKey || event.button === 1)) || false;

    // For Pixverse password-based accounts, attempt an automated re-auth
    // on Login only when the backend reports clearly broken auth state
    // (expired JWT or no JWT/cookies). Healthy sessions skip re-auth so
    // consecutive Logins stay fast.
    const shouldAttemptReauth =
      account.provider_id === 'pixverse' &&
      !account.is_google_account &&
      (
        account.jwt_expired === true ||
        !account.has_jwt ||
        !account.has_cookies
      );

    if (shouldAttemptReauth) {
      try {
        showToast('info', 'Re-authenticating Pixverse session...');
        const reauthRes = await chrome.runtime.sendMessage({
          action: 'reauthAccounts',
          accountIds: [account.id],
        });
        if (!reauthRes || !reauthRes.success) {
          console.warn('[Popup] Auto re-auth on Login failed:', reauthRes?.error);
          showError(reauthRes?.error || 'Re-auth failed; opening with existing session');
        } else {
          showToast('success', 'Pixverse session refreshed');
        }
      } catch (reauthErr) {
        console.warn('[Popup] Auto re-auth on Login threw:', reauthErr);
        // Continue to attempt login with whatever credentials we have.
      }
    }

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const res = await chrome.runtime.sendMessage({
      action: 'loginWithAccount',
      accountId: account.id,
      accountEmail: account.email,
      tabId: useNewTab
        ? undefined
        : (activeTab && typeof activeTab.id === 'number' ? activeTab.id : undefined),
    });
    if (!res || !res.success) {
      showError(res?.error || 'Failed to open logged-in tab');
    }
  } catch (e) {
    showError(e.message);
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

// ===== DEVICES TAB =====

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

// ===== UTILITIES =====

function showError(message) {
  showToast('error', message);
}
