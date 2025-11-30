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
const PIXVERSE_STATUS_CACHE_TTL_MS = 60 * 1000;
const PIXVERSE_STATUS_CACHE_STORAGE_KEY = 'pixsim7PixverseStatusCache';
const pixverseStatusCache = new Map();
const DEVICE_SELECTION_STORAGE_KEY = 'pixsim7SelectedDeviceId';
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
    if (message && message.action === 'accountsUpdated') {
      if (currentUser) {
        clearAccountsCache(message.providerId || null).catch(() => {});
        loadAccounts();
        if (message.email) {
          showLastImport(`Updated ${message.email}`);
        }
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

function getAccountsCacheKey(providerId) {
  return providerId || ACCOUNTS_CACHE_SCOPE_ALL;
}

async function clearAccountsCache(providerId) {
  const stored = await chrome.storage.local.get(ACCOUNTS_CACHE_KEY);
  const cache = stored[ACCOUNTS_CACHE_KEY] || {};
  if (providerId) {
    delete cache[getAccountsCacheKey(providerId)];
  }
  delete cache[ACCOUNTS_CACHE_SCOPE_ALL];
  await chrome.storage.local.set({ [ACCOUNTS_CACHE_KEY]: cache });
}

async function readAccountsCache(cacheKey) {
  const stored = await chrome.storage.local.get(ACCOUNTS_CACHE_KEY);
  const cache = stored[ACCOUNTS_CACHE_KEY] || {};
  return cache[cacheKey] || null;
}

async function writeAccountsCache(cacheKey, accounts) {
  const stored = await chrome.storage.local.get(ACCOUNTS_CACHE_KEY);
  const cache = stored[ACCOUNTS_CACHE_KEY] || {};
  cache[cacheKey] = {
    accounts,
    updatedAt: Date.now(),
  };
  await chrome.storage.local.set({ [ACCOUNTS_CACHE_KEY]: cache });
}

function analyzeAccountJwt(accounts) {
  const missing = accounts.filter(a => !a.has_jwt);
  const expired = accounts.filter(a => a.has_jwt && a.jwt_expired);
  const providers = [...new Set([...missing, ...expired].map(a => a.provider_id))];
  const accountIds = [...new Set([...missing, ...expired].map(a => a.id))];
  return { missing, expired, providers, accountIds };
}

function updateJwtBanner(health) {
  const banner = document.getElementById('jwtAlert');
  const textEl = document.getElementById('jwtAlertText');
  if (!banner || !textEl) {
    return;
  }

  if (!currentUser || (health.missing.length === 0 && health.expired.length === 0)) {
    banner.classList.add('hidden');
    textEl.textContent = '';
    return;
  }

  const parts = [];
  if (health.missing.length) {
    parts.push(`${health.missing.length} without session`);
  }
  if (health.expired.length) {
    parts.push(`${health.expired.length} expired`);
  }

  textEl.textContent = `${parts.join(' • ')}. Click "Fix Sessions" to open provider login tabs, sign in, then re-import cookies.`;
  banner.classList.remove('hidden');
}

async function handleReauthMissingJwt() {
  if (!currentUser) {
    return showError('Please login first');
  }

  const targetAccountIds = accountJwtHealth.accountIds || [];
  if (!targetAccountIds.length) {
    showToast('info', 'All accounts have active sessions');
    return;
  }

  const confirmMsg = `Attempt to re-authenticate ${targetAccountIds.length} account(s) using stored credentials?`;
  if (!window.confirm(confirmMsg)) return;

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'reauthAccounts',
      accountIds: targetAccountIds,
    });

    if (res && res.success) {
      showToast('success', `Re-auth triggered for ${targetAccountIds.length} account(s).`);
      clearAccountsCache(currentProvider?.provider_id || null).catch(() => {});
      loadAccounts();
    } else {
      const errorMsg = res?.error || 'Re-auth failed';
      showError(errorMsg);
    }
  } catch (error) {
    showError(`Re-auth error: ${error.message}`);
  }
}

