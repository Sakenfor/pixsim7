/**
 * Player Controls - Playback controls and keyboard shortcuts
 */
import {
  clampFps,
  clampVolume,
  getFrameFromTime,
  getProgressPercent,
  getSkipSeconds,
  getTimeFromFrame,
  getTimeFromPercent,
} from '@pixsim7/shared.player.core';

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

    const pct = getProgressPercent(video.currentTime, video.duration || 0);
    elements.seekFill.style.width = `${pct}%`;
    elements.frameInput.value = getFrameFromTime(video.currentTime, state.currentFps);
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
    return getSkipSeconds(
      {
        normalSeconds: state.skipNormalAmount,
        ctrlSeconds: state.skipCtrlAmount,
        shiftFrames: state.skipShiftFrames,
      },
      state.currentFps,
      e
    );
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
    elements.video.currentTime = getTimeFromPercent(pct, elements.video.duration);
  });

  elements.speedSelect.addEventListener('change', () => {
    elements.video.playbackRate = parseFloat(elements.speedSelect.value);
  });

  elements.fpsInput.addEventListener('change', () => {
    state.currentFps = clampFps(parseInt(elements.fpsInput.value) || 30);
    elements.fpsInput.value = state.currentFps;
  });

  elements.frameInput.addEventListener('change', () => {
    const frame = parseInt(elements.frameInput.value) || 0;
    window.PXS7Player.history?.addToSeekHistory(elements.video.currentTime);
    elements.video.currentTime = getTimeFromFrame(frame, state.currentFps);
  });

  // ===== Settings Panel =====
  elements.settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = elements.settingsPanel.classList.contains('hidden');
    elements.settingsPanel.classList.toggle('hidden');

    // Position the panel above the button (fixed positioning)
    if (isHidden) {
      const btnRect = elements.settingsBtn.getBoundingClientRect();
      const panelRect = elements.settingsPanel.getBoundingClientRect();

      // Position above the button, aligned to right edge
      let top = btnRect.top - panelRect.height - 8;
      let left = btnRect.right - panelRect.width;

      // Keep within viewport
      if (top < 8) top = btnRect.bottom + 8;
      if (left < 8) left = 8;

      elements.settingsPanel.style.top = top + 'px';
      elements.settingsPanel.style.left = left + 'px';
    }
  });

  document.addEventListener('click', (e) => {
    if (!elements.settingsPanel.contains(e.target) && e.target !== elements.settingsBtn) {
      elements.settingsPanel.classList.add('hidden');
    }
    // Close player settings popup when clicking outside
    if (elements.playerSettingsPopup && !elements.playerSettingsPopup.contains(e.target) && e.target !== elements.playerSettingsBtn) {
      elements.playerSettingsPopup.classList.add('hidden');
    }
  });

  // ===== Player Settings (header) =====
  const PLAYER_SETTINGS_STORAGE_KEY = 'pxs7_player_settings';

  function loadPlayerSettings() {
    try {
      const stored = localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY);
      if (stored) {
        const settings = JSON.parse(stored);
        state.containVideo = settings.containVideo || false;
        state.skipDedup = settings.skipDedup || false;
        // Load volume settings
        if (typeof settings.volume === 'number') {
          state.volume = settings.volume;
        }
        if (typeof settings.isMuted === 'boolean') {
          state.isMuted = settings.isMuted;
        }
      }
    } catch (e) {
      state.containVideo = false;
      state.skipDedup = false;
    }
    applyPlayerSettings();
  }

  function savePlayerSettings() {
    try {
      localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify({
        containVideo: state.containVideo,
        skipDedup: state.skipDedup,
        volume: state.volume,
        isMuted: state.isMuted,
      }));
    } catch (e) {
      console.warn('Failed to save player settings:', e);
    }
  }

  function applyPlayerSettings() {
    // Apply contain video setting
    if (state.containVideo) {
      elements.videoContainer.classList.add('contain-video');
    } else {
      elements.videoContainer.classList.remove('contain-video');
    }
    if (elements.containVideoCheck) {
      elements.containVideoCheck.checked = state.containVideo;
    }
    if (elements.skipDedupCheck) {
      elements.skipDedupCheck.checked = state.skipDedup;
    }
    // Apply volume settings
    elements.video.volume = state.volume;
    elements.video.muted = state.isMuted;
    if (elements.volumeSlider) {
      elements.volumeSlider.value = Math.round(state.volume * 100);
    }
    if (elements.volumeValue) {
      elements.volumeValue.textContent = Math.round(state.volume * 100) + '%';
    }
    updateVolumeIcon();
  }

  if (elements.playerSettingsBtn) {
    elements.playerSettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      elements.playerSettingsPopup.classList.toggle('hidden');
    });
  }

  if (elements.containVideoCheck) {
    elements.containVideoCheck.addEventListener('change', () => {
      state.containVideo = elements.containVideoCheck.checked;
      savePlayerSettings();
      applyPlayerSettings();
    });
  }

  if (elements.skipDedupCheck) {
    elements.skipDedupCheck.addEventListener('change', () => {
      state.skipDedup = elements.skipDedupCheck.checked;
      savePlayerSettings();
    });
  }

  // Load player settings on init
  loadPlayerSettings();

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

  // ===== Volume controls =====
  function updateVolumeIcon() {
    if (!elements.volumeBtn) return;
    if (state.isMuted || state.volume === 0) {
      elements.volumeBtn.textContent = '🔇';
    } else if (state.volume < 0.5) {
      elements.volumeBtn.textContent = '🔉';
    } else {
      elements.volumeBtn.textContent = '🔊';
    }
  }

  function setVolume(vol) {
    state.volume = clampVolume(vol);
    elements.video.volume = state.volume;
    if (elements.volumeSlider) {
      elements.volumeSlider.value = Math.round(state.volume * 100);
    }
    if (elements.volumeValue) {
      elements.volumeValue.textContent = Math.round(state.volume * 100) + '%';
    }
    if (state.volume > 0) {
      state.isMuted = false;
      elements.video.muted = false;
    }
    updateVolumeIcon();
    savePlayerSettings();
  }

  function toggleMute() {
    if (state.isMuted) {
      state.isMuted = false;
      elements.video.muted = false;
      setVolume(state.volumeBeforeMute || 1.0);
    } else {
      state.volumeBeforeMute = state.volume;
      state.isMuted = true;
      elements.video.muted = true;
      updateVolumeIcon();
      savePlayerSettings();
    }
  }

  if (elements.volumeSlider) {
    elements.volumeSlider.addEventListener('input', () => {
      setVolume(parseInt(elements.volumeSlider.value) / 100);
    });
  }

  if (elements.volumeBtn) {
    elements.volumeBtn.addEventListener('click', toggleMute);
  }

  // ===== Hotkey System =====
  const DEFAULT_HOTKEYS = {
    playPause: { code: 'Space', ctrl: false, shift: false, alt: false, label: 'Play/Pause' },
    skipBack: { code: 'ArrowLeft', ctrl: false, shift: false, alt: false, label: 'Skip Back' },
    skipForward: { code: 'ArrowRight', ctrl: false, shift: false, alt: false, label: 'Skip Forward' },
    capture: { code: 'KeyC', ctrl: false, shift: false, alt: false, label: 'Capture' },
    saveAsset: { code: 'KeyS', ctrl: false, shift: false, alt: false, label: 'Save Asset' },
    regionMode: { code: 'KeyR', ctrl: false, shift: false, alt: false, label: 'Rectangle' },
    polygonMode: { code: 'KeyP', ctrl: false, shift: false, alt: false, label: 'Polygon' },
    mute: { code: 'KeyM', ctrl: false, shift: false, alt: false, label: 'Mute' },
    volumeUp: { code: 'ArrowUp', ctrl: false, shift: false, alt: false, label: 'Volume Up' },
    volumeDown: { code: 'ArrowDown', ctrl: false, shift: false, alt: false, label: 'Volume Down' },
    togglePlaylist: { code: 'KeyB', ctrl: false, shift: false, alt: false, label: 'Toggle Playlist' },
  };

  const HOTKEY_STORAGE_KEY = 'pxs7_player_hotkeys';

  function loadHotkeys() {
    try {
      const stored = localStorage.getItem(HOTKEY_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to handle new hotkeys added in updates
        state.hotkeys = { ...DEFAULT_HOTKEYS };
        for (const action of Object.keys(DEFAULT_HOTKEYS)) {
          if (parsed[action]) {
            state.hotkeys[action] = { ...DEFAULT_HOTKEYS[action], ...parsed[action] };
          }
        }
      } else {
        state.hotkeys = { ...DEFAULT_HOTKEYS };
      }
    } catch (e) {
      state.hotkeys = { ...DEFAULT_HOTKEYS };
    }
  }

  function saveHotkeys() {
    try {
      localStorage.setItem(HOTKEY_STORAGE_KEY, JSON.stringify(state.hotkeys));
    } catch (e) {
      console.warn('Failed to save hotkeys:', e);
    }
  }

  function formatHotkey(hotkey) {
    const parts = [];
    if (hotkey.ctrl) parts.push('Ctrl');
    if (hotkey.shift) parts.push('Shift');
    if (hotkey.alt) parts.push('Alt');

    // Convert code to readable key name
    let key = hotkey.code;
    if (key.startsWith('Key')) key = key.slice(3);
    else if (key.startsWith('Digit')) key = key.slice(5);
    else if (key === 'ArrowLeft') key = '←';
    else if (key === 'ArrowRight') key = '→';
    else if (key === 'ArrowUp') key = '↑';
    else if (key === 'ArrowDown') key = '↓';
    else if (key === 'Space') key = 'Space';

    parts.push(key);
    return parts.join('+');
  }

  function renderHotkeySettings() {
    if (!elements.hotkeyList) return;

    elements.hotkeyList.innerHTML = '';
    for (const [action, hotkey] of Object.entries(state.hotkeys)) {
      const row = document.createElement('div');
      row.className = 'hotkey-row';
      row.innerHTML = `
        <span class="hotkey-label">${hotkey.label}</span>
        <button class="hotkey-btn" data-action="${action}">${formatHotkey(hotkey)}</button>
      `;
      elements.hotkeyList.appendChild(row);
    }

    // Add click handlers for hotkey buttons
    elements.hotkeyList.querySelectorAll('.hotkey-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        startRecordingHotkey(btn.dataset.action, btn);
      });
    });
  }

  function startRecordingHotkey(action, btn) {
    // Cancel any existing recording
    if (state.recordingHotkey) {
      const prevBtn = elements.hotkeyList.querySelector('.hotkey-btn.recording');
      if (prevBtn) {
        prevBtn.classList.remove('recording');
        prevBtn.textContent = formatHotkey(state.hotkeys[state.recordingHotkey]);
      }
    }

    state.recordingHotkey = action;
    btn.classList.add('recording');
    btn.textContent = 'Press key...';
  }

  function handleHotkeyRecording(e) {
    if (!state.recordingHotkey) return false;

    // Ignore modifier-only keypresses
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return true;

    e.preventDefault();
    e.stopPropagation();

    const action = state.recordingHotkey;
    state.hotkeys[action] = {
      ...state.hotkeys[action],
      code: e.code,
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
    };

    saveHotkeys();
    state.recordingHotkey = null;
    renderHotkeySettings();
    return true;
  }

  function matchesHotkey(e, hotkey) {
    return e.code === hotkey.code &&
           e.ctrlKey === hotkey.ctrl &&
           e.shiftKey === hotkey.shift &&
           e.altKey === hotkey.alt;
  }

  // Reset hotkeys button
  if (elements.resetHotkeysBtn) {
    elements.resetHotkeysBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.hotkeys = JSON.parse(JSON.stringify(DEFAULT_HOTKEYS));
      saveHotkeys();
      renderHotkeySettings();
    });
  }

  // Initialize hotkeys
  loadHotkeys();
  renderHotkeySettings();

  // ===== Keyboard shortcuts =====
  document.addEventListener('keydown', (e) => {
    // Handle hotkey recording first
    if (handleHotkeyRecording(e)) return;

    if (e.target.tagName === 'INPUT') return;

    const hotkeys = state.hotkeys;

    if (matchesHotkey(e, hotkeys.playPause)) {
      e.preventDefault();
      if (elements.video.paused) elements.video.play();
      else elements.video.pause();
    } else if (e.code === hotkeys.skipBack.code && !hotkeys.skipBack.ctrl && !hotkeys.skipBack.shift && !hotkeys.skipBack.alt) {
      // Skip back with modifier support (normal, ctrl, shift)
      e.preventDefault();
      elements.video.pause();
      elements.video.currentTime = Math.max(0, elements.video.currentTime - getSkipAmount(e));
    } else if (e.code === hotkeys.skipForward.code && !hotkeys.skipForward.ctrl && !hotkeys.skipForward.shift && !hotkeys.skipForward.alt) {
      // Skip forward with modifier support (normal, ctrl, shift)
      e.preventDefault();
      elements.video.pause();
      elements.video.currentTime = Math.min(elements.video.duration, elements.video.currentTime + getSkipAmount(e));
    } else if (matchesHotkey(e, hotkeys.capture)) {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      window.PXS7Player.capture?.captureAndUpload();
    } else if (matchesHotkey(e, hotkeys.saveAsset)) {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      window.PXS7Player.capture?.saveToAssetsOnly();
    } else if (matchesHotkey(e, hotkeys.regionMode)) {
      e.preventDefault();
      window.PXS7Player.region?.setRegionType('rect');
      window.PXS7Player.region?.toggleRegionMode();
    } else if (matchesHotkey(e, hotkeys.polygonMode)) {
      e.preventDefault();
      window.PXS7Player.region?.setRegionType('polygon');
      window.PXS7Player.region?.toggleRegionMode();
    } else if (e.code === 'Escape' && (state.regionMode || state.isDrawingPolygon)) {
      e.preventDefault();
      window.PXS7Player.region?.toggleRegionMode();
    } else if (matchesHotkey(e, hotkeys.mute)) {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      toggleMute();
    } else if (matchesHotkey(e, hotkeys.volumeUp)) {
      e.preventDefault();
      setVolume(state.volume + 0.05);
    } else if (matchesHotkey(e, hotkeys.volumeDown)) {
      e.preventDefault();
      setVolume(state.volume - 0.05);
    } else if (matchesHotkey(e, hotkeys.togglePlaylist)) {
      e.preventDefault();
      window.PXS7Player.playlist?.toggleSidebar();
    }
  });

  // Export
  window.PXS7Player.controls = {
    updateTimeDisplay,
    updateVideoInfo,
    getSkipAmount,
    setVolume,
    toggleMute,
  };
})();
