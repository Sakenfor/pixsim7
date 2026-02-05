/**
 * Player Capture - Frame capture and upload
 * Supports rectangle and polygon regions
 */
(function() {
  'use strict';

  const { elements, state, utils } = window.PXS7Player;
  const { showToast, resetInteractionState, getMediaSource, getMediaDimensions } = utils;

  // Region serialization from shared package
  const { pointsToCoordArray, normalizePolygonPoints } = window.PXS7Geometry;

  // Upload lock to prevent duplicate rapid uploads
  let isUploading = false;

  // Check if we have a polygon region
  function hasPolygonRegion() {
    return state.polygonPoints && state.polygonPoints.length >= 3;
  }

  // Calculate polygon bounds from points
  function getPolygonBounds() {
    if (!state.polygonPoints || state.polygonPoints.length < 3) return null;
    const xs = state.polygonPoints.map(p => p.x);
    const ys = state.polygonPoints.map(p => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  // Draw polygon-clipped region to canvas
  function drawPolygonRegion(ctx, mediaSource, polygonPoints, bounds) {
    ctx.save();

    // Create clipping path from polygon (translated to canvas coordinates)
    ctx.beginPath();
    const first = polygonPoints[0];
    ctx.moveTo(first.x - bounds.x, first.y - bounds.y);
    for (let i = 1; i < polygonPoints.length; i++) {
      ctx.lineTo(polygonPoints[i].x - bounds.x, polygonPoints[i].y - bounds.y);
    }
    ctx.closePath();
    ctx.clip();

    // Apply blur if needed
    if (state.blurAmount > 0) {
      ctx.filter = `blur(${state.blurAmount}px)`;
    }

    // Draw the media source cropped to the bounding box
    ctx.drawImage(
      mediaSource,
      bounds.x, bounds.y, bounds.width, bounds.height,
      0, 0, bounds.width, bounds.height
    );

    ctx.restore();
  }

  // Wait for video frame to be ready for capture
  function waitForVideoReady() {
    return new Promise((resolve) => {
      const video = elements.video;
      // readyState 2+ means current frame is available
      if (state.isImageMode || video.readyState >= 2) {
        resolve();
        return;
      }
      // Wait for seeked or canplay event
      const onReady = () => {
        video.removeEventListener('seeked', onReady);
        video.removeEventListener('canplay', onReady);
        resolve();
      };
      video.addEventListener('seeked', onReady, { once: true });
      video.addEventListener('canplay', onReady, { once: true });
      // Timeout fallback
      setTimeout(resolve, 500);
    });
  }

  async function captureAndUpload() {
    // Prevent duplicate rapid uploads
    if (isUploading) {
      console.log('[Capture] Upload already in progress, ignoring');
      return;
    }

    const dims = getMediaDimensions();
    if (!state.videoLoaded || dims.width === 0) {
      showToast('No media loaded', false);
      return;
    }

    isUploading = true;
    try {
      // Pause video if not in image mode
      if (!state.isImageMode) {
        elements.video.pause();
      }

      // Wait for video frame to be ready
      await waitForVideoReady();

      const mediaSource = getMediaSource();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Check for polygon region first
      if (hasPolygonRegion()) {
        const bounds = state.polygonBounds || getPolygonBounds();
        canvas.width = Math.round(bounds.width);
        canvas.height = Math.round(bounds.height);

        drawPolygonRegion(ctx, mediaSource, state.polygonPoints, bounds);

        const blurNote = state.blurAmount > 0 ? ` (blur: ${state.blurAmount}px)` : '';
        showToast(`Uploading polygon ${canvas.width}×${canvas.height}${blurNote}...`, true);
      } else if (state.selectedRegion && state.selectedRegion.width > 0 && state.selectedRegion.height > 0) {
        // Rectangle region
        canvas.width = Math.round(state.selectedRegion.width);
        canvas.height = Math.round(state.selectedRegion.height);

        if (state.blurAmount > 0) {
          ctx.filter = `blur(${state.blurAmount}px)`;
        }

        ctx.drawImage(
          mediaSource,
          state.selectedRegion.x, state.selectedRegion.y, state.selectedRegion.width, state.selectedRegion.height,
          0, 0, canvas.width, canvas.height
        );
        ctx.filter = 'none';

        const blurNote = state.blurAmount > 0 ? ` (blur: ${state.blurAmount}px)` : '';
        showToast(`Uploading region ${canvas.width}×${canvas.height}${blurNote}...`, true);
      } else {
        // Full frame
        canvas.width = dims.width;
        canvas.height = dims.height;
        ctx.drawImage(mediaSource, 0, 0, canvas.width, canvas.height);
        showToast(state.isImageMode ? 'Uploading image...' : 'Uploading frame...', true);
      }

      const useJpeg = canvas.width * canvas.height > 500 * 500;
      const dataUrl = useJpeg
        ? canvas.toDataURL('image/jpeg', 0.92)
        : canvas.toDataURL('image/png');

      await uploadToProvider(dataUrl, false);
    } catch (e) {
      console.error('Capture error:', e);
      resetInteractionState();
      if (e.name === 'SecurityError') {
        showToast('Cannot capture: video is cross-origin protected', false);
      } else {
        showToast('Capture failed: ' + e.message, false);
      }
    } finally {
      isUploading = false;
    }
  }

  async function uploadToProvider(dataUrl, ensureAsset = false) {
    try {
      showToast(ensureAsset ? 'Saving to assets...' : 'Uploading to Pixverse...', true);
      const uploadContext = {
        source: 'video_player',
        frame_time: elements.video.currentTime,
        has_region: !!(state.selectedRegion && state.selectedRegion.width > 0),
        is_polygon: hasPolygonRegion(),
      };

      // Include polygon points if available (normalized to video dimensions)
      if (hasPolygonRegion()) {
        const dims = getMediaDimensions();
        // Normalize points to 0-1 range
        const normalizedPoints = state.polygonPoints.map(p => ({
          x: p.x / dims.width,
          y: p.y / dims.height,
        }));
        // Use compact coordinate array format [[x,y], [x,y], ...]
        uploadContext.polygon_points = pointsToCoordArray(normalizePolygonPoints(normalizedPoints));
      }

      // Include rect bounds if available (normalized to video dimensions)
      if (state.selectedRegion && state.selectedRegion.width > 0) {
        const dims = getMediaDimensions();
        uploadContext.region_bounds = {
          x: state.selectedRegion.x / dims.width,
          y: state.selectedRegion.y / dims.height,
          width: state.selectedRegion.width / dims.width,
          height: state.selectedRegion.height / dims.height,
        };
      }

      if (state.currentVideoName && state.currentVideoName !== 'Video' &&
          state.currentVideoName !== 'Source Video' && state.currentVideoName !== 'Source') {
        uploadContext.source_filename = state.currentVideoName;
      }
      if (state.currentVideoUrl) {
        uploadContext.source_url = state.currentVideoUrl;
      }
      if (state.currentVideoSourceSite) {
        uploadContext.source_site = state.currentVideoSourceSite;
      }
      if (state.currentVideoSourceFolder) {
        uploadContext.source_folder = state.currentVideoSourceFolder;
      }

      console.log('[Capture] Sending upload request...', { ensureAsset, contextKeys: Object.keys(uploadContext) });
      const startTime = Date.now();

      const response = await chrome.runtime.sendMessage({
        action: 'uploadMediaFromUrl',
        mediaUrl: dataUrl,
        providerId: 'pixverse',
        ensureAsset: ensureAsset,
        uploadMethod: 'video_capture',
        uploadContext,
        skipDedup: state.skipDedup,
      });

      const elapsed = Date.now() - startTime;
      console.log(`[Capture] Response received in ${elapsed}ms:`, response);

      if (response && response.success) {
        // Check if this was a deduplicated upload (reused existing asset)
        const note = response.data?.note || '';
        const wasDeduplicated = note.includes('phash') || note.includes('Reused') || elapsed < 200;

        if (response.providerSucceeded === false) {
          if (ensureAsset) {
            showToast('Saved to assets (Pixverse upload failed)', true);
          } else {
            showToast('Pixverse upload failed', false);
          }
        } else if (wasDeduplicated) {
          showToast('Already exists (reused)', true);
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

  async function saveToAssetsOnly() {
    // Prevent duplicate rapid uploads
    if (isUploading) {
      console.log('[Capture] Upload already in progress, ignoring');
      return;
    }

    const dims = getMediaDimensions();
    if (!state.videoLoaded || dims.width === 0) {
      showToast('No media loaded', false);
      return;
    }

    isUploading = true;
    try {
      // Pause video if not in image mode
      if (!state.isImageMode) {
        elements.video.pause();
      }

      // Wait for video frame to be ready
      await waitForVideoReady();

      const mediaSource = getMediaSource();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Check for polygon region first
      if (hasPolygonRegion()) {
        const bounds = state.polygonBounds || getPolygonBounds();
        canvas.width = Math.round(bounds.width);
        canvas.height = Math.round(bounds.height);
        drawPolygonRegion(ctx, mediaSource, state.polygonPoints, bounds);
      } else if (state.selectedRegion && state.selectedRegion.width > 0 && state.selectedRegion.height > 0) {
        // Rectangle region
        canvas.width = Math.round(state.selectedRegion.width);
        canvas.height = Math.round(state.selectedRegion.height);

        if (state.blurAmount > 0) {
          ctx.filter = `blur(${state.blurAmount}px)`;
        }

        ctx.drawImage(
          mediaSource,
          state.selectedRegion.x, state.selectedRegion.y, state.selectedRegion.width, state.selectedRegion.height,
          0, 0, canvas.width, canvas.height
        );
        ctx.filter = 'none';
      } else {
        // Full frame
        canvas.width = dims.width;
        canvas.height = dims.height;
        ctx.drawImage(mediaSource, 0, 0, canvas.width, canvas.height);
      }

      const useJpeg = canvas.width * canvas.height > 500 * 500;
      const dataUrl = useJpeg
        ? canvas.toDataURL('image/jpeg', 0.92)
        : canvas.toDataURL('image/png');

      await uploadToProvider(dataUrl, true);
    } catch (e) {
      console.error('Save error:', e);
      resetInteractionState();
      showToast('Save failed: ' + e.message, false);
    } finally {
      isUploading = false;
    }
  }

  // Event handlers
  elements.captureBtn.addEventListener('click', captureAndUpload);
  elements.saveAssetBtn.addEventListener('click', saveToAssetsOnly);

  // Export
  window.PXS7Player.capture = {
    captureAndUpload,
    saveToAssetsOnly,
    uploadToProvider,
  };
})();