async function loadAccounts() {
  if (!currentUser) {
    return; // Don't load if not logged in
  }

  const accountsList = document.getElementById('accountsList');
  const accountsLoading = document.getElementById('accountsLoading');
  const accountsError = document.getElementById('accountsError');

  const cacheKey = getAccountsCacheKey(currentProvider?.provider_id || null);
  const cachedEntry = await readAccountsCache(cacheKey);

  accountsError.classList.add('hidden');

  if (cachedEntry) {
    displayAccounts(cachedEntry.accounts, { lastUpdatedAt: cachedEntry.updatedAt });
    accountsLoading.classList.add('hidden');
  } else {
    accountsList.innerHTML = '';
    accountsLoading.textContent = 'Loading accounts...';
    accountsLoading.classList.remove('hidden');
  }

  const requestId = ++accountsRequestSeq;
  accountsError.classList.add('hidden');

  try {
    // Request accounts from backend (filtered by provider if detected)
    const response = await chrome.runtime.sendMessage({
      action: 'getAccounts',
      providerId: currentProvider?.provider_id || null,
    });

    if (requestId !== accountsRequestSeq) {
      return;
    }

    accountsLoading.classList.add('hidden');

    if (response.success) {
      const accounts = response.data;
      displayAccounts(accounts, { lastUpdatedAt: Date.now() });
      await writeAccountsCache(cacheKey, accounts);
    } else {
      if (cachedEntry) {
        showToast('error', response.error || 'Failed to refresh accounts');
      } else {
        showAccountsError(response.error || 'Failed to load accounts');
      }
    }
  } catch (error) {
    if (requestId !== accountsRequestSeq) {
      return;
    }
    accountsLoading.classList.add('hidden');
    if (cachedEntry) {
      showToast('error', `Failed to refresh accounts: ${error.message}`);
    } else {
      showAccountsError(`Error: ${error.message}`);
    }
  }
}

function displayAccounts(accounts, options = {}) {
  const accountsList = document.getElementById('accountsList');
  const accountCount = document.getElementById('accountCount');
  const lastUpdatedAt = options.lastUpdatedAt || null;

  accountJwtHealth = analyzeAccountJwt(accounts);
  updateJwtBanner(accountJwtHealth);

  accountCount.textContent = `(${accounts.length})`;
  accountsList.innerHTML = '';

  if (accounts.length === 0) {
    accountsList.innerHTML = `
      <div class="info-box">
        No accounts found${currentProvider ? ` for ${currentProvider.name}` : ''}.
        Add accounts via the PixSim7 backend.
      </div>
    `;
    return;
  }

  // Add sort and filter controls
  const sortControls = document.createElement('div');
  sortControls.className = 'sort-controls';
  sortControls.innerHTML = `
    <button class="sort-btn ${accountsSortBy === 'credits' ? 'active' : ''}" data-sort="credits">
      ${accountsSortBy === 'credits' ? (accountsSortDesc ? '↓' : '↑') : ''} Credits
    </button>
    <button class="sort-btn ${accountsSortBy === 'name' ? 'active' : ''}" data-sort="name">
      ${accountsSortBy === 'name' ? (accountsSortDesc ? '↓' : '↑') : ''} Name
    </button>
    <button class="sort-btn ${accountsSortBy === 'lastUsed' ? 'active' : ''}" data-sort="lastUsed">
      ${accountsSortBy === 'lastUsed' ? (accountsSortDesc ? '↓' : '↑') : ''} Last Used
    </button>
    <span style="font-size: 9px; color: #4b5563; margin: 0 3px;">•</span>
    <button class="sort-btn ${hideZeroCredits ? 'active' : ''}" data-filter="hideZero">
      ${hideZeroCredits ? '✓ ' : ''}Hide Empty
    </button>
  `;

  sortControls.querySelectorAll('.sort-btn[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sortKey = btn.getAttribute('data-sort');
      if (accountsSortBy === sortKey) {
        accountsSortDesc = !accountsSortDesc;
      } else {
        accountsSortBy = sortKey;
        accountsSortDesc = true;
      }
      displayAccounts(accounts);
    });
  });

  sortControls.querySelector('[data-filter="hideZero"]').addEventListener('click', () => {
    hideZeroCredits = !hideZeroCredits;
    displayAccounts(accounts);
  });

  accountsList.appendChild(sortControls);

  if (lastUpdatedAt) {
    const refreshInfo = document.createElement('div');
    const isStale = (Date.now() - lastUpdatedAt) > ACCOUNTS_CACHE_TTL_MS;
    refreshInfo.style.cssText = 'font-size: 9px; text-align: right; padding: 2px 6px; opacity: 0.7;';
    refreshInfo.style.color = isStale ? '#fbbf24' : '#6b7280';
    refreshInfo.textContent = `${formatRelativeTime(lastUpdatedAt)}${isStale ? ' ⚠' : ''}`;
    accountsList.appendChild(refreshInfo);
  }

  // Filter accounts
  let filtered = [...accounts];
  if (hideZeroCredits) {
    filtered = filtered.filter(a => (a.total_credits || 0) > 0);
  }

  // Sort accounts
  const sorted = filtered.sort((a, b) => {
    let cmp = 0;
    switch (accountsSortBy) {
      case 'name':
        cmp = (a.nickname || a.email).localeCompare(b.nickname || b.email);
        break;
      case 'credits':
        cmp = (a.total_credits || 0) - (b.total_credits || 0);
        break;
      case 'lastUsed':
        const aTime = a.last_used ? new Date(a.last_used).getTime() : 0;
        const bTime = b.last_used ? new Date(b.last_used).getTime() : 0;
        cmp = aTime - bTime;
        break;
    }
    return accountsSortDesc ? -cmp : cmp;
  });

  // Show filtered count if filter is active
  if (hideZeroCredits && filtered.length < accounts.length) {
    const filterInfo = document.createElement('div');
    filterInfo.style.cssText = 'font-size: 9px; color: #6b7280; padding: 3px 6px; text-align: center; opacity: 0.8;';
    filterInfo.textContent = `${filtered.length}/${accounts.length} shown`;
    accountsList.appendChild(filterInfo);
  }

  sorted.forEach(account => {
    const card = createAccountCard(account);
    accountsList.appendChild(card);
  });
}

