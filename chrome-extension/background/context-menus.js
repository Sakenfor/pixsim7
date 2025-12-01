/**
 * Context Menus
 *
 * Loaded via importScripts in background.js.
 * Requires: getSettings, backendRequest (from api-client.js), showQuickGenerateDialog (from quick-generate-dialog.js)
 * Exposes: setupContextMenus, initContextMenuListeners
 */

/**
 * Setup context menus for image/video uploads and quick generate
 */
async function setupContextMenus() {
  if (!chrome.contextMenus) return;
  try {
    const settings = await getSettings();
    let providers = [];
    try {
      providers = await backendRequest('/api/v1/providers');
    } catch (e) {
      providers = [
        { provider_id: 'pixverse', name: 'Pixverse' },
        { provider_id: 'runway', name: 'Runway' },
        { provider_id: 'pika', name: 'Pika' },
        { provider_id: 'sora', name: 'Sora' },
      ];
    }

    chrome.contextMenus.removeAll(() => {
      const defaultProv = settings.defaultUploadProvider || 'pixverse';
      const defaultName = (providers.find(p => p.provider_id === defaultProv)?.name) || defaultProv;

      // Image upload menus
      chrome.contextMenus.create({ id: 'pixsim7-upload-default', title: `Upload image to ${defaultName} (Default)`, contexts: ['image'] });
      chrome.contextMenus.create({ id: 'pixsim7-upload-provider', title: 'Upload image to provider…', contexts: ['image'] });
      providers.forEach(p => {
        chrome.contextMenus.create({ id: `pixsim7-prov-${p.provider_id}`, parentId: 'pixsim7-upload-provider', title: p.name || p.provider_id, contexts: ['image'] });
      });

      // Quick generate video from image
      chrome.contextMenus.create({ id: 'pixsim7-separator-1', type: 'separator', contexts: ['image'] });
      chrome.contextMenus.create({ id: 'pixsim7-quick-generate', title: '⚡ Quick Generate Video', contexts: ['image'] });

      // Video upload menus (5-30 sec requirement)
      chrome.contextMenus.create({ id: 'pixsim7-upload-video-default', title: `Upload video to ${defaultName} (5-30s)`, contexts: ['video'] });
      chrome.contextMenus.create({ id: 'pixsim7-upload-video-provider', title: 'Upload video to provider…', contexts: ['video'] });
      providers.forEach(p => {
        chrome.contextMenus.create({ id: `pixsim7-video-prov-${p.provider_id}`, parentId: 'pixsim7-upload-video-provider', title: p.name || p.provider_id, contexts: ['video'] });
      });
    });
  } catch (e) {
    console.warn('Context menu setup failed:', e);
  }
}

/**
 * Initialize context menu event listeners
 * Call this once after importScripts in background.js
 */
function initContextMenuListeners() {
  // Handle installation
  chrome.runtime.onInstalled.addListener(() => {
    console.log('[PixSim7 Extension] Installed');
    setupContextMenus();
  });

  // Also set up context menus when the service worker starts up
  setupContextMenus();

  // Handle context menu clicks
  chrome.contextMenus && chrome.contextMenus.onClicked && chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    try {
      if (!info || !info.srcUrl) return;
      const settings = await getSettings();
      let providerId = settings.defaultUploadProvider || 'pixverse';

      // Handle quick generate
      if (info.menuItemId === 'pixsim7-quick-generate') {
        // Inject content script to show prompt dialog
        try {
          if (!tab || typeof tab.id !== 'number') {
            console.warn('Cannot inject quick generate dialog: missing tab id');
            return;
          }

          if (chrome.scripting && chrome.scripting.executeScript) {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: showQuickGenerateDialog,
              args: [info.srcUrl, providerId]
            });
          } else if (chrome.tabs && chrome.tabs.executeScript) {
            // Fallback for environments without chrome.scripting
            const code = `(${showQuickGenerateDialog.toString()})(${JSON.stringify(info.srcUrl)}, ${JSON.stringify(providerId)});`;
            chrome.tabs.executeScript(tab.id, { code });
          } else {
            console.warn('Quick generate dialog injection not supported in this environment');
          }
        } catch (e) {
          console.warn('Failed to inject quick generate dialog:', e);
        }
        return;
      }

      // Check if this is a video upload menu item
      const isVideo = info.menuItemId && info.menuItemId.includes('video');

      // Map menu item to provider (handle both image and video menu items)
      if (info.menuItemId && info.menuItemId.startsWith('pixsim7-prov-')) {
        providerId = info.menuItemId.replace('pixsim7-prov-', '');
      } else if (info.menuItemId && info.menuItemId.startsWith('pixsim7-video-prov-')) {
        providerId = info.menuItemId.replace('pixsim7-video-prov-', '');
      }

      // Reuse our upload handler
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'uploadMediaFromUrl', mediaUrl: info.srcUrl, providerId }, resolve);
      });
      if (!response?.success) {
        console.warn(`${isVideo ? 'Video' : 'Image'} upload via context menu failed:`, response?.error);
      }
    } catch (e) {
      console.warn('Context menu click handler error:', e);
    }
  });

  // Rebuild context menus if settings change (e.g., default provider)
  chrome.storage && chrome.storage.onChanged && chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.defaultUploadProvider || changes.backendUrl)) {
      setupContextMenus();
    }
  });
}
