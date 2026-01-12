/**
 * Player History - Video files history and seek history
 */
(function() {
  'use strict';

  const { elements, state, utils } = window.PXS7Player;
  const { showToast, formatTime } = utils;

  const VIDEO_HISTORY_KEY = 'pxs7_video_history';
  const MAX_VIDEO_HISTORY = 15;
  let videoHistory = [];

  // ===== Video History (localStorage) =====
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

  function saveVideoHistory() {
    try {
      localStorage.setItem(VIDEO_HISTORY_KEY, JSON.stringify(videoHistory));
    } catch (e) {
      console.warn('Failed to save video history:', e);
    }
  }

  function addToVideoHistory(name, url, isLocal = false) {
    videoHistory = videoHistory.filter(v => v.url !== url && v.name !== name);
    videoHistory.unshift({
      name,
      url: isLocal ? null : url,
      isLocal,
      timestamp: Date.now()
    });
    if (videoHistory.length > MAX_VIDEO_HISTORY) {
      videoHistory = videoHistory.slice(0, MAX_VIDEO_HISTORY);
    }
    saveVideoHistory();
    renderVideoHistory();
  }

  function renderVideoHistory() {
    if (videoHistory.length === 0) {
      elements.historyDropdown.innerHTML = '<div class="history-empty">No recent videos</div>';
      return;
    }

    elements.historyDropdown.innerHTML = videoHistory.map((v, i) => `
      <div class="history-item" data-index="${i}">
        <span class="history-item-icon">${v.isLocal ? '📁' : '🔗'}</span>
        <span class="history-item-name" title="${v.name}">${v.name}</span>
        <span class="history-item-type">${v.isLocal ? 'local' : 'url'}</span>
      </div>
    `).join('');

    elements.historyDropdown.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        const entry = videoHistory[index];
        if (entry.url) {
          elements.urlInput.value = entry.url;
          window.PXS7Player.loadVideo(entry.url, entry.name);
          elements.historyDropdown.classList.add('hidden');
        } else {
          showToast('Local file - use Open to reload', false);
        }
      });
    });
  }

  // Toggle history dropdown
  elements.historyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.historyDropdown.classList.toggle('hidden');
    elements.settingsPanel.classList.add('hidden');
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!elements.historyDropdown.contains(e.target) && e.target !== elements.historyBtn) {
      elements.historyDropdown.classList.add('hidden');
    }
  });

  // ===== Seek History (within current video) =====
  function addToSeekHistory(time) {
    if (!elements.historyEnabled.checked || !state.videoLoaded) return;
    if (state.seekHistory.length > 0) {
      const last = state.seekHistory[state.seekHistory.length - 1];
      if (Math.abs(time - last) < 0.5) return;
    }
    state.seekHistory.push(time);
    if (state.seekHistory.length > state.MAX_HISTORY) {
      state.seekHistory.shift();
    }
    updateHistoryMarkers();
  }

  function updateHistoryMarkers() {
    elements.seekBar.querySelectorAll('.seek-marker').forEach(m => m.remove());
    if (!elements.historyEnabled.checked || !elements.video.duration) return;

    state.seekHistory.forEach(time => {
      const pct = (time / elements.video.duration) * 100;
      const marker = document.createElement('div');
      marker.className = 'seek-marker';
      marker.style.left = `${pct}%`;
      marker.title = formatTime(time);
      elements.seekBar.appendChild(marker);
    });
  }

  function clearSeekHistory() {
    state.seekHistory = [];
    updateHistoryMarkers();
  }

  elements.clearHistoryBtn.addEventListener('click', clearSeekHistory);
  elements.historyEnabled.addEventListener('change', updateHistoryMarkers);

  // Initialize
  loadVideoHistory();
  renderVideoHistory();

  // Export
  window.PXS7Player.history = {
    addToVideoHistory,
    addToSeekHistory,
    updateHistoryMarkers,
    clearSeekHistory,
  };
})();
