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
    backendRequest('/api/v1/automation/execute-preset', {
      method: 'POST',
      body: JSON.stringify({
        preset_id: message.presetId,
        account_id: message.accountId,
        priority: message.priority || 1,
      }),
    })
      .then((data) => sendResponse({ success: true, data }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Automation: execute next loop preset for account
  if (message.action === 'executeLoopForAccount') {
    backendRequest('/api/v1/automation/loops/execute-for-account', {
      method: 'POST',
      body: JSON.stringify({
        loop_id: message.loopId,
        account_id: message.accountId,
      }),
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
        const url = new URL(message.url);
        const host = url.hostname;
        const parts = host.split('.')
        const parent = parts.length >= 2 ? parts.slice(-2).join('.') : host;
        const [hostCookies, parentCookies] = await Promise.all([
          extractCookies(host),
          parent !== host ? extractCookies(parent) : Promise.resolve({})
        ]);
        // Merge, parent first then host overrides
        const merged = { ...(parentCookies || {}) , ...(hostCookies || {}) };
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
        const { imageUrl, mediaUrl, providerId } = message;
        const url = mediaUrl || imageUrl; // Support both param names
        const settings = await getSettings();
        if (!settings.pixsim7Token) throw new Error('Not logged in');

        const uploadUrl = `${settings.backendUrl}/api/v1/assets/upload-from-url`;
        const resp = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.pixsim7Token}`,
          },
          body: JSON.stringify({ url, provider_id: providerId || settings.defaultUploadProvider || 'pixverse' }),
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

        // Then create the generation
        const genUrl = `${settings.backendUrl}/api/v1/generations`;
        const genResp = await fetch(genUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.pixsim7Token}`,
          },
          body: JSON.stringify({
            provider_id: providerId || settings.defaultUploadProvider || 'pixverse',
            config: {
              generation_type: 'npc_response',
              purpose: 'adaptive',
              style: {
                pacing: 'medium'
              },
              duration: {
                target: 5.0
              },
              constraints: {
                rating: 'PG-13'
              },
              strategy: 'once',
              fallback: {
                mode: 'placeholder',
                timeout_ms: 30000
              },
              enabled: true,
              version: 1
            },
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
        const { accountId } = message;
        const settings = await getSettings();
        if (!settings.pixsim7Token) throw new Error('Not logged in');

        // Fetch cookies for this account from backend
        const data = await backendRequest(`/api/v1/accounts/${accountId}/cookies`);
        const providerId = data.provider_id;
        const cookies = data.cookies || {};

        // Map provider -> domain + landing URL
        const providerTargets = {
          pixverse: { domain: 'pixverse.ai', url: 'https://app.pixverse.ai' },
          runway: { domain: 'runwayml.com', url: 'https://app.runwayml.com' },
          pika: { domain: 'pika.art', url: 'https://app.pika.art' },
          sora: { domain: 'chatgpt.com', url: 'https://chatgpt.com' },
        };
        const target = providerTargets[providerId] || { domain: 'pixverse.ai', url: 'https://app.pixverse.ai' };

        // Inject cookies
        await injectCookies(cookies, target.domain);

        // Best-effort: sync credits after opening tab
        try {
          await backendRequest(`/api/v1/accounts/${accountId}/sync-credits`, { method: 'POST' });
        } catch (e) {
          console.warn('[Background] Credit sync failed:', e);
        }

        // Open tab
        chrome.tabs.create({ url: target.url }, (tab) => {
          sendResponse({ success: true, tabId: tab?.id });
        });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
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
  setupContextMenus();
});

// Also set up context menus when the service worker starts up
setupContextMenus();

async function setupContextMenus() {
  if (!chrome.contextMenus) return;
  try {
    const settings = await getSettings();
    let providers = [];
    try {
      providers = await backendRequest('/api/v1/providers');
    } catch (e) {
      providers = [
        { provider_id: 'pixverse', name: 'Pixverse' },
        { provider_id: 'runway', name: 'Runway' },
        { provider_id: 'pika', name: 'Pika' },
        { provider_id: 'sora', name: 'Sora' },
      ];
    }

    chrome.contextMenus.removeAll(() => {
      const defaultProv = settings.defaultUploadProvider || 'pixverse';
      const defaultName = (providers.find(p => p.provider_id === defaultProv)?.name) || defaultProv;
      
      // Image upload menus
      chrome.contextMenus.create({ id: 'pixsim7-upload-default', title: `Upload image to ${defaultName} (Default)`, contexts: ['image'] });
      chrome.contextMenus.create({ id: 'pixsim7-upload-provider', title: 'Upload image to provider…', contexts: ['image'] });
      providers.forEach(p => {
        chrome.contextMenus.create({ id: `pixsim7-prov-${p.provider_id}`, parentId: 'pixsim7-upload-provider', title: p.name || p.provider_id, contexts: ['image'] });
      });

      // Quick generate video from image
      chrome.contextMenus.create({ id: 'pixsim7-separator-1', type: 'separator', contexts: ['image'] });
      chrome.contextMenus.create({ id: 'pixsim7-quick-generate', title: '⚡ Quick Generate Video', contexts: ['image'] });

      // Video upload menus (5-30 sec requirement)
      chrome.contextMenus.create({ id: 'pixsim7-upload-video-default', title: `Upload video to ${defaultName} (5-30s)`, contexts: ['video'] });
      chrome.contextMenus.create({ id: 'pixsim7-upload-video-provider', title: 'Upload video to provider…', contexts: ['video'] });
      providers.forEach(p => {
        chrome.contextMenus.create({ id: `pixsim7-video-prov-${p.provider_id}`, parentId: 'pixsim7-upload-video-provider', title: p.name || p.provider_id, contexts: ['video'] });
      });
    });
  } catch (e) {
    console.warn('Context menu setup failed:', e);
  }
}

chrome.contextMenus && chrome.contextMenus.onClicked && chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (!info || !info.srcUrl) return;
    const settings = await getSettings();
    let providerId = settings.defaultUploadProvider || 'pixverse';
    
    // Handle quick generate
    if (info.menuItemId === 'pixsim7-quick-generate') {
      // Inject content script to show prompt dialog
      try {
        if (!tab || typeof tab.id !== 'number') {
          console.warn('Cannot inject quick generate dialog: missing tab id');
          return;
        }

        if (chrome.scripting && chrome.scripting.executeScript) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: showQuickGenerateDialog,
            args: [info.srcUrl, providerId]
          });
        } else if (chrome.tabs && chrome.tabs.executeScript) {
          // Fallback for environments without chrome.scripting
          const code = `(${showQuickGenerateDialog.toString()})(${JSON.stringify(info.srcUrl)}, ${JSON.stringify(providerId)});`;
          chrome.tabs.executeScript(tab.id, { code });
        } else {
          console.warn('Quick generate dialog injection not supported in this environment');
        }
      } catch (e) {
        console.warn('Failed to inject quick generate dialog:', e);
      }
      return;
    }
    
    // Check if this is a video upload menu item
    const isVideo = info.menuItemId && info.menuItemId.includes('video');
    
    // Map menu item to provider (handle both image and video menu items)
    if (info.menuItemId && info.menuItemId.startsWith('pixsim7-prov-')) {
      providerId = info.menuItemId.replace('pixsim7-prov-', '');
    } else if (info.menuItemId && info.menuItemId.startsWith('pixsim7-video-prov-')) {
      providerId = info.menuItemId.replace('pixsim7-video-prov-', '');
    }

    // Reuse our upload handler
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'uploadMediaFromUrl', mediaUrl: info.srcUrl, providerId }, resolve);
    });
    if (!response?.success) {
      console.warn(`${isVideo ? 'Video' : 'Image'} upload via context menu failed:`, response?.error);
    }
  } catch (e) {
    console.warn('Context menu click handler error:', e);
  }
});

