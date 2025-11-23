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
const pixverseStatusCache = new Map();
let accountJwtHealth = {
  missing: [],
  expired: [],
  providers: [],
};

// ===== INIT =====

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Popup] Initializing...');

  // Setup event listeners
  setupEventListeners();

  // Load settings
  await loadSettings();

  // Check backend connection
  await checkBackendConnection();

  // Check if logged in
  await checkLogin();

  // Sync credits on popup open (only if logged in, throttled)
  if (currentUser) {
    syncCreditsThrottled('popup-open'); // fire-and-forget, best-effort
  }

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

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  // Refresh accounts
  document.getElementById('refreshBtn').addEventListener('click', loadAccounts);

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

  const reauthBtn = document.getElementById('reauthBtn');
  if (reauthBtn) reauthBtn.addEventListener('click', handleReauthMissingJwt);
}

// ===== CREDIT SYNC (THROTTLED) =====

const CREDIT_SYNC_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

async function syncCreditsThrottled(reason, options = {}) {
  const force = options.force === true;

  try {
    const now = Date.now();
    const { lastCreditSyncAt, creditSyncInProgress } = await chrome.storage.local.get({
      lastCreditSyncAt: null,
      creditSyncInProgress: false,
    });

    if (creditSyncInProgress) {
      console.log('[Popup] Credit sync already in progress, skipping:', reason);
      return;
    }

    if (!force && lastCreditSyncAt && now - lastCreditSyncAt < CREDIT_SYNC_THRESHOLD_MS) {
      console.log('[Popup] Skipping credit sync (throttled):', reason);
      return;
    }

    await chrome.storage.local.set({ creditSyncInProgress: true });
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
    await chrome.storage.local.set({ creditSyncInProgress: false });
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

      // Sync credits for all accounts after login (best-effort, forced)
      loginBtn.textContent = 'Syncing credits...';
      await syncCreditsThrottled('login', { force: true });
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
    <span style="font-size: 9px; color: #9ca3af; margin-right: 4px;">Sort:</span>
    <button class="sort-btn ${accountsSortBy === 'credits' ? 'active' : ''}" data-sort="credits">
      Credits ${accountsSortBy === 'credits' ? (accountsSortDesc ? '↓' : '↑') : ''}
    </button>
    <button class="sort-btn ${accountsSortBy === 'name' ? 'active' : ''}" data-sort="name">
      Name ${accountsSortBy === 'name' ? (accountsSortDesc ? '↓' : '↑') : ''}
    </button>
    <button class="sort-btn ${accountsSortBy === 'lastUsed' ? 'active' : ''}" data-sort="lastUsed">
      Last ${accountsSortBy === 'lastUsed' ? (accountsSortDesc ? '↓' : '↑') : ''}
    </button>
    <span style="font-size: 9px; color: #9ca3af; margin: 0 6px;">|</span>
    <button class="sort-btn ${hideZeroCredits ? 'active' : ''}" data-filter="hideZero" style="background: ${hideZeroCredits ? '#ef4444' : '#1f2937'}; color: white; border-color: ${hideZeroCredits ? '#ef4444' : '#374151'};">
      ${hideZeroCredits ? '✓' : ''} Hide 0 Credits
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
    refreshInfo.style.cssText = 'font-size: 10px; text-align: right; padding: 2px 8px;';
    refreshInfo.style.color = isStale ? '#fbbf24' : '#9ca3af';
    refreshInfo.textContent = `Updated ${formatRelativeTime(lastUpdatedAt)}${isStale ? ' (stale)' : ''}`;
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
    filterInfo.style.cssText = 'font-size: 10px; color: #9ca3af; padding: 4px 8px; text-align: center;';
    filterInfo.textContent = `Showing ${filtered.length} of ${accounts.length} accounts`;
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
  const jwtFlag = !account.has_jwt
    ? { text: 'Needs JWT', color: '#b91c1c' }
    : (account.jwt_expired ? { text: 'JWT expired', color: '#f97316' } : null);

  card.innerHTML = `
    <div class="account-header">
      <div class="account-title">
        <div class="account-name">${displayName}</div>
        ${account.nickname ? `<div class="account-email-sub">${account.email}</div>` : ''}
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 13px; font-weight: 700; color: #10b981;">${totalCredits}</span>
        <span class="account-status ${statusClass}">${account.status}</span>
        <span class="account-ad-pill" data-role="ad-pill"></span>
        ${jwtFlag ? `<span class="account-flag" style="font-size: 10px; padding: 2px 6px; border-radius: 999px; background: ${jwtFlag.color}; color: white;">${jwtFlag.text}</span>` : ''}
      </div>
    </div>

    <div class="actions-row">
      ${(account.has_cookies || account.has_jwt) ? `
        <button class="account-btn btn-tiny" data-action="login" data-account-id="${account.id}">${ACCOUNT_ACTIONS.LOGIN}</button>
      ` : `
        <button class="account-btn btn-tiny" disabled title="No credentials">${ACCOUNT_ACTIONS.LOGIN}</button>
      `}
      <button class="account-btn btn-ghost btn-tiny" data-action="run-preset" data-account-id="${account.id}">${ACCOUNT_ACTIONS.RUN_PRESET}</button>
      <button class="account-btn btn-ghost btn-tiny" data-action="run-loop" data-account-id="${account.id}">${ACCOUNT_ACTIONS.RUN_LOOP}</button>
    </div>
  `;

  // Add click handler for login button
  const actionButtons = card.querySelectorAll('.account-btn');
  actionButtons.forEach((btn) => {
    const action = btn.getAttribute('data-action');
    if (action === 'login') {
      btn.addEventListener('click', () => handleAccountLogin(account));
    } else if (action === 'run-preset') {
      btn.addEventListener('click', () => executePresetForAccount(account));
    } else if (action === 'run-loop') {
      btn.addEventListener('click', () => executeLoopForAccount(account));
    }
  });

  // For Pixverse accounts, enrich header line with live ad-task status
  if (account.provider_id === 'pixverse') {
    const adPillEl = card.querySelector('[data-role="ad-pill"]');
    attachPixverseAdStatus(account, adPillEl);
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
      if (!res || !res.success || !res.data) {
        pillEl.textContent = '';
        pillEl.removeAttribute('title');
        return;
      }
      pixverseStatusCache.set(account.id, { data: res.data, updatedAt: Date.now() });
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
  const task = payload?.ad_watch_task;
  if (task && typeof task === 'object') {
    const progress = task.progress ?? 0;
    const total = task.total_counts ?? 0;
    const reward = task.reward ?? 0;
    pillEl.textContent = `Ads ${progress}/${total}`;
    pillEl.title = `Watch-ad task: ${progress}/${total}, reward ${reward}`;
    pillEl.style.fontSize = '10px';
    pillEl.style.color = '#6b7280';
  } else {
    pillEl.textContent = '';
    pillEl.removeAttribute('title');
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
  try {
    const res = await chrome.runtime.sendMessage({
      action: 'executePreset',
      presetId,
      accountId: account.id,
    });
    if (res.success) {
      showLastImport(`Queued preset '${res.data.preset_name}' for ${account.email}`);
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
  try {
    const res = await chrome.runtime.sendMessage({
      action: 'executeLoopForAccount',
      loopId,
      accountId: account.id,
    });
    if (res.success) {
      showLastImport(`Queued loop preset '${res.data.preset_name}' for ${account.email}`);
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

async function handleAccountLogin(account) {
  console.log('[Popup] Login with account:', account.email);
  try {
    const res = await chrome.runtime.sendMessage({ action: 'loginWithAccount', accountId: account.id });
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
  const defaultUrl = 'http://10.243.48.125:8001';

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

  if (result.pixsim7Token) {
    // Show token copy section, hide login message
    tokenCopySection.classList.remove('hidden');
    loginRequiredMessage.classList.add('hidden');
  } else {
    // Hide token copy section, show login message
    tokenCopySection.classList.add('hidden');
    loginRequiredMessage.classList.remove('hidden');
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
