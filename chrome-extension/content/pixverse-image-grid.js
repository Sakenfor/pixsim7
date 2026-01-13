/**
 * Pixverse Image Grid UI
 * Handles grid rendering, hover previews, and slot selection menus
 *
 * Uses: pixverse-grid-metadata.js for metadata popup
 */

(function() {
  'use strict';

  window.PXS7 = window.PXS7 || {};
  const { sendMessageWithTimeout, normalizeUrl, showToast } = window.PXS7.utils || {};
  const { injectImageToUpload, findUploadInputs } = window.PXS7.uploadUtils || {};
  const { COLORS } = window.PXS7.styles || {};
  const { showDeleteAssetDialog } = window.PXS7.dialogs || {};

  // Access metadata module dynamically (loaded before this file)
  const getMetadataModule = () => window.PXS7.gridMetadata || {};

  // Debug mode - controlled by extension settings
  let DEBUG_IMAGE_PICKER = localStorage.getItem('pxs7_debug') === 'true';
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get({ debugImagePicker: false, debugAll: false }, (result) => {
      DEBUG_IMAGE_PICKER = result.debugImagePicker || result.debugAll || DEBUG_IMAGE_PICKER;
    });
  }
  const debugLog = (...args) => DEBUG_IMAGE_PICKER && console.log('[PixSim7]', ...args);

  // Z-index values
  const Z_INDEX_MENU = 10000;
  const Z_INDEX_PREVIEW = 10001;

  // Hover preview state
  let hoverPreview = null;
  let hoverPreviewImg = null;
  let hoverPreviewVideo = null;
  let hoverTimeout = null;
  let lastPreviewUrl = null;
  let lastPreviewIsVideo = false;

  // ===== Utility Functions =====

  function isVideoUrl(url, mediaType = null) {
    if (mediaType === 'VIDEO' || mediaType === 'video') return true;
    if (mediaType === 'IMAGE' || mediaType === 'image') return false;
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.mov') ||
           lower.includes('/video/') || lower.includes('video_url');
  }

  function getPreviewSizeUrl(url, mediaType = null) {
    if (!url) return url;
    if (isVideoUrl(url, mediaType)) return normalizeUrl(url);
    if (url.includes('pixverse') || url.includes('aliyuncs.com')) {
      return normalizeUrl(url) + '?x-oss-process=image/resize,w_400,h_400,m_lfit';
    }
    return url;
  }

  async function loadImageSrc(img, url) {
    if (!url) {
      if (img.onerror) img.dispatchEvent(new Event('error'));
      return false;
    }
    if (url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
      img.src = url;
      return true;
    }
    if (url.startsWith('http://')) {
      debugLog('[HTTP Image] Proxying:', url);
      try {
        const response = await chrome.runtime.sendMessage({ action: 'proxyImage', url });
        if (response && response.success && response.dataUrl) {
          debugLog('[HTTP Image] Proxy success');
          img.src = response.dataUrl;
          return true;
        }
        console.warn('[pxs7] Proxy failed for:', url, response);
        if (img.onerror) img.dispatchEvent(new Event('error'));
        return false;
      } catch (e) {
        console.warn('[pxs7] Image proxy error:', e.message, url);
        if (img.onerror) img.dispatchEvent(new Event('error'));
        return false;
      }
    }
    debugLog('[Image] Direct load (not HTTP):', url.substring(0, 50));
    img.src = url;
    return true;
  }

  // ===== Hover Preview =====

  let hoverPreviewPrompt = null;

  function showHoverPreview(mediaUrl, anchorEl, mediaType = null, itemData = null) {
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      const isVideo = isVideoUrl(mediaUrl, mediaType);
      const previewUrl = getPreviewSizeUrl(mediaUrl, mediaType);

      if (!anchorEl.isConnected) return;

      if (!hoverPreview) {
        hoverPreview = document.createElement('div');
        hoverPreview.style.cssText = `
          position: fixed;
          z-index: ${Z_INDEX_PREVIEW};
          background: ${COLORS.bg};
          border: 2px solid ${COLORS.accent};
          border-radius: 8px;
          padding: 4px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.5);
          pointer-events: none;
          max-width: 320px;
          max-height: 400px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        `;
        hoverPreviewImg = document.createElement('img');
        hoverPreviewImg.style.cssText = `
          max-width: 100%;
          max-height: 260px;
          border-radius: 4px;
          display: block;
          transition: opacity 0.15s ease-out;
          flex-shrink: 0;
        `;
        hoverPreviewVideo = document.createElement('video');
        hoverPreviewVideo.style.cssText = `
          max-width: 100%;
          max-height: 260px;
          border-radius: 4px;
          display: none;
          flex-shrink: 0;
        `;
        hoverPreviewVideo.muted = true;
        hoverPreviewVideo.loop = true;
        hoverPreviewVideo.playsInline = true;

        hoverPreviewPrompt = document.createElement('div');
        hoverPreviewPrompt.style.cssText = `
          margin-top: 8px;
          padding: 6px 8px;
          background: ${COLORS.bgAlt};
          border-radius: 4px;
          font-size: 11px;
          line-height: 1.3;
          color: ${COLORS.textSecondary};
          max-height: 100px;
          overflow-y: auto;
          overflow-x: hidden;
          word-wrap: break-word;
          display: none;
        `;

        hoverPreview.appendChild(hoverPreviewImg);
        hoverPreview.appendChild(hoverPreviewVideo);
        hoverPreview.appendChild(hoverPreviewPrompt);
        document.body.appendChild(hoverPreview);
      }

      if (lastPreviewUrl !== previewUrl || lastPreviewIsVideo !== isVideo) {
        if (isVideo) {
          hoverPreviewImg.style.display = 'none';
          hoverPreviewVideo.style.display = 'block';
          hoverPreviewVideo.src = previewUrl;
          hoverPreviewVideo.play().catch(() => {});
        } else {
          hoverPreviewVideo.style.display = 'none';
          hoverPreviewVideo.pause();
          hoverPreviewVideo.src = '';
          hoverPreviewImg.style.opacity = '0';
          hoverPreviewImg.style.display = 'block';
          hoverPreviewImg.onload = () => { hoverPreviewImg.style.opacity = '1'; };
          loadImageSrc(hoverPreviewImg, previewUrl);
        }
        lastPreviewUrl = previewUrl;
        lastPreviewIsVideo = isVideo;
      }

      // Extract and display prompt if available
      if (hoverPreviewPrompt && itemData) {
        const prompt = itemData.generation?.final_prompt
                    || itemData.media_metadata?.prompt
                    || itemData.media_metadata?.customer_paths?.prompt;

        if (prompt && prompt.trim()) {
          hoverPreviewPrompt.textContent = prompt;
          hoverPreviewPrompt.style.display = 'block';
        } else {
          hoverPreviewPrompt.style.display = 'none';
        }
      } else if (hoverPreviewPrompt) {
        hoverPreviewPrompt.style.display = 'none';
      }

      const rect = anchorEl.getBoundingClientRect();
      const previewWidth = 320;
      let x = rect.left - previewWidth - 12;
      let y = rect.top;

      if (x < 10) x = rect.right + 12;
      y = Math.max(10, Math.min(y, window.innerHeight - 410));

      hoverPreview.style.left = `${x}px`;
      hoverPreview.style.top = `${y}px`;
      hoverPreview.style.display = 'block';
    }, 400);
  }

  function hideHoverPreview() {
    clearTimeout(hoverTimeout);
    if (hoverPreview) {
      hoverPreview.style.display = 'none';
      if (hoverPreviewVideo) hoverPreviewVideo.pause();
    }
  }

  // ===== Grid Styles =====

  let gridStylesInjected = false;
  function injectGridStyles() {
    if (gridStylesInjected) return;
    gridStylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      .pxs7-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; contain: layout style; }
      .pxs7-thumb { position: relative; aspect-ratio: 1; border-radius: 4px; overflow: hidden; cursor: pointer; border: 2px solid ${COLORS.border}; contain: layout style paint; }
      .pxs7-thumb:hover { border-color: ${COLORS.accent}; }
      .pxs7-thumb.pxs7-success { border-color: ${COLORS.success}; }
      .pxs7-thumb.pxs7-loading { opacity: 0.5; pointer-events: none; }
      .pxs7-thumb img { width: 100%; height: 100%; object-fit: cover; }

      .pxs7-asset-btns {
        position: absolute !important;
        top: 4px !important;
        right: 4px !important;
        display: flex !important;
        gap: 4px !important;
        opacity: 0;
        transition: opacity 0.2s ease;
        z-index: 10;
        pointer-events: auto;
      }
      .pxs7-thumb:hover .pxs7-asset-btns { opacity: 1 !important; }

      .pxs7-restore-btn {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        background: ${COLORS.accent};
        color: white;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        transition: all 0.15s ease;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
      .pxs7-restore-btn:hover { background: ${COLORS.accentHover || COLORS.accent}; transform: scale(1.08); }
      .pxs7-restore-btn:active { transform: scale(0.92); }

      .pxs7-upload-badge {
        position: absolute !important;
        top: 4px !important;
        left: 4px !important;
        width: 22px;
        height: 22px;
        border-radius: 4px;
        background: rgba(0,0,0,0.7);
        color: white;
        border: 1px solid ${COLORS.warning || '#f59e0b'};
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        transition: all 0.15s ease;
        z-index: 10;
        opacity: 0.8;
      }
      .pxs7-upload-badge:hover { background: ${COLORS.warning || '#f59e0b'}; opacity: 1; transform: scale(1.1); }
      .pxs7-upload-badge:active { transform: scale(0.9); }
      .pxs7-upload-badge.uploading { animation: pxs7-pulse 1s infinite; pointer-events: none; }
      @keyframes pxs7-pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
    `;
    document.head.appendChild(style);
  }

  // ===== Create Image Grid =====

  function createImageGrid(items, getThumbUrl, getFullUrl = null, getName = null, getFallbackUrl = null, getMediaType = null) {
    injectGridStyles();

    const grid = document.createElement('div');
    grid.className = 'pxs7-grid';
    const itemDataMap = new Map();

    items.forEach((item, index) => {
      const thumbUrl = typeof getThumbUrl === 'function' ? getThumbUrl(item) : item;
      const fullUrl = getFullUrl ? getFullUrl(item) : (typeof item === 'string' ? item : item);
      const name = getName ? getName(item) : null;
      const fallbackUrl = getFallbackUrl ? getFallbackUrl(item) : null;
      const mediaType = getMediaType ? getMediaType(item) : null;

      const thumb = document.createElement('div');
      thumb.className = 'pxs7-thumb';
      thumb.dataset.idx = index;
      if (name) thumb.title = name;

      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';

      if (fallbackUrl && fallbackUrl !== thumbUrl) {
        img.onerror = () => {
          if (!img.dataset.fallbackAttempted) {
            img.dataset.fallbackAttempted = 'true';
            loadImageSrc(img, fallbackUrl);
          }
        };
      }

      loadImageSrc(img, thumbUrl);
      thumb.appendChild(img);

      // Add restore button for assets with ID
      if (item && typeof item === 'object' && item.id) {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'pxs7-asset-btns';

        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'pxs7-restore-btn';
        restoreBtn.innerHTML = '↻';
        restoreBtn.title = 'Restore generation to page';
        restoreBtn.dataset.assetId = item.id;
        restoreBtn.dataset.idx = index;

        btnContainer.appendChild(restoreBtn);
        thumb.appendChild(btnContainer);

        // TODO: Add upload badge for local-only assets once backend provides is_local_only flag
        // For now, detection is unreliable client-side
      }

      itemDataMap.set(index, { thumbUrl, fullUrl, name, mediaType, element: thumb, item });
      grid.appendChild(thumb);
    });

    // Event delegation
    let currentHoverIdx = null;
    let isScrolling = false;
    let scrollTimeout = null;

    grid.addEventListener('mouseenter', (e) => {
      if (isScrolling) return;
      const thumb = e.target.closest('.pxs7-thumb');
      if (!thumb) return;
      const idx = parseInt(thumb.dataset.idx, 10);
      if (isNaN(idx) || currentHoverIdx === idx) return;
      currentHoverIdx = idx;
      const data = itemDataMap.get(idx);
      if (data) showHoverPreview(data.fullUrl || data.thumbUrl, thumb, data.mediaType, data);
    }, true);

    grid.addEventListener('mouseleave', (e) => {
      const thumb = e.target.closest('.pxs7-thumb');
      if (!thumb) return;
      currentHoverIdx = null;
      hideHoverPreview();
    }, true);

    const handleScroll = () => {
      isScrolling = true;
      hideHoverPreview();
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => { isScrolling = false; }, 150);
    };

    const scrollContainer = grid.closest('[style*="overflow"]') || grid.parentElement;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    }
    grid.addEventListener('wheel', handleScroll, { passive: true });

    // Handle restore button clicks
    grid.addEventListener('click', async (e) => {
      if (e.target.classList.contains('pxs7-restore-btn')) {
        e.stopPropagation();
        e.preventDefault();

        const restoreBtn = e.target;
        const assetId = restoreBtn.dataset.assetId;

        // Show loading state
        restoreBtn.innerHTML = '⏳';
        restoreBtn.disabled = true;

        try {
          debugLog('[Restore] Starting restore for asset ID:', assetId);

          // Fetch asset details
          const assetRes = await sendMessageWithTimeout({
            action: 'getAsset',
            assetId: assetId
          }, 5000);

          debugLog('[Restore] Asset response:', assetRes);

          if (!assetRes?.success) {
            throw new Error(assetRes?.error || 'Failed to fetch asset');
          }

          let asset = assetRes.data;
          debugLog('[Restore] Asset data:', asset);
          debugLog('[Restore] source_generation_id:', asset.source_generation_id);

          // Check if asset has a source generation - if not, try to re-sync first
          if (!asset.source_generation_id) {
            debugLog('[Restore] No source_generation_id found, attempting auto re-sync...');
            if (showToast) showToast('No generation data found, syncing...', true);

            try {
              // Call the backend enrich endpoint
              const enrichRes = await sendMessageWithTimeout({
                action: 'enrichAsset',
                assetId: assetId
              }, 10000);

              debugLog('[Restore] Auto re-sync response:', enrichRes);

              if (!enrichRes?.success) {
                throw new Error(enrichRes?.error || 'Failed to re-sync asset');
              }

              const enrichData = enrichRes.data || {};
              debugLog('[Restore] Auto re-sync result:', enrichData);

              // Re-fetch the asset after sync
              const reAssetRes = await sendMessageWithTimeout({
                action: 'getAsset',
                assetId: assetId
              }, 5000);

              if (!reAssetRes?.success) {
                throw new Error(reAssetRes?.error || 'Failed to fetch asset after sync');
              }

              asset = reAssetRes.data;
              debugLog('[Restore] Re-fetched asset after sync:', asset);

              // Check again if we have generation data now
              if (!asset.source_generation_id) {
                debugLog('[Restore] Still no source_generation_id after re-sync');
                if (showToast) showToast('No generation data available even after sync', false);
                return;
              }

              if (showToast) showToast('Synced! Restoring generation...', true);

            } catch (err) {
              console.error('[PixSim7] Auto re-sync failed:', err);
              if (showToast) showToast('Sync failed: ' + err.message, false);
              return;
            }
          }

          // Fetch generation details
          const genRes = await sendMessageWithTimeout({
            action: 'getGeneration',
            generationId: asset.source_generation_id
          }, 5000);

          debugLog('[Restore] Generation response:', genRes);

          if (!genRes?.success) {
            throw new Error(genRes?.error || 'Failed to fetch generation');
          }

          const generation = genRes.data;
          debugLog('[Restore] Generation data:', generation);
          debugLog('[Restore] Generation inputs:', generation.inputs);
          debugLog('[Restore] Generation final_prompt:', generation.final_prompt);

          // Extract source images from generation inputs with slot indices
          const sourceImages = [];
          if (generation.inputs && Array.isArray(generation.inputs)) {
            debugLog('[Restore] Processing', generation.inputs.length, 'inputs');
            for (let slotIndex = 0; slotIndex < generation.inputs.length; slotIndex++) {
              const input = generation.inputs[slotIndex];
              debugLog('[Restore] Processing input at slot', slotIndex, ':', input);

              let url = null;

              // Check for direct URL first
              if (input.url) {
                debugLog('[Restore] Found direct URL:', input.url);
                url = input.url;
              } else {
                // Parse asset reference - can be "asset:123" string or asset_id number
                let assetId = null;
                if (input.asset && typeof input.asset === 'string' && input.asset.startsWith('asset:')) {
                  assetId = input.asset.replace('asset:', '');
                  debugLog('[Restore] Parsed asset reference:', input.asset, '->', assetId);
                } else if (input.asset_id) {
                  assetId = input.asset_id;
                }

                if (assetId) {
                  debugLog('[Restore] Fetching source asset:', assetId);
                  // Fetch the source asset to get its URL
                  const sourceAssetRes = await sendMessageWithTimeout({
                    action: 'getAsset',
                    assetId: assetId
                  }, 5000);
                  debugLog('[Restore] Source asset response:', sourceAssetRes);
                  if (sourceAssetRes?.success && sourceAssetRes.data) {
                    // Use HTTPS-aware URL selection to avoid mixed content errors
                    const a = sourceAssetRes.data;
                    const isHttpsPage = window.location.protocol === 'https:';

                    if (isHttpsPage) {
                      // On HTTPS pages: prefer HTTPS URLs to avoid mixed content
                      url = (a.remote_url?.startsWith('https://') ? a.remote_url :
                             a.external_url?.startsWith('https://') ? a.external_url :
                             a.file_url?.startsWith('https://') ? a.file_url :
                             a.url?.startsWith('https://') ? a.url :
                             // Fallback to any URL (will be proxied if HTTP)
                             a.file_url || a.url || a.src || a.thumbnail_url || a.remote_url || a.external_url);
                    } else {
                      // On HTTP pages: prefer backend URLs for better control
                      url = a.file_url || a.url || a.src || a.thumbnail_url || a.remote_url || a.external_url;
                    }
                    debugLog('[Restore] Extracted URL from source asset:', url);
                  }
                }
              }

              if (url) {
                // Include slot index for position-aware restoration
                sourceImages.push({ url, slot: slotIndex });
              }
            }
          } else {
            debugLog('[Restore] No inputs found or inputs is not an array');
          }

          debugLog('[Restore] Total source images to inject:', sourceImages.length, sourceImages);

          // Inject source images using shared restore function
          let restoreResult = { success: 0, failed: [] };
          if (sourceImages.length > 0) {
            const { restoreAllImages } = window.PXS7.uploadUtils || {};
            if (restoreAllImages) {
              restoreResult = await restoreAllImages(sourceImages);
            } else {
              debugLog('[Restore] restoreAllImages not available, falling back to simple inject');
              for (const url of sourceImages) {
                await injectImageToUpload(url);
                await new Promise(r => setTimeout(r, 800));
              }
              restoreResult.success = sourceImages.length;
            }
          } else {
            debugLog('[Restore] No source images to inject');
          }

          // Fill prompt textarea if final_prompt exists
          if (generation.final_prompt) {
            debugLog('[Restore] Looking for prompt textarea...');
            const promptTextarea = document.querySelector('textarea[placeholder*="prompt" i], textarea[placeholder*="describe" i]');
            debugLog('[Restore] Found textarea:', promptTextarea);
            if (promptTextarea) {
              debugLog('[Restore] Setting prompt value:', generation.final_prompt);
              promptTextarea.value = generation.final_prompt;
              promptTextarea.dispatchEvent(new Event('input', { bubbles: true }));
              promptTextarea.dispatchEvent(new Event('change', { bubbles: true }));
              debugLog('[Restore] Prompt set and events dispatched');
            } else {
              debugLog('[Restore] No prompt textarea found on page');
            }
          } else {
            debugLog('[Restore] No final_prompt in generation data');
          }

          // Success feedback
          if (showToast) {
            const imgCount = restoreResult.success;
            const hasPrompt = !!generation.final_prompt;
            let msg = '';
            if (imgCount > 0 && hasPrompt) {
              msg = `Restored ${imgCount} image(s) and prompt`;
            } else if (imgCount > 0) {
              msg = `Restored ${imgCount} image(s)`;
            } else if (hasPrompt) {
              msg = 'Restored prompt';
            } else {
              msg = 'Nothing to restore';
            }
            if (restoreResult.failed.length > 0) {
              msg += ` (${restoreResult.failed.length} failed)`;
            }
            showToast(msg, restoreResult.failed.length === 0);
          }

          debugLog('[Restore] Restore completed successfully');

        } catch (err) {
          console.error('[PixSim7] Failed to restore generation:', err);
          if (showToast) showToast('Failed to restore generation', false);
        } finally {
          // Restore button state
          restoreBtn.innerHTML = '↻';
          restoreBtn.disabled = false;
        }

        return;
      }

      // Handle upload badge clicks (upload local-only asset to Pixverse)
      if (e.target.classList.contains('pxs7-upload-badge')) {
        e.stopPropagation();
        e.preventDefault();

        const badge = e.target;
        const assetId = badge.dataset.assetId;
        const idx = parseInt(badge.dataset.idx, 10);
        const data = itemDataMap.get(idx);

        if (!assetId || !data) return;

        // Show loading state
        badge.classList.add('uploading');
        badge.innerHTML = '⏳';

        try {
          debugLog('[Upload] Uploading local asset to Pixverse:', assetId);
          if (showToast) showToast('Uploading to Pixverse...', true);

          // Get the file URL to upload
          const fileUrl = data.fullUrl || data.thumbUrl;

          // Call backend to re-upload to provider
          const response = await sendMessageWithTimeout({
            action: 'uploadMediaFromUrl',
            mediaUrl: fileUrl,
            providerId: 'pixverse',
            ensureAsset: false, // Only succeed if provider upload works
          }, 30000);

          if (response?.success && response?.providerSucceeded !== false) {
            debugLog('[Upload] Provider upload succeeded');
            if (showToast) showToast('Uploaded to Pixverse!', true);
            // Remove badge on success
            badge.remove();
          } else {
            throw new Error(response?.error || 'Provider upload failed');
          }
        } catch (err) {
          console.error('[PixSim7] Failed to upload to provider:', err);
          if (showToast) showToast('Upload failed: ' + err.message, false);
          badge.classList.remove('uploading');
          badge.innerHTML = '☁️';
        }

        return;
      }

      // Handle left-click on thumbnail (not buttons) - inject to first empty slot
      const thumb = e.target.closest('.pxs7-thumb');
      if (thumb && !e.target.closest('.pxs7-asset-btns') && !e.target.closest('.pxs7-upload-badge')) {
        const idx = parseInt(thumb.dataset.idx, 10);
        const data = itemDataMap.get(idx);
        if (data && data.fullUrl) {
          e.stopPropagation();

          // Find first empty slot
          const slots = findUploadInputs().filter(u => u.priority >= 10);
          const emptySlotIndex = slots.findIndex(s => !s.hasImage);

          if (emptySlotIndex >= 0) {
            debugLog('[Click] Injecting to first empty slot:', emptySlotIndex);
            injectImageToUpload(data.fullUrl, null, emptySlotIndex, slots[emptySlotIndex].containerId);
          } else if (slots.length > 0) {
            // No empty slots - show context menu to let user choose
            debugLog('[Click] No empty slots, showing menu');
            showUploadSlotMenu(data.fullUrl, e.clientX, e.clientY, slots, {
              ...data,
              ...data.item,
              assetId: data.item?.id || data.item?.asset_id,
            });
          } else {
            if (showToast) showToast('No upload slots available', false);
          }
        }
      }
    }, true); // Capture phase to handle before other click listeners

    // Right-click context menu for slot selection and restore
    // Ctrl+Right-click for instant delete (DB + Provider) without confirmation
    grid.addEventListener('contextmenu', async (e) => {
      const thumb = e.target.closest('.pxs7-thumb');
      if (!thumb) return;
      e.preventDefault();
      const idx = parseInt(thumb.dataset.idx, 10);
      const data = itemDataMap.get(idx);
      if (!data) return;

      // Merge item data with wrapper data for easier access
      const assetData = {
        ...data,
        ...data.item,
        assetId: data.item?.id || data.item?.asset_id,
        element: thumb,
      };

      // Ctrl+Right-click: Delete immediately without confirmation
      if (e.ctrlKey && assetData.assetId) {
        if (showToast) showToast('Deleting asset (DB + Provider)...', true);

        try {
          console.log('[Delete] Ctrl+Right-click delete for asset ID:', assetData.assetId, 'type:', typeof assetData.assetId);

          const deleteRes = await sendMessageWithTimeout({
            action: 'deleteAsset',
            assetId: assetData.assetId,
            deleteFromProvider: true  // Always delete from both on Ctrl+click
          }, 10000);

          console.log('[Delete] Delete response:', deleteRes);
          console.log('[Delete] Response data:', JSON.stringify(deleteRes?.data, null, 2));

          if (!deleteRes?.success) {
            console.error('[Delete] Delete failed:', deleteRes?.error);
            throw new Error(deleteRes?.error || 'Failed to delete asset');
          }

          const data = deleteRes?.data;
          console.log('[Delete] Delete successful, deleted_count:', data?.deleted_count);

          // Check for errors in the response
          if (data?.errors && data.errors.length > 0) {
            console.error('[Delete] Backend reported errors:', data.errors);
            throw new Error(`Delete failed: ${data.errors[0].error}`);
          }

          if (data?.deleted_count === 0) {
            console.error('[Delete] No assets were deleted!');
            throw new Error('Asset was not deleted (deleted_count = 0)');
          }

          // Show success feedback
          if (showToast) {
            showToast('Asset deleted from DB + Provider!', true);
          }

          // Remove the thumbnail from UI with animation
          thumb.style.transition = 'all 0.2s ease-out';
          thumb.style.opacity = '0';
          thumb.style.transform = 'scale(0.8)';
          setTimeout(() => thumb.remove(), 200);

        } catch (err) {
          console.error('[PixSim7] Failed to delete asset:', err);
          if (showToast) showToast('Failed to delete: ' + err.message, false);
        }
        return;
      }

      // Normal right-click: Show context menu
      showUploadSlotMenu(data.fullUrl, e.clientX, e.clientY, null, assetData);
    });

    return { grid, itemDataMap };
  }

  // ===== Metadata Popup =====
  // Delegated to pixverse-grid-metadata.js module
  function showMetadataPopup(assetData, x, y) {
    const metadataModule = getMetadataModule();
    // Wire up the loadImageSrc dependency
    if (metadataModule.setLoadImageSrc) {
      metadataModule.setLoadImageSrc(loadImageSrc);
    }
    // Call the module
    if (metadataModule.showMetadataPopup) {
      metadataModule.showMetadataPopup(assetData, x, y);
    } else {
      console.warn('[PixSim7] Metadata module not loaded');
    }
  }

  // ===== Upload Slot Menu =====

  function showUploadSlotMenu(imageUrl, x, y, slotsToShow = null, assetData = null) {
    document.querySelectorAll('.pxs7-upload-slot-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = 'pxs7-upload-slot-menu';
    menu.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      z-index: ${Z_INDEX_MENU};
      background: ${COLORS.bg};
      border: 1px solid ${COLORS.border};
      border-radius: 6px;
      padding: 4px 0;
      min-width: 160px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;

    // Helper to create menu item button
    const createMenuButton = (label, icon, onClick) => {
      const item = document.createElement('button');
      item.style.cssText = `
        width: 100%;
        padding: 6px 12px;
        font-size: 11px;
        text-align: left;
        background: transparent;
        border: none;
        color: ${COLORS.text};
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
      `;
      item.innerHTML = `<span style="opacity:0.6">${icon}</span><span>${label}</span>`;
      item.addEventListener('mouseenter', () => { item.style.background = COLORS.hover; });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
      item.addEventListener('click', () => { menu.remove(); onClick(); });
      return item;
    };

    // Helper to create divider
    const createDivider = () => {
      const div = document.createElement('div');
      div.style.cssText = `height: 1px; background: ${COLORS.border}; margin: 4px 0;`;
      return div;
    };

    const slots = slotsToShow || findUploadInputs().filter(u => u.priority >= 10);
    debugLog('[Slots] Menu slots:', slots.length);

    // === SECTION 1: INSERTION ===
    // Upload slots section
    if (slots.length > 0) {
      const header = document.createElement('div');
      header.style.cssText = `padding: 6px 12px 4px; font-size: 10px; color: ${COLORS.textMuted};`;
      header.textContent = 'Insert to slot';
      menu.appendChild(header);

      const slotCount = Math.min(slots.length, 7);
      for (let i = 0; i < slotCount; i++) {
        const slotInfo = slots[i];
        let slotName = `Slot ${i + 1}`;
        // Strip #N suffix from containerId for comparison
        const containerId = (slotInfo?.containerId || '').replace(/#\d+$/, '');
        if (containerId.includes('image_text')) slotName = 'Image';
        else if (containerId.includes('create_image')) slotName = 'Image';
        else if (containerId.startsWith('transition') || containerId.includes('transition')) slotName = `Image ${i + 1}`;
        else if (containerId.startsWith('fusion') || containerId.includes('fusion')) slotName = `Image ${i + 1}`;
        else if (containerId.startsWith('extend') || containerId.includes('extend')) slotName = 'Extend Image';
        else if (containerId.includes('edit')) slotName = 'Edit';

        const item = createMenuButton(slotName, i + 1, async () => {
          debugLog('[Slots] Menu click: index=' + i + ', containerId=' + slotInfo.containerId);
          await injectImageToUpload(imageUrl, null, i, slotInfo.containerId);
        });
        item.title = `Insert to ${slotName}`;
        menu.appendChild(item);
      }
    }

    // Add new slot option
    menu.appendChild(createMenuButton('Add New Slot', '+', async () => {
      // Find the "add slot" button using multiple approaches
      let addBtn = null;

      // Approach 1: Try multiple known SVG path patterns for + icons (using partial match)
      const plusPathPrefixes = [
        'M8 2v6',      // Pixverse transition + button (starts with this)
        'M12 4v16',    // Alternative + icon
        'M12 5v14',    // Another + variant
        'M6 12h12',    // Simple + path
      ];
      for (const prefix of plusPathPrefixes) {
        // Use partial match with ^= (starts with) since exact match can fail with whitespace
        const svg = document.querySelector(`svg path[d^="${prefix}"]`);
        if (svg) {
          // Find clickable parent - go up to the cursor-pointer div
          addBtn = svg.closest('div.cursor-pointer') ||
                   svg.closest('div[class*="cursor-pointer"]') ||
                   svg.closest('button') ||
                   svg.parentElement?.closest('div.cursor-pointer') ||
                   svg.parentElement?.parentElement;
          if (addBtn && addBtn.offsetParent !== null) {
            debugLog('[AddSlot] Found + button via SVG path prefix:', prefix);
            break;
          }
        }
      }

      // Approach 2: Look for elements with + text content near upload areas
      if (!addBtn) {
        const uploadArea = document.querySelector('[class*="transition"], [class*="fusion"]')?.parentElement;
        if (uploadArea) {
          const candidates = uploadArea.querySelectorAll('div[class*="opacity"], div[class*="cursor-pointer"]');
          for (const el of candidates) {
            if (el.querySelector('svg') && el.offsetParent !== null) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0 && rect.width < 100) {
                addBtn = el;
                debugLog('[AddSlot] Found + button via upload area sibling');
                break;
              }
            }
          }
        }
      }

      // Approach 3: Generic button/div search
      if (!addBtn) {
        const addButtons = document.querySelectorAll('button, div[role="button"]');
        for (const btn of addButtons) {
          const text = btn.textContent?.toLowerCase() || '';
          const hasPlus = btn.innerHTML?.includes('+') ||
                          (text.includes('add') && text.includes('image'));
          if (hasPlus && btn.offsetParent !== null) {
            addBtn = btn;
            debugLog('[AddSlot] Found + button via text content');
            break;
          }
        }
      }

      // Approach 4: Class-based selectors
      if (!addBtn) {
        addBtn = document.querySelector('[class*="add-image"], [class*="addImage"], [data-testid*="add"]');
        if (addBtn) debugLog('[AddSlot] Found + button via class selector');
      }

      if (addBtn) {
        addBtn.click();
        // Wait a moment then inject the image to the new slot
        setTimeout(async () => {
          await injectImageToUpload(imageUrl);
        }, 300);
      } else {
        debugLog('[AddSlot] Could not find add slot button');
        if (showToast) showToast('Could not find add slot button', false);
      }
    }));

    // === SECTION 2: INFORMATION ===
    if (assetData) {
      menu.appendChild(createDivider());

      // Show metadata option
      menu.appendChild(createMenuButton('Show Details', 'ℹ️', () => {
        showMetadataPopup(assetData, x, y);
      }));
    }

    // === SECTION 3: GENERATION/RESTORE ===
    if (assetData && (assetData.assetId || assetData.asset_id)) {
      menu.appendChild(createDivider());

      const assetId = assetData.assetId || assetData.asset_id;

      // Restore Generation option
      menu.appendChild(createMenuButton('Restore Generation', '↻', async () => {
          // Find and click the restore button for this asset, or trigger restore directly
          const restoreBtn = document.querySelector(`.pxs7-restore-btn[data-asset-id="${assetId}"]`);
          if (restoreBtn) {
            restoreBtn.click();
          } else {
            // Trigger restore directly via event
            const event = new CustomEvent('pxs7-restore-generation', { detail: { assetId } });
            document.dispatchEvent(event);
            if (showToast) showToast('Restoring generation...', true);
          }
        }));

        // Use Prompt option
        menu.appendChild(createMenuButton('Use Prompt', '📝', async () => {
          if (showToast) showToast('Loading prompt...', true);

          try {
            debugLog('[Use Prompt] Fetching asset for ID:', assetId);

            // Fetch asset details
            const assetRes = await sendMessageWithTimeout({
              action: 'getAsset',
              assetId: assetId
            }, 5000);

            if (!assetRes?.success) {
              throw new Error(assetRes?.error || 'Failed to fetch asset');
            }

            let asset = assetRes.data;
            let prompt = null;

            // Try to get prompt from asset's generation
            if (asset.source_generation_id) {
              const genRes = await sendMessageWithTimeout({
                action: 'getGeneration',
                generationId: asset.source_generation_id
              }, 5000);

              if (genRes?.success && genRes.data) {
                prompt = genRes.data.final_prompt;
                debugLog('[Use Prompt] Got prompt from generation:', prompt);
              }
            }

            // Fallback to asset metadata if no generation
            if (!prompt) {
              prompt = asset.media_metadata?.prompt
                    || asset.media_metadata?.customer_paths?.prompt;
              debugLog('[Use Prompt] Got prompt from asset metadata:', prompt);
            }

            if (!prompt) {
              if (showToast) showToast('No prompt found for this asset', false);
              return;
            }

            // Fill prompt textarea
            const promptTextarea = document.querySelector('textarea[placeholder*="prompt" i], textarea[placeholder*="describe" i]');
            if (promptTextarea) {
              promptTextarea.value = prompt;
              promptTextarea.dispatchEvent(new Event('input', { bubbles: true }));
              promptTextarea.dispatchEvent(new Event('change', { bubbles: true }));
              if (showToast) showToast('Prompt filled!', true);
              debugLog('[Use Prompt] Prompt set successfully');
            } else {
              if (showToast) showToast('No prompt textarea found on page', false);
              debugLog('[Use Prompt] No prompt textarea found');
            }

          } catch (err) {
            console.error('[PixSim7] Failed to load prompt:', err);
            if (showToast) showToast('Failed to load prompt: ' + err.message, false);
          }
        }));
    }

    // === SECTION 4: ASSET TOOLS ===
    if (assetData && (assetData.assetId || assetData.asset_id)) {
      menu.appendChild(createDivider());

      const assetId = assetData.assetId || assetData.asset_id;

      // Re-sync Asset option
      menu.appendChild(createMenuButton('Re-sync Asset', '🔄', async () => {
        if (showToast) showToast('Re-syncing asset...', true);

        try {
          debugLog('[Re-sync] Starting re-sync for asset ID:', assetId);

          // Call the backend enrich endpoint
          const enrichRes = await sendMessageWithTimeout({
            action: 'enrichAsset',
            assetId: assetId
          }, 10000);

          debugLog('[Re-sync] Enrich response:', enrichRes);

          if (!enrichRes?.success) {
            throw new Error(enrichRes?.error || 'Failed to re-sync asset');
          }

          const data = enrichRes.data || {};
          debugLog('[Re-sync] Enrich result:', data);

          // Show success feedback
          if (showToast) {
            if (data.enriched) {
              showToast('Asset re-synced successfully!', true);
            } else {
              showToast(data.message || 'Asset already synced', true);
            }
          }

        } catch (err) {
          console.error('[PixSim7] Failed to re-sync asset:', err);
          if (showToast) showToast('Failed to re-sync: ' + err.message, false);
        }
      }));
    }

    // Copy URL option (available for all items with imageUrl)
    if (assetData) {
      menu.appendChild(createMenuButton('Copy URL', '📋', async () => {
        await navigator.clipboard.writeText(imageUrl);
        if (showToast) showToast('URL copied', true);
      }));
    }

    // === SECTION 5: DELETE ===
    if (assetData && (assetData.assetId || assetData.asset_id)) {
      menu.appendChild(createDivider());

      const assetId = assetData.assetId || assetData.asset_id;

      // Delete Asset option
      menu.appendChild(createMenuButton('Delete Asset', '🗑️', () => {
        // Show confirmation dialog using shared dialogs module
        if (showDeleteAssetDialog) {
          showDeleteAssetDialog(assetData, x, y, async (deleteFromProvider) => {
          if (showToast) showToast('Deleting asset...', true);

          try {
            console.log('[Delete] Starting delete for asset ID:', assetId, 'type:', typeof assetId, 'deleteFromProvider:', deleteFromProvider);

            const deleteRes = await sendMessageWithTimeout({
              action: 'deleteAsset',
              assetId: assetId,
              deleteFromProvider: deleteFromProvider
            }, 10000);

            console.log('[Delete] Delete response:', deleteRes);
            console.log('[Delete] Response data:', JSON.stringify(deleteRes?.data, null, 2));

            if (!deleteRes?.success) {
              console.error('[Delete] Delete failed:', deleteRes?.error);
              throw new Error(deleteRes?.error || 'Failed to delete asset');
            }

            const data = deleteRes?.data;
            console.log('[Delete] Delete successful, deleted_count:', data?.deleted_count);

            // Check for errors in the response
            if (data?.errors && data.errors.length > 0) {
              console.error('[Delete] Backend reported errors:', data.errors);
              throw new Error(`Delete failed: ${data.errors[0].error}`);
            }

            if (data?.deleted_count === 0) {
              console.error('[Delete] No assets were deleted!');
              throw new Error('Asset was not deleted (deleted_count = 0)');
            }

            // Show success feedback
            if (showToast) {
              const location = deleteFromProvider ? 'DB + Provider' : 'DB only';
              showToast(`Asset deleted from ${location}!`, true);
            }

            // Remove the thumbnail from UI
            const thumb = document.querySelector(`.pxs7-thumb[data-idx="${assetData.element?.dataset?.idx}"]`);
            if (thumb) {
              thumb.style.opacity = '0';
              thumb.style.transform = 'scale(0.8)';
              setTimeout(() => thumb.remove(), 200);
            }

          } catch (err) {
            console.error('[PixSim7] Failed to delete asset:', err);
            if (showToast) showToast('Failed to delete: ' + err.message, false);
          }
        });
        } else {
          console.warn('[PixSim7] Dialogs module not loaded');
          if (showToast) showToast('Dialog module not available', false);
        }
      }));
    }

    // Show empty state if nothing to show
    if (slots.length === 0 && !assetData) {
      const item = document.createElement('div');
      item.style.cssText = `padding: 8px 12px; font-size: 11px; color: ${COLORS.textMuted}; text-align: center;`;
      item.textContent = 'No upload slots found';
      menu.appendChild(item);
    }

    document.body.appendChild(menu);

    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);

    setTimeout(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth - 10) {
        menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
      }
      if (rect.bottom > window.innerHeight - 10) {
        menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
      }
    }, 0);
  }

  // Export to global scope
  window.PXS7.imageGrid = {
    createImageGrid,
    showUploadSlotMenu,
    showMetadataPopup,
    showHoverPreview,
    hideHoverPreview,
    loadImageSrc  // Export for reuse in other modules
  };

})();
