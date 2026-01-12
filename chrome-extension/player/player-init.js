/**
 * Player Init - Initialization and message handling
 */
(function() {
  'use strict';

  const { elements, utils } = window.PXS7Player;
  const { getVideoNameFromUrl } = utils;

  // ===== Check for URL parameters =====
  const params = new URLSearchParams(window.location.search);
  const videoUrl = params.get('url') || params.get('src');
  if (videoUrl) {
    elements.urlInput.value = videoUrl;
    if (window.PXS7Player.image?.isLikelyImageUrl(videoUrl)) {
      window.PXS7Player.image.loadImage(videoUrl, getVideoNameFromUrl(videoUrl));
    } else {
      window.PXS7Player.loadVideo(videoUrl, getVideoNameFromUrl(videoUrl));
    }
  }

  // ===== Listen for messages from other parts of extension =====
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'loadVideo' && message.url) {
      elements.urlInput.value = message.url;
      window.PXS7Player.loadVideo(message.url, message.name || 'Video');
      sendResponse({ success: true });
    }
  });

  console.log('[PixSim7 Player] Initialized');
})();
