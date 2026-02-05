/**
 * Player Init - Initialization and message handling
 */
(function() {
  'use strict';

  const { elements, state, utils } = window.PXS7Player;
  const { getVideoNameFromUrl } = utils;

  function init() {
    // ===== Check for URL parameters =====
    const params = new URLSearchParams(window.location.search);

    // Handle captured screenshot (data URL from tab capture)
    const captureDataUrl = params.get('capture');
    if (captureDataUrl) {
      const name = params.get('name') || 'Screenshot';
      const source = params.get('source') || null;

      // Set source context if available
      if (source) {
        try {
          state.currentVideoSourceSite = new URL(source).hostname;
        } catch (e) {
          state.currentVideoSourceSite = 'unknown';
        }
        state.currentVideoUrl = source;
      }

      // Load as image (it's a PNG data URL)
      window.PXS7Player.image?.loadImage(captureDataUrl, name);
    }
    // Handle regular URL parameter
    else {
      const videoUrl = params.get('url') || params.get('src');
      if (videoUrl) {
        elements.urlInput.value = videoUrl;
        if (window.PXS7Player.image?.isLikelyImageUrl(videoUrl)) {
          window.PXS7Player.image.loadImage(videoUrl, getVideoNameFromUrl(videoUrl));
        } else {
          window.PXS7Player.loadVideo(videoUrl, getVideoNameFromUrl(videoUrl));
        }
      }
    }

    console.log('[PixSim7 Player] Initialized');
  }

  // ===== Listen for messages from other parts of extension =====
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'loadVideo' && message.url) {
      elements.urlInput.value = message.url;
      window.PXS7Player.loadVideo(message.url, message.name || 'Video');
      sendResponse({ success: true });
    }
  });

  // Wait for dockview to be ready before loading media from URL params
  // This ensures panels are visible and elements have been moved from templates
  if (window.PXS7Player.dockviewReady) {
    init();
  } else {
    window.addEventListener('pxs7-dockview-ready', init, { once: true });
  }
})();
