/**
 * Player Capture - Frame capture and upload
 * Supports rectangle and polygon regions
 */
(function() {
  'use strict';

  const { elements, state, utils } = window.PXS7Player;
  const { showToast, resetInteractionState, getMediaSource, getMediaDimensions } = utils;

  // Check if we have a polygon region
  function hasPolygonRegion() {
    return state.polygonPoints && state.polygonPoints.length >= 3;
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

  async function captureAndUpload() {
    const dims = getMediaDimensions();
    if (!state.videoLoaded || dims.width === 0) {
      showToast('No media loaded', false);
      return;
    }

    try {
      // Pause video if not in image mode
      if (!state.isImageMode) {
        elements.video.pause();
      }

      const mediaSource = getMediaSource();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Check for polygon region first
      if (hasPolygonRegion()) {
        const bounds = state.selectedRegion; // Already calculated from polygon
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

  async function saveToAssetsOnly() {
    const dims = getMediaDimensions();
    if (!state.videoLoaded || dims.width === 0) {
      showToast('No media loaded', false);
      return;
    }

    try {
      // Pause video if not in image mode
      if (!state.isImageMode) {
        elements.video.pause();
      }

      const mediaSource = getMediaSource();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Check for polygon region first
      if (hasPolygonRegion()) {
        const bounds = state.selectedRegion;
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
