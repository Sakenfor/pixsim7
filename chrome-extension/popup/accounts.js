/**
 * Account management module
 *
 * Handles account loading, rendering, filtering, and actions.
 */


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

// ===== HELPERS =====

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

// ===== ACCOUNTS CACHE =====

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


// Export main functions for use in popup.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { loadAccounts, handleAccountLogin };
}
