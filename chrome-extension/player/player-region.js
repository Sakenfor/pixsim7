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
    createMediaTransform,
    findNearestVertex,
    moveVertex,
  } = window.PXS7Geometry;

  // Polygon state
  state.polygonMode = false;      // true = polygon, false = rect
  state.polygonPoints = [];       // current polygon points (video coords)
  state.isDrawingPolygon = false; // actively adding points
  state.isDraggingPolygon = false; // dragging finished polygon
  state.polygonDragStart = null;  // {x, y, points: [...]} for dragging

  // Vertex dragging state
  state.isDraggingVertex = false;
  state.activeVertexIndex = -1;
  state.hoveredVertexIndex = -1;
  state.vertexDragStart = null;   // {x, y, originalPoints: [...]} for vertex dragging

  // Region type registry - extensible system for different selection types
  const regionTypes = {
    rect: {
      hasSelection: () => !!state.selectedRegion,
      show: () => {
        if (state.selectedRegion) {
          elements.regionBox.classList.remove('hidden');
          elements.regionBox.style.display = '';
        }
      },
      hide: () => {
        elements.regionBox.classList.add('hidden');
        elements.regionBox.style.display = 'none';
      },
      clear: () => {
        state.selectedRegion = null;
        elements.regionBox.classList.add('hidden');
        elements.regionInfo.textContent = '';
        state.blurAmount = 0;
        elements.blurSlider.value = 0;
        elements.blurValue.textContent = '0px';
        elements.blurControls.classList.add('hidden');
        hideBlurPreview();
      }
    },
    polygon: {
      hasSelection: () => state.polygonPoints.length >= 3,
      show: () => {
        const overlay = document.getElementById('polygonOverlay');
        if (overlay && state.polygonPoints.length >= 3) {
          overlay.classList.remove('hidden');
          overlay.style.display = '';
        }
      },
      hide: () => {
        const overlay = document.getElementById('polygonOverlay');
        if (overlay) {
          overlay.classList.add('hidden');
          overlay.style.display = 'none';
        }
        const preview = document.getElementById('polygonPreview');
        if (preview) {
          preview.classList.add('hidden');
          preview.style.display = 'none';
        }
      },
      clear: () => {
        state.polygonPoints = [];
        state.polygonBounds = null;
        hidePolygonPreview();
        hidePolygonOverlay();
      }
    }
  };

  // Get the display element (video or image)
  function getDisplayElement() {
    if (state.isImageMode) {
      return document.getElementById('imageDisplay') || elements.video;
    }
    return elements.video;
  }

  // ===== Coordinate conversion =====
  function getMediaTransform() {
    const dims = getMediaDimensions();
    if (!dims.width || !dims.height) return null;
    const containerRect = elements.videoContainer.getBoundingClientRect();
    if (!containerRect.width || !containerRect.height) return null;
    return createMediaTransform(
      { width: containerRect.width, height: containerRect.height },
      { width: dims.width, height: dims.height },
      'contain'
    );
  }

  function screenToVideoCoords(screenX, screenY) {
    const transform = getMediaTransform();
    if (!transform) return { x: 0, y: 0 };
    const dims = getMediaDimensions();
    const containerRect = elements.videoContainer.getBoundingClientRect();
    const screenPoint = {
      x: screenX - containerRect.left,
      y: screenY - containerRect.top,
    };
    const contentPoint = transform.toContent(screenPoint);
    return {
      x: Math.max(0, Math.min(dims.width, contentPoint.x)),
      y: Math.max(0, Math.min(dims.height, contentPoint.y)),
    };
  }

  function videoToScreenCoords(videoX, videoY, videoW, videoH) {
    const transform = getMediaTransform();
    if (!transform) return { left: 0, top: 0, width: 0, height: 0 };

    const topLeft = transform.toScreenFromContent({ x: videoX, y: videoY });
    const bottomRight = transform.toScreenFromContent({
      x: videoX + videoW,
      y: videoY + videoH,
    });

    return {
      left: topLeft.x,
      top: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }

  // ===== Region management =====
  function updateRegionModeButton() {
    const isActive = state.regionMode || state.isDrawingPolygon;
    elements.regionModeBtn.classList.toggle('active', isActive);
    // Update icon based on selected type
    elements.regionModeIcon.textContent = state.selectedRegionType === 'polygon' ? '⬡' : '⬚';
    // Update dropdown selection
    const options = elements.regionModeDropdown.querySelectorAll('.region-mode-option');
    options.forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.mode === state.selectedRegionType);
    });
  }

  // Show/hide regions based on selected type (preserves both selections)
  function updateRegionVisibility() {
    const currentType = state.selectedRegionType;

    // Iterate through all region types and show/hide appropriately
    for (const [typeName, typeHandler] of Object.entries(regionTypes)) {
      if (typeName === currentType) {
        typeHandler.show();
      } else {
        typeHandler.hide();
      }
    }

    // Update has-region class based on current mode's selection
    const currentHandler = regionTypes[currentType];
    const hasActiveRegion = currentHandler && currentHandler.hasSelection();
    elements.videoContainer.classList.toggle('has-region', hasActiveRegion);

    updateCaptureButtonLabel();
  }

  function toggleRegionMode() {
    if (!state.videoLoaded) return;
    // If polygon mode, use polygon drawing
    if (state.selectedRegionType === 'polygon') {
      if (state.isDrawingPolygon) {
        cancelPolygonDrawing();
      } else {
        startPolygonDrawing();
      }
      updateRegionModeButton();
      return;
    }
    // Rectangle mode
    state.regionMode = !state.regionMode;
    elements.regionOverlay.classList.toggle('hidden', !state.regionMode);
    updateRegionModeButton();
    if (state.regionMode) {
      showToast('Draw region on video (Esc to cancel)', true);
    }
  }

  function setRegionType(type) {
    state.selectedRegionType = type;
    updateRegionModeButton();
    updateRegionVisibility();
    elements.regionModeDropdown.classList.add('hidden');
  }

  function clearCurrentRegion() {
    // Only clear the currently selected mode's region using the registry
    const handler = regionTypes[state.selectedRegionType];
    if (handler) {
      handler.clear();
    }
    updateRegionVisibility();
  }

  function clearRegion() {
    // Clear all region types using the registry
    for (const handler of Object.values(regionTypes)) {
      handler.clear();
    }
    elements.videoContainer.classList.remove('has-region');
    updateCaptureButtonLabel();
  }

  function updateCaptureButtonLabel() {
    // Only show "Capture Region" if the current mode has a selection (using registry)
    const handler = regionTypes[state.selectedRegionType];
    const hasRegion = handler && handler.hasSelection();
    elements.captureBtn.textContent = hasRegion ? '📸 Capture Region' : '📸 Capture';
  }

  // ===== Polygon mode =====
  function togglePolygonMode() {
    state.selectedRegionType = 'polygon';
    toggleRegionMode();
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
    hidePolygonPreview();

    // Simplify if too many points (for freehand)
    if (state.polygonPoints.length > 50) {
      const dims = getMediaDimensions();
      const tolerance = Math.min(dims.width, dims.height) * 0.005;
      state.polygonPoints = simplifyPath(state.polygonPoints, tolerance);
    }

    // Calculate bounding rect for the polygon (for blur preview)
    const bounds = getPathRect(state.polygonPoints);
    state.polygonBounds = bounds; // Store separately from rect region

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

      // Add drag handler for the main polygon overlay
      if (id === 'polygonOverlay') {
        canvas.addEventListener('mousedown', (e) => {
          if (state.polygonPoints.length >= 3 && !state.isDrawingPolygon) {
            e.preventDefault();
            e.stopPropagation();

            const pos = screenToVideoCoords(e.clientX, e.clientY);
            const dims = getMediaDimensions();
            const threshold = Math.min(dims.width, dims.height) * 0.02; // 2% of smaller dimension

            // Check if clicking on a vertex
            const vertexResult = findNearestVertex(pos, state.polygonPoints, threshold);

            if (vertexResult.index >= 0) {
              // Start vertex drag
              state.isDraggingVertex = true;
              state.activeVertexIndex = vertexResult.index;
              state.vertexDragStart = {
                x: pos.x,
                y: pos.y,
                originalPoints: state.polygonPoints.map(pt => ({ ...pt }))
              };
            } else {
              // Start polygon drag
              state.isDraggingPolygon = true;
              state.polygonDragStart = {
                x: pos.x,
                y: pos.y,
                points: state.polygonPoints.map(pt => ({ ...pt }))
              };
            }
          }
        });

        // Add mousemove handler for hover state
        canvas.addEventListener('mousemove', (e) => {
          if (state.polygonPoints.length >= 3 && !state.isDrawingPolygon && !state.isDraggingVertex && !state.isDraggingPolygon) {
            const pos = screenToVideoCoords(e.clientX, e.clientY);
            const dims = getMediaDimensions();
            const threshold = Math.min(dims.width, dims.height) * 0.02;

            const vertexResult = findNearestVertex(pos, state.polygonPoints, threshold);
            const newHoveredIndex = vertexResult.index;

            if (newHoveredIndex !== state.hoveredVertexIndex) {
              state.hoveredVertexIndex = newHoveredIndex;
              renderPolygonOverlay();
            }
          }
        });

        // Reset hover when leaving canvas
        canvas.addEventListener('mouseleave', () => {
          if (state.hoveredVertexIndex !== -1) {
            state.hoveredVertexIndex = -1;
            if (state.polygonPoints.length >= 3 && !state.isDrawingPolygon) {
              renderPolygonOverlay();
            }
          }
        });
      }
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
    if (canvas) {
      canvas.classList.add('hidden');
      canvas.style.display = 'none';
    }
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
    // Only show if polygon is the selected region type
    if (state.selectedRegionType === 'polygon') {
      canvas.classList.remove('hidden');
    }

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

    // Draw vertex handles with hover/active states
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const isHovered = i === state.hoveredVertexIndex;
      const isActive = i === state.activeVertexIndex;

      ctx.beginPath();
      // Size: normal=4px, hovered/active=6px
      const radius = (isHovered || isActive) ? 6 : 4;
      ctx.arc(point.x * scaleX, point.y * scaleY, radius, 0, Math.PI * 2);

      if (isActive) {
        // Active: accent fill, white stroke
        ctx.fillStyle = 'var(--accent, #e94560)';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (isHovered) {
        // Hovered: white fill, accent stroke, larger
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = 'var(--accent, #e94560)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        // Normal: white fill, accent stroke
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = 'var(--accent, #e94560)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Update cursor based on state
    if (state.isDraggingVertex) {
      canvas.style.cursor = 'grabbing';
    } else if (state.hoveredVertexIndex >= 0) {
      canvas.style.cursor = 'pointer';
    } else {
      canvas.style.cursor = 'move';
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

    // Vertex dragging
    if (state.isDraggingVertex && state.vertexDragStart && state.activeVertexIndex >= 0) {
      const dims = getMediaDimensions();
      const current = screenToVideoCoords(e.clientX, e.clientY);
      const bounds = { x: 0, y: 0, width: dims.width, height: dims.height };

      // Update the single vertex position using shared geometry function
      state.polygonPoints = moveVertex(
        state.vertexDragStart.originalPoints,
        state.activeVertexIndex,
        current,
        bounds
      );
      updatePolygonOverlay();
      return;
    }

    // Polygon dragging
    if (state.isDraggingPolygon && state.polygonDragStart && state.polygonPoints.length >= 3) {
      const dims = getMediaDimensions();
      const current = screenToVideoCoords(e.clientX, e.clientY);
      const dx = current.x - state.polygonDragStart.x;
      const dy = current.y - state.polygonDragStart.y;

      // Update all polygon points
      state.polygonPoints = state.polygonDragStart.points.map(pt => {
        let newX = pt.x + dx;
        let newY = pt.y + dy;
        // Clamp to video bounds
        newX = Math.max(0, Math.min(dims.width, newX));
        newY = Math.max(0, Math.min(dims.height, newY));
        return { x: newX, y: newY };
      });
      updatePolygonOverlay();
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

    // Stop vertex dragging
    if (state.isDraggingVertex) {
      state.isDraggingVertex = false;
      state.activeVertexIndex = -1;
      state.vertexDragStart = null;
      // Re-render to update cursor and vertex styles
      if (state.polygonPoints.length >= 3) {
        renderPolygonOverlay();
      }
    }

    // Stop polygon dragging
    if (state.isDraggingPolygon) {
      state.isDraggingPolygon = false;
      state.polygonDragStart = null;
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

  // Region mode dropdown - click button to toggle dropdown
  elements.regionModeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.regionModeDropdown.classList.toggle('hidden');
  });

  // Dropdown option selection - select and activate mode
  elements.regionModeDropdown.addEventListener('click', (e) => {
    const option = e.target.closest('.region-mode-option');
    if (option) {
      e.stopPropagation();
      const mode = option.dataset.mode;
      // Use setRegionType to properly update visibility
      setRegionType(mode);
      // Activate the selected mode (start drawing)
      toggleRegionMode();
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (elements.regionModeDropdown && !elements.regionModeDropdown.classList.contains('hidden')) {
      if (!elements.regionModeDropdown.contains(e.target) && !elements.regionModeBtn.contains(e.target)) {
        elements.regionModeDropdown.classList.add('hidden');
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
    // Only update the currently active region type to avoid showing both
    if (state.selectedRegionType === 'rect') {
      if (state.selectedRegion) {
        updateRegionBox();
        if (state.blurAmount > 0) updateBlurPreview();
      }
    } else if (state.selectedRegionType === 'polygon') {
      if (state.polygonPoints.length >= 3) {
        updatePolygonOverlay();
      }
    }
  });

  elements.videoContainer.addEventListener('click', (e) => {
    if (e.target.closest('.region-box') || e.target.closest('.blur-controls')) return;
    if (e.target.id === 'polygonOverlay') return; // Don't clear when clicking polygon
    resetInteractionState();
  });

  // Export
  window.PXS7Player.region = {
    // Registry for extensibility - add new region types here
    regionTypes,
    toggleRegionMode,
    togglePolygonMode,
    setRegionType,
    clearRegion,
    clearCurrentRegion,
    updateRegionVisibility,
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
