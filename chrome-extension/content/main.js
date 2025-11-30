/**
 * Content Script - Main Entry Point
 *
 * Coordinates URL monitoring, provider detection, and auth state monitoring.
 * Only detects provider on URL changes (not on every poll).
 */

import { init as initUrlMonitor, getCurrentProvider, forceDetection } from './url-monitor.js';
import { authMonitor } from './auth-monitor.js';
import { importCookies } from './cookie-import.js';
import { injectBearerTokenCapture } from './utils.js';
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

// Listen for manual import requests from popup
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
});