function createAccountCard(account) {
  const card = document.createElement('div');
  card.className = 'account-card';

  const statusClass = `status-${account.status}`;
  const totalCredits = account.total_credits || 0;
  const displayName = account.nickname || account.email;
  const isOwnedByCurrentUser = currentUser && account.user_id === currentUser.id;
  const canLoginWithAccount = isOwnedByCurrentUser && (account.has_cookies || account.has_jwt);
  const jwtFlag = !account.has_jwt
    ? { text: 'No JWT', color: '#b91c1c' }
    : (account.jwt_expired ? { text: 'Expired', color: '#f97316' } : null);
  const showAdPill = account.provider_id === 'pixverse';

  card.innerHTML = `
    <div class="account-header">
      <div class="account-title">
        <span class="account-status ${statusClass}" title="Status: ${account.status}"></span>
        <div style="flex: 1; min-width: 0;">
          <span class="account-name">${displayName}</span>
          ${account.nickname ? `<span class="account-email-sub">${account.email}</span>` : ''}
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
        ${jwtFlag ? `<span class="account-flag" style="background: ${jwtFlag.color}; color: white;">${jwtFlag.text}</span>` : ''}
        ${showAdPill ? `<span class="account-ad-pill" data-role="ad-pill" data-account-id="${account.id}">Ads ?/?</span>` : ''}
        <div class="account-credits">${totalCredits}</div>
      </div>
    </div>

    <div class="actions-row">
      ${canLoginWithAccount ? `
        <button
          class="account-btn btn-tiny"
          data-action="login"
          data-account-id="${account.id}"
          title="Login with this account"
        >
          ${EMOJI.GLOBE}
        </button>
      ` : `
        <button
          class="account-btn btn-tiny"
          disabled
          title="${!isOwnedByCurrentUser ? 'Can only open tabs for your own accounts' : 'No cookies/JWT available for this account'}"
        >
          ${EMOJI.GLOBE}
        </button>
      `}
      <button class="account-btn btn-ghost btn-tiny" data-action="run-preset" data-account-id="${account.id}" title="Run preset">${EMOJI.PLAY} Preset</button>
      <button class="account-btn btn-ghost btn-tiny" data-action="run-loop" data-account-id="${account.id}" title="Run loop">${EMOJI.PLAY} Loop</button>
    </div>
  `;

  // Add click handler for login button
  const actionButtons = card.querySelectorAll('.account-btn');
  actionButtons.forEach((btn) => {
    const action = btn.getAttribute('data-action');
    if (action === 'login') {
      btn.addEventListener('click', (event) => handleAccountLogin(account, event));
    } else if (action === 'run-preset') {
      btn.addEventListener('click', () => executePresetForAccount(account));
    } else if (action === 'run-loop') {
      btn.addEventListener('click', () => executeLoopForAccount(account));
    }
  });

  // If we have a cached Pixverse status for this account, render it
  // immediately so the pill persists across popup opens without having
  // to re-hit the backend every time.
  if (showAdPill) {
    const pillEl = card.querySelector('.account-ad-pill');
    const cacheEntry = pixverseStatusCache.get(account.id);
    if (pillEl && cacheEntry && (Date.now() - cacheEntry.updatedAt) < PIXVERSE_STATUS_CACHE_TTL_MS) {
      renderPixverseAdPill(pillEl, cacheEntry.data);
    }
  }

  return card;
}

