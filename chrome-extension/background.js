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

// Constants for provider session tracking (used by loginWithAccount)
const PROVIDER_SESSION_STORAGE_KEY = 'pixsim7ProviderSessions';

// Initialize context menus and listeners
initContextMenuListeners();

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
          chrome.runtime.sendMessage({ action: 'accountsUpdated' });
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

        const result = await backendRequest(endpoint, { method: 'POST' });

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
          const { imageUrl, mediaUrl, providerId, ensureAsset } = message;
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
          body: JSON.stringify({ url: imageUrl, provider_id: providerId || settings.defaultUploadProvider || 'pixverse' }),
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
        const settings = await getSettings();
        if (!settings.pixsim7Token) throw new Error('Not logged in');

        // Get the old session account (if any) before switching
        let oldAccountId = null;
        try {
          const stored = await chrome.storage.local.get(PROVIDER_SESSION_STORAGE_KEY);
          const sessions = stored[PROVIDER_SESSION_STORAGE_KEY] || {};
          const oldSession = sessions['pixverse'];
          if (oldSession?.accountId && oldSession.accountId !== accountId) {
            oldAccountId = oldSession.accountId;
          }
        } catch (e) {
          console.warn('[Background] Failed to get old session for refresh:', e);
        }

        // Best-effort: refresh credits for both old and new accounts
        // Old account: capture latest credit state before switching away
        // New account: ensure session health and get fresh credits
        // Use force: true on login to bypass TTL and get fresh data
        const refreshPromises = [ensureAccountSessionHealth(accountId, { force: true })];
        if (oldAccountId) {
          refreshPromises.push(ensureAccountSessionHealth(oldAccountId, { force: true }));
        }
        await Promise.all(refreshPromises);

        // Fetch cookies for this account from backend and open a tab using
        // the stored session.
        const data = await backendRequest(`/api/v1/accounts/${accountId}/cookies`);
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
        const { providerId, limit, offset, cursor } = message;
        let endpoint = '/api/v1/assets?';
        const params = [];
        if (providerId) params.push(`provider_id=${encodeURIComponent(providerId)}`);
        if (limit) params.push(`limit=${limit}`);
        if (cursor) params.push(`cursor=${encodeURIComponent(cursor)}`);
        else if (offset != null) params.push(`offset=${offset}`);
        endpoint += params.join('&');

        const data = await backendRequest(endpoint);
        sendResponse({ success: true, data });
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
