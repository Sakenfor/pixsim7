/**
 * Cookie Import - Handles importing cookies to backend
 *
 * Loaded as a plain script - exposes globals.
 * Requires: getAllCookiesSecure, getBearerToken, showNotification (from utils.js)
 * Requires: STORAGE_KEYS (from shared/constants.js)
 */

// Debug mode - controlled by extension settings
let DEBUG_COOKIES = false;
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.local.get({ debugCookies: false, debugAll: false }, (result) => {
    DEBUG_COOKIES = result.debugCookies || result.debugAll;
  });
}
const debugLogCookies = (...args) => DEBUG_COOKIES && console.log('[PixSim7 Cookie Import]', ...args);

/**
 * Provider session storage management
 */
async function readProviderSessionStore() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.PROVIDER_SESSIONS);
  return stored[STORAGE_KEYS.PROVIDER_SESSIONS] || {};
}

async function rememberProviderAccount(providerId, info) {
  const store = await readProviderSessionStore();
  store[providerId] = { providerId, ...info, updatedAt: Date.now() };
  await chrome.storage.local.set({ [STORAGE_KEYS.PROVIDER_SESSIONS]: store });
}

async function getRememberedProviderAccount(providerId) {
  const store = await readProviderSessionStore();
  return store[providerId] || null;
}

async function clearRememberedProviderAccount(providerId) {
  const store = await readProviderSessionStore();
  if (store[providerId]) {
    delete store[providerId];
    await chrome.storage.local.set({ [STORAGE_KEYS.PROVIDER_SESSIONS]: store });
  }
}

/**
 * Notify backend of account status change
 */
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
      console.warn('[PixSim7 Cookie Import] Failed to update account status', res?.error);
    }
  } catch (err) {
    console.warn('[PixSim7 Cookie Import] Account status update error:', err);
  }
}

/**
 * Extract all raw data from page (provider-agnostic)
 */
async function _cookieImport_extractRawData(providerId, config) {
  const data = {
    cookies: await getAllCookiesSecure(providerId)
  };

  // For providers that need bearer token (like Sora)
  if (config && config.needsBearerToken) {
    const bearerToken = getBearerToken();
    if (bearerToken) {
      data.bearer_token = bearerToken;
      data.authorization = `Bearer ${bearerToken}`;
    }
  }

  // For Pixverse: capture session identifiers for session sharing
  // These allow backend to appear as the same session as the browser,
  // preventing "logged in elsewhere" errors
  if (providerId === 'pixverse') {
    // Request fresh session data from page context
    requestSessionDataRefresh();

    // Wait for session IDs with retries (injected script may need time to capture)
    let sessionIds = getPixverseSessionIds();
    let retries = 0;
    const maxRetries = 5;

    while ((!sessionIds.traceId || !sessionIds.anonymousId) && retries < maxRetries) {
      await new Promise(r => setTimeout(r, 300));
      // Request refresh on each retry in case injected script is ready now
      if (retries > 0) {
        requestSessionDataRefresh();
      }
      sessionIds = getPixverseSessionIds();
      retries++;
    }

    if (sessionIds.traceId || sessionIds.anonymousId) {
      data.session_ids = {
        ai_trace_id: sessionIds.traceId,
        ai_anonymous_id: sessionIds.anonymousId,
      };
      debugLogCookies('Captured Pixverse session IDs:', {
        hasTraceId: !!sessionIds.traceId,
        hasAnonymousId: !!sessionIds.anonymousId,
        retries,
      });
    } else {
      // Log warning when session IDs not captured - this will cause "logged in elsewhere" errors
      console.warn('[PixSim7] Session IDs not captured after retries - backend requests may get "logged in elsewhere" errors. Try performing an action on the page first.');
    }
    // Also capture JWT token from header if available
    if (sessionIds.jwtToken) {
      data.jwt_token = sessionIds.jwtToken;
    }
  }

  return data;
}

/**
 * Import cookies to backend
 */
async function importCookies(providerId, config = {}) {
  debugLogCookies(`Importing raw data for ${providerId}...`);

  try {
    // Get extension settings
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });

    if (!response.pixsim7Token) {
      debugLogCookies('Not logged into PixSim7, skipping import');
      return;
    }

    if (!response.autoImport) {
      debugLogCookies('Auto-import disabled, skipping');
      return;
    }

    // Extract RAW data (no parsing, backend will handle it)
    const rawData = await _cookieImport_extractRawData(providerId, config);

    debugLogCookies('Extracted raw data:', {
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
      debugLogCookies('✓ Cookies imported successfully:', importResponse.data);

      const importedAccountId = importResponse.data?.account_id;
      if (importedAccountId) {
        try {
          await rememberProviderAccount(providerId, {
            accountId: importedAccountId,
            email: importResponse.data?.email || null,
          });
        } catch (statusError) {
          console.warn('[PixSim7 Cookie Import] Failed to update account status after import:', statusError);
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
        console.warn('[PixSim7 Cookie Import] Could not notify popup about update:', e);
      }
    } else {
      console.error('[PixSim7 Cookie Import] Failed to import cookies:', importResponse.error);
    }

  } catch (error) {
    console.error('[PixSim7 Cookie Import] Import error:', error);
  }
}
