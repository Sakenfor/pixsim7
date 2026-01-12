/**
 * Player Capture - Frame capture and upload
 */
(function() {
  'use strict';

  const { elements, state, utils } = window.PXS7Player;
  const { showToast, resetInteractionState } = utils;

  async function captureAndUpload() {
    if (!state.videoLoaded || elements.video.videoWidth === 0) {
      showToast('No video loaded', false);
      return;
    }

    try {
      elements.video.pause();

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (state.selectedRegion && state.selectedRegion.width > 0 && state.selectedRegion.height > 0) {
        canvas.width = Math.round(state.selectedRegion.width);
        canvas.height = Math.round(state.selectedRegion.height);

        if (state.blurAmount > 0) {
          ctx.filter = `blur(${state.blurAmount}px)`;
        }

        ctx.drawImage(
          elements.video,
          state.selectedRegion.x, state.selectedRegion.y, state.selectedRegion.width, state.selectedRegion.height,
          0, 0, canvas.width, canvas.height
        );
        ctx.filter = 'none';

        const blurNote = state.blurAmount > 0 ? ` (blur: ${state.blurAmount}px)` : '';
        showToast(`Uploading region ${canvas.width}×${canvas.height}${blurNote}...`, true);
      } else {
        canvas.width = elements.video.videoWidth;
        canvas.height = elements.video.videoHeight;
        ctx.drawImage(elements.video, 0, 0, canvas.width, canvas.height);
        showToast('Uploading frame...', true);
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
    if (!state.videoLoaded || elements.video.videoWidth === 0) {
      showToast('No video loaded', false);
      return;
    }

    try {
      elements.video.pause();

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (state.selectedRegion && state.selectedRegion.width > 0 && state.selectedRegion.height > 0) {
        canvas.width = Math.round(state.selectedRegion.width);
        canvas.height = Math.round(state.selectedRegion.height);

        if (state.blurAmount > 0) {
          ctx.filter = `blur(${state.blurAmount}px)`;
        }

        ctx.drawImage(
          elements.video,
          state.selectedRegion.x, state.selectedRegion.y, state.selectedRegion.width, state.selectedRegion.height,
          0, 0, canvas.width, canvas.height
        );
        ctx.filter = 'none';
      } else {
        canvas.width = elements.video.videoWidth;
        canvas.height = elements.video.videoHeight;
        ctx.drawImage(elements.video, 0, 0, canvas.width, canvas.height);
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
