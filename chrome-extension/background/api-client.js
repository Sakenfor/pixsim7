/**
 * API Client - Backend communication
 *
 * Loaded via importScripts in background.js.
 * Exposes: DEFAULT_BACKEND_URL, getSettings, backendRequest, ensureAccountSessionHealth
 */

// Default backend URL (configurable in settings)
// Using ZeroTier IP for network access
const DEFAULT_BACKEND_URL = 'http://10.243.48.125:8001';

// Account health check throttling
const ACCOUNT_HEALTH_CHECK_TTL_MS = 10 * 60 * 1000; // 10 minutes
const lastAccountHealthCheck = {};

/**
 * Get settings from storage
 */
async function getSettings() {
  const result = await chrome.storage.local.get({
    backendUrl: DEFAULT_BACKEND_URL,
    pixsim7Token: null,
    autoImport: false,
    defaultUploadProvider: 'pixverse',
  });
  return result;
}

/**
 * Make authenticated request to backend
 */
async function backendRequest(endpoint, options = {}) {
  const settings = await getSettings();
  const url = `${settings.backendUrl}${endpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (settings.pixsim7Token) {
    headers['Authorization'] = `Bearer ${settings.pixsim7Token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Backend error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Best-effort per-account session health check.
 *
 * Uses the sync-credits endpoint so that Pixverse session errors
 * (e.g. "logged in elsewhere") flow through the backend's session
 * manager and auto-reauth logic before we export cookies.
 */
async function ensureAccountSessionHealth(accountId) {
  if (!accountId) return;

  const now = Date.now();
  const last = lastAccountHealthCheck[accountId];
  if (last && (now - last) < ACCOUNT_HEALTH_CHECK_TTL_MS) {
    return;
  }

  lastAccountHealthCheck[accountId] = now;

  try {
    await backendRequest(`/api/v1/accounts/${accountId}/sync-credits`, {
      method: 'POST',
    });
  } catch (err) {
    console.warn('[Background] Account health check (sync-credits) failed:', err);
  }
}
