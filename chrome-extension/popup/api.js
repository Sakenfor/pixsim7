/**
 * API Client for Popup - Backend communication via background script
 */

/**
 * Make API request via background script
 */
export async function apiRequest(path, method = 'GET', body = undefined) {
  const response = await chrome.runtime.sendMessage({
    action: 'apiRequest',
    path,
    method,
    body
  });

  if (!response.success) {
    throw new Error(response.error || 'API request failed');
  }

  return response.data;
}

/**
 * Check backend connection
 */
export async function checkBackendConnection() {
  try {
    const settings = await chrome.storage.local.get('backendUrl');
    const backendUrl = settings.backendUrl || 'http://10.243.48.125:8001';

    const response = await fetch(`${backendUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) throw new Error('Backend not responding');
    return true;
  } catch (error) {
    console.warn('[Popup API] Backend connection check failed:', error);
    return false;
  }
}

/**
 * Login to backend
 */
export async function login(email, password) {
  const response = await chrome.runtime.sendMessage({
    action: 'login',
    email,
    password
  });

  if (!response.success) {
    throw new Error(response.error || 'Login failed');
  }

  return response.data;
}

/**
 * Get current user
 */
export async function getCurrentUser() {
  const response = await chrome.runtime.sendMessage({
    action: 'getMe'
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to get user');
  }

  return response.data;
}

/**
 * Detect provider from URL
 */
export async function detectProvider(url) {
  const response = await chrome.runtime.sendMessage({
    action: 'detectProvider',
    url
  });

  if (!response.success) {
    throw new Error(response.error || 'Provider detection failed');
  }

  return response.data;
}

/**
 * Get accounts
 */
export async function getAccounts(providerId = null) {
  let path = '/accounts';
  if (providerId) {
    path += `?provider_id=${providerId}`;
  }
  return await apiRequest(path);
}

/**
 * Sync account credits
 */
export async function syncAccountCredits(accountId) {
  return await apiRequest(`/accounts/${accountId}/sync-credits`, 'POST');
}

/**
 * Sync all account credits
 */
export async function syncAllCredits(providerId = null) {
  let path = '/accounts/sync-all-credits';
  if (providerId) {
    path += `?provider_id=${providerId}`;
  }
  return await apiRequest(path, 'POST');
}

/**
 * Get Pixverse status (credits + ad task)
 */
export async function getPixverseStatus(accountId) {
  return await apiRequest(`/accounts/${accountId}/pixverse-status`);
}

/**
 * Get automation options (presets, loops)
 */
export async function getAutomationOptions() {
  return await apiRequest('/automation/options');
}

/**
 * Execute preset for account
 */
export async function executePreset(accountId, presetId, deviceId = null) {
  return await apiRequest('/automation/execute-preset', 'POST', {
    account_id: accountId,
    preset_id: presetId,
    device_id: deviceId
  });
}

/**
 * Execute loop for account
 */
export async function executeLoop(accountId, loopId, deviceId = null) {
  return await apiRequest('/automation/execute-loop', 'POST', {
    account_id: accountId,
    loop_id: loopId,
    device_id: deviceId
  });
}

/**
 * Get available devices
 */
export async function getDevices() {
  return await apiRequest('/devices');
}

/**
 * Get providers
 */
export async function getProviders() {
  const response = await chrome.runtime.sendMessage({
    action: 'getProviders'
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to get providers');
  }

  return response.data;
}
