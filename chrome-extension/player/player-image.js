/**
 * Player Image - Image loading support
 */
(function() {
  'use strict';

  const { elements, state, utils } = window.PXS7Player;
  const { showToast, setRemoteVideoContext, setLocalVideoContext } = utils;

  function isLikelyImageUrl(url) {
    if (!url) return false;
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.avif', '.ico', '.tiff', '.tif'];
    const lowerUrl = url.toLowerCase().split('?')[0].split('#')[0];
    // Check extension
    if (imageExts.some(ext => lowerUrl.endsWith(ext))) return true;
    // Check common image URL patterns
    if (lowerUrl.includes('/image/') || lowerUrl.includes('/img/') || lowerUrl.includes('/photo/')) return true;
    // Check for image CDN patterns
    if (/\/(i|images|photos|media|static)\//i.test(url)) return true;
    return false;
  }

  // Try to load URL as image - returns promise that resolves if it's a valid image
  function tryLoadAsImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Not an image'));
      img.src = url;
    });
  }

  function loadImage(src, name = 'Image', sourceFolder = null) {
    showToast('Loading image...', true);

    // Reset image mode state
    state.isImageMode = false;
    state.loadedImage = null;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      // Store the image for capture/region
      state.loadedImage = img;
      state.isImageMode = true;

      // Hide video, show image display
      elements.video.style.display = 'none';

      let imgDisplay = document.getElementById('imageDisplay');
      if (!imgDisplay) {
        imgDisplay = document.createElement('img');
        imgDisplay.id = 'imageDisplay';
        imgDisplay.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain;';
        elements.videoContainer.insertBefore(imgDisplay, elements.video);
      }
      imgDisplay.src = src;
      imgDisplay.style.display = 'block';

      // Set context - use local context if folder provided, otherwise remote
      if (sourceFolder) {
        setLocalVideoContext(name, sourceFolder);
      } else {
        setRemoteVideoContext(src, name);
      }

      // Update UI state
      state.videoLoaded = true;
      elements.dropZone.classList.add('hidden');
      elements.captureBtn.disabled = false;
      elements.saveAssetBtn.disabled = false;
      elements.regionModeBtn.disabled = false;
      elements.videoInfo.innerHTML = `<strong>${name}</strong> | ${img.width}×${img.height} | Image`;

      // Clear any existing region
      window.PXS7Player.region?.clearRegion();

      // Add to history
      window.PXS7Player.history?.addToVideoHistory(name, src, false);

      // Add to playlist
      window.PXS7Player.playlist?.addToPlaylist(name, src, false, true, img);

      // Set FPS to 1 for images (not really applicable)
      state.currentFps = 1;
      elements.fpsInput.value = 1;

      showToast('Image loaded - use Capture to upload', true);
    };

    img.onerror = () => {
      showToast('Failed to load image - may be cross-origin protected', false);
    };

    img.src = src;
  }

  // Helper to get the image display element for positioning calculations
  function getImageDisplayElement() {
    return document.getElementById('imageDisplay');
  }

  // Export
  window.PXS7Player.image = {
    isLikelyImageUrl,
    loadImage,
    tryLoadAsImage,
    getImageDisplayElement,
  };
})();
