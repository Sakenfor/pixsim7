/**
 * Cookie Import - Handles importing cookies to backend
 */

import { getAllCookiesSecure, getBearerToken, showNotification } from './utils.js';
import { STORAGE_KEYS } from '../shared/constants.js';

/**
 * Provider session storage management
 */
export async function readProviderSessionStore() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.PROVIDER_SESSIONS);
  return stored[STORAGE_KEYS.PROVIDER_SESSIONS] || {};
}

export async function rememberProviderAccount(providerId, info) {
  const store = await readProviderSessionStore();
  store[providerId] = { providerId, ...info, updatedAt: Date.now() };
  await chrome.storage.local.set({ [STORAGE_KEYS.PROVIDER_SESSIONS]: store });
}

export async function getRememberedProviderAccount(providerId) {
  const store = await readProviderSessionStore();
  return store[providerId] || null;
}

export async function clearRememberedProviderAccount(providerId) {
  const store = await readProviderSessionStore();
  if (store[providerId]) {
    delete store[providerId];
    await chrome.storage.local.set({ [STORAGE_KEYS.PROVIDER_SESSIONS]: store });
  }
}

/**
 * Notify backend of account status change
 */
export async function notifyAccountStatus(accountId, status, reason) {
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
async function extractRawData(providerId, config) {
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

  return data;
}

/**
 * Import cookies to backend
 */
export async function importCookies(providerId, config = {}) {
  console.log(`[PixSim7 Cookie Import] Importing raw data for ${providerId}...`);

  try {
    // Get extension settings
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });

    if (!response.pixsim7Token) {
      console.log('[PixSim7 Cookie Import] Not logged into PixSim7, skipping import');
      return;
    }

    if (!response.autoImport) {
      console.log('[PixSim7 Cookie Import] Auto-import disabled, skipping');
      return;
    }

    // Extract RAW data (no parsing, backend will handle it)
    const rawData = await extractRawData(providerId, config);

    console.log('[PixSim7 Cookie Import] Extracted raw data:', {
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
      console.log(`[PixSim7 Cookie Import] ✓ Cookies imported successfully:`, importResponse.data);

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
