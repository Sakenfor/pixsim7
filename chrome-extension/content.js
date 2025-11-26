/**
 * Content Script - Provider Site Detection
 *
 * Runs on provider sites (Pixverse, Runway, Pika, etc.)
 * Detects when user is logged in and auto-imports cookies
 */

console.log('[PixSim7 Content] Loaded on:', window.location.href);

// Provider detection is delegated to backend via background API

/**
 * Get cookie by name
 */
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop().split(';').shift();
  }
  return null;
}

/**
 * Get all cookies as object
 */
async function getAllCookiesSecure(providerId) {
  if (providerId === 'pixverse') {
    try {
      // For Pixverse, prefer the full host+parent-domain view so that the
      // backend sees the same cookies the browser uses (including any
      // host-only cookies on app.pixverse.ai). This uses the same robust
      // merge logic as the generic path.
      const res = await chrome.runtime.sendMessage({
        action: 'extractCookiesForUrl',
        url: window.location.href,
      });
      if (res && res.success && res.cookies) return res.cookies;
    } catch (e) {
      console.warn('[PixSim7 Content] Pixverse cookie extraction via URL failed, falling back to parent domain', e);
    }
    try {
      // Fallback: parent-domain-only snapshot, which captures cookies with
      // domain ".pixverse.ai" even if the host-specific merge fails.
      const res = await chrome.runtime.sendMessage({ action: 'extractCookies', domain: 'pixverse.ai' });
      if (res && res.success && res.cookies) return res.cookies;
    } catch (e) {
      console.warn('[PixSim7 Content] Pixverse cookie extraction failed, falling back to generic path', e);
    }
  }

  // Generic path: merge host and parent domain cookies
  try {
    const res = await chrome.runtime.sendMessage({ action: 'extractCookiesForUrl', url: window.location.href });
    if (res && res.success && res.cookies) return res.cookies;
  } catch (e) {
    console.warn('[PixSim7 Content] Secure cookie extraction failed, falling back to document.cookie');
  }
  const cookies = {};
  try {
    document.cookie.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        cookies[name] = value;
      }
    });
  } catch {}
  return cookies;
}

function isProviderSessionAuthenticated(providerId, cookies) {
  const hints = PROVIDER_AUTH_COOKIE_HINTS[providerId];
  if (!hints || hints.length === 0) {
    return Object.keys(cookies || {}).length > 0;
  }
  return hints.some(name => Boolean(cookies?.[name]));
}

async function readProviderSessionStore() {
  const stored = await chrome.storage.local.get(PROVIDER_SESSION_STORAGE_KEY);
  return stored[PROVIDER_SESSION_STORAGE_KEY] || {};
}

async function rememberProviderAccount(providerId, info) {
  const store = await readProviderSessionStore();
  store[providerId] = { providerId, ...info, updatedAt: Date.now() };
  await chrome.storage.local.set({ [PROVIDER_SESSION_STORAGE_KEY]: store });
}

async function getRememberedProviderAccount(providerId) {
  const store = await readProviderSessionStore();
  return store[providerId] || null;
}

async function clearRememberedProviderAccount(providerId) {
  const store = await readProviderSessionStore();
  if (store[providerId]) {
    delete store[providerId];
    await chrome.storage.local.set({ [PROVIDER_SESSION_STORAGE_KEY]: store });
  }
}

async function notifyAccountStatus(accountId, status, reason) {
  if (!accountId || !status) return;
  try {
    const res = await chrome.runtime.sendMessage({
      action: 'updateAccountStatus',
      accountId,
      status,
      reason,
    });
    if (!res || !res.success) {
      console.warn('[PixSim7 Content] Failed to update account status', res?.error);
    }
  } catch (err) {
    console.warn('[PixSim7 Content] Account status update error:', err);
  }
}

async function detectProviderFromBackend() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'detectProvider', url: window.location.href });
    if (res && res.success && res.data && res.data.detected && res.data.provider) {
      return { providerId: res.data.provider.provider_id };
    }
  } catch (e) {
    console.warn('[PixSim7 Content] Provider detection failed:', e);
  }
  return null;
}

/**
 * Check if user is authenticated
 */
