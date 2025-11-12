/**
 * Background Service Worker - Thin client for PixSim7 backend
 *
 * Handles:
 * - Communication with PixSim7 backend
 * - Cookie management for detected providers
 * - Message passing between extension components
 */

console.log('[PixSim7 Extension] Background service worker loaded');

// Default backend URL (configurable in settings)
// Using ZeroTier IP for network access
const DEFAULT_BACKEND_URL = 'http://10.243.48.125:8001';

/**
 * Get settings from storage
 */
async function getSettings() {
  const result = await chrome.storage.local.get({
    backendUrl: DEFAULT_BACKEND_URL,
    pixsim7Token: null,
    autoImport: false,
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

// ===== MESSAGE HANDLERS =====

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message);

  if (message.action === 'getSettings') {
    getSettings().then(sendResponse);
    return true; // Async response
  }

  if (message.action === 'login') {
    // Login to PixSim7 backend
    backendRequest('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: message.email,
        password: message.password,
      }),
    })
      .then((data) => {
        // Store token
        chrome.storage.local.set({
          pixsim7Token: data.access_token,
          currentUser: data.user,
        });
        sendResponse({ success: true, data });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Async response
  }

  if (message.action === 'detectProvider') {
    // Detect provider from URL (backend does the detection)
    backendRequest('/api/v1/providers/detect', {
      method: 'POST',
      body: JSON.stringify({
        url: message.url,
      }),
    })
      .then((data) => {
        sendResponse({ success: true, data });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Async response
  }

  if (message.action === 'getAccounts') {
    // Get accounts for provider from backend
    let endpoint = '/api/v1/accounts';
    if (message.providerId) {
      endpoint += `?provider_id=${message.providerId}`;
    }

    backendRequest(endpoint)
      .then((data) => {
        sendResponse({ success: true, data });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Async response
  }

  if (message.action === 'openTab') {
    // Open URL in new tab
    chrome.tabs.create({ url: message.url }, (tab) => {
      sendResponse({ success: true, tabId: tab.id });
    });
    return true; // Async response
  }

  if (message.action === 'injectCookies') {
    // Inject cookies for provider account
    injectCookies(message.cookies, message.domain)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Async response
  }

  if (message.action === 'extractCookies') {
    // Extract cookies from current domain
    extractCookies(message.domain)
      .then((cookies) => {
        sendResponse({ success: true, cookies });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Async response
  }

  if (message.action === 'importCookies') {
    // Import raw data to backend
    importCookiesToBackend(
      message.providerId,
      message.url,
      message.rawData
    )
      .then((data) => {
        sendResponse({ success: true, data });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Async response
  }
});

// ===== COOKIE MANAGEMENT =====

/**
 * Inject cookies into browser
 */
async function injectCookies(cookies, domain) {
  console.log(`[Background] Injecting ${Object.keys(cookies).length} cookies for ${domain}`);

  for (const [name, value] of Object.entries(cookies)) {
    try {
      await chrome.cookies.set({
        url: `https://${domain}`,
        name: name,
        value: value,
        domain: `.${domain}`,
        path: '/',
        secure: true,
        sameSite: 'no_restriction',
      });
    } catch (error) {
      console.warn(`[Background] Failed to set cookie ${name}:`, error);
    }
  }

  console.log('[Background] Cookies injected successfully');
}

/**
 * Extract cookies from domain
 */
async function extractCookies(domain) {
  console.log(`[Background] Extracting cookies for ${domain}`);

  const cookies = await chrome.cookies.getAll({ domain });
  const cookieMap = {};

  for (const cookie of cookies) {
    cookieMap[cookie.name] = cookie.value;
  }

  console.log(`[Background] Extracted ${Object.keys(cookieMap).length} cookies`);
  return cookieMap;
}

/**
 * Import cookies to backend
 */
async function importCookiesToBackend(providerId, url, rawData) {
  console.log(`[Background] Importing raw data for ${providerId} to backend...`);

  try {
    const data = await backendRequest('/api/v1/accounts/import-cookies', {
      method: 'POST',
      body: JSON.stringify({
        provider_id: providerId,
        url: url,
        raw_data: rawData
      })
    });

    console.log(`[Background] ✓ Data imported successfully:`, data);
    return data;
  } catch (error) {
    console.error(`[Background] Failed to import:`, error);
    throw error;
  }
}

// ===== INSTALLATION =====

chrome.runtime.onInstalled.addListener(() => {
  console.log('[PixSim7 Extension] Installed');
});
