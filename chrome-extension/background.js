/**
 * Background Service Worker - Thin client for PixSim7 backend
 *
 * Handles:
 * - Communication with PixSim7 backend
 * - Cookie management for detected providers
 * - Message passing between extension components
 */

// Load emoji constants and helper modules (service workers use self, not window)
// Note: Load order matters - api-client.js must be first (others depend on it)
importScripts(
  'emojis.js',
  'background/api-client.js',
  'background/cookies.js',
  'background/presets.js',
  'background/quick-generate-dialog.js',
  'background/context-menus.js'
);

console.log('[PixSim7 Extension] Background service worker loaded');

// Debug flag for auth/login operations (loaded from storage)
let DEBUG_AUTH = false;
chrome.storage.local.get({ debugAuth: false, debugAll: false }, (result) => {
  DEBUG_AUTH = result.debugAuth || result.debugAll;
});
const debugLogAuth = (...args) => DEBUG_AUTH && console.log('[Background Auth]', ...args);

// Constants for provider session tracking (used by loginWithAccount)
const PROVIDER_SESSION_STORAGE_KEY = 'pixsim7ProviderSessions';
const CLIENT_ID_STORAGE_KEY = 'pixsim7ClientId';

// Image proxy cache using Cache API (persists across service worker restarts)
const IMAGE_PROXY_CACHE_NAME = 'pixsim7-image-proxy-v1';
const IMAGE_PROXY_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Helper to get/set from Cache API
async function getCachedImage(url) {
  try {
    const cache = await caches.open(IMAGE_PROXY_CACHE_NAME);
    const response = await cache.match(url);
    if (!response) return null;

    // Check TTL from custom header
    const cachedAt = response.headers.get('X-Cached-At');
    if (cachedAt && (Date.now() - parseInt(cachedAt)) > IMAGE_PROXY_CACHE_TTL) {
      await cache.delete(url);
      return null;
    }

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read cached blob'));
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('[ImageCache] Cache read error:', e.message);
    return null;
  }
}

async function setCachedImage(url, blob) {
  try {
    const cache = await caches.open(IMAGE_PROXY_CACHE_NAME);
    const response = new Response(blob, {
      headers: {
        'Content-Type': blob.type,
        'X-Cached-At': Date.now().toString(),
      }
    });
    await cache.put(url, response);
  } catch (e) {
    console.warn('[ImageCache] Cache write error:', e.message);
  }
}

// Cleanup old cache entries on startup and periodically
async function cleanupImageCache() {
  try {
    const cache = await caches.open(IMAGE_PROXY_CACHE_NAME);
    const keys = await cache.keys();
    const now = Date.now();
    let deleted = 0;

    for (const request of keys) {
      const response = await cache.match(request);
      const cachedAt = response?.headers.get('X-Cached-At');
      if (cachedAt && (now - parseInt(cachedAt)) > IMAGE_PROXY_CACHE_TTL) {
        await cache.delete(request);
        deleted++;
      }
    }

    if (deleted > 0) {
      console.log(`[ImageCache] Cleaned up ${deleted} expired entries`);
    }
  } catch (e) {
    console.warn('[ImageCache] Cleanup error:', e.message);
  }
}

// Run cleanup on startup and every 10 minutes
cleanupImageCache();
setInterval(cleanupImageCache, 10 * 60 * 1000);

// Initialize context menus and listeners
initContextMenuListeners();

// ===== CLIENT IDENTIFICATION HELPERS =====

/**
 * Get or create a persistent client ID for this extension instance
 * This ID is used to track sessions from this specific browser/device
 */
async function getOrCreateClientId() {
  const result = await chrome.storage.local.get(CLIENT_ID_STORAGE_KEY);

  if (result[CLIENT_ID_STORAGE_KEY]) {
    return result[CLIENT_ID_STORAGE_KEY];
  }

  // Generate new client ID: "ext-" + random UUID-like string
  const clientId = 'ext-' + generateUUID();
  await chrome.storage.local.set({ [CLIENT_ID_STORAGE_KEY]: clientId });

  return clientId;
}

/**
 * Generate a simple UUID-like string
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Get a human-readable client name (browser + version)
 */
async function getClientName() {
  // Try to get browser info from user agent
  const browserInfo = getBrowserInfo();
  const manifestVersion = chrome.runtime.getManifest().version;

  return `${browserInfo} - PixSim7 Extension v${manifestVersion}`;
}

