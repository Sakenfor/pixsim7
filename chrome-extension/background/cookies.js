/**
 * Cookie Management
 *
 * Loaded via importScripts in background.js.
 * Requires: backendRequest (from api-client.js)
 * Exposes: injectCookies, extractCookies, extractCookiesForUrl, importCookiesToBackend
 */

// Debug flag for cookie operations (loaded from storage)
let DEBUG_COOKIES = false;
chrome.storage.local.get({ debugCookies: false, debugAll: false }, (result) => {
  DEBUG_COOKIES = result.debugCookies || result.debugAll;
});
const debugLogCookies = (...args) => DEBUG_COOKIES && console.log('[Background Cookies]', ...args);

/**
 * Clear auth-related cookies for a domain before injecting new session
 * This prevents old session cookies from interfering with new logins
 */
async function clearAuthCookies(domain) {
  // Auth-related cookie names that should be cleared before switching accounts
  const authCookieNames = [
    '_ai_token',      // Pixverse JWT
    'token',          // Generic auth token
    'session',        // Session cookie
    'sessionid',      // Session ID
    'auth',           // Auth cookie
    'user_id',        // User identifier
    'userId',         // User identifier (camelCase)
  ];

  // Build URLs to check - for Pixverse we need to check both app subdomain and main domain
  // Using URL-based lookup catches ALL cookies that would be sent to these URLs,
  // including both host-only cookies (app.pixverse.ai) and domain cookies (.pixverse.ai)
  const urlsToCheck = domain === 'pixverse.ai'
    ? ['https://app.pixverse.ai', 'https://pixverse.ai']
    : ['https://' + domain, 'https://app.' + domain];

  // Collect all unique cookies across all URLs
  const allCookies = new Map();
  for (const url of urlsToCheck) {
    try {
      const cookies = await chrome.cookies.getAll({ url });
      for (const cookie of cookies) {
        // Use name+domain as key to deduplicate
        const key = cookie.name + '|' + cookie.domain;
        if (!allCookies.has(key)) {
          allCookies.set(key, cookie);
        }
      }
    } catch (e) {
      debugLogCookies('Failed to get cookies for ' + url + ':', e);
    }
  }

  debugLogCookies('Found ' + allCookies.size + ' unique cookies across ' + urlsToCheck.join(', '));

  for (const [key, cookie] of allCookies) {
    // Clear if it's a known auth cookie
    if (authCookieNames.includes(cookie.name)) {
      try {
        // Build the correct URL for removal based on the cookie's actual domain
        const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
        const removeUrl = 'https://' + cookieDomain + cookie.path;

        await chrome.cookies.remove({
          url: removeUrl,
          name: cookie.name,
        });
        debugLogCookies('Cleared auth cookie: ' + cookie.name + ' (domain: ' + cookie.domain + ')');
      } catch (error) {
        debugLogCookies('Failed to clear cookie ' + cookie.name + ':', error);
      }
    }
  }
}

/**
 * Inject cookies into browser
 */
async function injectCookies(cookies, domain) {
  // IMPORTANT: Clear existing auth cookies first to prevent old sessions from interfering
  await clearAuthCookies(domain);

  for (const [name, value] of Object.entries(cookies)) {
    try {
      // For Pixverse, set cookies against app.pixverse.ai so the host
      // matches what Pixverse itself uses. This mirrors pixsim6 behavior.
      const urlForSet =
        domain === 'pixverse.ai'
          ? 'https://app.pixverse.ai'
          : 'https://' + domain;

      await chrome.cookies.set({
        url: urlForSet,
        name: name,
        value: value,
        domain: domain === 'pixverse.ai' ? '.pixverse.ai' : '.' + domain,
        path: '/',
        secure: true,
        sameSite: 'no_restriction',
      });
    } catch (error) {
      debugLogCookies('Failed to set cookie ' + name + ':', error);
    }
  }

  debugLogCookies('Cookies injected successfully');
}

/**
 * Extract cookies from domain
 */
async function extractCookies(domain) {
  debugLogCookies('Extracting cookies for ' + domain);

  const cookies = await chrome.cookies.getAll({ domain });
  const cookieMap = {};

  for (const cookie of cookies) {
    cookieMap[cookie.name] = cookie.value;
  }

  debugLogCookies('Extracted ' + Object.keys(cookieMap).length + ' cookies');
  return cookieMap;
}

/**
 * Extract cookies for a specific URL (merges host + parent domain)
 */
async function extractCookiesForUrl(url) {
  const urlObj = new URL(url);
  const host = urlObj.hostname;
  const parts = host.split('.');
  const parent = parts.length >= 2 ? parts.slice(-2).join('.') : host;

  const [hostCookies, parentCookies] = await Promise.all([
    extractCookies(host),
    parent !== host ? extractCookies(parent) : Promise.resolve({})
  ]);

  // Merge, parent first then host overrides
  return { ...(parentCookies || {}), ...(hostCookies || {}) };
}

/**
 * Import cookies to backend
 */
async function importCookiesToBackend(providerId, url, rawData) {
  debugLogCookies('Importing raw data for ' + providerId + ' to backend...');

  try {
    const data = await backendRequest('/api/v1/accounts/import-cookies', {
      method: 'POST',
      body: JSON.stringify({
        provider_id: providerId,
        url: url,
        raw_data: rawData
      })
    });

    debugLogCookies('Data imported successfully:', data);
    return data;
  } catch (error) {
    debugLogCookies('Failed to import:', error);
    throw error;
  }
}
