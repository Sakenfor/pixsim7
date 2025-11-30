/**
 * API Client - Backend communication
 */

// Default backend URL (configurable in settings)
const DEFAULT_BACKEND_URL = 'http://10.243.48.125:8001';

/**
 * Get settings from storage
 */
export async function getSettings() {
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
export async function backendRequest(endpoint, options = {}) {
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
