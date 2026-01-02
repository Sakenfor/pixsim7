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
    console.log('[PixSim7] Received savePageStateBeforeLogin message');
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

        const textareas = document.querySelectorAll('textarea');
        console.log('[PixSim7] Found', textareas.length, 'textareas on page');

        // Capture prompt text from textareas
        const prompts = {};
        document.querySelectorAll('textarea').forEach((el, i) => {
          if (el.value && el.value.trim()) {
            const key = el.id || el.name || el.placeholder || `textarea_${i}`;
            prompts[key] = el.value;
            console.log('[PixSim7] Captured prompt:', key.substring(0, 40) + '...', '=', el.value.substring(0, 30) + '...');
          }
        });
        if (Object.keys(prompts).length > 0) {
          pageState.prompts = prompts;
          console.log('[PixSim7] Total prompts captured:', Object.keys(prompts).length);
        }

        // Capture images from upload containers with container ID for precise restoration
        const images = [];
        const seenUrls = new Set();

        // Find all upload inputs to map images to their containers
        const uploadInputs = Array.from(document.querySelectorAll('input[type="file"]'))
          .filter(input => {
            const accept = input.getAttribute('accept') || '';
            return accept.includes('image') || input.closest('.ant-upload');
          });

        // For each upload input, find any associated image
        uploadInputs.forEach((input, slotIndex) => {
          const container = input.closest('.ant-upload-wrapper') ||
                           input.closest('.ant-upload') ||
                           input.parentElement?.parentElement;
          if (!container) return;

          // Get the container ID for precise matching on restore
          const parentWithId = input.closest('[id]');
          const containerId = parentWithId?.id || '';

          // Skip video containers
          if (containerId.includes('video')) return;

          // Look for images in this container
          let imageUrl = null;

          // Check img tags
          const img = container.querySelector('img[src*="media.pixverse.ai"], img[src*="aliyun"]');
          if (img?.src) {
            imageUrl = img.src.split('?')[0];
          }

          // Check background-image styles
          if (!imageUrl) {
            const bgEl = container.querySelector('[style*="media.pixverse.ai"]');
            if (bgEl) {
              const style = bgEl.getAttribute('style') || '';
              const match = style.match(/url\(["']?(https:\/\/media\.pixverse\.ai[^"')\s]+)/);
              if (match) imageUrl = match[1].split('?')[0];
            }
          }

          if (imageUrl && !seenUrls.has(imageUrl)) {
            seenUrls.add(imageUrl);
            images.push({
              url: imageUrl,
              slot: slotIndex,
              containerId: containerId, // e.g., "create_image-customer_img_paths"
            });
          }
        });

        // Only save images that are actually in upload containers
        // (removed the fallback that grabbed ALL pixverse images on page)
        if (images.length > 0) {
          pageState.images = images;
          console.log('[PixSim7] Captured images from upload slots:', images);
        }

        // Count image upload slots (for restoring slot count after reload)
        const imageSlotCount = uploadInputs.filter(input => {
          const parentWithId = input.closest('[id]');
          const containerId = parentWithId?.id || '';
          // Only count image slots, not video slots
          return containerId.includes('customer_img') && !containerId.includes('video');
        }).length;
        if (imageSlotCount > 0) {
          pageState.imageSlotCount = imageSlotCount;
          console.log('[PixSim7] Captured image slot count:', imageSlotCount);
        }

        // Save to chrome.storage via the storage module
        if (window.PXS7?.storage?.savePendingPageState) {
          await window.PXS7.storage.savePendingPageState(pageState);
          console.log('[PixSim7] Saved page state before login:', pageState);
        } else {
          console.warn('[PixSim7] Storage module not available, saving directly');
          // Fallback: save directly to chrome.storage
          // Use same key as storage module: 'pixsim7PendingPageState'
          await chrome.storage.local.set({
            pixsim7PendingPageState: { ...pageState, savedAt: Date.now() }
          });
          console.log('[PixSim7] Saved page state directly:', pageState);
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
