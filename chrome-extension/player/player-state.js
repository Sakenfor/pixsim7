/**
 * Player State - Shared state and DOM elements
 */
(function() {
  'use strict';

  // Create global namespace
  window.PXS7Player = window.PXS7Player || {};

  // ===== DOM Elements =====
  const elements = {
    video: document.getElementById('video'),
    dropZone: document.getElementById('dropZone'),
    videoContainer: document.getElementById('videoContainer'),
    fileInput: document.getElementById('fileInput'),
    urlInput: document.getElementById('urlInput'),
    loadUrlBtn: document.getElementById('loadUrlBtn'),
    openFileBtn: document.getElementById('openFileBtn'),
    captureBtn: document.getElementById('captureBtn'),
    saveAssetBtn: document.getElementById('saveAssetBtn'),
    regionBtn: document.getElementById('regionBtn'),
    regionOverlay: document.getElementById('regionOverlay'),
    regionBox: document.getElementById('regionBox'),
    regionClear: document.getElementById('regionClear'),
    regionInfo: document.getElementById('regionInfo'),
    blurControls: document.getElementById('blurControls'),
    blurSlider: document.getElementById('blurSlider'),
    blurValue: document.getElementById('blurValue'),
    blurPreview: document.getElementById('blurPreview'),
    playBtn: document.getElementById('playBtn'),
    prevFrameBtn: document.getElementById('prevFrameBtn'),
    nextFrameBtn: document.getElementById('nextFrameBtn'),
    seekBar: document.getElementById('seekBar'),
    seekFill: document.getElementById('seekFill'),
    timeDisplay: document.getElementById('timeDisplay'),
    speedSelect: document.getElementById('speedSelect'),
    frameInput: document.getElementById('frameInput'),
    fpsInput: document.getElementById('fpsInput'),
    videoInfo: document.getElementById('videoInfo'),
    toast: document.getElementById('toast'),
    // Settings panel
    settingsBtn: document.getElementById('settingsBtn'),
    settingsPanel: document.getElementById('settingsPanel'),
    skipNormalSlider: document.getElementById('skipNormal'),
    skipCtrlSlider: document.getElementById('skipCtrl'),
    skipShiftSlider: document.getElementById('skipShift'),
    skipNormalVal: document.getElementById('skipNormalVal'),
    skipCtrlVal: document.getElementById('skipCtrlVal'),
    skipShiftVal: document.getElementById('skipShiftVal'),
    historyEnabled: document.getElementById('historyEnabled'),
    clearHistoryBtn: document.getElementById('clearHistory'),
    // Video history
    historyBtn: document.getElementById('historyBtn'),
    historyDropdown: document.getElementById('historyDropdown'),
    // Volume controls
    volumeBtn: document.getElementById('volumeBtn'),
    volumeSlider: document.getElementById('volumeSlider'),
    volumeValue: document.getElementById('volumeValue'),
    // Hotkey settings
    hotkeyList: document.getElementById('hotkeyList'),
    resetHotkeysBtn: document.getElementById('resetHotkeys'),
    // Conversion UI
    convertOverlay: document.getElementById('convertOverlay'),
    convertText: document.getElementById('convertText'),
    convertProgressBar: document.getElementById('convertProgressBar'),
    convertDetail: document.getElementById('convertDetail'),
    convertCancel: document.getElementById('convertCancel'),
  };

  // ===== Shared State =====
  const state = {
    currentFps: 30,
    videoLoaded: false,
    isImageMode: false,
    loadedImage: null,
    currentVideoName: 'Video',
    currentVideoUrl: null,
    currentVideoSourceSite: null,
    currentVideoSourceFolder: null,
    // Skip settings
    skipNormalAmount: 1.0,
    skipCtrlAmount: 3.0,
    skipShiftFrames: 1,
    // Seek history
    seekHistory: [],
    MAX_HISTORY: 20,
    // Region selection
    regionMode: false,
    isDrawing: false,
    isDraggingRegion: false,
    isResizingRegion: false,
    resizeHandle: null,
    regionStart: null,
    dragStart: null,
    selectedRegion: null,
    // Blur
    blurAmount: 0,
    blurPreviewCtx: null,
    // Volume
    volume: 1.0,
    isMuted: false,
    volumeBeforeMute: 1.0,
    // Hotkeys (action -> { code, ctrl, shift, alt })
    hotkeys: null, // Will be initialized in player-controls.js
    recordingHotkey: null, // Currently recording hotkey action
  };

  // ===== Utility Functions =====
  let toastTimeout = null;
  function showToast(message, isSuccess = true) {
    elements.toast.textContent = message;
    elements.toast.className = 'toast visible ' + (isSuccess ? 'success' : 'error');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      elements.toast.className = 'toast';
    }, 3000);
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

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

  function getLocalSourceFolder(relativePath) {
    if (!relativePath) return null;
    const normalized = relativePath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts.length > 1 ? parts[0] : null;
  }

  function setLocalVideoContext(name, sourceFolder) {
    state.currentVideoName = name || 'Video';
    state.currentVideoUrl = null;
    state.currentVideoSourceFolder = sourceFolder || null;
    state.currentVideoSourceSite = 'local';
  }

  function setRemoteVideoContext(url, name) {
    state.currentVideoName = name || 'Video';
    state.currentVideoUrl = url || null;
    state.currentVideoSourceSite = getSourceSite(url);
    state.currentVideoSourceFolder = null;
  }

  function resetInteractionState() {
    state.isDrawing = false;
    state.isDraggingRegion = false;
    state.isResizingRegion = false;
    state.resizeHandle = null;
    state.dragStart = null;
    state.regionStart = null;
  }

  // Get the current media source (video or image) for drawing
  function getMediaSource() {
    if (state.isImageMode && state.loadedImage) {
      return state.loadedImage;
    }
    return elements.video;
  }

  // Get media dimensions (works for both video and image)
  function getMediaDimensions() {
    if (state.isImageMode && state.loadedImage) {
      return {
        width: state.loadedImage.width,
        height: state.loadedImage.height,
      };
    }
    return {
      width: elements.video.videoWidth,
      height: elements.video.videoHeight,
    };
  }

  // Export
  window.PXS7Player.elements = elements;
  window.PXS7Player.state = state;
  window.PXS7Player.utils = {
    showToast,
    formatTime,
    getExtension,
    getVideoNameFromUrl,
    getSourceSite,
    getLocalSourceFolder,
    setLocalVideoContext,
    setRemoteVideoContext,
    resetInteractionState,
    getMediaSource,
    getMediaDimensions,
  };
})();