async function checkAuth() {
  // We let backend confirm provider; we optimistically attempt import when detected
  const provider = await detectProviderFromBackend();
  if (!provider) {
    console.log('[PixSim7 Content] Provider not detected for this URL');
    return null;
  }
  console.log(`[PixSim7 Content] Provider detected: ${provider.providerId}`);
  return { providerId: provider.providerId };
}

// Global storage for captured bearer token (for Sora)
let capturedBearerToken = null;

/**
 * Inject script to capture bearer token from network requests
 * (For providers like Sora that use Authorization headers)
 */
function injectBearerTokenCapture() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected-bearer-capture.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

/**
 * Get captured bearer token from injected script
 */
function getBearerToken() {
  // Check if the injected script captured it
  return window.__pixsim7_bearer_token || null;
}

/**
 * Extract all raw data from page (provider-agnostic)
 * Like pixsim6: only sends cookies, backend parses JWT
 */
async function extractRawData(providerId, config) {
  const data = {
    cookies: await getAllCookiesSecure(providerId)
    // Note: No localStorage - not reliable
    // Credits will be synced via provider API calls, not browser
  };

  // For providers that need bearer token (like Sora)
  if (config && config.needsBearerToken) {
    const bearerToken = getBearerToken();
    if (bearerToken) {
      data.bearer_token = bearerToken;
      data.authorization = `Bearer ${bearerToken}`;
    }
  }

  return data;
}

/**
 * Import cookies to backend
 */
async function importCookies(providerId, config) {
  console.log(`[PixSim7 Content] Importing raw data for ${providerId}...`);

  try {
    // Get extension settings
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });

    if (!response.pixsim7Token) {
      console.log('[PixSim7 Content] Not logged into PixSim7, skipping import');
      return;
    }

    if (!response.autoImport) {
      console.log('[PixSim7 Content] Auto-import disabled, skipping');
      return;
    }

    // Extract RAW data (no parsing, backend will handle it)
    const rawData = await extractRawData(providerId, config);

    console.log('[PixSim7 Content] Extracted raw data:', {
      cookies: Object.keys(rawData.cookies).length,
      hasBearerToken: !!rawData.bearer_token
    });

    // Send to backend via background script
    const importResponse = await chrome.runtime.sendMessage({
      action: 'importCookies',
      providerId,
      url: window.location.href,
      rawData: rawData
    });

    if (importResponse.success) {
      console.log(`[PixSim7 Content] ${EMOJI.CHECK} Cookies imported successfully:`, importResponse.data);

      const importedAccountId = importResponse.data?.account_id;
      if (importedAccountId) {
        try {
          await rememberProviderAccount(providerId, {
            accountId: importedAccountId,
            email: importResponse.data?.email || null,
          });
          await notifyAccountStatus(importedAccountId, 'active', 'login_detected');
        } catch (statusError) {
          console.warn('[PixSim7 Content] Failed to update account status after import:', statusError);
        }
      }

      const updatedFields = importResponse.data.updated_fields || [];
      const accountEmail = importResponse.data.email || 'account';

      if (importResponse.data.created) {
        showNotification(
          'Account Created',
          `${accountEmail} - Cookies imported successfully`
        );
      } else if (updatedFields.includes('jwt_token')) {
        showNotification(
          'Session Refreshed',
          `${accountEmail} session updated`
        );
      }

      // Let the extension UI know accounts/credits may have changed
      try {
        chrome.runtime.sendMessage({
          action: 'accountsUpdated',
          email: importResponse.data.email,
          providerId
        });
      } catch (e) {
        console.warn('[PixSim7 Content] Could not notify popup about update:', e);
      }
    } else {
      console.error('[PixSim7 Content] Failed to import cookies:', importResponse.error);
    }

  } catch (error) {
    console.error('[PixSim7 Content] Import error:', error);
  }
}

/**
 * Show notification to user
 */