function attachPixverseAdStatus(account, pillEl) {
  if (!pillEl) return;

  const cacheEntry = pixverseStatusCache.get(account.id);
  if (cacheEntry && (Date.now() - cacheEntry.updatedAt) < PIXVERSE_STATUS_CACHE_TTL_MS) {
    renderPixverseAdPill(pillEl, cacheEntry.data);
    return;
  }

  pillEl.textContent = 'Ads …';
  pillEl.title = 'Refreshing Pixverse status...';
  pillEl.style.fontSize = '10px';
  pillEl.style.color = '#6b7280';

  chrome.runtime.sendMessage(
    { action: 'getPixverseStatus', accountId: account.id },
    (res) => {
      if (!pillEl.isConnected) {
        return;
      }
      if (!res || !res.success) {
        console.warn('[Ads] API failed for account', account.id, res?.error);
        pillEl.textContent = 'Ads: N/A';
        pillEl.title = 'Failed to fetch ad status';
        pillEl.style.fontSize = '10px';
        pillEl.style.color = '#ef4444';
        return;
      }

      console.log('[Ads] Status for account', account.id, res.data);
      pixverseStatusCache.set(account.id, { data: res.data, updatedAt: Date.now() });
      persistPixverseStatusCache();
      if (pixverseStatusCache.size > 200) {
        const firstKey = pixverseStatusCache.keys().next().value;
        pixverseStatusCache.delete(firstKey);
      }
      renderPixverseAdPill(pillEl, res.data);
    }
  );
}

function renderPixverseAdPill(pillEl, payload) {
  if (!pillEl) return;

  // Debug: log the entire payload structure
  console.log('[Ads] Full payload:', JSON.stringify(payload, null, 2));
  console.log('[Ads] Payload keys:', Object.keys(payload || {}));

  const task = payload?.ad_watch_task;
  console.log('[Ads] ad_watch_task:', task);

  if (task && typeof task === 'object') {
    const progress = task.progress ?? 0;
    const total = task.total_counts ?? 0;
    const reward = task.reward ?? 0;
    console.log('[Ads] Task values - progress:', progress, 'total:', total, 'reward:', reward);
    pillEl.textContent = `Ads ${progress}/${total}`;
    pillEl.title = `Watch-ad task: ${progress}/${total}, reward ${reward}`;
    pillEl.style.fontSize = '10px';
    pillEl.style.color = '#6b7280';
  } else {
    console.warn('[Ads] No valid ad_watch_task found in payload');
    // Show 0/0 when no task data instead of hiding
    pillEl.textContent = 'Ads 0/0';
    pillEl.title = 'No ad watch task available';
    pillEl.style.fontSize = '10px';
    pillEl.style.color = '#9ca3af';
  }
}

// ===== AUTOMATION (Presets/Loops) =====

function showAutomationToolbar(show) {
  const el = document.getElementById('automationToolbar');
  if (!el) return;
  el.classList.toggle('hidden', !show);
}

async function loadAutomationOptions() {
  try {
    // Backend now filters by provider_id, no need for client-side filtering!
    const providerId = currentProvider?.provider_id || null;

    const [presetsRes, loopsRes] = await Promise.all([
      chrome.runtime.sendMessage({ action: 'getPresets', providerId }),
      chrome.runtime.sendMessage({ action: 'getLoops', providerId }),
    ]);

    if (presetsRes.success) automationOptions.presets = presetsRes.data || [];
    if (loopsRes.success) automationOptions.loops = loopsRes.data || [];

    populateAutomationSelects();
  } catch (e) {
    console.error('[Popup] Failed to load automation options', e);
  }
}

