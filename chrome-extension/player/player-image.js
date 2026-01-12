/**
 * Player Image - Image loading support
 */
(function() {
  'use strict';

  const { elements, state, utils } = window.PXS7Player;
  const { showToast, setRemoteVideoContext } = utils;

  function isLikelyImageUrl(url) {
    if (!url) return false;
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    const lowerUrl = url.toLowerCase().split('?')[0];
    return imageExts.some(ext => lowerUrl.endsWith(ext));
  }

  function loadImage(src, name = 'Image') {
    showToast('Loading image...', true);

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      try {
        const stream = canvas.captureStream(0);
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const chunks = [];

        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const videoUrl = URL.createObjectURL(blob);

          elements.video.src = videoUrl;
          elements.video.load();
          setRemoteVideoContext(src, name);

          elements.video.onloadedmetadata = () => {
            state.videoLoaded = true;
            elements.dropZone.classList.add('hidden');
            elements.captureBtn.disabled = false;
            elements.saveAssetBtn.disabled = false;
            elements.regionBtn.disabled = false;
            elements.videoInfo.innerHTML = `<strong>${name}</strong> | ${img.width}×${img.height} | Image`;
            window.PXS7Player.region?.clearRegion();
            window.PXS7Player.history?.addToVideoHistory(name, src, false);
            state.currentFps = 1;
            elements.fpsInput.value = 1;
            showToast('Image loaded - use Capture to upload', true);
          };
        };

        mediaRecorder.start();
        setTimeout(() => mediaRecorder.stop(), 100);
      } catch (e) {
        console.warn('MediaRecorder not available, using fallback:', e);
        loadImageFallback(img, src, name);
      }
    };

    img.onerror = () => {
      showToast('Failed to load image - may be cross-origin protected', false);
    };

    img.src = src;
  }

  function loadImageFallback(img, src, name) {
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

    window._loadedImage = img;

    state.videoLoaded = true;
    elements.dropZone.classList.add('hidden');
    elements.captureBtn.disabled = false;
    elements.saveAssetBtn.disabled = false;
    elements.regionBtn.disabled = false;
    elements.videoInfo.innerHTML = `<strong>${name}</strong> | ${img.width}×${img.height} | Image`;
    window.PXS7Player.region?.clearRegion();
    showToast('Image loaded - use Capture to upload', true);
  }

  // Export
  window.PXS7Player.image = {
    isLikelyImageUrl,
    loadImage,
  };
})();