// Dialog function to inject
async function showQuickGenerateDialog(imageUrl, providerId) {
  const dialogId = 'pixsim7-quick-generate-dialog';
  if (document.getElementById(dialogId)) return;

  const overlay = document.createElement('div');
  overlay.id = dialogId;
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.75); z-index: 2147483647;
    display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: #1f2937; border-radius: 12px; padding: 24px;
    max-width: 500px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    border: 1px solid #374151;
  `;

  dialog.innerHTML = `
    <h3 style="margin: 0 0 16px; color: #f3f4f6; font-size: 18px; font-weight: 600;">⚡ Quick Generate Video</h3>
    <div style="margin-bottom: 16px;">
      <img src="${imageUrl}" style="max-width: 100%; max-height: 200px; border-radius: 6px; display: block; margin: 0 auto;" />
    </div>
    <div style="margin-bottom: 12px;">
      <label style="display: block; color: #d1d5db; font-size: 12px; margin-bottom: 6px; font-weight: 500;">
        Preset Template
        <button id="pixsim7-refresh-presets" style="margin-left: 8px; padding: 2px 6px; border: 1px solid #4b5563; border-radius: 4px; background: #374151; color: #d1d5db; cursor: pointer; font-size: 11px;">↻</button>
      </label>
      <select id="pixsim7-preset-select" style="width: 100%; padding: 8px; border: 1px solid #4b5563; border-radius: 6px; background: #111827; color: #f3f4f6; font-size: 13px;">
        <option value="">Custom Prompt</option>
      </select>
    </div>
    <div style="margin-bottom: 16px;">
      <label style="display: block; color: #d1d5db; font-size: 12px; margin-bottom: 6px; font-weight: 500;">Prompt (max 2048 chars)</label>
      <textarea id="pixsim7-prompt-input" maxlength="2048" placeholder="Describe how you want to animate this image..." 
        style="width: 100%; min-height: 100px; padding: 10px; border: 1px solid #4b5563; border-radius: 6px;
               background: #111827; color: #f3f4f6; font-size: 14px; font-family: inherit; resize: vertical;"></textarea>
      <div style="text-align: right; color: #9ca3af; font-size: 11px; margin-top: 4px;">
        <span id="pixsim7-char-count">0</span> / 2048
      </div>
    </div>
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button id="pixsim7-cancel-btn" style="padding: 10px 20px; border: 1px solid #4b5563; border-radius: 6px;
                background: transparent; color: #d1d5db; cursor: pointer; font-size: 14px; font-weight: 500;">Cancel</button>
      <button id="pixsim7-generate-btn" style="padding: 10px 20px; border: none; border-radius: 6px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; cursor: pointer; font-size: 14px; font-weight: 600;">Generate Video</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const input = dialog.querySelector('#pixsim7-prompt-input');
  const charCount = dialog.querySelector('#pixsim7-char-count');
  const cancelBtn = dialog.querySelector('#pixsim7-cancel-btn');
  const generateBtn = dialog.querySelector('#pixsim7-generate-btn');

  input.addEventListener('input', () => {
    charCount.textContent = input.value.length;
  });

  cancelBtn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  generateBtn.addEventListener('click', async () => {
    const prompt = input.value.trim();
    if (!prompt) {
      input.style.borderColor = '#ef4444';
      return;
    }

    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'quickGenerate',
        imageUrl,
        prompt,
        providerId
      });

      if (res && res.success) {
        // Show success toast
        const toast = document.createElement('div');
        toast.style.cssText = `
          position: fixed; bottom: 20px; right: 20px; z-index: 2147483648;
          background: #065f46; color: white; padding: 12px 20px; border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3); font-size: 14px; border: 1px solid #10b981;
        `;
        toast.textContent = '✓ Video generation started!';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
        overlay.remove();
      } else {
        throw new Error(res?.error || 'Failed to generate');
      }
    } catch (e) {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate Video';
      const error = document.createElement('div');
      error.style.cssText = 'color: #ef4444; font-size: 12px; margin-top: 8px;';
      error.textContent = e.message || 'Generation failed';
      dialog.appendChild(error);
      setTimeout(() => error.remove(), 3000);
    }
  });

  // === PRESET LOADING ===
  const presetSelect = dialog.querySelector('#pixsim7-preset-select');
  const refreshBtn = dialog.querySelector('#pixsim7-refresh-presets');
  
  async function loadPresets() {
    const opts = await chrome.storage.local.get(['backendUrl', 'pixsim7Token']);
    if (!opts.backendUrl || !opts.pixsim7Token) return;
    
    try {
      const url = `${opts.backendUrl}/api/v1/automation/presets?provider_id=${providerId || 'pixverse'}`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${opts.pixsim7Token}` } });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      
      presetSelect.innerHTML = '<option value="">Custom Prompt</option>';
      (data.presets || []).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name || `Preset ${p.id}`;
        opt.dataset.prompt = p.prompt || '';
        presetSelect.appendChild(opt);
      });
    } catch (e) { console.error('Preset load failed:', e); }
  }
  
  loadPresets();
  refreshBtn.addEventListener('click', () => loadPresets());
  presetSelect.addEventListener('change', () => {
    const opt = presetSelect.options[presetSelect.selectedIndex];
    if (opt.dataset.prompt) {
      input.value = opt.dataset.prompt;
      charCount.textContent = input.value.length;
    }
  });

  input.focus();
}

// Rebuild context menus if settings change (e.g., default provider)
chrome.storage && chrome.storage.onChanged && chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.defaultUploadProvider || changes.backendUrl)) {
    setupContextMenus();
  }
});
