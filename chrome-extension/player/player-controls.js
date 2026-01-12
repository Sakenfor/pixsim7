/**
 * Player Controls - Playback controls and keyboard shortcuts
 */
(function() {
  'use strict';

  const { elements, state, utils } = window.PXS7Player;
  const { formatTime } = utils;

  // ===== Time display =====
  function updateTimeDisplay() {
    const video = elements.video;
    const current = formatTime(video.currentTime);
    const total = formatTime(video.duration || 0);
    elements.timeDisplay.textContent = `${current} / ${total}`;

    const pct = video.duration ? (video.currentTime / video.duration) * 100 : 0;
    elements.seekFill.style.width = `${pct}%`;
    elements.frameInput.value = Math.round(video.currentTime * state.currentFps);
  }

  function updateVideoInfo(name = '') {
    const video = elements.video;
    if (!video.videoWidth) return;
    const info = [
      name ? `<strong>${name}</strong>` : '',
      `${video.videoWidth}×${video.videoHeight}`,
      `Duration: ${formatTime(video.duration)}`,
      `FPS: ${state.currentFps} (estimated)`,
    ].filter(Boolean).join(' &nbsp;|&nbsp; ');
    elements.videoInfo.innerHTML = info;
  }

  // ===== Skip amount =====
  function getSkipAmount(e) {
    if (e.shiftKey) return state.skipShiftFrames / state.currentFps;
    if (e.ctrlKey || e.metaKey) return state.skipCtrlAmount;
    return state.skipNormalAmount;
  }

  // ===== Event handlers =====
  elements.video.addEventListener('timeupdate', updateTimeDisplay);
  elements.video.addEventListener('play', () => { elements.playBtn.textContent = '⏸'; });
  elements.video.addEventListener('pause', () => { elements.playBtn.textContent = '▶'; });

  elements.playBtn.addEventListener('click', () => {
    if (elements.video.paused) elements.video.play();
    else elements.video.pause();
  });

  elements.prevFrameBtn.addEventListener('click', (e) => {
    elements.video.pause();
    elements.video.currentTime = Math.max(0, elements.video.currentTime - getSkipAmount(e));
  });

  elements.nextFrameBtn.addEventListener('click', (e) => {
    elements.video.pause();
    elements.video.currentTime = Math.min(elements.video.duration, elements.video.currentTime + getSkipAmount(e));
  });

  elements.seekBar.addEventListener('click', (e) => {
    if (!elements.video.duration) return;
    const rect = elements.seekBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    window.PXS7Player.history?.addToSeekHistory(elements.video.currentTime);
    elements.video.currentTime = pct * elements.video.duration;
  });

  elements.speedSelect.addEventListener('change', () => {
    elements.video.playbackRate = parseFloat(elements.speedSelect.value);
  });

  elements.fpsInput.addEventListener('change', () => {
    state.currentFps = Math.max(1, Math.min(120, parseInt(elements.fpsInput.value) || 30));
    elements.fpsInput.value = state.currentFps;
  });

  elements.frameInput.addEventListener('change', () => {
    const frame = parseInt(elements.frameInput.value) || 0;
    window.PXS7Player.history?.addToSeekHistory(elements.video.currentTime);
    elements.video.currentTime = frame / state.currentFps;
  });

  // ===== Settings Panel =====
  elements.settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.settingsPanel.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!elements.settingsPanel.contains(e.target) && e.target !== elements.settingsBtn) {
      elements.settingsPanel.classList.add('hidden');
    }
  });

  elements.skipNormalSlider.addEventListener('input', () => {
    state.skipNormalAmount = parseInt(elements.skipNormalSlider.value) / 10;
    elements.skipNormalVal.textContent = state.skipNormalAmount.toFixed(1) + 's';
  });

  elements.skipCtrlSlider.addEventListener('input', () => {
    state.skipCtrlAmount = parseInt(elements.skipCtrlSlider.value) / 10;
    elements.skipCtrlVal.textContent = state.skipCtrlAmount.toFixed(1) + 's';
  });

  elements.skipShiftSlider.addEventListener('input', () => {
    state.skipShiftFrames = parseInt(elements.skipShiftSlider.value);
    elements.skipShiftVal.textContent = state.skipShiftFrames + 'f';
  });

  // ===== Keyboard shortcuts =====
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        if (elements.video.paused) elements.video.play();
        else elements.video.pause();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        elements.video.pause();
        elements.video.currentTime = Math.max(0, elements.video.currentTime - getSkipAmount(e));
        break;
      case 'ArrowRight':
        e.preventDefault();
        elements.video.pause();
        elements.video.currentTime = Math.min(elements.video.duration, elements.video.currentTime + getSkipAmount(e));
        break;
      case 'KeyC':
        if (e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        window.PXS7Player.capture?.captureAndUpload();
        break;
      case 'KeyS':
        if (e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        window.PXS7Player.capture?.saveToAssetsOnly();
        break;
      case 'KeyR':
        e.preventDefault();
        window.PXS7Player.region?.toggleRegionMode();
        break;
      case 'Escape':
        if (state.regionMode) {
          e.preventDefault();
          window.PXS7Player.region?.toggleRegionMode();
        }
        break;
    }
  });

  // Export
  window.PXS7Player.controls = {
    updateTimeDisplay,
    updateVideoInfo,
    getSkipAmount,
  };
})();
