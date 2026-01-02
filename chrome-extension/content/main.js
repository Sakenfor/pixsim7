/**
 * Content Script - Main Entry Point
 *
 * Loaded as a plain script - uses globals from other content scripts.
 * Requires: initUrlMonitor, getCurrentProvider, forceDetection (from url-monitor.js)
 * Requires: authMonitor (from auth-monitor.js)
 * Requires: importCookies (from cookie-import.js)
 * Requires: injectBearerTokenCapture, getAllCookiesSecure, isProviderSessionAuthenticated (from utils.js)
 * Requires: TIMING (from shared/constants.js)
 *
 * Coordinates URL monitoring, provider detection, and auth state monitoring.
 * Only detects provider on URL changes (not on every poll).
 */

// Debug mode - controlled by extension settings
let DEBUG_GENERAL = false;
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.local.get({ debugGeneral: false, debugAll: false }, (result) => {
    DEBUG_GENERAL = result.debugGeneral || result.debugAll;
  });
}
const debugLog = (...args) => DEBUG_GENERAL && console.log('[PixSim7 Content]', ...args);

debugLog('Loaded on:', window.location.href);

// Inject bearer token capture (safe no-op if not used)
try {
  injectBearerTokenCapture();
} catch (e) {
  console.warn('[PixSim7 Content] Failed to inject bearer capture:', e);
}

// Initialize URL monitor with callback for provider changes
setTimeout(() => {
  debugLog('Initializing...');

  initUrlMonitor((provider) => {
    // URL changed and provider detected/changed
    authMonitor.onProviderDetected(provider);
  });
}, TIMING.INITIAL_CHECK_DELAY_MS);

// Listen for manual import requests and session checks from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'manualImport') {
    (async () => {
      try {
        // Force re-detection in case provider changed
        const provider = await forceDetection();
        if (provider) {
          await importCookies(provider.providerId, {});
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Not logged into provider' });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Async response
  }

  if (message.action === 'checkSessionStatus') {
    (async () => {
      try {
        // Use cached provider if available; otherwise force detection
        let provider = getCurrentProvider();
        if (!provider) {
          provider = await forceDetection();
        }

        if (!provider || !provider.providerId) {
          sendResponse({ success: true, providerId: null, isAuthenticated: false });
          return;
        }

        const cookies = await getAllCookiesSecure(provider.providerId);
        const isAuthenticated = isProviderSessionAuthenticated(provider.providerId, cookies);

        sendResponse({
          success: true,
          providerId: provider.providerId,
          isAuthenticated,
        });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Async response
  }

  // Save page state before login/account switch (preserves prompt, image, URL)
  if (message.action === 'savePageStateBeforeLogin') {
    debugLog('Received savePageStateBeforeLogin message');
    (async () => {
      try {
        // Use the image picker's saveInputState to capture to sessionStorage
        if (window.PXS7?.imagePicker?.saveInputState) {
          window.PXS7.imagePicker.saveInputState();
        }

        // Use extracted utility functions if available, otherwise inline fallback
        if (window.PXS7?.utils?.capturePageState && window.PXS7?.utils?.savePageState) {
          const pageState = window.PXS7.utils.capturePageState();
          await window.PXS7.utils.savePageState(pageState);
        } else {
          // Fallback for when utils module isn't loaded yet
          console.warn('[PixSim7] Utils module not available, using inline capture');
          const pageState = {
            url: window.location.href,
            path: window.location.pathname,
          };
          // Basic prompt capture
          const prompts = {};
          document.querySelectorAll('textarea').forEach((el, i) => {
            if (el.value?.trim()) {
              prompts[el.id || el.name || el.placeholder || `textarea_${i}`] = el.value;
            }
          });
          if (Object.keys(prompts).length > 0) pageState.prompts = prompts;

          await chrome.storage.local.set({
            pixsim7PendingPageState: { ...pageState, savedAt: Date.now() }
          });
        }

        sendResponse({ success: true });
      } catch (error) {
        console.warn('[PixSim7] Failed to save page state:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Async response
  }
});