/**
 * Extract browser name and version from user agent
 */
function getBrowserInfo() {
  const ua = navigator.userAgent;

  // Chrome
  if (ua.includes('Chrome/')) {
    const version = ua.match(/Chrome\/(\d+)/)?.[1];
    return version ? `Chrome ${version}` : 'Chrome';
  }

  // Edge
  if (ua.includes('Edg/')) {
    const version = ua.match(/Edg\/(\d+)/)?.[1];
    return version ? `Edge ${version}` : 'Edge';
  }

  // Opera
  if (ua.includes('OPR/')) {
    const version = ua.match(/OPR\/(\d+)/)?.[1];
    return version ? `Opera ${version}` : 'Opera';
  }

  // Brave (harder to detect, usually reports as Chrome)
  if (ua.includes('Brave')) {
    return 'Brave';
  }

  // Fallback
  return 'Chrome-based Browser';
}

// ===== MESSAGE HANDLERS =====

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message);

  if (message.action === 'getSettings') {
    getSettings().then(sendResponse);
    return true; // Async response
  }

  if (message.action === 'login') {
    // Login to PixSim7 backend with client identification
    (async () => {
      try {
        // Get or create persistent client_id
        const clientId = await getOrCreateClientId();

        // Get client name (browser + version info)
        const clientName = await getClientName();

        const data = await backendRequest('/api/v1/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: message.email,
            password: message.password,
            client_id: clientId,
            client_type: 'chrome_extension',
            client_name: clientName,
          }),
        });

        // Store token
        await chrome.storage.local.set({
          pixsim7Token: data.access_token,
          currentUser: data.user,
        });

        sendResponse({ success: true, data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Async response
  }

  // Fetch current user (when token exists but user not cached)
  if (message.action === 'getMe') {
    backendRequest('/api/v1/users/me')
      .then((data) => {
        // Cache for later popup loads
        chrome.storage.local.set({ currentUser: data });
        sendResponse({ success: true, data });
      })
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
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

  if (message.action === 'getProviders') {
    backendRequest('/api/v1/providers')
      .then((data) => sendResponse({ success: true, data }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Generic API passthrough (used for devices scan, etc.)
  if (message.action === 'apiRequest') {
    (async () => {
      try {
        let path = message.path || '';
        const method = message.method || 'GET';
        const body = message.body || undefined;

        // Normalize path and ensure /api/v1 prefix
        if (!path.startsWith('/')) {
          path = '/' + path;
        }
        const endpoint = path.startsWith('/api/')
          ? path
          : `/api/v1${path}`;

        const data = await backendRequest(endpoint, {
          method,
          body: body ? JSON.stringify(body) : undefined,
        });

        sendResponse({ success: true, data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'getQuickPromptTemplates') {
    try {
      const { providerId } = message;
      const prompts = getQuickGeneratePresets(providerId || 'pixverse');
      sendResponse({ success: true, data: prompts });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  if (message.action === 'openProviderHome') {
    try {
      const { providerId } = message;
      const target = PROVIDER_TARGETS[providerId] || PROVIDER_TARGETS.pixverse;
      chrome.tabs.create({ url: target.url }, () => sendResponse({ success: true }));
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  if (message.action === 'reauthAccounts') {
    (async () => {
      try {
        const { accountIds } = message;
        if (!Array.isArray(accountIds) || accountIds.length === 0) {
          throw new Error('No account IDs provided');
        }

        const results = [];
        for (const accountId of accountIds) {
          try {
            await backendRequest(`/api/v1/accounts/${accountId}/reauth`, {
              method: 'POST',
              body: JSON.stringify({}),
            });
            results.push({ accountId, success: true });
          } catch (err) {
            results.push({ accountId, success: false, error: err.message });
          }
        }

        const success = results.every((r) => r.success);
        if (success) {
          try {
            chrome.runtime.sendMessage({ action: 'accountsUpdated' });
          } catch (e) {
            // Popup might not be open - that's fine
          }
        }
        sendResponse({ success, results });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
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

  if (message.action === 'syncAllCredits') {
    // Sync credits for all user accounts using batch endpoint
    (async () => {
      try {
        // Use the new batch sync endpoint - much more efficient!
        let endpoint = '/api/v1/accounts/sync-all-credits';
        if (message.providerId) {
          endpoint += `?provider_id=${encodeURIComponent(message.providerId)}`;
        }

        // Pass force flag to backend if requested (bypasses TTL)
        const body = message.force ? JSON.stringify({ force: true }) : undefined;
        const options = {
          method: 'POST',
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body
        };

        const result = await backendRequest(endpoint, options);

        sendResponse({
          success: result.success,
          synced: result.synced,
          failed: result.failed,
          total: result.total
        });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'refreshPixverseStatus') {
    (async () => {
      try {
        const { accountId } = message;
        if (!accountId) {
          throw new Error('No accountId provided');
        }

        await backendRequest(`/api/v1/accounts/${accountId}/pixverse-status`);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Automation: fetch devices
  if (message.action === 'getDevices') {
    backendRequest('/api/v1/automation/devices')
      .then((data) => sendResponse({ success: true, data }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Automation: fetch presets (with optional provider filter)
  if (message.action === 'getPresets') {
    let endpoint = '/api/v1/automation/presets';
    if (message.providerId) {
      endpoint += `?provider_id=${encodeURIComponent(message.providerId)}`;
    }
    backendRequest(endpoint)
      .then((data) => sendResponse({ success: true, data }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Automation: fetch loops (with optional provider filter)
  if (message.action === 'getLoops') {
    let endpoint = '/api/v1/automation/loops';
    if (message.providerId) {
      endpoint += `?provider_id=${encodeURIComponent(message.providerId)}`;
    }
    backendRequest(endpoint)
      .then((data) => sendResponse({ success: true, data }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Automation: execute preset for account
  if (message.action === 'executePreset') {
    const payload = {
      preset_id: message.presetId,
      account_id: message.accountId,
      priority: message.priority || 1,
    };
    if (message.deviceId) {
      payload.device_id = message.deviceId;
    }
    backendRequest('/api/v1/automation/execute-preset', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
      .then((data) => sendResponse({ success: true, data }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Automation: execute next loop preset for account
  if (message.action === 'executeLoopForAccount') {
    const payload = {
      loop_id: message.loopId,
      account_id: message.accountId,
    };
    if (message.deviceId) {
      payload.device_id = message.deviceId;
    }
    backendRequest('/api/v1/automation/loops/execute-for-account', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
      .then((data) => sendResponse({ success: true, data }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
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

  // Robust cookie extraction for a given URL (includes parent domain)
  if (message.action === 'extractCookiesForUrl') {
    (async () => {
      try {
        const merged = await extractCookiesForUrl(message.url);
        sendResponse({ success: true, cookies: merged });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
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

  // ===== ASSET UPLOADS =====
  if (message.action === 'uploadMediaFromUrl' || message.action === 'uploadImageFromUrl') {
      (async () => {
        try {
          const { imageUrl, mediaUrl, providerId, ensureAsset, uploadMethod, uploadContext } = message;
          const url = mediaUrl || imageUrl; // Support both param names
          const settings = await getSettings();
          if (!settings.pixsim7Token) throw new Error('Not logged in');

          // Extract source context from sender tab
          const sourceUrl = sender?.tab?.url;
          const sourceSite = sourceUrl ? new URL(sourceUrl).hostname : undefined;

          const uploadUrl = `${settings.backendUrl}/api/v1/assets/upload-from-url`;
          const resp = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${settings.pixsim7Token}`,
            },
            body: JSON.stringify({
              url,
              provider_id: providerId || settings.defaultUploadProvider || 'pixverse',
              // Default to true to preserve existing semantics for callers that
              // don't specify ensureAsset (local asset even if provider fails).
              ensure_asset: ensureAsset === false ? false : true,
              // Allow callers to specify upload method/context, default to 'web'
              upload_method: uploadMethod || 'web',
              upload_context: {
                client: 'chrome_extension',
                ...(uploadContext || {}),
              },
              // Include source tracking for extension uploads
              source_url: sourceUrl,
              source_site: sourceSite,
            }),
          });
          if (!resp.ok) {
            const txt = await resp.text();
            throw new Error(`Upload failed: ${resp.status} ${txt}`);
          }
          const data = await resp.json();

          // Derive a simple provider success flag from backend note
          const note = typeof data.note === 'string' ? data.note : '';
          const providerSucceeded = !note.startsWith('Asset saved locally; provider upload failed');

          sendResponse({ success: true, data, providerSucceeded });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    }

  // Sync PixVerse asset to PixSim7 (register by external ID without re-upload)
  if (message.action === 'syncPixverseAsset') {
    (async () => {
      try {
        const { mediaUrl, pixverseAssetId, pixverseAssetUuid, pixverseMediaType, isVideo, accountId } = message;
        const settings = await getSettings();
        if (!settings.pixsim7Token) throw new Error('Not logged in');

        // Extract source context from sender tab
        const sourceUrl = sender?.tab?.url;

        const syncUrl = `${settings.backendUrl}/api/v1/assets/sync-pixverse`;
        const resp = await fetch(syncUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.pixsim7Token}`,
          },
          body: JSON.stringify({
            pixverse_asset_id: pixverseAssetId,
            pixverse_asset_uuid: pixverseAssetUuid || null, // UUID for reference/dedup
            media_url: mediaUrl,
            pixverse_media_type: pixverseMediaType,
            is_video: !!isVideo,  // Ensure boolean
            source_url: sourceUrl,
            account_id: accountId || null,
          }),
        });
        if (!resp.ok) {
          const txt = await resp.text();
          throw new Error(`Sync failed: ${resp.status} ${txt}`);
        }
        const data = await resp.json();
        sendResponse({ success: true, data, existed: data.existed || false });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Extract last frame from a video asset and upload to provider
  if (message.action === 'extractLastFrameAndUpload') {
    (async () => {
      try {
        const { videoAssetId, providerId } = message;
        const settings = await getSettings();
        if (!settings.pixsim7Token) throw new Error('Not logged in');

        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.pixsim7Token}`,
        };

        // Extract last frame and upload to provider in one call
        const extractResp = await fetch(
          `${settings.backendUrl}/api/v1/assets/extract-frame`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              video_asset_id: videoAssetId,
              last_frame: true,
              provider_id: providerId || 'pixverse',
            }),
          },
        );
        if (!extractResp.ok) {
          const txt = await extractResp.text();
          throw new Error(`Frame extraction failed: ${extractResp.status} ${txt}`);
        }
        const frameAsset = await extractResp.json();

        sendResponse({ success: true, frameAssetId: frameAsset.id });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Quick generate video from image
  if (message.action === 'quickGenerate') {
    (async () => {
      try {
        const { imageUrl, prompt, providerId } = message;
        const settings = await getSettings();
        if (!settings.pixsim7Token) throw new Error('Not logged in');

        // First upload the image
        const uploadUrl = `${settings.backendUrl}/api/v1/assets/upload-from-url`;
        const uploadResp = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.pixsim7Token}`,
          },
          body: JSON.stringify({
            url: imageUrl,
            provider_id: providerId || settings.defaultUploadProvider || 'pixverse',
            upload_method: 'web',
            upload_context: {
              client: 'chrome_extension',
              feature: 'quick_generate',
            },
          }),
        });
        if (!uploadResp.ok) {
          const txt = await uploadResp.text();
          throw new Error(`Image upload failed: ${uploadResp.status} ${txt}`);
        }
        const uploadData = await uploadResp.json();

        // Then create the generation via the simple image-to-video endpoint
        const genUrl = `${settings.backendUrl}/api/v1/generations/simple-image-to-video`;
        const genResp = await fetch(genUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.pixsim7Token}`,
          },
          body: JSON.stringify({
            provider_id: providerId || settings.defaultUploadProvider || 'pixverse',
            prompt: prompt,
            image_url: uploadData.external_url || imageUrl,
            name: prompt ? `Quick generate: ${prompt.substring(0, 50)}` : 'Quick generate',
            priority: 7
          }),
        });
        if (!genResp.ok) {
          const txt = await genResp.text();
          throw new Error(`Generation creation failed: ${genResp.status} ${txt}`);
        }
        const genData = await genResp.json();
        sendResponse({ success: true, data: genData });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // Login to provider site by injecting stored cookies and opening a tab
  if (message.action === 'loginWithAccount') {
    (async () => {
      try {
        const { accountId, tabId, accountEmail } = message;
        debugLogAuth('loginWithAccount received - accountId:', accountId, 'type:', typeof accountId, 'accountEmail:', accountEmail);
        const settings = await getSettings();
        if (!settings.pixsim7Token) throw new Error('Not logged in');

        // Note: No credit sync here - dropdown open already triggers batch sync
        // which handles TTL and exhausted-today skip logic. Login just injects cookies.

        // Fetch cookies for this account from backend and open a tab using
        // the stored session.
        debugLogAuth('Fetching cookies for accountId:', accountId);
        const data = await backendRequest(`/api/v1/accounts/${accountId}/cookies`);
        debugLogAuth('Backend returned cookies for email:', data.email, 'provider:', data.provider_id);
        debugLogAuth('Cookie names returned:', Object.keys(data.cookies || {}));
        // Log _ai_token payload if present (to see which user it belongs to)
        if (data.cookies && data.cookies._ai_token) {
          try {
            const tokenParts = data.cookies._ai_token.split('.');
            if (tokenParts.length >= 2) {
              const payload = JSON.parse(atob(tokenParts[1]));
              debugLogAuth('_ai_token belongs to user:', payload.email || payload.sub || payload.user_id || 'unknown');
            }
          } catch (e) {
            debugLogAuth('Could not decode _ai_token');
          }
        }
        const providerId = data.provider_id;
        const cookies = data.cookies || {};

        const target = PROVIDER_TARGETS[providerId] || PROVIDER_TARGETS.pixverse;

        // Inject cookies
        await injectCookies(cookies, target.domain);

        const handleTabReady = async (tab) => {
          const resolvedTabId = tab?.id ?? tabId;
          sendResponse({ success: true, tabId: resolvedTabId });

          // Best-effort: ask the content script in this tab
          // whether the provider session looks authenticated after
          // cookie injection, and forward that status to the popup.
          if (resolvedTabId && typeof resolvedTabId === 'number' && chrome.tabs?.sendMessage) {
            chrome.tabs.sendMessage(
              resolvedTabId,
              { action: 'checkSessionStatus' },
              (res) => {
                if (chrome.runtime.lastError) {
                  console.warn('[Background] Session status check failed:', chrome.runtime.lastError.message);
                  return;
                }
                if (!res || !res.success) {
                  console.warn('[Background] Session status check returned error:', res?.error);
                  return;
                }
                try {
                  chrome.runtime.sendMessage({
                    action: 'sessionStatus',
                    tabId: resolvedTabId,
                    providerId: res.providerId || providerId,
                    isAuthenticated: res.isAuthenticated,
                  });
                } catch (notifyErr) {
                  console.warn('[Background] Failed to notify popup of session status:', notifyErr);
                }
              }
            );
          }

          // Persist the "current account" for this provider so that other
          // features (e.g. pixverse-preset-buttons) can infer which Pixverse
          // account is active when running presets from the site UI.
          try {
            const stored = await chrome.storage.local.get(PROVIDER_SESSION_STORAGE_KEY);
            const sessions = stored[PROVIDER_SESSION_STORAGE_KEY] || {};
            sessions[providerId] = {
              providerId,
              accountId,
              email: accountEmail || data.email || null,
              updatedAt: Date.now(),
            };
            await chrome.storage.local.set({ [PROVIDER_SESSION_STORAGE_KEY]: sessions });
          } catch (e) {
            console.warn('[Background] Failed to update provider session store after login:', e);
          }

          // Notify popup to refresh accounts list
          try {
            chrome.runtime.sendMessage({
              action: 'accountsUpdated',
              providerId,
            });
          } catch (notifyErr) {
            console.warn('[Background] Failed to notify popup after login:', notifyErr);
          }
        };

        // Check if current tab is already on the provider's domain
        const useTabId = sender?.tab?.id || tabId;
        const currentTabUrl = sender?.tab?.url || '';
        const isOnProviderDomain = currentTabUrl.includes(target.domain);

        if (useTabId && typeof useTabId === 'number') {
          if (isOnProviderDomain) {
            // Already on provider domain - save page state and reload to preserve URL
            console.log('[Background] Already on provider domain, preserving page state');

            // Ask content script to save current page state before reload
            try {
              await new Promise((resolve) => {
                chrome.tabs.sendMessage(
                  useTabId,
                  { action: 'savePageStateBeforeLogin' },
                  (res) => {
                    if (chrome.runtime.lastError) {
                      console.warn('[Background] Failed to save page state:', chrome.runtime.lastError.message);
                    }
                    resolve();
                  }
                );
                // Don't wait forever
                setTimeout(resolve, 500);
              });
            } catch (e) {
              console.warn('[Background] Error saving page state:', e);
            }

            // Reload the current page instead of navigating to target.url
            chrome.tabs.reload(useTabId, {}, () => {
              chrome.tabs.get(useTabId, (tab) => {
                handleTabReady(tab);
              });
            });
          } else {
            // Not on provider domain - navigate to target.url
            chrome.tabs.update(useTabId, { url: target.url }, (tab) => {
              handleTabReady(tab);
            });
          }
        } else {
          // Fallback: open a new tab
          chrome.tabs.create({ url: target.url }, (tab) => {
            handleTabReady(tab);
          });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // List assets from backend
  if (message.action === 'getAssets') {
    (async () => {
      try {
        const { providerId, limit, offset, cursor, q, mediaType, uploadMethod } = message;
        const registryFilters = {};
        if (providerId) registryFilters.provider_id = providerId;
        if (mediaType) registryFilters.media_type = mediaType;
        if (uploadMethod) registryFilters.upload_method = uploadMethod;
        if (message.filters && typeof message.filters === 'object') {
          Object.entries(message.filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              registryFilters[key] = value;
            }
          });
        }

        const payload = {
          limit: limit || undefined,
          cursor: cursor || undefined,
          offset: cursor ? undefined : (offset != null ? offset : undefined),
          q: q && q.trim() ? q.trim() : undefined,
          filters: Object.keys(registryFilters).length > 0 ? registryFilters : undefined,
        };

        const data = await backendRequest('/api/v1/assets/search', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        // Fix relative URLs by prepending backend URL
        const settings = await getSettings();
        const backendUrl = settings.backendUrl || DEFAULT_BACKEND_URL;
        const fixRelativeUrl = (url) => {
          if (!url) return url;
          if (url.startsWith('/')) return backendUrl + url;
          return url;
        };

        // Fix URLs in assets array
        let items = data;
        if (data && !Array.isArray(data)) {
          items = data.items || data.assets || data.data || data.results || [];
        }
        if (Array.isArray(items)) {
          items.forEach(asset => {
            if (asset.thumbnail_url) asset.thumbnail_url = fixRelativeUrl(asset.thumbnail_url);
            if (asset.file_url) asset.file_url = fixRelativeUrl(asset.file_url);
            if (asset.preview_url) asset.preview_url = fixRelativeUrl(asset.preview_url);
          });
        }

        sendResponse({ success: true, data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Get single asset details
  if (message.action === 'getAsset') {
    (async () => {
      try {
        const { assetId } = message;
        const endpoint = `/api/v1/assets/${assetId}`;
        const data = await backendRequest(endpoint);

        // Fix relative URLs
        const settings = await getSettings();
        const backendUrl = settings.backendUrl || DEFAULT_BACKEND_URL;
        const fixRelativeUrl = (url) => {
          if (!url) return url;
          if (url.startsWith('/')) return backendUrl + url;
          return url;
        };

        if (data) {
          if (data.thumbnail_url) data.thumbnail_url = fixRelativeUrl(data.thumbnail_url);
          if (data.file_url) data.file_url = fixRelativeUrl(data.file_url);
          if (data.preview_url) data.preview_url = fixRelativeUrl(data.preview_url);
          if (data.remote_url) data.remote_url = fixRelativeUrl(data.remote_url);
        }

        sendResponse({ success: true, data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Get generation details
  if (message.action === 'getGeneration') {
    (async () => {
      try {
        const { generationId } = message;
        const endpoint = `/api/v1/generations/${generationId}`;
        const data = await backendRequest(endpoint);
        sendResponse({ success: true, data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Re-enrich asset (re-sync metadata and generation)
  if (message.action === 'enrichAsset') {
    (async () => {
      try {
        const { assetId } = message;
        const endpoint = `/api/v1/assets/${assetId}/enrich?force=true`;
        const data = await backendRequest(endpoint, { method: 'POST' });
        sendResponse({ success: true, data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Proxy image fetch for HTTP URLs (avoids mixed content issues on HTTPS pages)
  // Also handles Private Network Access (PNA) restrictions when loading from private IPs
  // Once backend has HTTPS, this proxy is bypassed automatically
  if (message.action === 'proxyImage') {
    (async () => {
      try {
        const { url, bypassCache } = message;
        if (!url) throw new Error('url is required');

        // Check persistent cache first (unless bypass requested)
        if (!bypassCache) {
          const cachedDataUrl = await getCachedImage(url);
          if (cachedDataUrl) {
            sendResponse({ success: true, dataUrl: cachedDataUrl, cached: true });
            return;
          }
        }

        // Include auth token for backend media endpoints
        const settings = await getSettings();
        const headers = {};
        if (settings.pixsim7Token) {
          headers['Authorization'] = `Bearer ${settings.pixsim7Token}`;
        }

        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();

        // Store in persistent cache
        await setCachedImage(url, blob);

        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Failed to read blob'));
          reader.readAsDataURL(blob);
        });

        sendResponse({ success: true, dataUrl });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Sync credits for an account (best-effort, respects TTL unless force=true)
  if (message.action === 'syncAccountCredits') {
    (async () => {
      try {
        const { accountId, force } = message;
        if (!accountId) throw new Error('accountId is required');
        await ensureAccountSessionHealth(accountId, { force: !!force });
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Batch sync credits for multiple accounts (backend handles TTL + exhausted skip)
  if (message.action === 'batchSyncCredits') {
    (async () => {
      try {
        const { accountIds, providerId, force } = message;
        const body = {};
        if (accountIds && accountIds.length > 0) {
          body.account_ids = accountIds;
        }
        if (force) {
          body.force = true;
        }
        const endpoint = providerId
          ? `/api/v1/accounts/sync-all-credits?provider_id=${providerId}`
          : '/api/v1/accounts/sync-all-credits';
        const data = await backendRequest(endpoint, {
          method: 'POST',
          body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
          headers: Object.keys(body).length > 0 ? { 'Content-Type': 'application/json' } : undefined,
        });
        sendResponse({ success: true, data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Pixverse status (credits + ad-watched task) for a given account
  if (message.action === 'getPixverseStatus') {
    (async () => {
      try {
        const { accountId } = message;
        if (!accountId) throw new Error('accountId is required');
        const data = await backendRequest(`/api/v1/accounts/${accountId}/pixverse-status`);
        sendResponse({ success: true, data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Get account stats (invited count, user info) - cached
  if (message.action === 'getAccountStats') {
    (async () => {
      try {
        const { accountId, force } = message;
        if (!accountId) throw new Error('accountId is required');
        const params = force ? '?force=true' : '';
        const data = await backendRequest(`/api/v1/accounts/${accountId}/stats${params}`);
        sendResponse({ success: true, data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Get invited accounts list (full details) - on-demand
  if (message.action === 'getInvitedAccounts') {
    (async () => {
      try {
        const { accountId, pageSize = 20, offset = 0 } = message;
        if (!accountId) throw new Error('accountId is required');
        const params = new URLSearchParams({ page_size: pageSize, offset });
        const data = await backendRequest(`/api/v1/accounts/${accountId}/invited-accounts?${params}`);
        sendResponse({ success: true, data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Dev: Pixverse dry-run sync for a specific account
  if (message.action === 'pixverseDryRunSync') {
    (async () => {
      try {
        const { accountId, limit, offset } = message;
        if (!accountId) throw new Error('accountId is required');

        const params = new URLSearchParams();
        params.set('account_id', String(accountId));
        if (typeof limit === 'number') params.set('limit', String(limit));
        if (typeof offset === 'number') params.set('offset', String(offset));

        const endpoint = `/api/v1/dev/pixverse-sync/dry-run?${params.toString()}`;
        const data = await backendRequest(endpoint);
        sendResponse({ success: true, data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Delete asset (with optional provider deletion)
  if (message.action === 'deleteAsset') {
    (async () => {
      try {
        const { assetId, deleteFromProvider = true } = message;
        if (!assetId) throw new Error('assetId is required');

        console.log('[Background] Deleting asset:', assetId, 'deleteFromProvider:', deleteFromProvider);

        const params = new URLSearchParams();
        params.set('delete_from_provider', String(deleteFromProvider));

        const endpoint = `/api/v1/assets/bulk/delete?${params.toString()}`;
        const data = await backendRequest(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ asset_ids: [assetId] }),
        });

        console.log('[Background] Delete response:', data);
        sendResponse({ success: true, data });
      } catch (error) {
        console.error('[Background] Delete error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'updateAccountStatus') {
    (async () => {
      try {
        const { accountId, status, reason } = message;
        if (!accountId) throw new Error('accountId is required');
        if (!status) throw new Error('status is required');

        const data = await backendRequest(`/api/v1/accounts/${accountId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        });

        console.log('[Background] Account status updated', {
          accountId,
          status,
          reason: reason || 'unspecified',
        });

        sendResponse({ success: true, data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
});
