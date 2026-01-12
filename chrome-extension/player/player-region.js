/**
 * Player Region - Region selection and blur
 */
(function() {
  'use strict';

  const { elements, state, utils } = window.PXS7Player;
  const { showToast, resetInteractionState } = utils;

  // ===== Coordinate conversion =====
  function screenToVideoCoords(screenX, screenY) {
    const video = elements.video;
    const videoRect = video.getBoundingClientRect();
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

    const relX = screenX - videoRect.left - offsetX;
    const relY = screenY - videoRect.top - offsetY;

    return {
      x: Math.max(0, Math.min(video.videoWidth, (relX / renderWidth) * video.videoWidth)),
      y: Math.max(0, Math.min(video.videoHeight, (relY / renderHeight) * video.videoHeight))
    };
  }

  function videoToScreenCoords(videoX, videoY, videoW, videoH) {
    const video = elements.video;
    const videoRect = video.getBoundingClientRect();
    const containerRect = elements.videoContainer.getBoundingClientRect();
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

  // ===== Region management =====
  function toggleRegionMode() {
    if (!state.videoLoaded) return;
    state.regionMode = !state.regionMode;
    elements.regionOverlay.classList.toggle('hidden', !state.regionMode);
    elements.regionBtn.style.background = state.regionMode ? 'var(--accent)' : '';
    elements.regionBtn.style.color = state.regionMode ? 'white' : '';
    if (state.regionMode) {
      showToast('Draw region on video (Esc to cancel)', true);
    }
  }

  function clearRegion() {
    state.selectedRegion = null;
    elements.regionBox.classList.add('hidden');
    elements.regionInfo.textContent = '';
    elements.videoContainer.classList.remove('has-region');
    updateCaptureButtonLabel();
    state.blurAmount = 0;
    elements.blurSlider.value = 0;
    elements.blurValue.textContent = '0px';
    elements.blurControls.classList.add('hidden');
    hideBlurPreview();
  }

  function updateCaptureButtonLabel() {
    elements.captureBtn.textContent = state.selectedRegion ? '📸 Capture Region' : '📸 Capture';
  }

  function updateRegionBox() {
    if (!state.selectedRegion) return;
    const screen = videoToScreenCoords(
      state.selectedRegion.x, state.selectedRegion.y,
      state.selectedRegion.width, state.selectedRegion.height
    );
    elements.regionBox.style.left = `${screen.left}px`;
    elements.regionBox.style.top = `${screen.top}px`;
    elements.regionBox.style.width = `${screen.width}px`;
    elements.regionBox.style.height = `${screen.height}px`;
    elements.regionInfo.textContent = `${Math.round(state.selectedRegion.width)}×${Math.round(state.selectedRegion.height)}`;
  }

  // ===== Blur preview =====
  function showBlurControls() {
    elements.blurControls.classList.remove('hidden');
  }

  function hideBlurPreview() {
    elements.blurPreview.classList.add('hidden');
  }

  function updateBlurPreview() {
    if (!state.selectedRegion || state.blurAmount === 0 || !state.videoLoaded) {
      hideBlurPreview();
      return;
    }

    const video = elements.video;
    const videoRect = video.getBoundingClientRect();
    const containerRect = elements.videoContainer.getBoundingClientRect();
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

    const left = (videoRect.left - containerRect.left) + offsetX;
    const top = (videoRect.top - containerRect.top) + offsetY;

    elements.blurPreview.style.left = `${left}px`;
    elements.blurPreview.style.top = `${top}px`;
    elements.blurPreview.width = renderWidth;
    elements.blurPreview.height = renderHeight;
    elements.blurPreview.classList.remove('hidden');

    if (!state.blurPreviewCtx) {
      state.blurPreviewCtx = elements.blurPreview.getContext('2d');
    }
    const ctx = state.blurPreviewCtx;

    const scaleX = renderWidth / video.videoWidth;
    const scaleY = renderHeight / video.videoHeight;
    const dispX = state.selectedRegion.x * scaleX;
    const dispY = state.selectedRegion.y * scaleY;
    const dispW = state.selectedRegion.width * scaleX;
    const dispH = state.selectedRegion.height * scaleY;

    ctx.clearRect(0, 0, renderWidth, renderHeight);
    ctx.save();
    ctx.beginPath();
    ctx.rect(dispX, dispY, dispW, dispH);
    ctx.clip();
    ctx.filter = `blur(${state.blurAmount}px)`;
    ctx.drawImage(video, 0, 0, renderWidth, renderHeight);
    ctx.restore();
  }

  // ===== Event handlers =====
  elements.blurSlider.addEventListener('input', () => {
    state.blurAmount = parseInt(elements.blurSlider.value) || 0;
    elements.blurValue.textContent = `${state.blurAmount}px`;
    updateBlurPreview();
  });

  elements.video.addEventListener('seeked', () => {
    if (state.blurAmount > 0 && state.selectedRegion) {
      updateBlurPreview();
    }
  });

  // Draw new region
  elements.regionOverlay.addEventListener('mousedown', (e) => {
    if (!state.regionMode || !state.videoLoaded) return;
    e.preventDefault();
    state.isDrawing = true;
    state.regionStart = screenToVideoCoords(e.clientX, e.clientY);
    elements.regionBox.classList.remove('hidden');
  });

  document.addEventListener('mousemove', (e) => {
    if (!state.videoLoaded) return;

    if (state.isDrawing && state.regionStart) {
      const current = screenToVideoCoords(e.clientX, e.clientY);
      state.selectedRegion = {
        x: Math.min(state.regionStart.x, current.x),
        y: Math.min(state.regionStart.y, current.y),
        width: Math.abs(current.x - state.regionStart.x),
        height: Math.abs(current.y - state.regionStart.y)
      };
      updateRegionBox();
      return;
    }

    if (state.isDraggingRegion && state.dragStart && state.selectedRegion) {
      const current = screenToVideoCoords(e.clientX, e.clientY);
      const dx = current.x - state.dragStart.x;
      const dy = current.y - state.dragStart.y;

      state.selectedRegion.x = Math.max(0, Math.min(elements.video.videoWidth - state.selectedRegion.width, state.dragStart.regionX + dx));
      state.selectedRegion.y = Math.max(0, Math.min(elements.video.videoHeight - state.selectedRegion.height, state.dragStart.regionY + dy));
      updateRegionBox();
      return;
    }

    if (state.isResizingRegion && state.dragStart && state.selectedRegion && state.resizeHandle) {
      const current = screenToVideoCoords(e.clientX, e.clientY);
      let { x, y, width, height } = state.dragStart.region;

      switch (state.resizeHandle) {
        case 'se':
          width = Math.max(20, current.x - x);
          height = Math.max(20, current.y - y);
          break;
        case 'sw':
          width = Math.max(20, (x + width) - current.x);
          x = Math.min(current.x, x + state.dragStart.region.width - 20);
          height = Math.max(20, current.y - y);
          break;
        case 'ne':
          width = Math.max(20, current.x - x);
          height = Math.max(20, (y + height) - current.y);
          y = Math.min(current.y, y + state.dragStart.region.height - 20);
          break;
        case 'nw':
          width = Math.max(20, (x + width) - current.x);
          x = Math.min(current.x, x + state.dragStart.region.width - 20);
          height = Math.max(20, (y + height) - current.y);
          y = Math.min(current.y, y + state.dragStart.region.height - 20);
          break;
      }

      x = Math.max(0, x);
      y = Math.max(0, y);
      width = Math.min(width, elements.video.videoWidth - x);
      height = Math.min(height, elements.video.videoHeight - y);

      state.selectedRegion = { x, y, width, height };
      updateRegionBox();
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (state.isDrawing) {
      state.isDrawing = false;
      if (state.selectedRegion && (state.selectedRegion.width < 10 || state.selectedRegion.height < 10)) {
        clearRegion();
      } else if (state.selectedRegion) {
        toggleRegionMode();
        elements.videoContainer.classList.add('has-region');
        updateCaptureButtonLabel();
        showBlurControls();
        showToast(`Region: ${Math.round(state.selectedRegion.width)}×${Math.round(state.selectedRegion.height)}`, true);
      }
    }

    if (state.isDraggingRegion || state.isResizingRegion) {
      state.isDraggingRegion = false;
      state.isResizingRegion = false;
      state.resizeHandle = null;
      state.dragStart = null;
      if (state.selectedRegion) {
        elements.regionInfo.textContent = `${Math.round(state.selectedRegion.width)}×${Math.round(state.selectedRegion.height)}`;
        if (state.blurAmount > 0) updateBlurPreview();
      }
    }
  });

  // Drag region box
  elements.regionBox.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('region-handle') ||
        e.target.classList.contains('region-clear') ||
        e.target.closest('.blur-controls')) return;
    e.preventDefault();
    e.stopPropagation();
    resetInteractionState();
    state.isDraggingRegion = true;
    const pos = screenToVideoCoords(e.clientX, e.clientY);
    state.dragStart = {
      x: pos.x,
      y: pos.y,
      regionX: state.selectedRegion.x,
      regionY: state.selectedRegion.y
    };
  });

  // Resize handles
  elements.regionBox.querySelectorAll('.region-handle').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.isResizingRegion = true;
      state.resizeHandle = handle.dataset.handle;
      state.dragStart = { region: { ...state.selectedRegion } };
    });
  });

  elements.regionClear.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearRegion();
    showToast('Region cleared', true);
  });

  elements.regionBtn.addEventListener('click', toggleRegionMode);

  window.addEventListener('resize', () => {
    if (state.selectedRegion) {
      updateRegionBox();
      if (state.blurAmount > 0) updateBlurPreview();
    }
  });

  elements.videoContainer.addEventListener('click', (e) => {
    if (e.target.closest('.region-box') || e.target.closest('.blur-controls')) return;
    resetInteractionState();
  });

  // Export
  window.PXS7Player.region = {
    toggleRegionMode,
    clearRegion,
    updateRegionBox,
    updateBlurPreview,
    screenToVideoCoords,
    videoToScreenCoords,
  };
})();
