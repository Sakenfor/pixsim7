/**
 * Content Script Utilities
 *
 * Loaded as a plain script - exposes globals.
 * Requires: PROVIDER_AUTH_COOKIE_HINTS (from shared/constants.js)
 */

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
 * Get all cookies as object (secure, using background script)
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

/**
 * Check if provider session is authenticated based on cookies
 */
function isProviderSessionAuthenticated(providerId, cookies) {
  const hints = PROVIDER_AUTH_COOKIE_HINTS[providerId];
  if (!hints || hints.length === 0) {
    return Object.keys(cookies || {}).length > 0;
  }
  return hints.some(name => Boolean(cookies?.[name]));
}

/**
 * Hash cookies for change detection
 */
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

/**
 * Get captured bearer token from injected script
 */
function getBearerToken() {
  return window.__pixsim7_bearer_token || null;
}

/**
 * Inject script to capture bearer token from network requests
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
 * Show notification to user
 */
function showNotification(title, message) {
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
