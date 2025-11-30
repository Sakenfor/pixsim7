/**
 * Cookie Management
 */

import { backendRequest } from './api-client.js';

/**
 * Inject cookies into browser
 */
export async function injectCookies(cookies, domain) {
  for (const [name, value] of Object.entries(cookies)) {
    try {
      // For Pixverse, set cookies against app.pixverse.ai so the host
      // matches what Pixverse itself uses. This mirrors pixsim6 behavior.
      const urlForSet =
        domain === 'pixverse.ai'
          ? 'https://app.pixverse.ai'
          : `https://${domain}`;

      await chrome.cookies.set({
        url: urlForSet,
        name: name,
        value: value,
        domain: domain === 'pixverse.ai' ? '.pixverse.ai' : `.${domain}`,
        path: '/',
        secure: true,
        sameSite: 'no_restriction',
      });
    } catch (error) {
      console.warn(`[Background Cookies] Failed to set cookie ${name}:`, error);
    }
  }

  console.log('[Background Cookies] Cookies injected successfully');
}

/**
 * Extract cookies from domain
 */
export async function extractCookies(domain) {
  console.log(`[Background Cookies] Extracting cookies for ${domain}`);

  const cookies = await chrome.cookies.getAll({ domain });
  const cookieMap = {};

  for (const cookie of cookies) {
    cookieMap[cookie.name] = cookie.value;
  }

  console.log(`[Background Cookies] Extracted ${Object.keys(cookieMap).length} cookies`);
  return cookieMap;
}

/**
 * Extract cookies for a specific URL (merges host + parent domain)
 */
export async function extractCookiesForUrl(url) {
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
export async function importCookiesToBackend(providerId, url, rawData) {
  console.log(`[Background Cookies] Importing raw data for ${providerId} to backend...`);

  try {
    const data = await backendRequest('/api/v1/accounts/import-cookies', {
      method: 'POST',
      body: JSON.stringify({
        provider_id: providerId,
        url: url,
        raw_data: rawData
      })
    });

    console.log(`[Background Cookies] ✓ Data imported successfully:`, data);
    return data;
  } catch (error) {
    console.error(`[Background Cookies] Failed to import:`, error);
    throw error;
  }
}
