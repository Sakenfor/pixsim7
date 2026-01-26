/**
 * Universal Image Extractor
 *
 * Extracts actual image URLs from complex DOM structures used by modern sites.
 * Many sites (Instagram, Twitter/X, Facebook, Pinterest, etc.) use techniques that
 * prevent direct right-click access to images:
 * - Background images instead of <img> tags
 * - Lazy loading with placeholder elements
 * - Complex nested DOM structures
 * - srcset with multiple resolutions (we pick the highest)
 * - Video elements with poster images
 */

(function() {
  'use strict';

  // Store the last extracted image data for the background script to query
  let lastExtractedData = {
    imageUrl: null,
    element: null,
    timestamp: 0
  };

  /**
   * Extract the highest resolution image URL from srcset
   */
  function getBestSrcFromSrcset(srcset) {
    if (!srcset) return null;

    const sources = srcset.split(',').map(s => {
      const parts = s.trim().split(/\s+/);
      const url = parts[0];
      const descriptor = parts[1] || '1x';
      let size = 1;

      if (descriptor.endsWith('w')) {
        size = parseInt(descriptor) || 1;
      } else if (descriptor.endsWith('x')) {
        size = parseFloat(descriptor) * 1000 || 1;
      }

      return { url, size };
    });

    // Sort by size descending and return the largest
    sources.sort((a, b) => b.size - a.size);
    return sources[0]?.url || null;
  }

  /**
   * Check if a URL looks like a valid image URL
   */
  function isValidImageUrl(url) {
    if (!url) return false;
    if (url.startsWith('data:')) return false;
    if (url.startsWith('blob:')) return true; // Blob URLs can be valid
    if (url.length < 10) return false;
    return true;
  }

  /**
   * Extract image URL from an element or its ancestors
   */
  function extractImageUrl(element) {
    if (!element) return null;

    // Walk up the DOM tree looking for image sources
    let current = element;
    const maxDepth = 15;
    let depth = 0;
    let bestUrl = null;
    let bestSize = 0;

    while (current && depth < maxDepth) {
      // Check for direct img element
      if (current.tagName === 'IMG') {
        // Prefer srcset for highest resolution
        const srcsetUrl = getBestSrcFromSrcset(current.srcset);
        if (srcsetUrl && isValidImageUrl(srcsetUrl)) {
          bestUrl = srcsetUrl;
          break; // srcset highest-res is usually best
        }
        if (isValidImageUrl(current.src)) {
          const size = (current.naturalWidth || current.width || 0) * (current.naturalHeight || current.height || 0);
          if (size > bestSize || !bestUrl) {
            bestUrl = current.src;
            bestSize = size;
          }
        }
      }

      // Check for img children (many sites wrap images in divs)
      const imgs = current.querySelectorAll('img');
      for (const img of imgs) {
        // Skip tiny images (likely icons/avatars)
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        if (width > 0 && width < 50) continue;
        if (height > 0 && height < 50) continue;

        const srcsetUrl = getBestSrcFromSrcset(img.srcset);
        if (srcsetUrl && isValidImageUrl(srcsetUrl)) {
          bestUrl = srcsetUrl;
          break;
        }
        if (isValidImageUrl(img.src)) {
          const size = width * height;
          if (size > bestSize || !bestUrl) {
            bestUrl = img.src;
            bestSize = size;
          }
        }
      }

      if (bestUrl && current.querySelectorAll('img').length > 0) {
        // Found an image in children, stop here
        break;
      }

      // Check for background image
      const style = window.getComputedStyle(current);
      const bgImage = style.backgroundImage;
      if (bgImage && bgImage !== 'none') {
        const match = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
        if (match && isValidImageUrl(match[1])) {
          if (!bestUrl) {
            bestUrl = match[1];
          }
        }
      }

      // Check for video poster (some sites use video elements for images)
      if (current.tagName === 'VIDEO' && current.poster && isValidImageUrl(current.poster)) {
        if (!bestUrl) {
          bestUrl = current.poster;
        }
      }

      // Check video children
      const videos = current.querySelectorAll('video[poster]');
      for (const video of videos) {
        if (isValidImageUrl(video.poster) && !bestUrl) {
          bestUrl = video.poster;
        }
      }

      // Check for source elements with srcset (picture element pattern)
      const sources = current.querySelectorAll('source[srcset]');
      for (const source of sources) {
        const srcsetUrl = getBestSrcFromSrcset(source.srcset);
        if (srcsetUrl && isValidImageUrl(srcsetUrl)) {
          bestUrl = srcsetUrl;
          break;
        }
      }

      current = current.parentElement;
      depth++;
    }

    return bestUrl;
  }

  /**
   * Handle contextmenu (right-click) events
   */
  function handleContextMenu(event) {
    const imageUrl = extractImageUrl(event.target);

    lastExtractedData = {
      imageUrl: imageUrl,
      element: event.target,
      timestamp: Date.now()
    };

    if (imageUrl) {
      console.debug('[PixSim7] Extracted image URL:', imageUrl);
    }
  }

  /**
   * Listen for messages from the background script
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getExtractedImageUrl') {
      // Only return if the extraction is recent (within 5 seconds)
      const isRecent = (Date.now() - lastExtractedData.timestamp) < 5000;
      sendResponse({
        imageUrl: isRecent ? lastExtractedData.imageUrl : null,
        pageUrl: window.location.href
      });
      return true;
    }

    // Legacy support for Instagram-specific action name
    if (message.action === 'getInstagramImageUrl') {
      const isRecent = (Date.now() - lastExtractedData.timestamp) < 5000;
      sendResponse({
        imageUrl: isRecent ? lastExtractedData.imageUrl : null,
        pageUrl: window.location.href
      });
      return true;
    }
  });

  // Listen for right-click events (capture phase to get it before the menu appears)
  document.addEventListener('contextmenu', handleContextMenu, true);

  console.debug('[PixSim7] Image extractor loaded');
})();
