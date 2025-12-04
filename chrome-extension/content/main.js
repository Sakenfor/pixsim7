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

console.log('[PixSim7 Content] Loaded on:', window.location.href);

// Inject bearer token capture (safe no-op if not used)
try {
  injectBearerTokenCapture();
} catch (e) {
  console.warn('[PixSim7 Content] Failed to inject bearer capture:', e);
}

// Initialize URL monitor with callback for provider changes
setTimeout(() => {
  console.log('[PixSim7 Content] Initializing...');

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
    (async () => {
      try {
        // Use the image picker's saveInputState to capture current state
        if (window.PXS7?.imagePicker?.saveInputState) {
          window.PXS7.imagePicker.saveInputState();
        }

        // Also save to chrome.storage for persistence across reload
        const pageState = {
          url: window.location.href,
          path: window.location.pathname,
        };

        // Capture prompt text from textareas
        const prompts = {};
        document.querySelectorAll('textarea').forEach((el, i) => {
          if (el.value && el.value.trim()) {
            const key = el.id || el.name || el.placeholder || `textarea_${i}`;
            prompts[key] = el.value;
          }
        });
        if (Object.keys(prompts).length > 0) {
          pageState.prompts = prompts;
        }

        // Capture images from upload containers
        const images = [];
        document.querySelectorAll('.ant-upload-drag-container img, [style*="media.pixverse.ai"]').forEach(el => {
          let src = el.src || '';
          if (!src) {
            const style = el.getAttribute('style') || '';
            const match = style.match(/url\(["']?(https:\/\/media\.pixverse\.ai[^"')\s]+)/);
            if (match) src = match[1];
          }
          if (src && src.includes('media.pixverse.ai')) {
            const cleanUrl = src.split('?')[0];
            if (!images.includes(cleanUrl)) {
              images.push(cleanUrl);
            }
          }
        });
        if (images.length > 0) {
          pageState.images = images;
        }

        // Save to chrome.storage via the storage module
        if (window.PXS7?.storage?.savePendingPageState) {
          await window.PXS7.storage.savePendingPageState(pageState);
          console.log('[PixSim7] Saved page state before login:', pageState);
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
