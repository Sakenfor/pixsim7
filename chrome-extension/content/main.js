/**
 * Content Script - Main Entry Point
 *
 * Coordinates URL monitoring, provider detection, and auth state monitoring.
 * Only detects provider on URL changes (not on every poll).
 */

import { init as initUrlMonitor, getCurrentProvider, forceDetection } from './url-monitor.js';
import { authMonitor } from './auth-monitor.js';
import { importCookies } from './cookie-import.js';
import { injectBearerTokenCapture, getAllCookiesSecure, isProviderSessionAuthenticated } from './utils.js';
import { TIMING } from '../shared/constants.js';

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
});
