/**
 * URL Monitor - Detects URL changes and provider
 *
 * Only calls backend provider detection when URL actually changes.
 * Caches provider per URL to avoid unnecessary API calls.
 */

let currentUrl = '';
let cachedProvider = null;
let onProviderChangeCallback = null;

/**
 * Detect provider from backend
 */
async function detectProviderFromBackend(url) {
  try {
    const res = await chrome.runtime.sendMessage({
      action: 'detectProvider',
      url
    });
    if (res && res.success && res.data && res.data.detected && res.data.provider) {
      return { providerId: res.data.provider.provider_id };
    }
  } catch (e) {
    console.warn('[PixSim7 URL Monitor] Provider detection failed:', e);
  }
  return null;
}

/**
 * Check if URL has changed and re-detect provider if needed
 */
async function checkUrlChange() {
  const url = window.location.href;

  // URL hasn't changed - use cached provider
  if (url === currentUrl && cachedProvider !== null) {
    return cachedProvider;
  }

  // URL changed - invalidate cache and re-detect
  console.log('[PixSim7 URL Monitor] URL changed, detecting provider...', url);
  currentUrl = url;
  cachedProvider = await detectProviderFromBackend(url);

  if (cachedProvider) {
    console.log(`[PixSim7 URL Monitor] Provider detected: ${cachedProvider.providerId}`);
  } else {
    console.log('[PixSim7 URL Monitor] No provider detected for this URL');
  }

  // Notify callback of provider change
  if (onProviderChangeCallback) {
    onProviderChangeCallback(cachedProvider);
  }

  return cachedProvider;
}

/**
 * Watch for URL changes (SPA navigation)
 */
function watchUrlChanges() {
  let lastUrl = location.href;

  // Use MutationObserver to detect SPA navigation
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      checkUrlChange();
    }
  }).observe(document, { subtree: true, childList: true });

  // Also listen for popstate (back/forward)
  window.addEventListener('popstate', () => {
    checkUrlChange();
  });

  // And pushState/replaceState
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    checkUrlChange();
  };

  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    checkUrlChange();
  };
}

/**
 * Initialize URL monitoring
 */
export function init(onProviderChange) {
  onProviderChangeCallback = onProviderChange;

  console.log('[PixSim7 URL Monitor] Initializing on:', window.location.href);

  // Start watching for URL changes
  watchUrlChanges();

  // Do initial detection
  checkUrlChange();
}

/**
 * Get current cached provider (without re-detection)
 */
export function getCurrentProvider() {
  return cachedProvider;
}

/**
 * Force re-detection (useful for manual refresh)
 */
export async function forceDetection() {
  currentUrl = ''; // Invalidate cache
  return await checkUrlChange();
}