function populateAutomationSelects() {
  const presetSelect = document.getElementById('presetSelect');
  const loopSelect = document.getElementById('loopSelect');
  if (!presetSelect || !loopSelect) return;

  // Preserve selection
  const prevPreset = presetSelect.value;
  const prevLoop = loopSelect.value;

  presetSelect.innerHTML = '';
  loopSelect.innerHTML = '';

  automationOptions.presets.forEach(p => {
    const opt = document.createElement('option');
    opt.value = String(p.id);
    opt.textContent = p.name || `Preset #${p.id}`;
    presetSelect.appendChild(opt);
  });

  automationOptions.loops.forEach(l => {
    const opt = document.createElement('option');
    opt.value = String(l.id);
    opt.textContent = l.name || `Loop #${l.id}`;
    loopSelect.appendChild(opt);
  });

  if (prevPreset) presetSelect.value = prevPreset;
  if (prevLoop) loopSelect.value = prevLoop;
}

async function executePresetForAccount(account) {
  const presetSelect = document.getElementById('presetSelect');
  const presetId = presetSelect && presetSelect.value ? parseInt(presetSelect.value, 10) : null;
  if (!presetId) {
    return showError('Select a preset in the toolbar');
  }

  // Get selected device from global selector
  const deviceSelect = document.getElementById('deviceSelect');
  const deviceId = deviceSelect?.value || null;

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'executePreset',
      presetId,
      accountId: account.id,
      deviceId: deviceId || undefined,
    });
    if (res.success) {
      showLastImport(`Queued preset '${res.data.preset_name}' for ${account.email}${deviceId ? ' on device' : ''}`);
      showToast('success', `Preset queued for ${account.email}`);
    } else {
      showError(res.error || 'Failed to queue preset');
    }
  } catch (e) {
    showError(`Error: ${e.message}`);
  }
}

async function executeLoopForAccount(account) {
  const loopSelect = document.getElementById('loopSelect');
  const loopId = loopSelect && loopSelect.value ? parseInt(loopSelect.value, 10) : null;
  if (!loopId) {
    return showError('Select a loop in the toolbar');
  }

  // Get selected device from global selector
  const deviceSelect = document.getElementById('deviceSelect');
  const deviceId = deviceSelect?.value || null;

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'executeLoopForAccount',
      loopId,
      accountId: account.id,
      deviceId: deviceId || undefined,
    });
    if (res.success) {
      showLastImport(`Queued loop preset '${res.data.preset_name}' for ${account.email}${deviceId ? ' on device' : ''}`);
      showToast('success', `Loop queued for ${account.email}`);
    } else {
      showError(res.error || 'Failed to queue loop execution');
    }
  } catch (e) {
    showError(`Error: ${e.message}`);
  }
}

// ===== Toasts =====

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

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const res = await chrome.runtime.sendMessage({
      action: 'loginWithAccount',
      accountId: account.id,
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

async function loadPixverseStatusCacheFromStorage() {
  try {
    const stored = await chrome.storage.local.get(PIXVERSE_STATUS_CACHE_STORAGE_KEY);
    const raw = stored[PIXVERSE_STATUS_CACHE_STORAGE_KEY];
    if (!raw || typeof raw !== 'object') return;

    Object.entries(raw).forEach(([key, entry]) => {
      const accountId = parseInt(key, 10);
      if (!Number.isFinite(accountId)) return;
      if (!entry || typeof entry !== 'object') return;
      const data = entry.data;
      const updatedAt = entry.updatedAt;
      if (!data || typeof updatedAt !== 'number') return;
      pixverseStatusCache.set(accountId, { data, updatedAt });
    });
  } catch (e) {
    console.warn('[Popup] Failed to restore Pixverse status cache from storage', e);
  }
}

function persistPixverseStatusCache() {
  try {
    const serialized = {};
    pixverseStatusCache.forEach((entry, accountId) => {
      serialized[accountId] = entry;
    });
    chrome.storage.local.set({ [PIXVERSE_STATUS_CACHE_STORAGE_KEY]: serialized });
  } catch (e) {
    console.warn('[Popup] Failed to persist Pixverse status cache', e);
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

// ===== UTILITIES =====

function showError(message) {
  showToast('error', message);
}