function showNotification(title, message) {
  // Create simple notification div
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 999999;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 16px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    max-width: 300px;
    animation: slideIn 0.3s ease-out;
  `;

  notification.innerHTML = `
    <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">
      ${EMOJI.ART} ${title}
    </div>
    <div style="font-size: 12px; opacity: 0.9;">
      ${message}
    </div>
  `;

  document.body.appendChild(notification);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ===== INITIALIZATION =====

// Inject bearer token capture (safe no-op if not used)
(function() {
  try {
    injectBearerTokenCapture();
  } catch {}
})();

// Monitor login state and import cookies
let wasLoggedIn = false;
let hasImportedThisSession = false;
let lastCookieSnapshot = null;
let lastImportTimestamp = 0;
const IMPORT_DEBOUNCE_MS = 10000;
let pendingLogoutStartedAt = null;
const LOGOUT_DEBOUNCE_MS = 4000;
const PROVIDER_SESSION_STORAGE_KEY = 'pixsim7ProviderSessions';
const PROVIDER_AUTH_COOKIE_HINTS = {
  pixverse: ['_ai_token'],
};

function scheduleImport(providerId) {
  const now = Date.now();
  if (now - lastImportTimestamp < IMPORT_DEBOUNCE_MS) {
    console.log('[PixSim7 Content] Import skipped (debounced)');
    return;
  }
  lastImportTimestamp = now;
  // Wait a bit for bearer token to be captured
  setTimeout(() => {
    importCookies(providerId, {});
  }, 1000);
}

function hashCookies(cookies) {
  try {
    const entries = Object.entries(cookies || {}).sort(([a], [b]) => a.localeCompare(b));
    const json = JSON.stringify(entries);
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
      hash = ((hash << 5) - hash) + json.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  } catch {
    return null;
  }
}

async function handleProviderLogout(providerId) {
  try {
    const session = await getRememberedProviderAccount(providerId);
    if (session?.accountId) {
      await notifyAccountStatus(session.accountId, 'disabled', 'logout_detected');
    }
    await clearRememberedProviderAccount(providerId);
  } catch (err) {
    console.warn('[PixSim7 Content] Failed to handle logout status update:', err);
  }
}

async function checkAndImport() {
  const auth = await checkAuth();
  if (!auth) {
    wasLoggedIn = false;
    lastCookieSnapshot = null;
    hasImportedThisSession = false;
    return;
  }

  let cookies = {};
  try {
    cookies = await getAllCookiesSecure();
  } catch (e) {
    console.warn('[PixSim7 Content] Failed to read cookies for session detection:', e);
  }
  const isAuthenticated = isProviderSessionAuthenticated(auth.providerId, cookies);

  if (!isAuthenticated) {
    if (wasLoggedIn) {
      pendingLogoutStartedAt = pendingLogoutStartedAt || Date.now();
      const elapsed = Date.now() - pendingLogoutStartedAt;
      if (elapsed >= LOGOUT_DEBOUNCE_MS) {
        console.log('[PixSim7 Content] *** LOGOUT CONFIRMED ***');
        pendingLogoutStartedAt = null;
        await handleProviderLogout(auth.providerId);
        wasLoggedIn = false;
        lastCookieSnapshot = null;
        hasImportedThisSession = false;
      }
    } else {
      pendingLogoutStartedAt = null;
      hasImportedThisSession = false;
      lastCookieSnapshot = null;
    }
    return;
  }

  pendingLogoutStartedAt = null;

  // When provider is detected and authenticated, watch for cookie changes for re-imports.
  try {
    const currentHash = hashCookies(cookies);
    if (currentHash !== null) {
      if (lastCookieSnapshot === null) {
        lastCookieSnapshot = currentHash;
      } else if (currentHash !== lastCookieSnapshot) {
        console.log('[PixSim7 Content] *** COOKIE CHANGE DETECTED - treating as login/update ***');
        lastCookieSnapshot = currentHash;
        hasImportedThisSession = true;
        scheduleImport(auth.providerId);
      }
    }
  } catch (e) {
    console.warn('[PixSim7 Content] Cookie change detection failed:', e);
  }

  if (!wasLoggedIn && !hasImportedThisSession) {
    console.log('[PixSim7 Content] *** LOGIN DETECTED (initial) ***');
    hasImportedThisSession = true;
    scheduleImport(auth.providerId);
  }

  wasLoggedIn = true;
}

// Initial check after page load - longer delay to ensure page is fully loaded
setTimeout(() => {
  console.log('[PixSim7 Content] Initial check...');
  checkAndImport();
}, 3000);

// Check every 5 seconds for login state changes
setInterval(checkAndImport, 5000);

// Listen for manual import requests from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'manualImport') {
    (async () => {
      try {
        const auth = await checkAuth();
        if (auth) {
          await importCookies(auth.providerId, auth.config || {});
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Not logged into provider' });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Async response
  }
});
