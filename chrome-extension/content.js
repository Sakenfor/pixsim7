/**
 * Content Script - Provider Site Detection
 *
 * Runs on provider sites (Pixverse, Runway, Pika, etc.)
 * Detects when user is logged in and auto-imports cookies
 */

console.log('[PixSim7 Content] Loaded on:', window.location.href);

// Provider-specific detection logic
// Content script only detects login and extracts RAW data
// Backend provider adapter parses provider-specific formats
const PROVIDER_DETECTORS = {
  pixverse: {
    domains: ['pixverse.ai', 'app.pixverse.ai'],
    detectAuth: () => {
      // Check for _ai_token cookie (pixsim6 approach)
      return !!getCookie('_ai_token');
    }
  },
  sora: {
    domains: ['sora.chatgpt.com', 'chatgpt.com'],
    detectAuth: () => {
      // Check for OpenAI session cookies
      return !!(getCookie('__Secure-next-auth.session-token') || getCookie('oai-device-id'));
    },
    needsBearerToken: true  // Flag to indicate we need to capture bearer token
  },
  runway: {
    domains: ['runwayml.com', 'app.runwayml.com'],
    detectAuth: () => {
      return !!(getCookie('auth_token') || getCookie('session'));
    }
  },
  pika: {
    domains: ['pika.art', 'app.pika.art'],
    detectAuth: () => {
      return !!getCookie('token');
    }
  }
};

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
function getAllCookies() {
  const cookies = {};
  document.cookie.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies[name] = value;
    }
  });
  return cookies;
}

/**
 * Detect which provider this site is
 */
function detectProvider() {
  const hostname = window.location.hostname;

  for (const [providerId, config] of Object.entries(PROVIDER_DETECTORS)) {
    for (const domain of config.domains) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return { providerId, config };
      }
    }
  }

  return null;
}

/**
 * Check if user is authenticated
 */
function checkAuth() {
  const provider = detectProvider();
  if (!provider) {
    console.log('[PixSim7 Content] Not a provider site');
    return null;
  }

  const { providerId, config } = provider;

  if (!config.detectAuth()) {
    console.log(`[PixSim7 Content] Not logged into ${providerId}`);
    return null;
  }

  console.log(`[PixSim7 Content] Logged into ${providerId}!`);
  return { providerId, config };
}

// Global storage for captured bearer token (for Sora)
let capturedBearerToken = null;

/**
 * Inject script to capture bearer token from network requests
 * (For providers like Sora that use Authorization headers)
 */
function injectBearerTokenCapture() {
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const [url, options] = args;

        // Capture Authorization header
        if (options && options.headers) {
          const headers = new Headers(options.headers);
          const auth = headers.get('Authorization');
          if (auth && auth.startsWith('Bearer ')) {
            // Store in a global variable accessible to content script
            window.__pixsim7_bearer_token = auth.substring(7); // Remove "Bearer "
          }
        }

        return originalFetch.apply(this, args);
      };
    })();
  `;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
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
function extractRawData(providerId, config) {
  const data = {
    cookies: getAllCookies()
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
    const rawData = extractRawData(providerId, config);

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

      // Show notification
      showNotification(
        importResponse.data.created ? 'Account Created' : 'Account Updated',
        `${importResponse.data.email} - Cookies imported successfully`
      );
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

// Inject bearer token capture for providers that need it
(function() {
  const provider = detectProvider();
  if (provider && provider.config.needsBearerToken) {
    console.log(`[PixSim7 Content] Injecting bearer token capture for ${provider.providerId}`);
    injectBearerTokenCapture();
  }
})();

// Monitor login state like pixsim6 (simpler approach)
let wasLoggedIn = false;

function checkAndImport() {
  const auth = checkAuth();
  const isLoggedIn = !!auth;

  // Only import on login transition or initial logged-in state
  if (isLoggedIn && !wasLoggedIn) {
    console.log('[PixSim7 Content] *** LOGIN DETECTED ***');
    // Wait a bit for bearer token to be captured
    setTimeout(() => {
      importCookies(auth.providerId, auth.config);
    }, 1000);
  }

  wasLoggedIn = isLoggedIn;
}

// Initial check after page load
setTimeout(() => {
  console.log('[PixSim7 Content] Initial check...');
  checkAndImport();
}, 2000);

// Check every 2 seconds for login state changes (like pixsim6)
setInterval(checkAndImport, 2000);

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
