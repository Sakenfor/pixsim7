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

  // Sync all credits on popup open (only if logged in)
  if (currentUser) {
    console.log('[Popup] Syncing credits on popup open...');
    try {
      const syncResult = await chrome.runtime.sendMessage({ action: 'syncAllCredits' });
      if (syncResult.success) {
        console.log(`[Popup] Synced ${syncResult.synced}/${syncResult.total} accounts`);
      }
    } catch (err) {
      console.warn('[Popup] Credit sync failed:', err);
    }
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

      // Sync credits for all accounts after login (best-effort, non-blocking)
      loginBtn.textContent = 'Syncing credits...';
      try {
        const syncResult = await chrome.runtime.sendMessage({ action: 'syncAllCredits' });
        if (syncResult.success) {
          console.log(`[Popup] Synced credits for ${syncResult.synced}/${syncResult.total} accounts`);
          // Refresh accounts to show updated credits
          if (document.getElementById('tab-accounts').classList.contains('active')) {
            await loadAccounts();
          }
        }
      } catch (syncError) {
        console.warn('[Popup] Credit sync failed:', syncError);
        // Non-fatal, just log the error
      }
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

async function loadAccounts() {
  if (!currentUser) {
    return; // Don't load if not logged in
  }

  const accountsList = document.getElementById('accountsList');
  const accountsLoading = document.getElementById('accountsLoading');
  const accountsError = document.getElementById('accountsError');

  accountsList.innerHTML = '';
  accountsLoading.classList.remove('hidden');
  accountsError.classList.add('hidden');

  try {
    // Request accounts from backend (filtered by provider if detected)
    const response = await chrome.runtime.sendMessage({
      action: 'getAccounts',
      providerId: currentProvider?.provider_id || null,
    });

    accountsLoading.classList.add('hidden');

    if (response.success) {
      const accounts = response.data;
      displayAccounts(accounts);
    } else {
      showAccountsError(response.error || 'Failed to load accounts');
    }
  } catch (error) {
    accountsLoading.classList.add('hidden');
    showAccountsError(`Error: ${error.message}`);
  }
}

function displayAccounts(accounts) {
  const accountsList = document.getElementById('accountsList');
  const accountCount = document.getElementById('accountCount');

  accountCount.textContent = `(${accounts.length})`;

  if (accounts.length === 0) {
    accountsList.innerHTML = `
      <div class="info-box">
        No accounts found${currentProvider ? ` for ${currentProvider.name}` : ''}.
        Add accounts via the PixSim7 backend.
      </div>
    `;
    return;
  }

  accounts.forEach(account => {
    const card = createAccountCard(account);
    accountsList.appendChild(card);
  });
}

function createAccountCard(account) {
  const card = document.createElement('div');
  card.className = 'account-card';

  const statusClass = `status-${account.status}`;
  const creditsInfo = formatCredits(account.credits, account.total_credits);
  const displayName = account.nickname || account.email;
  const successRate = account.success_rate ? `${Math.round(account.success_rate)}%` : 'N/A';
  const videosGenerated = account.total_videos_generated || 0;

  card.innerHTML = `
    <div class="account-header">
      <div class="account-title">
        <div class="account-name">${displayName}</div>
        ${account.nickname ? `<div class="account-email-sub">${account.email}</div>` : ''}
      </div>
      <span class="account-status ${statusClass}">${account.status}</span>
    </div>
    
    <div class="account-stats">
      <div class="stat-item">
        <span class="stat-label">Success</span>
        <span class="stat-value">${successRate}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Videos</span>
        <span class="stat-value">${videosGenerated}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Today</span>
        <span class="stat-value">${account.videos_today || 0}</span>
      </div>
    </div>

    <div class="credits-section">
      <div class="credits-label">Credits</div>
      <div class="credits-breakdown">${creditsInfo}</div>
    </div>
    
    <div class="actions-row">
      ${(account.has_cookies || account.has_jwt) ? `
        <button class="account-btn btn-tiny" data-action="login" data-account-id="${account.id}">🌐 Login</button>
      ` : `
        <button class="account-btn btn-tiny" disabled title="No credentials">🌐 Login</button>
      `}
      <button class="account-btn btn-ghost btn-tiny" data-action="run-preset" data-account-id="${account.id}">▶ Preset</button>
      <button class="account-btn btn-ghost btn-tiny" data-action="run-loop" data-account-id="${account.id}">▶ Loop</button>
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

  return card;
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

  // Order: daily, monthly, package, then others
  const order = ['daily', 'monthly', 'package'];
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

  const parts = ordered.map(({ type, amount }) => 
    `<span class="credit-item"><span class="credit-type">${type}</span>: <span class="credit-amount">${amount}</span></span>`
  );

  // Show total if available and different from single credit
  if (totalCredits !== undefined && ordered.length > 1) {
    parts.push(`<span class="credit-item credit-total"><span class="credit-type">total</span>: <span class="credit-amount">${totalCredits}</span></span>`);
  }

  return parts.join('');
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
  btn.textContent = '✓ Saved!';

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
  btn.textContent = '✓ Reset!';

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
      btn.textContent = '✓ Imported!';

      // Show import info
      showLastImport(`Imported from ${currentProvider.name}`);

      // Reload accounts
      await loadAccounts();

      setTimeout(() => {
        btn.textContent = '📥 Import Cookies from This Site';
      }, 2000);
    } else {
      showError(response.error || 'Import failed');
      btn.textContent = '📥 Import Cookies from This Site';
    }
  } catch (error) {
    console.error('[Popup] Import error:', error);
    showError(`Import error: ${error.message}`);
    btn.textContent = '📥 Import Cookies from This Site';
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
