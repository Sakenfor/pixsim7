/**
 * URL Monitor - Detects URL changes and provider
 *
 * Loaded as a plain script - exposes globals.
 * Only calls backend provider detection when URL actually changes.
 * Caches provider per URL to avoid unnecessary API calls.
 */

let _urlMonitor_currentUrl = '';
let _urlMonitor_cachedProvider = null;
let _urlMonitor_onProviderChangeCallback = null;

/**
 * Detect provider from backend
 */
async function _urlMonitor_detectProviderFromBackend(url) {
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
async function _urlMonitor_checkUrlChange() {
  const url = window.location.href;

  // URL hasn't changed - use cached provider
  if (url === _urlMonitor_currentUrl && _urlMonitor_cachedProvider !== null) {
    return _urlMonitor_cachedProvider;
  }

  // URL changed - invalidate cache and re-detect
  console.log('[PixSim7 URL Monitor] URL changed, detecting provider...', url);
  _urlMonitor_currentUrl = url;
  _urlMonitor_cachedProvider = await _urlMonitor_detectProviderFromBackend(url);

  if (_urlMonitor_cachedProvider) {
    console.log(`[PixSim7 URL Monitor] Provider detected: ${_urlMonitor_cachedProvider.providerId}`);
  } else {
    console.log('[PixSim7 URL Monitor] No provider detected for this URL');
  }

  // Notify callback of provider change
  if (_urlMonitor_onProviderChangeCallback) {
    _urlMonitor_onProviderChangeCallback(_urlMonitor_cachedProvider);
  }

  return _urlMonitor_cachedProvider;
}

/**
 * Watch for URL changes (SPA navigation)
 */
function _urlMonitor_watchUrlChanges() {
  let lastUrl = location.href;

  // Use MutationObserver to detect SPA navigation
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      _urlMonitor_checkUrlChange();
    }
  }).observe(document, { subtree: true, childList: true });

  // Also listen for popstate (back/forward)
  window.addEventListener('popstate', () => {
    _urlMonitor_checkUrlChange();
  });

  // And pushState/replaceState
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    _urlMonitor_checkUrlChange();
  };

  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    _urlMonitor_checkUrlChange();
  };
}

/**
 * Initialize URL monitoring
 */
function initUrlMonitor(onProviderChange) {
  _urlMonitor_onProviderChangeCallback = onProviderChange;

  console.log('[PixSim7 URL Monitor] Initializing on:', window.location.href);

  // Start watching for URL changes
  _urlMonitor_watchUrlChanges();

  // Do initial detection
  _urlMonitor_checkUrlChange();
}

/**
 * Get current cached provider (without re-detection)
 */
function getCurrentProvider() {
  return _urlMonitor_cachedProvider;
}

/**
 * Force re-detection (useful for manual refresh)
 */
async function forceDetection() {
  _urlMonitor_currentUrl = ''; // Invalidate cache
  return await _urlMonitor_checkUrlChange();
}
