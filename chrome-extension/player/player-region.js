/**
 * Player Region - Region selection and blur
 * Supports rectangle and polygon modes
 */
(function() {
  'use strict';

  const { elements, state, utils } = window.PXS7Player;
  const { showToast, resetInteractionState, getMediaDimensions, getMediaSource } = utils;

  // Geometry functions from shared package
  const {
    pointInPolygon,
    getBoundingBox,
    getPathRect,
    distance,
    simplifyPath,
  } = window.PXS7Geometry;

  // Polygon state
  state.polygonMode = false;      // true = polygon, false = rect
  state.polygonPoints = [];       // current polygon points (video coords)
  state.isDrawingPolygon = false; // actively adding points

  // Get the display element (video or image)
  function getDisplayElement() {
    if (state.isImageMode) {
      return document.getElementById('imageDisplay') || elements.video;
    }
    return elements.video;
  }

  // ===== Coordinate conversion =====
  function screenToVideoCoords(screenX, screenY) {
    const displayEl = getDisplayElement();
    const dims = getMediaDimensions();
    const displayRect = displayEl.getBoundingClientRect();
    const mediaAspect = dims.width / dims.height;
    const containerAspect = displayRect.width / displayRect.height;

    let renderWidth, renderHeight, offsetX, offsetY;

    if (mediaAspect > containerAspect) {
      renderWidth = displayRect.width;
      renderHeight = displayRect.width / mediaAspect;
      offsetX = 0;
      offsetY = (displayRect.height - renderHeight) / 2;
    } else {
      renderHeight = displayRect.height;
      renderWidth = displayRect.height * mediaAspect;
      offsetX = (displayRect.width - renderWidth) / 2;
      offsetY = 0;
    }

    const relX = screenX - displayRect.left - offsetX;
    const relY = screenY - displayRect.top - offsetY;

    return {
      x: Math.max(0, Math.min(dims.width, (relX / renderWidth) * dims.width)),
      y: Math.max(0, Math.min(dims.height, (relY / renderHeight) * dims.height))
    };
  }

  function videoToScreenCoords(videoX, videoY, videoW, videoH) {
    const displayEl = getDisplayElement();
    const dims = getMediaDimensions();
    const displayRect = displayEl.getBoundingClientRect();
    const containerRect = elements.videoContainer.getBoundingClientRect();
    const mediaAspect = dims.width / dims.height;
    const containerAspect = displayRect.width / displayRect.height;

    let renderWidth, renderHeight, offsetX, offsetY;

    if (mediaAspect > containerAspect) {
      renderWidth = displayRect.width;
      renderHeight = displayRect.width / mediaAspect;
      offsetX = 0;
      offsetY = (displayRect.height - renderHeight) / 2;
    } else {
      renderHeight = displayRect.height;
      renderWidth = displayRect.height * mediaAspect;
      offsetX = (displayRect.width - renderWidth) / 2;
      offsetY = 0;
    }

    const scaleX = renderWidth / dims.width;
    const scaleY = renderHeight / dims.height;

    return {
      left: (displayRect.left - containerRect.left) + offsetX + (videoX * scaleX),
      top: (displayRect.top - containerRect.top) + offsetY + (videoY * scaleY),
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
    // Clear polygon too
    clearPolygon();
  }

  function updateCaptureButtonLabel() {
    const hasRegion = state.selectedRegion || state.polygonPoints.length >= 3;
    elements.captureBtn.textContent = hasRegion ? '📸 Capture Region' : '📸 Capture';
  }

  // ===== Polygon mode =====
  function togglePolygonMode() {
    state.polygonMode = !state.polygonMode;
    const polygonBtn = document.getElementById('polygonBtn');
    if (polygonBtn) {
      polygonBtn.style.background = state.polygonMode ? 'var(--accent)' : '';
      polygonBtn.style.color = state.polygonMode ? 'white' : '';
    }
    // Update region button style (inverse)
    elements.regionBtn.style.background = state.polygonMode ? '' : (state.regionMode ? 'var(--accent)' : '');
    elements.regionBtn.style.color = state.polygonMode ? '' : (state.regionMode ? 'white' : '');
  }

  function startPolygonDrawing() {
    if (!state.videoLoaded) return;
    state.isDrawingPolygon = true;
    state.polygonPoints = [];
    elements.regionOverlay.classList.remove('hidden');
    showToast('Click to add points, double-click to finish (Esc to cancel)', true);
  }

  function addPolygonPoint(videoCoords) {
    // Check if clicking near first point to close
    if (state.polygonPoints.length >= 3) {
      const first = state.polygonPoints[0];
      const dist = distance(videoCoords, first);
      const dims = getMediaDimensions();
      const threshold = Math.min(dims.width, dims.height) * 0.02; // 2% of smaller dimension
      if (dist < threshold) {
        finishPolygon();
        return;
      }
    }
    state.polygonPoints.push(videoCoords);
    renderPolygonPreview();
  }

  function finishPolygon() {
    if (state.polygonPoints.length < 3) {
      cancelPolygonDrawing();
      return;
    }

    state.isDrawingPolygon = false;
    elements.regionOverlay.classList.add('hidden');

    // Simplify if too many points (for freehand)
    if (state.polygonPoints.length > 50) {
      const dims = getMediaDimensions();
      const tolerance = Math.min(dims.width, dims.height) * 0.005;
      state.polygonPoints = simplifyPath(state.polygonPoints, tolerance);
    }

    // Calculate bounding rect for the polygon
    const bounds = getPathRect(state.polygonPoints);
    state.selectedRegion = bounds;

    elements.videoContainer.classList.add('has-region');
    updateCaptureButtonLabel();
    showBlurControls();
    renderPolygonOverlay();
    showToast(`Polygon: ${state.polygonPoints.length} points`, true);
  }

  function cancelPolygonDrawing() {
    state.isDrawingPolygon = false;
    state.polygonPoints = [];
    elements.regionOverlay.classList.add('hidden');
    hidePolygonPreview();
  }

  function clearPolygon() {
    state.polygonPoints = [];
    hidePolygonPreview();
    hidePolygonOverlay();
  }

  // ===== Polygon rendering =====
  function getOrCreatePolygonCanvas(id, zIndex = 8) {
    let canvas = document.getElementById(id);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = id;
      canvas.style.cssText = `position: absolute; top: 0; left: 0; pointer-events: none; z-index: ${zIndex};`;
      elements.videoContainer.appendChild(canvas);
    }
    return canvas;
  }

  function renderPolygonPreview(cursorPos = null) {
    const canvas = getOrCreatePolygonCanvas('polygonPreview', 11);
    const displayEl = getDisplayElement();
    const dims = getMediaDimensions();
    const displayRect = displayEl.getBoundingClientRect();
    const containerRect = elements.videoContainer.getBoundingClientRect();

    // Calculate render dimensions
    const mediaAspect = dims.width / dims.height;
    const containerAspect = displayRect.width / displayRect.height;
    let renderWidth, renderHeight, offsetX, offsetY;

    if (mediaAspect > containerAspect) {
      renderWidth = displayRect.width;
      renderHeight = displayRect.width / mediaAspect;
      offsetX = 0;
      offsetY = (displayRect.height - renderHeight) / 2;
    } else {
      renderHeight = displayRect.height;
      renderWidth = displayRect.height * mediaAspect;
      offsetX = (displayRect.width - renderWidth) / 2;
      offsetY = 0;
    }

    const left = (displayRect.left - containerRect.left) + offsetX;
    const top = (displayRect.top - containerRect.top) + offsetY;

    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;
    canvas.width = renderWidth;
    canvas.height = renderHeight;
    canvas.classList.remove('hidden');

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, renderWidth, renderHeight);

    const points = state.polygonPoints;
    if (points.length === 0) return;

    const scaleX = renderWidth / dims.width;
    const scaleY = renderHeight / dims.height;

    // Draw lines between points
    ctx.beginPath();
    ctx.moveTo(points[0].x * scaleX, points[0].y * scaleY);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x * scaleX, points[i].y * scaleY);
    }

    // Draw line to cursor if provided
    if (cursorPos) {
      ctx.lineTo(cursorPos.x * scaleX, cursorPos.y * scaleY);
    }

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw points
    for (let i = 0; i < points.length; i++) {
      ctx.beginPath();
      ctx.arc(points[i].x * scaleX, points[i].y * scaleY, 5, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? 'var(--accent, #e94560)' : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Hint: show close indicator when near first point
    if (cursorPos && points.length >= 3) {
      const first = points[0];
      const dist = distance(cursorPos, first);
      const threshold = Math.min(dims.width, dims.height) * 0.02;
      if (dist < threshold) {
        ctx.beginPath();
        ctx.arc(first.x * scaleX, first.y * scaleY, 10, 0, Math.PI * 2);
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function hidePolygonPreview() {
    const canvas = document.getElementById('polygonPreview');
    if (canvas) canvas.classList.add('hidden');
  }

  function renderPolygonOverlay() {
    const canvas = getOrCreatePolygonCanvas('polygonOverlay', 6);
    const displayEl = getDisplayElement();
    const dims = getMediaDimensions();
    const displayRect = displayEl.getBoundingClientRect();
    const containerRect = elements.videoContainer.getBoundingClientRect();

    const mediaAspect = dims.width / dims.height;
    const containerAspect = displayRect.width / displayRect.height;
    let renderWidth, renderHeight, offsetX, offsetY;

    if (mediaAspect > containerAspect) {
      renderWidth = displayRect.width;
      renderHeight = displayRect.width / mediaAspect;
      offsetX = 0;
      offsetY = (displayRect.height - renderHeight) / 2;
    } else {
      renderHeight = displayRect.height;
      renderWidth = displayRect.height * mediaAspect;
      offsetX = (displayRect.width - renderWidth) / 2;
      offsetY = 0;
    }

    const left = (displayRect.left - containerRect.left) + offsetX;
    const top = (displayRect.top - containerRect.top) + offsetY;

    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;
    canvas.width = renderWidth;
    canvas.height = renderHeight;
    canvas.style.pointerEvents = 'auto';
    canvas.style.cursor = 'move';
    canvas.classList.remove('hidden');

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, renderWidth, renderHeight);

    const points = state.polygonPoints;
    if (points.length < 3) return;

    const scaleX = renderWidth / dims.width;
    const scaleY = renderHeight / dims.height;

    // Draw filled polygon
    ctx.beginPath();
    ctx.moveTo(points[0].x * scaleX, points[0].y * scaleY);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x * scaleX, points[i].y * scaleY);
    }
    ctx.closePath();

    ctx.fillStyle = 'rgba(233, 69, 96, 0.15)';
    ctx.fill();
    ctx.strokeStyle = 'var(--accent, #e94560)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw vertex handles
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x * scaleX, point.y * scaleY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = 'var(--accent, #e94560)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function hidePolygonOverlay() {
    const canvas = document.getElementById('polygonOverlay');
    if (canvas) {
      canvas.classList.add('hidden');
      canvas.style.pointerEvents = 'none';
    }
  }

  function updatePolygonOverlay() {
    if (state.polygonPoints.length >= 3) {
      renderPolygonOverlay();
    }
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

    const displayEl = getDisplayElement();
    const dims = getMediaDimensions();
    const mediaSource = getMediaSource();
    const displayRect = displayEl.getBoundingClientRect();
    const containerRect = elements.videoContainer.getBoundingClientRect();
    const mediaAspect = dims.width / dims.height;
    const containerAspect = displayRect.width / displayRect.height;

    let renderWidth, renderHeight, offsetX, offsetY;
    if (mediaAspect > containerAspect) {
      renderWidth = displayRect.width;
      renderHeight = displayRect.width / mediaAspect;
      offsetX = 0;
      offsetY = (displayRect.height - renderHeight) / 2;
    } else {
      renderHeight = displayRect.height;
      renderWidth = displayRect.height * mediaAspect;
      offsetX = (displayRect.width - renderWidth) / 2;
      offsetY = 0;
    }

    const left = (displayRect.left - containerRect.left) + offsetX;
    const top = (displayRect.top - containerRect.top) + offsetY;

    elements.blurPreview.style.left = `${left}px`;
    elements.blurPreview.style.top = `${top}px`;
    elements.blurPreview.width = renderWidth;
    elements.blurPreview.height = renderHeight;
    elements.blurPreview.classList.remove('hidden');

    if (!state.blurPreviewCtx) {
      state.blurPreviewCtx = elements.blurPreview.getContext('2d');
    }
    const ctx = state.blurPreviewCtx;

    const scaleX = renderWidth / dims.width;
    const scaleY = renderHeight / dims.height;
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
    ctx.drawImage(mediaSource, 0, 0, renderWidth, renderHeight);
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

  // Draw new region (rect or polygon)
  elements.regionOverlay.addEventListener('mousedown', (e) => {
    if (!state.videoLoaded) return;

    // Polygon mode: click to add points
    if (state.isDrawingPolygon) {
      e.preventDefault();
      const coords = screenToVideoCoords(e.clientX, e.clientY);
      addPolygonPoint(coords);
      return;
    }

    // Rect mode
    if (!state.regionMode) return;
    e.preventDefault();
    state.isDrawing = true;
    state.regionStart = screenToVideoCoords(e.clientX, e.clientY);
    elements.regionBox.classList.remove('hidden');
  });

  // Double-click to finish polygon
  elements.regionOverlay.addEventListener('dblclick', (e) => {
    if (state.isDrawingPolygon && state.polygonPoints.length >= 3) {
      e.preventDefault();
      finishPolygon();
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!state.videoLoaded) return;

    // Polygon preview: show line to cursor
    if (state.isDrawingPolygon && state.polygonPoints.length > 0) {
      const coords = screenToVideoCoords(e.clientX, e.clientY);
      renderPolygonPreview(coords);
      return;
    }

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
      const dims = getMediaDimensions();
      const current = screenToVideoCoords(e.clientX, e.clientY);
      const dx = current.x - state.dragStart.x;
      const dy = current.y - state.dragStart.y;

      state.selectedRegion.x = Math.max(0, Math.min(dims.width - state.selectedRegion.width, state.dragStart.regionX + dx));
      state.selectedRegion.y = Math.max(0, Math.min(dims.height - state.selectedRegion.height, state.dragStart.regionY + dy));
      updateRegionBox();
      return;
    }

    if (state.isResizingRegion && state.dragStart && state.selectedRegion && state.resizeHandle) {
      const dims = getMediaDimensions();
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
      width = Math.min(width, dims.width - x);
      height = Math.min(height, dims.height - y);

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

  // Polygon button (will be added to DOM later)
  document.addEventListener('click', (e) => {
    if (e.target.id === 'polygonBtn') {
      if (!state.videoLoaded) return;
      if (state.isDrawingPolygon) {
        cancelPolygonDrawing();
      } else {
        // Clear any existing region first
        if (state.selectedRegion) clearRegion();
        startPolygonDrawing();
      }
    }
  });

  // Escape key to cancel polygon drawing
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.isDrawingPolygon) {
      cancelPolygonDrawing();
      showToast('Polygon cancelled', true);
    }
  });

  window.addEventListener('resize', () => {
    if (state.selectedRegion) {
      updateRegionBox();
      if (state.blurAmount > 0) updateBlurPreview();
    }
    // Also update polygon overlay
    if (state.polygonPoints.length >= 3) {
      updatePolygonOverlay();
    }
  });

  elements.videoContainer.addEventListener('click', (e) => {
    if (e.target.closest('.region-box') || e.target.closest('.blur-controls')) return;
    if (e.target.id === 'polygonOverlay') return; // Don't clear when clicking polygon
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
    // Polygon functions
    startPolygonDrawing,
    finishPolygon,
    cancelPolygonDrawing,
    clearPolygon,
    updatePolygonOverlay,
    getPolygonPoints: () => state.polygonPoints,
    hasPolygon: () => state.polygonPoints.length >= 3,
  };
})();
