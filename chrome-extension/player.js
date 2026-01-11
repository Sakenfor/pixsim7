/**
 * PixSim7 Video Player
 * - Play local video files or URLs
 * - Frame-by-frame navigation
 * - Capture frames and upload to PixSim7
 */

(function() {
  'use strict';

  // Elements
  const video = document.getElementById('video');
  const dropZone = document.getElementById('dropZone');
  const videoContainer = document.getElementById('videoContainer');
  const fileInput = document.getElementById('fileInput');
  const urlInput = document.getElementById('urlInput');
  const loadUrlBtn = document.getElementById('loadUrlBtn');
  const openFileBtn = document.getElementById('openFileBtn');
  const captureBtn = document.getElementById('captureBtn');
  const saveAssetBtn = document.getElementById('saveAssetBtn');
  const regionBtn = document.getElementById('regionBtn');
  const regionOverlay = document.getElementById('regionOverlay');
  const regionBox = document.getElementById('regionBox');
  const regionClear = document.getElementById('regionClear');
  const regionInfo = document.getElementById('regionInfo');
  const blurControls = document.getElementById('blurControls');
  const blurSlider = document.getElementById('blurSlider');
  const blurValue = document.getElementById('blurValue');
  const blurPreview = document.getElementById('blurPreview');
  const playBtn = document.getElementById('playBtn');
  const prevFrameBtn = document.getElementById('prevFrameBtn');
  const nextFrameBtn = document.getElementById('nextFrameBtn');
  const seekBar = document.getElementById('seekBar');
  const seekFill = document.getElementById('seekFill');
  const timeDisplay = document.getElementById('timeDisplay');
  const speedSelect = document.getElementById('speedSelect');
  const frameInput = document.getElementById('frameInput');
  const fpsInput = document.getElementById('fpsInput');
  const videoInfo = document.getElementById('videoInfo');
  const toast = document.getElementById('toast');

  // Settings panel elements
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const skipNormalSlider = document.getElementById('skipNormal');
  const skipCtrlSlider = document.getElementById('skipCtrl');
  const skipShiftSlider = document.getElementById('skipShift');
  const skipNormalVal = document.getElementById('skipNormalVal');
  const skipCtrlVal = document.getElementById('skipCtrlVal');
  const skipShiftVal = document.getElementById('skipShiftVal');
  const historyEnabled = document.getElementById('historyEnabled');
  const clearHistoryBtn = document.getElementById('clearHistory');

  // Video history elements
  const historyBtn = document.getElementById('historyBtn');
  const historyDropdown = document.getElementById('historyDropdown');

  // Conversion UI elements
  const convertOverlay = document.getElementById('convertOverlay');
  const convertText = document.getElementById('convertText');
  const convertProgressBar = document.getElementById('convertProgressBar');
  const convertDetail = document.getElementById('convertDetail');
  const convertCancel = document.getElementById('convertCancel');

  let currentFps = 30;
  let videoLoaded = false;
  let currentVideoName = 'Video';
  let currentVideoUrl = null;
  let currentVideoSourceSite = null;
  let currentVideoSourceFolder = null;

  // Skip settings (in 0.1s for normal/ctrl, frames for shift)
  let skipNormalAmount = 1.0;  // seconds
  let skipCtrlAmount = 3.0;    // seconds
  let skipShiftFrames = 1;     // frames

  // Seek history (positions within current video)
  let seekHistory = [];
  const MAX_HISTORY = 20;

  // Video files history
  const VIDEO_HISTORY_KEY = 'pxs7_video_history';
  const MAX_VIDEO_HISTORY = 15;
  let videoHistory = [];

  // Load video history from localStorage
  function loadVideoHistory() {
    try {
      const saved = localStorage.getItem(VIDEO_HISTORY_KEY);
      if (saved) {
        videoHistory = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load video history:', e);
      videoHistory = [];
    }
  }

  // Save video history to localStorage
  function saveVideoHistory() {
    try {
      localStorage.setItem(VIDEO_HISTORY_KEY, JSON.stringify(videoHistory));
    } catch (e) {
      console.warn('Failed to save video history:', e);
    }
  }

  // Add video to history
  function addToVideoHistory(name, url, isLocal = false) {
    // Remove existing entry with same name/url
    videoHistory = videoHistory.filter(v => v.url !== url && v.name !== name);

    // Add to front
    videoHistory.unshift({
      name,
      url: isLocal ? null : url,
      isLocal,
      timestamp: Date.now()
    });

    // Trim to max
    if (videoHistory.length > MAX_VIDEO_HISTORY) {
      videoHistory = videoHistory.slice(0, MAX_VIDEO_HISTORY);
    }

    saveVideoHistory();
    renderVideoHistory();
  }

  // Render video history dropdown
  function renderVideoHistory() {
    if (videoHistory.length === 0) {
      historyDropdown.innerHTML = '<div class="history-empty">No recent videos</div>';
      return;
    }

    historyDropdown.innerHTML = videoHistory.map((v, i) => `
      <div class="history-item" data-index="${i}">
        <span class="history-item-icon">${v.isLocal ? '📁' : '🔗'}</span>
        <span class="history-item-name" title="${v.name}">${v.name}</span>
        <span class="history-item-type">${v.isLocal ? 'local' : 'url'}</span>
      </div>
    `).join('');

    // Add click handlers
    historyDropdown.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        const entry = videoHistory[index];
        if (entry.url) {
          urlInput.value = entry.url;
          loadVideo(entry.url, entry.name);
          historyDropdown.classList.add('hidden');
        } else {
          showToast('Local file - use Open to reload', false);
        }
      });
    });
  }

  // Toggle history dropdown
  historyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    historyDropdown.classList.toggle('hidden');
    settingsPanel.classList.add('hidden'); // Close settings if open
  });

  // Close history dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!historyDropdown.contains(e.target) && e.target !== historyBtn) {
      historyDropdown.classList.add('hidden');
    }
  });

  // Load history on startup
  loadVideoHistory();
  renderVideoHistory();

  // FFmpeg sandbox state
  let ffmpegSandbox = null;
  let ffmpegReady = false;
  let ffmpegLoading = false;
  let conversionCancelled = false;
  let pendingCallbacks = {};
  let callbackId = 0;

  // Cancel button handler
  convertCancel.addEventListener('click', () => {
    conversionCancelled = true;
    hideConvertUI();
    dropZone.classList.remove('hidden');
    showToast('Conversion cancelled', false);
  });

  /**
   * Create and initialize FFmpeg sandbox iframe
   */
  function initFFmpegSandbox() {
    return new Promise((resolve, reject) => {
      if (ffmpegReady && ffmpegSandbox) {
        resolve();
        return;
      }

      if (ffmpegLoading) {
        // Wait for existing load
        const checkReady = setInterval(() => {
          if (ffmpegReady) {
            clearInterval(checkReady);
            resolve();
          }
        }, 100);
        return;
      }

      ffmpegLoading = true;
      console.log('[FFmpeg] Creating sandbox iframe...');

      // Create hidden iframe for sandbox
      const iframe = document.createElement('iframe');
      iframe.src = chrome.runtime.getURL('ffmpeg-sandbox.html');
      iframe.style.cssText = 'position: absolute; width: 0; height: 0; border: 0; visibility: hidden;';
      iframe.id = 'ffmpeg-sandbox';
      document.body.appendChild(iframe);
      ffmpegSandbox = iframe;

      let initTimeout = null;

      // Listen for messages from sandbox
      const messageHandler = (event) => {
        if (event.source !== iframe.contentWindow) return;

        const { type, id, success, error, data, progress } = event.data;

        if (type === 'ffmpeg-sandbox-ready') {
          console.log('[FFmpeg] Sandbox ready, ffmpegAvailable:', event.data.ffmpegAvailable);

          if (event.data.ffmpegAvailable === false) {
            ffmpegLoading = false;
            const errorMsg = event.data.error || 'FFmpeg library could not be loaded from CDN';
            console.error('[FFmpeg] Sandbox reported FFmpeg not available:', errorMsg);
            reject(new Error(errorMsg + '. Try converting the video externally using HandBrake or similar.'));
            return;
          }

          console.log('[FFmpeg] Initializing FFmpeg in sandbox...');
          // Now initialize FFmpeg in the sandbox
          const initId = ++callbackId;
          pendingCallbacks[initId] = { resolve, reject };
          iframe.contentWindow.postMessage({ type: 'ffmpeg-init', id: initId }, '*');

          initTimeout = setTimeout(() => {
            if (!ffmpegReady) {
              ffmpegLoading = false;
              reject(new Error('FFmpeg initialization timed out. The WASM file (~25MB) may still be downloading.'));
            }
          }, 120000); // 120s timeout for WASM download (increased)
        }

        if (type === 'ffmpeg-init-result') {
          clearTimeout(initTimeout);
          ffmpegLoading = false;
          if (success) {
            console.log('[FFmpeg] FFmpeg initialized successfully');
            ffmpegReady = true;
            if (pendingCallbacks[id]) {
              pendingCallbacks[id].resolve();
              delete pendingCallbacks[id];
            }
          } else {
            console.error('[FFmpeg] FFmpeg init failed:', error);
            if (pendingCallbacks[id]) {
              pendingCallbacks[id].reject(new Error(error));
              delete pendingCallbacks[id];
            }
          }
        }

        if (type === 'ffmpeg-convert-result') {
          if (pendingCallbacks[id]) {
            if (success) {
              pendingCallbacks[id].resolve(new Uint8Array(data));
            } else {
              pendingCallbacks[id].reject(new Error(error));
            }
            delete pendingCallbacks[id];
          }
        }

        if (type === 'ffmpeg-progress') {
          const pct = Math.round((progress || 0) * 100);
          showConvertUI('Converting...', 30 + pct * 0.7, `${pct}% complete`);
        }
      };

      window.addEventListener('message', messageHandler);

      // Cleanup on error
      iframe.onerror = () => {
        ffmpegLoading = false;
        reject(new Error('Failed to create FFmpeg sandbox'));
      };
    });
  }

  /**
   * Convert video using sandbox
   */
  async function convertInSandbox(fileData, inputExt) {
    if (!ffmpegReady || !ffmpegSandbox) {
      throw new Error('FFmpeg not initialized');
    }

    return new Promise((resolve, reject) => {
      const id = ++callbackId;
      pendingCallbacks[id] = { resolve, reject };

      ffmpegSandbox.contentWindow.postMessage({
        type: 'ffmpeg-convert',
        id,
        fileData,
        inputExt
      }, '*');

      // Timeout for conversion (5 minutes)
      setTimeout(() => {
        if (pendingCallbacks[id]) {
          pendingCallbacks[id].reject(new Error('Conversion timed out'));
          delete pendingCallbacks[id];
        }
      }, 300000);
    });
  }

  // Formats that browsers can play natively
  const NATIVE_FORMATS = ['mp4', 'webm', 'ogg', 'mov'];

  // Formats to try direct playback first (may work depending on codecs inside)
  const TRY_DIRECT_FORMATS = ['mkv', 'm4v', '3gp'];

  // Formats that always need conversion via FFmpeg
  const CONVERTIBLE_FORMATS = ['avi', 'wmv', 'flv', 'mpeg', 'mpg', 'ts', 'mts', 'm2ts'];

  /**
   * Check if a file extension requires conversion
   */
  function needsConversion(filename) {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (NATIVE_FORMATS.includes(ext)) return false;
    if (CONVERTIBLE_FORMATS.includes(ext)) return true;
    // Unknown format - try native first, convert on error
    return false;
  }

  /**
   * Get file extension from filename
   */
  function getExtension(filename) {
    return filename.split('.').pop()?.toLowerCase() || '';
  }

  function getVideoNameFromUrl(url) {
    if (!url) return 'Video';
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length > 0) {
        return decodeURIComponent(parts[parts.length - 1]);
      }
      return parsed.hostname || 'Video';
    } catch (e) {
      const fallback = url.split('/').filter(Boolean).pop();
      return fallback || 'Video';
    }
  }

  function getSourceSite(url) {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      return parsed.hostname || null;
    } catch (e) {
      return null;
    }
  }

  function getLocalSourceSite() {
    return 'local';
  }

  function getLocalSourceFolder(relativePath) {
    if (!relativePath) {
      return null;
    }
    const normalized = relativePath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length > 1) {
      return parts[0];
    }
    return null;
  }

  function setLocalVideoContext(name, sourceFolder) {
    currentVideoName = name || 'Video';
    currentVideoUrl = null;
    currentVideoSourceFolder = sourceFolder || null;
    currentVideoSourceSite = getLocalSourceSite();
  }

  function setRemoteVideoContext(url, name) {
    currentVideoName = name || 'Video';
    currentVideoUrl = url || null;
    currentVideoSourceSite = getSourceSite(url);
    currentVideoSourceFolder = null;
  }

  /**
   * Show conversion overlay
   */
  function showConvertUI(message, progress = 0, detail = '') {
    convertOverlay.classList.remove('hidden');
    dropZone.classList.add('hidden');
    convertText.textContent = message;
    convertProgressBar.style.width = `${progress}%`;
    convertDetail.textContent = detail;
  }

  /**
   * Hide conversion overlay
   */
  function hideConvertUI() {
    convertOverlay.classList.add('hidden');
  }

  /**
   * Load FFmpeg via sandbox (lazy load on first use)
   */
  async function loadFFmpeg() {
    if (ffmpegReady) return;

    showConvertUI('Loading FFmpeg...', 5, 'Setting up sandbox...');

    try {
      showConvertUI('Loading FFmpeg...', 10, 'Downloading WASM (~25MB)...');
      await initFFmpegSandbox();
      showConvertUI('FFmpeg ready!', 30);
    } catch (e) {
      hideConvertUI();
      console.error('Failed to load FFmpeg:', e);
      throw new Error('Failed to load FFmpeg: ' + e.message);
    }
  }

  /**
   * Convert a video file to MP4 using FFmpeg sandbox
   */
  async function convertToMp4(file) {
    conversionCancelled = false;

    showConvertUI('Loading FFmpeg...', 5);

    try {
      await loadFFmpeg();

      if (conversionCancelled) {
        throw new Error('Conversion cancelled');
      }

      showConvertUI('Reading file...', 25);

      // Read file data
      const fileData = await file.arrayBuffer();

      if (conversionCancelled) {
        throw new Error('Conversion cancelled');
      }

      showConvertUI('Converting to MP4...', 30, 'This may take a while for large files');

      // Convert in sandbox
      const resultData = await convertInSandbox(fileData, getExtension(file.name));

      if (conversionCancelled) {
        throw new Error('Conversion cancelled');
      }

      showConvertUI('Finalizing...', 95);

      // Create blob URL for the converted video
      const blob = new Blob([resultData], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      hideConvertUI();
      return { url, name: file.name.replace(/\.[^.]+$/, '.mp4') };
    } catch (e) {
      hideConvertUI();

      if (e.message === 'Conversion cancelled') {
        throw e;
      }
      console.error('Conversion failed:', e);
      throw new Error('Video conversion failed: ' + e.message);
    }
  }

  /**
   * Handle file - convert if needed, then load
   */
  async function handleVideoFile(file) {
    const ext = getExtension(file.name);
    currentVideoSourceFolder = getLocalSourceFolder(file.webkitRelativePath || null);

    // Check if this format needs conversion
    if (CONVERTIBLE_FORMATS.includes(ext)) {
      try {
        showToast('Converting ' + ext.toUpperCase() + ' to MP4...', true);
        const result = await convertToMp4(file);
        setLocalVideoContext(file.name, currentVideoSourceFolder);
        loadVideo(result.url, file.name);
      } catch (e) {
        // Don't show error toast for user cancellation
        if (e.message !== 'Conversion cancelled') {
          showToast(e.message, false);
        }
      }
    } else {
      // Try to load directly (MP4, WebM, etc.)
      const url = URL.createObjectURL(file);
      loadVideoWithFallback(url, file.name, file);
    }
  }

  /**
   * Load video with fallback to conversion on error
   */
  function loadVideoWithFallback(src, name, originalFile = null) {
    const sourceFolder = getLocalSourceFolder(originalFile?.webkitRelativePath || null);
    setLocalVideoContext(name, sourceFolder);

    video.src = src;
    video.load();
    seekHistory = []; // Clear history for new video

    const handleError = async (e) => {
      console.error('Video load error:', e);
      video.removeEventListener('error', handleError);

      // If we have the original file and it failed, try converting
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
        if (video.error) {
          switch (video.error.code) {
            case 1: errorMsg = 'Video loading aborted'; break;
            case 2: errorMsg = 'Network error loading video'; break;
            case 3: errorMsg = 'Video decoding failed - unsupported codec?'; break;
            case 4: errorMsg = 'Video format not supported'; break;
          }
        }
        showToast(errorMsg, false);
      }
    };

    video.addEventListener('error', handleError, { once: true });

    video.onloadedmetadata = () => {
      video.removeEventListener('error', handleError);
      videoLoaded = true;
      dropZone.classList.add('hidden');
      hideConvertUI();
      captureBtn.disabled = false;
      saveAssetBtn.disabled = false;
      regionBtn.disabled = false;
      updateTimeDisplay();
      updateVideoInfo(name);
      clearRegion();
      updateHistoryMarkers();
      // Add to video history (local file, name only)
      addToVideoHistory(name, null, true);
      currentFps = 30;
      fpsInput.value = currentFps;
    };
  }

  // Region selection state
  let regionMode = false;
  let isDrawing = false;
  let isDraggingRegion = false;
  let isResizingRegion = false;
  let resizeHandle = null;
  let regionStart = null;
  let dragStart = null;
  let selectedRegion = null; // { x, y, width, height } in video coordinates

  // Blur state
  let blurAmount = 0;
  let blurPreviewCtx = null;

  // Reset all interaction states (call when things might get stuck)
  function resetInteractionState() {
    isDrawing = false;
    isDraggingRegion = false;
    isResizingRegion = false;
    resizeHandle = null;
    dragStart = null;
    regionStart = null;
  }

  // ===== Toast =====
  let toastTimeout = null;
  function showToast(message, isSuccess = true) {
    toast.textContent = message;
    toast.className = 'toast visible ' + (isSuccess ? 'success' : 'error');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.className = 'toast';
    }, 3000);
  }

  // ===== Time formatting =====
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // ===== Load video =====
  function loadVideo(src, name = 'Video') {
    video.src = src;
    video.load();
    const isBlob = src && src.startsWith('blob:');
    const isExtension = src && src.startsWith('chrome-extension:');
    if (isBlob || isExtension) {
      setLocalVideoContext(name, currentVideoSourceFolder);
    } else {
      setRemoteVideoContext(src, name);
    }
    seekHistory = []; // Clear history for new video

    video.onloadedmetadata = () => {
      videoLoaded = true;
      dropZone.classList.add('hidden');
      captureBtn.disabled = false;
      saveAssetBtn.disabled = false;
      regionBtn.disabled = false;
      updateTimeDisplay();
      updateVideoInfo(name);
      // Clear any previous region
      clearRegion();
      // Clear history markers
      updateHistoryMarkers();
      // Add to video history (URL-based if not blob, can be reopened)
      const isBlob = src.startsWith('blob:');
      addToVideoHistory(name, isBlob ? null : src, isBlob);

      // Try to detect FPS from video (not always available)
      // Default to 30fps
      currentFps = 30;
      fpsInput.value = currentFps;
    };

    video.onerror = (e) => {
      console.error('Video load error:', e);
      let errorMsg = 'Failed to load video';
      if (video.error) {
        switch (video.error.code) {
          case 1: errorMsg = 'Video loading aborted'; break;
          case 2: errorMsg = 'Network error loading video'; break;
          case 3: errorMsg = 'Video decoding failed - unsupported codec?'; break;
          case 4: errorMsg = 'Video format not supported'; break;
        }
      }
      showToast(errorMsg, false);
    };
  }

  function updateVideoInfo(name = '') {
    if (!video.videoWidth) return;
    const info = [
      name ? `<strong>${name}</strong>` : '',
      `${video.videoWidth}×${video.videoHeight}`,
      `Duration: ${formatTime(video.duration)}`,
      `FPS: ${currentFps} (estimated)`,
    ].filter(Boolean).join(' &nbsp;|&nbsp; ');
    videoInfo.innerHTML = info;
  }

  function updateTimeDisplay() {
    const current = formatTime(video.currentTime);
    const total = formatTime(video.duration || 0);
    timeDisplay.textContent = `${current} / ${total}`;

    const pct = video.duration ? (video.currentTime / video.duration) * 100 : 0;
    seekFill.style.width = `${pct}%`;

    // Update frame number
    frameInput.value = Math.round(video.currentTime * currentFps);
  }

  // ===== Video controls =====
  video.addEventListener('timeupdate', updateTimeDisplay);
  video.addEventListener('play', () => { playBtn.textContent = '⏸'; });
  video.addEventListener('pause', () => { playBtn.textContent = '▶'; });

  playBtn.addEventListener('click', () => {
    if (video.paused) video.play();
    else video.pause();
  });

  // Skip amount based on settings
  function getSkipAmount(e) {
    if (e.shiftKey) return skipShiftFrames / currentFps;
    if (e.ctrlKey || e.metaKey) return skipCtrlAmount;
    return skipNormalAmount;
  }

  // ===== Settings Panel =====
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPanel.classList.toggle('hidden');
  });

  // Close settings when clicking outside
  document.addEventListener('click', (e) => {
    if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
      settingsPanel.classList.add('hidden');
    }
  });

  // Skip sliders
  skipNormalSlider.addEventListener('input', () => {
    skipNormalAmount = parseInt(skipNormalSlider.value) / 10;
    skipNormalVal.textContent = skipNormalAmount.toFixed(1) + 's';
  });

  skipCtrlSlider.addEventListener('input', () => {
    skipCtrlAmount = parseInt(skipCtrlSlider.value) / 10;
    skipCtrlVal.textContent = skipCtrlAmount.toFixed(1) + 's';
  });

  skipShiftSlider.addEventListener('input', () => {
    skipShiftFrames = parseInt(skipShiftSlider.value);
    skipShiftVal.textContent = skipShiftFrames + 'f';
  });

  // ===== Seek History =====
  function addToHistory(time) {
    if (!historyEnabled.checked || !videoLoaded) return;
    // Don't add if too close to last entry
    if (seekHistory.length > 0) {
      const last = seekHistory[seekHistory.length - 1];
      if (Math.abs(time - last) < 0.5) return;
    }
    seekHistory.push(time);
    if (seekHistory.length > MAX_HISTORY) {
      seekHistory.shift();
    }
    updateHistoryMarkers();
  }

  function updateHistoryMarkers() {
    // Remove old markers
    seekBar.querySelectorAll('.seek-marker').forEach(m => m.remove());

    if (!historyEnabled.checked || !video.duration) return;

    // Add markers
    seekHistory.forEach(time => {
      const pct = (time / video.duration) * 100;
      const marker = document.createElement('div');
      marker.className = 'seek-marker';
      marker.style.left = `${pct}%`;
      marker.title = formatTime(time);
      seekBar.appendChild(marker);
    });
  }

  clearHistoryBtn.addEventListener('click', () => {
    seekHistory = [];
    updateHistoryMarkers();
  });

  historyEnabled.addEventListener('change', () => {
    updateHistoryMarkers();
  });

  prevFrameBtn.addEventListener('click', (e) => {
    video.pause();
    video.currentTime = Math.max(0, video.currentTime - getSkipAmount(e));
  });

  nextFrameBtn.addEventListener('click', (e) => {
    video.pause();
    video.currentTime = Math.min(video.duration, video.currentTime + getSkipAmount(e));
  });

  seekBar.addEventListener('click', (e) => {
    if (!video.duration) return;
    const rect = seekBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    addToHistory(video.currentTime); // Save current position before seeking
    video.currentTime = pct * video.duration;
  });

  speedSelect.addEventListener('change', () => {
    video.playbackRate = parseFloat(speedSelect.value);
  });

  fpsInput.addEventListener('change', () => {
    currentFps = Math.max(1, Math.min(120, parseInt(fpsInput.value) || 30));
    fpsInput.value = currentFps;
  });

  frameInput.addEventListener('change', () => {
    const frame = parseInt(frameInput.value) || 0;
    addToHistory(video.currentTime); // Save current position before seeking
    video.currentTime = frame / currentFps;
  });

  // ===== Keyboard shortcuts =====
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        if (video.paused) video.play();
        else video.pause();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        video.pause();
        video.currentTime = Math.max(0, video.currentTime - getSkipAmount(e));
        break;
      case 'ArrowRight':
        e.preventDefault();
        video.pause();
        video.currentTime = Math.min(video.duration, video.currentTime + getSkipAmount(e));
        break;
      case 'KeyC':
        if (e.ctrlKey || e.metaKey) return; // Don't capture on Ctrl+C
        e.preventDefault();
        captureAndUpload();
        break;
      case 'KeyS':
        if (e.ctrlKey || e.metaKey) return; // Don't save on Ctrl+S
        e.preventDefault();
        saveToAssetsOnly();
        break;
      case 'KeyR':
        e.preventDefault();
        toggleRegionMode();
        break;
      case 'Escape':
        if (regionMode) {
          e.preventDefault();
          toggleRegionMode();
        }
        break;
    }
  });

  // ===== Region Selection =====
  function toggleRegionMode() {
    if (!videoLoaded) return;
    regionMode = !regionMode;
    regionOverlay.classList.toggle('hidden', !regionMode);
    regionBtn.style.background = regionMode ? 'var(--accent)' : '';
    regionBtn.style.color = regionMode ? 'white' : '';
    if (regionMode) {
      showToast('Draw region on video (Esc to cancel)', true);
    }
  }

  function clearRegion() {
    selectedRegion = null;
    regionBox.classList.add('hidden');
    regionInfo.textContent = '';
    videoContainer.classList.remove('has-region');
    updateCaptureButtonLabel();
    // Reset blur
    blurAmount = 0;
    blurSlider.value = 0;
    blurValue.textContent = '0px';
    blurControls.classList.add('hidden');
    hideBlurPreview();
  }

  function updateCaptureButtonLabel() {
    if (selectedRegion) {
      captureBtn.textContent = '📸 Capture Region';
    } else {
      captureBtn.textContent = '📸 Capture';
    }
  }

  // Convert screen coordinates to video coordinates
  function screenToVideoCoords(screenX, screenY) {
    const videoRect = video.getBoundingClientRect();
    const videoAspect = video.videoWidth / video.videoHeight;
    const containerAspect = videoRect.width / videoRect.height;

    let renderWidth, renderHeight, offsetX, offsetY;

    if (videoAspect > containerAspect) {
      // Video is wider - letterboxed top/bottom
      renderWidth = videoRect.width;
      renderHeight = videoRect.width / videoAspect;
      offsetX = 0;
      offsetY = (videoRect.height - renderHeight) / 2;
    } else {
      // Video is taller - letterboxed left/right
      renderHeight = videoRect.height;
      renderWidth = videoRect.height * videoAspect;
      offsetX = (videoRect.width - renderWidth) / 2;
      offsetY = 0;
    }

    const relX = screenX - videoRect.left - offsetX;
    const relY = screenY - videoRect.top - offsetY;

    const videoX = (relX / renderWidth) * video.videoWidth;
    const videoY = (relY / renderHeight) * video.videoHeight;

    return {
      x: Math.max(0, Math.min(video.videoWidth, videoX)),
      y: Math.max(0, Math.min(video.videoHeight, videoY))
    };
  }

  // Convert video coordinates to screen position for display
  function videoToScreenCoords(videoX, videoY, videoW, videoH) {
    const videoRect = video.getBoundingClientRect();
    const containerRect = videoContainer.getBoundingClientRect();
    const videoAspect = video.videoWidth / video.videoHeight;
    const containerAspect = videoRect.width / videoRect.height;

    let renderWidth, renderHeight, offsetX, offsetY;

    if (videoAspect > containerAspect) {
      renderWidth = videoRect.width;
      renderHeight = videoRect.width / videoAspect;
      offsetX = 0;
      offsetY = (videoRect.height - renderHeight) / 2;
    } else {
      renderHeight = videoRect.height;
      renderWidth = videoRect.height * videoAspect;
      offsetX = (videoRect.width - renderWidth) / 2;
      offsetY = 0;
    }

    const scaleX = renderWidth / video.videoWidth;
    const scaleY = renderHeight / video.videoHeight;

    return {
      left: (videoRect.left - containerRect.left) + offsetX + (videoX * scaleX),
      top: (videoRect.top - containerRect.top) + offsetY + (videoY * scaleY),
      width: videoW * scaleX,
      height: videoH * scaleY
    };
  }

  function updateRegionBox() {
    if (!selectedRegion) return;
    const screen = videoToScreenCoords(
      selectedRegion.x, selectedRegion.y,
      selectedRegion.width, selectedRegion.height
    );
    regionBox.style.left = `${screen.left}px`;
    regionBox.style.top = `${screen.top}px`;
    regionBox.style.width = `${screen.width}px`;
    regionBox.style.height = `${screen.height}px`;
    regionInfo.textContent = `${Math.round(selectedRegion.width)}×${Math.round(selectedRegion.height)}`;
  }

  // ===== Blur Preview =====
  function showBlurControls() {
    blurControls.classList.remove('hidden');
  }

  function hideBlurPreview() {
    blurPreview.classList.add('hidden');
  }

  function updateBlurPreview() {
    if (!selectedRegion || blurAmount === 0 || !videoLoaded) {
      hideBlurPreview();
      return;
    }

    // Get video display metrics
    const videoRect = video.getBoundingClientRect();
    const containerRect = videoContainer.getBoundingClientRect();
    const videoAspect = video.videoWidth / video.videoHeight;
    const containerAspect = videoRect.width / videoRect.height;

    let renderWidth, renderHeight, offsetX, offsetY;
    if (videoAspect > containerAspect) {
      renderWidth = videoRect.width;
      renderHeight = videoRect.width / videoAspect;
      offsetX = 0;
      offsetY = (videoRect.height - renderHeight) / 2;
    } else {
      renderHeight = videoRect.height;
      renderWidth = videoRect.height * videoAspect;
      offsetX = (videoRect.width - renderWidth) / 2;
      offsetY = 0;
    }

    // Position and size the preview canvas to match video display area
    const left = (videoRect.left - containerRect.left) + offsetX;
    const top = (videoRect.top - containerRect.top) + offsetY;

    blurPreview.style.left = `${left}px`;
    blurPreview.style.top = `${top}px`;
    blurPreview.width = renderWidth;
    blurPreview.height = renderHeight;
    blurPreview.classList.remove('hidden');

    // Get or create context
    if (!blurPreviewCtx) {
      blurPreviewCtx = blurPreview.getContext('2d');
    }
    const ctx = blurPreviewCtx;

    // Calculate scale from video coords to display coords
    const scaleX = renderWidth / video.videoWidth;
    const scaleY = renderHeight / video.videoHeight;

    // Region in display coordinates
    const dispX = selectedRegion.x * scaleX;
    const dispY = selectedRegion.y * scaleY;
    const dispW = selectedRegion.width * scaleX;
    const dispH = selectedRegion.height * scaleY;

    // Clear canvas
    ctx.clearRect(0, 0, renderWidth, renderHeight);

    // Draw only the blurred region
    ctx.save();

    // Clip to the region
    ctx.beginPath();
    ctx.rect(dispX, dispY, dispW, dispH);
    ctx.clip();

    // Apply blur filter and draw video
    ctx.filter = `blur(${blurAmount}px)`;
    ctx.drawImage(video, 0, 0, renderWidth, renderHeight);

    ctx.restore();
  }

  // Blur slider handler
  blurSlider.addEventListener('input', () => {
    blurAmount = parseInt(blurSlider.value) || 0;
    blurValue.textContent = `${blurAmount}px`;
    updateBlurPreview();
  });

  // Update blur preview when video time changes (if blur is active)
  video.addEventListener('seeked', () => {
    if (blurAmount > 0 && selectedRegion) {
      updateBlurPreview();
    }
  });

  // Region drawing handlers - draw new region on overlay
  regionOverlay.addEventListener('mousedown', (e) => {
    if (!regionMode || !videoLoaded) return;
    e.preventDefault();
    isDrawing = true;
    regionStart = screenToVideoCoords(e.clientX, e.clientY);
    regionBox.classList.remove('hidden');
  });

  document.addEventListener('mousemove', (e) => {
    if (!videoLoaded) return;

    // Drawing new region
    if (isDrawing && regionStart) {
      const current = screenToVideoCoords(e.clientX, e.clientY);
      selectedRegion = {
        x: Math.min(regionStart.x, current.x),
        y: Math.min(regionStart.y, current.y),
        width: Math.abs(current.x - regionStart.x),
        height: Math.abs(current.y - regionStart.y)
      };
      updateRegionBox();
      return;
    }

    // Dragging existing region
    if (isDraggingRegion && dragStart && selectedRegion) {
      const current = screenToVideoCoords(e.clientX, e.clientY);
      const dx = current.x - dragStart.x;
      const dy = current.y - dragStart.y;

      selectedRegion.x = Math.max(0, Math.min(video.videoWidth - selectedRegion.width, dragStart.regionX + dx));
      selectedRegion.y = Math.max(0, Math.min(video.videoHeight - selectedRegion.height, dragStart.regionY + dy));
      updateRegionBox();
      return;
    }

    // Resizing region
    if (isResizingRegion && dragStart && selectedRegion && resizeHandle) {
      const current = screenToVideoCoords(e.clientX, e.clientY);
      let { x, y, width, height } = dragStart.region;

      switch (resizeHandle) {
        case 'se':
          width = Math.max(20, current.x - x);
          height = Math.max(20, current.y - y);
          break;
        case 'sw':
          width = Math.max(20, (x + width) - current.x);
          x = Math.min(current.x, x + dragStart.region.width - 20);
          height = Math.max(20, current.y - y);
          break;
        case 'ne':
          width = Math.max(20, current.x - x);
          height = Math.max(20, (y + height) - current.y);
          y = Math.min(current.y, y + dragStart.region.height - 20);
          break;
        case 'nw':
          width = Math.max(20, (x + width) - current.x);
          x = Math.min(current.x, x + dragStart.region.width - 20);
          height = Math.max(20, (y + height) - current.y);
          y = Math.min(current.y, y + dragStart.region.height - 20);
          break;
      }

      // Clamp to video bounds
      x = Math.max(0, x);
      y = Math.max(0, y);
      width = Math.min(width, video.videoWidth - x);
      height = Math.min(height, video.videoHeight - y);

      selectedRegion = { x, y, width, height };
      updateRegionBox();
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (isDrawing) {
      isDrawing = false;
      // Minimum size check
      if (selectedRegion && (selectedRegion.width < 10 || selectedRegion.height < 10)) {
        clearRegion();
      } else if (selectedRegion) {
        // Keep region visible, exit draw mode
        toggleRegionMode();
        videoContainer.classList.add('has-region');
        updateCaptureButtonLabel();
        showBlurControls();
        showToast(`Region: ${Math.round(selectedRegion.width)}×${Math.round(selectedRegion.height)}`, true);
      }
    }

    if (isDraggingRegion || isResizingRegion) {
      isDraggingRegion = false;
      isResizingRegion = false;
      resizeHandle = null;
      dragStart = null;
      if (selectedRegion) {
        regionInfo.textContent = `${Math.round(selectedRegion.width)}×${Math.round(selectedRegion.height)}`;
        if (blurAmount > 0) updateBlurPreview();
      }
    }
  });

  // Drag region box to move it
  regionBox.addEventListener('mousedown', (e) => {
    // Don't intercept clicks on handles, clear button, or blur controls
    if (e.target.classList.contains('region-handle') ||
        e.target.classList.contains('region-clear') ||
        e.target.closest('.blur-controls')) return;
    e.preventDefault();
    e.stopPropagation();
    // Reset any stuck states before starting drag
    resetInteractionState();
    isDraggingRegion = true;
    const pos = screenToVideoCoords(e.clientX, e.clientY);
    dragStart = {
      x: pos.x,
      y: pos.y,
      regionX: selectedRegion.x,
      regionY: selectedRegion.y
    };
  });

  // Resize handles
  regionBox.querySelectorAll('.region-handle').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isResizingRegion = true;
      resizeHandle = handle.dataset.handle;
      dragStart = {
        region: { ...selectedRegion }
      };
    });
  });

  regionClear.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearRegion();
    showToast('Region cleared', true);
  });

  regionBtn.addEventListener('click', toggleRegionMode);

  // Update region box position when window resizes
  window.addEventListener('resize', () => {
    if (selectedRegion) {
      updateRegionBox();
      if (blurAmount > 0) updateBlurPreview();
    }
  });

  // Reset interaction states on click in video container (safety net for stuck states)
  videoContainer.addEventListener('click', (e) => {
    // Don't reset if clicking on interactive elements
    if (e.target.closest('.region-box') || e.target.closest('.blur-controls')) return;
    resetInteractionState();
  });

  // ===== File handling =====
  openFileBtn.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleVideoFile(file);
    }
  });

  // Drag and drop
  ['dragenter', 'dragover'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    videoContainer.addEventListener(evt, (e) => e.preventDefault());
  });

  ['dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, () => {
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    // Accept video/* or common video extensions (some browsers report wrong MIME for avi/mkv)
    const ext = getExtension(file?.name || '');
    if (file && (file.type.startsWith('video/') || CONVERTIBLE_FORMATS.includes(ext) || NATIVE_FORMATS.includes(ext) || TRY_DIRECT_FORMATS.includes(ext))) {
      handleVideoFile(file);
    }
  });

  // Also allow drop on video container when video is loaded
  videoContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    const ext = getExtension(file?.name || '');
    if (file && (file.type.startsWith('video/') || CONVERTIBLE_FORMATS.includes(ext) || NATIVE_FORMATS.includes(ext) || TRY_DIRECT_FORMATS.includes(ext))) {
      handleVideoFile(file);
    }
  });

  // ===== URL loading =====
  loadUrlBtn.addEventListener('click', loadFromUrl);
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadFromUrl();
  });

  function loadFromUrl() {
    const url = urlInput.value.trim();
    if (!url) return;

    // Check if it's an asset URL from PixSim7
    if (url.includes('/api/') && url.includes('/assets/')) {
      // Extract and load via background
      loadAssetUrl(url);
    } else {
      // Direct video URL
      loadVideo(url, getVideoNameFromUrl(url));
    }
  }

  async function loadAssetUrl(url) {
    try {
      showToast('Loading asset...', true);
      // For now, just try to load directly - background can proxy if needed
      loadVideo(url, getVideoNameFromUrl(url));
    } catch (e) {
      showToast('Failed to load asset: ' + e.message, false);
    }
  }

  // ===== Frame capture =====
  captureBtn.addEventListener('click', captureAndUpload);
  saveAssetBtn.addEventListener('click', saveToAssetsOnly);

  async function captureAndUpload() {
    if (!videoLoaded || video.videoWidth === 0) {
      showToast('No video loaded', false);
      return;
    }

    try {
      video.pause();

      // Capture frame to canvas (full or region)
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (selectedRegion && selectedRegion.width > 0 && selectedRegion.height > 0) {
        // Capture only the selected region
        canvas.width = Math.round(selectedRegion.width);
        canvas.height = Math.round(selectedRegion.height);

        // Apply blur if set
        if (blurAmount > 0) {
          ctx.filter = `blur(${blurAmount}px)`;
        }

        ctx.drawImage(
          video,
          selectedRegion.x, selectedRegion.y, selectedRegion.width, selectedRegion.height,
          0, 0, canvas.width, canvas.height
        );

        // Reset filter
        ctx.filter = 'none';

        const blurNote = blurAmount > 0 ? ` (blur: ${blurAmount}px)` : '';
        showToast(`Uploading region ${canvas.width}×${canvas.height}${blurNote}...`, true);
      } else {
        // Capture full frame
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        showToast('Uploading frame...', true);
      }

      // Convert to data URL (JPEG for better provider compatibility, PNG for small regions)
      const useJpeg = canvas.width * canvas.height > 500 * 500; // JPEG for larger images
      const dataUrl = useJpeg
        ? canvas.toDataURL('image/jpeg', 0.92)
        : canvas.toDataURL('image/png');

      // Upload to Pixverse (only save to assets if provider upload succeeds)
      await uploadToProvider(dataUrl, false);
    } catch (e) {
      console.error('Capture error:', e);
      resetInteractionState();
      if (e.name === 'SecurityError') {
        showToast('Cannot capture: video is cross-origin protected', false);
      } else {
        showToast('Capture failed: ' + e.message, false);
      }
    }
  }

  // Upload to provider (Pixverse) - ensureAsset controls whether to keep local copy on provider failure
  async function uploadToProvider(dataUrl, ensureAsset = false) {
    try {
      showToast(ensureAsset ? 'Saving to assets...' : 'Uploading to Pixverse...', true);
      const uploadContext = {
        source: 'video_player',
        frame_time: video.currentTime,
        has_region: !!(selectedRegion && selectedRegion.width > 0),
      };
      if (
        currentVideoName &&
        currentVideoName !== 'Video' &&
        currentVideoName !== 'Source Video' &&
        currentVideoName !== 'Source'
      ) {
        uploadContext.source_filename = currentVideoName;
      }
      if (currentVideoUrl) {
        uploadContext.source_url = currentVideoUrl;
      }
      if (currentVideoSourceSite) {
        uploadContext.source_site = currentVideoSourceSite;
      }
      if (currentVideoSourceFolder) {
        uploadContext.source_folder = currentVideoSourceFolder;
      }
      const response = await chrome.runtime.sendMessage({
        action: 'uploadMediaFromUrl',
        mediaUrl: dataUrl,
        providerId: 'pixverse',
        ensureAsset: ensureAsset,
        uploadMethod: 'video_capture',
        uploadContext,
      });

      if (response && response.success) {
        if (response.providerSucceeded === false) {
          if (ensureAsset) {
            showToast('Saved to assets (Pixverse upload failed)', true);
          } else {
            showToast('Pixverse upload failed', false);
          }
        } else {
          showToast('Uploaded to Pixverse!', true);
        }
      } else {
        showToast(response?.error || 'Upload failed', false);
        resetInteractionState();
      }
    } catch (e) {
      console.error('Upload error:', e);
      resetInteractionState();
      showToast('Upload failed: ' + e.message, false);
    }
  }

  // Save to assets only (doesn't require Pixverse upload to succeed)
  async function saveToAssetsOnly() {
    if (!videoLoaded || video.videoWidth === 0) {
      showToast('No video loaded', false);
      return;
    }

    try {
      video.pause();

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (selectedRegion && selectedRegion.width > 0 && selectedRegion.height > 0) {
        canvas.width = Math.round(selectedRegion.width);
        canvas.height = Math.round(selectedRegion.height);

        // Apply blur if set
        if (blurAmount > 0) {
          ctx.filter = `blur(${blurAmount}px)`;
        }

        ctx.drawImage(
          video,
          selectedRegion.x, selectedRegion.y, selectedRegion.width, selectedRegion.height,
          0, 0, canvas.width, canvas.height
        );

        // Reset filter
        ctx.filter = 'none';
      } else {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      const useJpeg = canvas.width * canvas.height > 500 * 500;
      const dataUrl = useJpeg
        ? canvas.toDataURL('image/jpeg', 0.92)
        : canvas.toDataURL('image/png');

      // ensureAsset: true = save to local assets even if Pixverse fails
      await uploadToProvider(dataUrl, true);
    } catch (e) {
      console.error('Save error:', e);
      resetInteractionState();
      showToast('Save failed: ' + e.message, false);
    }
  }

  // ===== Check for URL parameters =====
  const params = new URLSearchParams(window.location.search);
  const videoUrl = params.get('url') || params.get('src');
  if (videoUrl) {
    urlInput.value = videoUrl;
    loadVideo(videoUrl, 'Video');
  }

  // ===== Listen for messages from other parts of extension =====
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'loadVideo' && message.url) {
      urlInput.value = message.url;
      loadVideo(message.url, message.name || 'Video');
      sendResponse({ success: true });
    }
  });

})();
