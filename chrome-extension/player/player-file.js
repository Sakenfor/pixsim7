/**
 * Player File - File handling, drag-drop, URL loading
 */
(function() {
  'use strict';

  // Prevent browser from navigating when dropping files/URLs anywhere on the page
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());

  const { elements, state, utils } = window.PXS7Player;
  const { showToast, getExtension, getVideoNameFromUrl, setLocalVideoContext, setRemoteVideoContext, getLocalSourceFolder } = utils;
  const { NATIVE_FORMATS, TRY_DIRECT_FORMATS, CONVERTIBLE_FORMATS, convertToMp4, hideConvertUI } = window.PXS7Player.ffmpeg;

  // ===== Load video =====
  function loadVideo(src, name = 'Video') {
    // Reset image mode
    state.isImageMode = false;
    state.loadedImage = null;
    elements.video.style.display = '';
    const imgDisplay = document.getElementById('imageDisplay');
    if (imgDisplay) imgDisplay.style.display = 'none';

    elements.video.src = src;
    elements.video.load();
    const isBlob = src && src.startsWith('blob:');
    const isExtension = src && src.startsWith('chrome-extension:');
    if (isBlob || isExtension) {
      setLocalVideoContext(name, state.currentVideoSourceFolder);
    } else {
      setRemoteVideoContext(src, name);
    }
    state.seekHistory = [];

    elements.video.onloadedmetadata = () => {
      state.videoLoaded = true;
      elements.dropZone.classList.add('hidden');
      elements.captureBtn.disabled = false;
      elements.saveAssetBtn.disabled = false;
      elements.regionModeBtn.disabled = false;
      window.PXS7Player.controls?.updateTimeDisplay();
      window.PXS7Player.controls?.updateVideoInfo(name);
      window.PXS7Player.region?.clearRegion();
      window.PXS7Player.history?.updateHistoryMarkers();
      const isBlob = src.startsWith('blob:');
      window.PXS7Player.history?.addToVideoHistory(name, isBlob ? null : src, isBlob);
      // Add to playlist
      window.PXS7Player.playlist?.addToPlaylist(name, src, isBlob, false, elements.video);
      state.currentFps = 30;
      elements.fpsInput.value = state.currentFps;
    };

    elements.video.onerror = async (e) => {
      console.error('Video load error:', e);

      // Try loading as image if video fails (might be an image URL without extension)
      if (window.PXS7Player.image?.tryLoadAsImage) {
        try {
          console.log('[Player] Video failed, trying as image...');
          await window.PXS7Player.image.tryLoadAsImage(src);
          // It loaded as image, so load it properly
          window.PXS7Player.image.loadImage(src, name);
          return;
        } catch {
          // Not an image either, show video error
        }
      }

      let errorMsg = 'Failed to load video';
      if (elements.video.error) {
        switch (elements.video.error.code) {
          case 1: errorMsg = 'Video loading aborted'; break;
          case 2: errorMsg = 'Network error loading video'; break;
          case 3: errorMsg = 'Video decoding failed - unsupported codec?'; break;
          case 4: errorMsg = 'Video format not supported'; break;
        }
      }
      showToast(errorMsg, false);
    };
  }

  function loadVideoWithFallback(src, name, originalFile = null) {
    // Reset image mode
    state.isImageMode = false;
    state.loadedImage = null;
    elements.video.style.display = '';
    const imgDisplay = document.getElementById('imageDisplay');
    if (imgDisplay) imgDisplay.style.display = 'none';

    const sourceFolder = getLocalSourceFolder(originalFile?.webkitRelativePath || null);
    setLocalVideoContext(name, sourceFolder);

    elements.video.src = src;
    elements.video.load();
    state.seekHistory = [];

    const handleError = async (e) => {
      console.error('Video load error:', e);
      elements.video.removeEventListener('error', handleError);

      if (originalFile && !NATIVE_FORMATS.includes(getExtension(name))) {
        try {
          showToast('Format not supported, converting...', true);
          const result = await convertToMp4(originalFile);
          loadVideo(result.url, result.name);
        } catch (convError) {
          if (convError.message !== 'Conversion cancelled') {
            showToast('Video format not supported and conversion failed', false);
          }
        }
      } else {
        let errorMsg = 'Failed to load video';
        if (elements.video.error) {
          switch (elements.video.error.code) {
            case 1: errorMsg = 'Video loading aborted'; break;
            case 2: errorMsg = 'Network error loading video'; break;
            case 3: errorMsg = 'Video decoding failed - unsupported codec?'; break;
            case 4: errorMsg = 'Video format not supported'; break;
          }
        }
        showToast(errorMsg, false);
      }
    };

    elements.video.addEventListener('error', handleError, { once: true });

    elements.video.onloadedmetadata = () => {
      elements.video.removeEventListener('error', handleError);
      state.videoLoaded = true;
      elements.dropZone.classList.add('hidden');
      hideConvertUI();
      elements.captureBtn.disabled = false;
      elements.saveAssetBtn.disabled = false;
      elements.regionModeBtn.disabled = false;
      window.PXS7Player.controls?.updateTimeDisplay();
      window.PXS7Player.controls?.updateVideoInfo(name);
      window.PXS7Player.region?.clearRegion();
      window.PXS7Player.history?.updateHistoryMarkers();
      window.PXS7Player.history?.addToVideoHistory(name, null, true);
      // Add to playlist (local file)
      window.PXS7Player.playlist?.addToPlaylist(name, null, true, false, elements.video);
      state.currentFps = 30;
      elements.fpsInput.value = state.currentFps;
    };
  }

  async function handleVideoFile(file) {
    const ext = getExtension(file.name);
    state.currentVideoSourceFolder = getLocalSourceFolder(file.webkitRelativePath || null);

    if (CONVERTIBLE_FORMATS.includes(ext)) {
      try {
        showToast('Converting ' + ext.toUpperCase() + ' to MP4...', true);
        const result = await convertToMp4(file);
        setLocalVideoContext(file.name, state.currentVideoSourceFolder);
        loadVideo(result.url, file.name);
      } catch (e) {
        if (e.message !== 'Conversion cancelled') {
          showToast(e.message, false);
        }
      }
    } else {
      const url = URL.createObjectURL(file);
      loadVideoWithFallback(url, file.name, file);
    }
  }

  function loadFromUrl() {
    const url = elements.urlInput.value.trim();
    if (!url) return;

    if (url.includes('/api/') && url.includes('/assets/')) {
      loadAssetUrl(url);
    } else if (window.PXS7Player.image?.isLikelyImageUrl(url)) {
      window.PXS7Player.image.loadImage(url, getVideoNameFromUrl(url));
    } else {
      loadVideo(url, getVideoNameFromUrl(url));
    }
  }

  async function loadAssetUrl(url) {
    try {
      showToast('Loading asset...', true);
      loadVideo(url, getVideoNameFromUrl(url));
    } catch (e) {
      showToast('Failed to load asset: ' + e.message, false);
    }
  }

  // ===== Event handlers =====
  elements.openFileBtn.addEventListener('click', () => elements.fileInput.click());
  elements.dropZone.addEventListener('click', () => elements.fileInput.click());

  elements.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleVideoFile(file);
  });

  ['dragenter', 'dragover'].forEach(evt => {
    elements.dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      elements.dropZone.classList.add('dragover');
    });
    elements.videoContainer.addEventListener(evt, (e) => e.preventDefault());
  });

  ['dragleave', 'drop'].forEach(evt => {
    elements.dropZone.addEventListener(evt, () => {
      elements.dropZone.classList.remove('dragover');
    });
  });

  // Handle drop - check for files first, then URLs
  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    // Check for file drop
    const file = e.dataTransfer.files[0];
    if (file) {
      const ext = getExtension(file.name || '');
      if (file.type.startsWith('video/') || CONVERTIBLE_FORMATS.includes(ext) || NATIVE_FORMATS.includes(ext) || TRY_DIRECT_FORMATS.includes(ext)) {
        handleVideoFile(file);
        return;
      }
    }

    // Check for URL drop
    const url = e.dataTransfer.getData('text/uri-list') ||
                e.dataTransfer.getData('text/plain') ||
                e.dataTransfer.getData('URL');
    if (url && url.trim()) {
      const trimmedUrl = url.trim().split('\n')[0]; // Take first URL if multiple
      if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
        elements.urlInput.value = trimmedUrl;
        loadFromUrl();
      }
    }
  }

  elements.dropZone.addEventListener('drop', handleDrop);
  elements.videoContainer.addEventListener('drop', handleDrop);

  elements.loadUrlBtn.addEventListener('click', loadFromUrl);
  elements.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadFromUrl();
  });

  // Export
  window.PXS7Player.loadVideo = loadVideo;
  window.PXS7Player.file = {
    loadVideo,
    loadVideoWithFallback,
    handleVideoFile,
    loadFromUrl,
  };
})();
