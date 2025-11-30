/**
 * Popup Utilities
 */

/**
 * Show toast notification
 */
export function showToast(type, message, timeoutMs = 2500) {
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

/**
 * Format credits for display
 */
export function formatCredits(credits, totalCredits) {
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

/**
 * Format timestamp as relative time
 */
export function formatRelativeTime(timestamp) {
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

/**
 * Show accounts error message
 */
export function showAccountsError(message) {
  const accountsError = document.getElementById('accountsError');
  accountsError.textContent = message;
  accountsError.classList.remove('hidden');
}

/**
 * Switch tab
 */
export function switchTab(tabId) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Show selected tab
  const tabContent = document.getElementById(`${tabId}Tab`);
  const tabBtn = document.querySelector(`[data-tab="${tabId}"]`);

  if (tabContent) tabContent.classList.add('active');
  if (tabBtn) tabBtn.classList.add('active');

  // Trigger tab-specific actions
  if (tabId === 'devices') {
    // Lazy-load devices when tab is opened
    import('./devices.js').then(module => module.loadDevices());
  }
}

/**
 * Cache management
 */
const ACCOUNTS_CACHE_KEY = 'pixsim7AccountCache';
const ACCOUNTS_CACHE_SCOPE_ALL = '__all__';
const ACCOUNTS_CACHE_TTL_MS = 60 * 1000;

export function getAccountsCacheKey(providerId) {
  return providerId || ACCOUNTS_CACHE_SCOPE_ALL;
}

export async function clearAccountsCache(providerId) {
  const cacheKey = getAccountsCacheKey(providerId);
  try {
    const stored = await chrome.storage.local.get(ACCOUNTS_CACHE_KEY);
    const cache = stored[ACCOUNTS_CACHE_KEY] || {};
    if (cache[cacheKey]) {
      delete cache[cacheKey];
      await chrome.storage.local.set({ [ACCOUNTS_CACHE_KEY]: cache });
    }
  } catch (e) {
    console.warn('[Popup Utils] clearAccountsCache failed:', e);
  }
}

export async function readAccountsCache(cacheKey) {
  const stored = await chrome.storage.local.get(ACCOUNTS_CACHE_KEY);
  return (stored[ACCOUNTS_CACHE_KEY] || {})[cacheKey];
}

export async function writeAccountsCache(cacheKey, accounts) {
  try {
    const stored = await chrome.storage.local.get(ACCOUNTS_CACHE_KEY);
    const cache = stored[ACCOUNTS_CACHE_KEY] || {};
    cache[cacheKey] = { data: accounts, ts: Date.now() };
    await chrome.storage.local.set({ [ACCOUNTS_CACHE_KEY]: cache });
  } catch (e) {
    console.warn('[Popup Utils] writeAccountsCache failed:', e);
  }
}
