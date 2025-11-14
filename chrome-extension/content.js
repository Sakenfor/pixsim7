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
async function getAllCookiesSecure() {
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
    cookies: await getAllCookiesSecure()
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
      console.log(`[PixSim7 Content] ✓ Cookies imported successfully:`, importResponse.data);

      // Only notify on first-time creation to avoid update spam
      if (importResponse.data.created) {
        showNotification(
          'Account Created',
          `${importResponse.data.email} - Cookies imported successfully`
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
      🎨 ${title}
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

async function checkAndImport() {
  const auth = await checkAuth();
  const isLoggedIn = !!auth;

  // Only import on actual login transition (from logged out to logged in)
  if (isLoggedIn && !wasLoggedIn) {
    console.log('[PixSim7 Content] *** LOGIN DETECTED ***');
    hasImportedThisSession = true;
    // Wait a bit for bearer token to be captured
    setTimeout(() => {
      importCookies(auth.providerId, {});
    }, 1000);
  }

  wasLoggedIn = isLoggedIn;
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
    const auth = checkAuth();
    if (auth) {
      importCookies(auth.providerId, auth.config)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
    } else {
      sendResponse({ success: false, error: 'Not logged into provider' });
    }
    return true; // Async response
  }
});
