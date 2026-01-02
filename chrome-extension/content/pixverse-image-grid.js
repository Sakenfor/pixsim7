/**
 * Pixverse Image Grid UI
 * Handles grid rendering, hover previews, and slot selection menus
 */

(function() {
  'use strict';

  window.PXS7 = window.PXS7 || {};
  const { sendMessageWithTimeout, normalizeUrl, showToast } = window.PXS7.utils || {};
  const { injectImageToUpload, findUploadInputs } = window.PXS7.uploadUtils || {};
  const { COLORS } = window.PXS7.styles || {};

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
      try {
        const response = await chrome.runtime.sendMessage({ action: 'proxyImage', url });
        if (response && response.success && response.dataUrl) {
          img.src = response.dataUrl;
          return true;
        }
        if (img.onerror) img.dispatchEvent(new Event('error'));
        return false;
      } catch (e) {
        console.warn('[pxs7] Image proxy error:', e.message, url);
        if (img.onerror) img.dispatchEvent(new Event('error'));
        return false;
      }
    }
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

      .pxs7-restore-btn, .pxs7-resync-btn {
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
      .pxs7-resync-btn {
        background: #6366f1;
        font-size: 13px;
      }
      .pxs7-restore-btn:hover { background: ${COLORS.accentHover || COLORS.accent}; transform: scale(1.08); }
      .pxs7-restore-btn:active { transform: scale(0.92); }
      .pxs7-resync-btn:hover { background: #4f46e5; transform: scale(1.08); }
      .pxs7-resync-btn:active { transform: scale(0.92); }
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

      // Add restore and re-sync buttons for assets with ID
      if (item && typeof item === 'object' && item.id) {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'pxs7-asset-btns';

        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'pxs7-restore-btn';
        restoreBtn.innerHTML = '↻';
        restoreBtn.title = 'Restore generation to page';
        restoreBtn.dataset.assetId = item.id;
        restoreBtn.dataset.idx = index;

        const resyncBtn = document.createElement('button');
        resyncBtn.className = 'pxs7-resync-btn';
        resyncBtn.innerHTML = '🔄';
        resyncBtn.title = 'Re-sync asset metadata and generation';
        resyncBtn.dataset.assetId = item.id;
        resyncBtn.dataset.idx = index;

        btnContainer.appendChild(resyncBtn);
        btnContainer.appendChild(restoreBtn);
        thumb.appendChild(btnContainer);
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

          const asset = assetRes.data;
          debugLog('[Restore] Asset data:', asset);
          debugLog('[Restore] source_generation_id:', asset.source_generation_id);

          // Check if asset has a source generation
          if (!asset.source_generation_id) {
            debugLog('[Restore] No source_generation_id found');
            if (showToast) showToast('No generation data available', false);
            return;
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

          // Extract source images from generation inputs
          const sourceImages = [];
          if (generation.inputs && Array.isArray(generation.inputs)) {
            debugLog('[Restore] Processing', generation.inputs.length, 'inputs');
            for (const input of generation.inputs) {
              debugLog('[Restore] Processing input:', input);

              // Check for direct URL first
              if (input.url) {
                debugLog('[Restore] Found direct URL:', input.url);
                sourceImages.push(input.url);
                continue;
              }

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
                  const url = sourceAssetRes.data.remote_url ||
                              sourceAssetRes.data.file_url ||
                              sourceAssetRes.data.preview_url;
                  debugLog('[Restore] Extracted URL from source asset:', url);
                  if (url) sourceImages.push(url);
                }
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

      // Handle re-sync button clicks
      if (e.target.classList.contains('pxs7-resync-btn')) {
        e.stopPropagation();
        e.preventDefault();

        const resyncBtn = e.target;
        const assetId = resyncBtn.dataset.assetId;

        // Show loading state
        resyncBtn.innerHTML = '⏳';
        resyncBtn.disabled = true;

        console.log('[PixSim7 Re-sync] Starting re-sync for asset ID:', assetId);

        (async () => {
          try {
            // Call the backend enrich endpoint
            const enrichRes = await sendMessageWithTimeout({
              action: 'enrichAsset',
              assetId: assetId
            }, 10000);

            console.log('[PixSim7 Re-sync] Enrich response:', enrichRes);

            if (!enrichRes?.success) {
              throw new Error(enrichRes?.error || 'Failed to re-sync asset');
            }

            const data = enrichRes.data || {};
            console.log('[PixSim7 Re-sync] Enrich result:', data);

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
          } finally {
            // Restore button state
            resyncBtn.innerHTML = '🔄';
            resyncBtn.disabled = false;
          }
        })();

        return;
      }

      // Handle left-click on thumbnail (not buttons) - inject to first empty slot
      const thumb = e.target.closest('.pxs7-thumb');
      if (thumb && !e.target.closest('.pxs7-asset-btns')) {
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
    grid.addEventListener('contextmenu', (e) => {
      const thumb = e.target.closest('.pxs7-thumb');
      if (!thumb) return;
      e.preventDefault();
      const idx = parseInt(thumb.dataset.idx, 10);
      const data = itemDataMap.get(idx);
      if (data) {
        // Merge item data with wrapper data for easier access
        const assetData = {
          ...data,
          ...data.item,
          assetId: data.item?.id || data.item?.asset_id,
        };
        showUploadSlotMenu(data.fullUrl, e.clientX, e.clientY, null, assetData);
      }
    });

    return { grid, itemDataMap };
  }

  // ===== Metadata Popup =====

  function showMetadataPopup(assetData, x, y) {
    // Remove any existing popup
    document.querySelectorAll('.pxs7-metadata-popup').forEach(p => p.remove());

    debugLog('Metadata popup data:', assetData);

    const popup = document.createElement('div');
    popup.className = 'pxs7-metadata-popup';
    popup.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      z-index: ${Z_INDEX_PREVIEW + 1};
      background: ${COLORS.bg};
      border: 1px solid ${COLORS.border};
      border-radius: 8px;
      padding: 12px;
      min-width: 280px;
      max-width: 400px;
      max-height: 500px;
      overflow-y: auto;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 11px;
      color: ${COLORS.text};
    `;

    // Header with close button
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid ${COLORS.border};
    `;
    header.innerHTML = `
      <span style="font-weight: 600; font-size: 12px;">Asset Details</span>
      <button style="background: none; border: none; color: ${COLORS.textMuted}; cursor: pointer; font-size: 16px; padding: 0 4px;">×</button>
    `;
    header.querySelector('button').onclick = () => popup.remove();
    popup.appendChild(header);

    // Content container for loading/replacing
    const content = document.createElement('div');
    popup.appendChild(content);

    // Helper to add a field
    const addField = (container, label, value, copyable = false) => {
      if (!value) return;
      const row = document.createElement('div');
      row.style.cssText = `margin-bottom: 8px;`;

      const labelEl = document.createElement('div');
      labelEl.style.cssText = `font-size: 10px; color: ${COLORS.textMuted}; margin-bottom: 2px;`;
      labelEl.textContent = label;
      row.appendChild(labelEl);

      const valueEl = document.createElement('div');
      valueEl.style.cssText = `
        word-break: break-word;
        ${copyable ? 'cursor: pointer;' : ''}
        ${typeof value === 'string' && value.length > 100 ? 'max-height: 80px; overflow-y: auto; padding-right: 4px;' : ''}
      `;
      valueEl.textContent = typeof value === 'object' ? JSON.stringify(value, null, 2) : value;

      if (copyable) {
        valueEl.title = 'Click to copy';
        valueEl.addEventListener('click', async () => {
          await navigator.clipboard.writeText(String(value));
          if (showToast) showToast('Copied!', true);
        });
        valueEl.addEventListener('mouseenter', () => { valueEl.style.background = COLORS.hover; });
        valueEl.addEventListener('mouseleave', () => { valueEl.style.background = 'transparent'; });
      }
      row.appendChild(valueEl);
      container.appendChild(row);
    };

    // Render metadata from data object
    const renderMetadata = (container, data, generation = null) => {
      container.innerHTML = '';

      const prompt = generation?.final_prompt
                  || data.generation?.final_prompt
                  || data.media_metadata?.prompt
                  || data.media_metadata?.customer_paths?.prompt;
      const model = generation?.canonical_params?.model
                 || data.generation?.canonical_params?.model
                 || data.media_metadata?.model;
      const aspectRatio = generation?.canonical_params?.aspect_ratio
                       || data.generation?.canonical_params?.aspect_ratio
                       || data.media_metadata?.aspect_ratio;
      const createdAt = data.created_at || data.createdAt;
      const assetId = data.assetId || data.asset_id || data.id;
      const providerAssetId = data.provider_asset_id || data.pixverse_id;
      const sourceGenId = data.source_generation_id || generation?.id;

      addField(container, 'Prompt', prompt, true);
      addField(container, 'Model', model);
      addField(container, 'Aspect Ratio', aspectRatio);
      addField(container, 'Created', createdAt ? new Date(createdAt).toLocaleString() : null);
      addField(container, 'Asset ID', assetId, true);
      addField(container, 'Provider Asset ID', providerAssetId, true);
      addField(container, 'Generation ID', sourceGenId, true);

      // Source images if available
      const inputs = generation?.inputs || data.generation?.inputs;
      if (inputs && inputs.length > 0) {
        const inputsLabel = document.createElement('div');
        inputsLabel.style.cssText = `font-size: 10px; color: ${COLORS.textMuted}; margin: 10px 0 4px;`;
        inputsLabel.textContent = `Source Images (${inputs.length})`;
        container.appendChild(inputsLabel);

        inputs.forEach((input, i) => {
          // Parse asset reference to get ID for fetching
          let assetRef = null;
          if (input.asset && typeof input.asset === 'string' && input.asset.startsWith('asset:')) {
            assetRef = input.asset.replace('asset:', '');
          }

          const imgRow = document.createElement('div');
          imgRow.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px;
            margin-bottom: 4px;
            background: ${COLORS.bgAlt};
            border-radius: 4px;
            cursor: pointer;
          `;

          // Show placeholder initially if we have asset ref but no URL
          const url = input.url || input.thumbnail_url;
          if (url) {
            imgRow.innerHTML = `
              <img src="${url}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 3px;">
              <span style="font-size: 10px; color: ${COLORS.textMuted}; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${input.role || `Input ${i + 1}`}</span>
            `;
            imgRow.title = 'Click to copy URL';
            imgRow.onclick = async () => {
              await navigator.clipboard.writeText(url);
              if (showToast) showToast('URL copied', true);
            };
          } else if (assetRef) {
            imgRow.innerHTML = `
              <div style="width: 32px; height: 32px; background: ${COLORS.hover}; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 10px;">⏳</div>
              <span style="font-size: 10px; color: ${COLORS.textMuted}; flex: 1;">${input.role || `Input ${i + 1}`} (asset:${assetRef})</span>
            `;
            // Fetch asset to get URL
            (async () => {
              try {
                const assetRes = await sendMessageWithTimeout({ action: 'getAsset', assetId: assetRef }, 5000);
                if (assetRes?.success && assetRes.data) {
                  const fetchedUrl = assetRes.data.remote_url || assetRes.data.file_url || assetRes.data.preview_url;
                  if (fetchedUrl) {
                    imgRow.innerHTML = `
                      <img src="${fetchedUrl}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 3px;">
                      <span style="font-size: 10px; color: ${COLORS.textMuted}; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${input.role || `Input ${i + 1}`}</span>
                    `;
                    imgRow.title = 'Click to copy URL';
                    imgRow.onclick = async () => {
                      await navigator.clipboard.writeText(fetchedUrl);
                      if (showToast) showToast('URL copied', true);
                    };
                  }
                }
              } catch (e) {
                debugLog('Failed to fetch source asset:', e);
              }
            })();
          } else {
            imgRow.innerHTML = `
              <div style="width: 32px; height: 32px; background: ${COLORS.hover}; border-radius: 3px;"></div>
              <span style="font-size: 10px; color: ${COLORS.textMuted}; flex: 1;">${input.role || `Input ${i + 1}`}</span>
            `;
          }
          container.appendChild(imgRow);
        });
      }

      // If no meaningful data, show notice
      if (!prompt && !model && !inputs?.length) {
        const notice = document.createElement('div');
        notice.style.cssText = `padding: 10px; text-align: center; color: ${COLORS.textMuted}; font-style: italic;`;
        notice.textContent = generation === null ? 'Loading details...' : 'No generation data available. Try re-syncing the asset.';
        container.appendChild(notice);
      }
    };

    // Initial render with cached data
    renderMetadata(content, assetData);

    document.body.appendChild(popup);

    // Position adjustment
    const adjustPosition = () => {
      const rect = popup.getBoundingClientRect();
      if (rect.right > window.innerWidth - 10) {
        popup.style.left = Math.max(10, window.innerWidth - rect.width - 10) + 'px';
      }
      if (rect.bottom > window.innerHeight - 10) {
        popup.style.top = Math.max(10, window.innerHeight - rect.height - 10) + 'px';
      }
    };
    setTimeout(adjustPosition, 0);

    // Fetch full details from backend
    const assetId = assetData.assetId || assetData.asset_id || assetData.id;
    if (assetId && sendMessageWithTimeout) {
      (async () => {
        try {
          // Fetch asset with full details
          const assetRes = await sendMessageWithTimeout({
            action: 'getAsset',
            assetId: assetId
          }, 5000);

          debugLog('[Metadata] Full asset response:', assetRes);

          if (assetRes?.success && assetRes.data) {
            const fullAsset = assetRes.data;
            let generation = null;

            // If asset has generation, fetch it
            if (fullAsset.source_generation_id) {
              const genRes = await sendMessageWithTimeout({
                action: 'getGeneration',
                generationId: fullAsset.source_generation_id
              }, 5000);

              debugLog('[Metadata] Generation response:', genRes);

              if (genRes?.success && genRes.data) {
                generation = genRes.data;
              }
            }

            // Re-render with full data
            renderMetadata(content, fullAsset, generation);
            setTimeout(adjustPosition, 0);
          }
        } catch (err) {
          console.warn('[PixSim7] Failed to fetch full asset details:', err);
        }
      })();
    }

    // Close on outside click
    const closeHandler = (e) => {
      if (!popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
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
        const containerId = slotInfo?.containerId || '';
        if (containerId.includes('image_text')) slotName = 'Image';
        else if (containerId.includes('create_image')) slotName = 'Image';
        else if (containerId.startsWith('transition')) slotName = `Image ${i + 1}`;
        else if (containerId.startsWith('fusion')) slotName = `Image ${i + 1}`;
        else if (containerId.startsWith('extend')) slotName = 'Extend Image';
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
      // Find and click the "add image" button on the page
      const addButtons = document.querySelectorAll('button, div[role="button"]');
      let addBtn = null;
      for (const btn of addButtons) {
        const text = btn.textContent?.toLowerCase() || '';
        const hasPlus = btn.querySelector('svg path[d*="M12 4v16m8-8H4"]') || // Plus icon
                        btn.innerHTML?.includes('+') ||
                        text.includes('add') && text.includes('image');
        if (hasPlus && btn.offsetParent !== null) {
          addBtn = btn;
          break;
        }
      }
      // Also try finding by common Pixverse add button patterns
      if (!addBtn) {
        addBtn = document.querySelector('[class*="add-image"], [class*="addImage"], [data-testid*="add"]');
      }
      if (addBtn) {
        addBtn.click();
        // Wait a moment then inject the image to the new slot
        setTimeout(async () => {
          await injectImageToUpload(imageUrl);
        }, 300);
      } else {
        if (showToast) showToast('Could not find add slot button', false);
      }
    }));

    // Actions section (if asset data available)
    if (assetData) {
      menu.appendChild(createDivider());

      // Show metadata option
      menu.appendChild(createMenuButton('Show Details', 'ℹ️', () => {
        showMetadataPopup(assetData, x, y);
      }));

      // Restore Generation option
      if (assetData.assetId || assetData.asset_id) {
        const assetId = assetData.assetId || assetData.asset_id;
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
      }

      // Copy URL option
      menu.appendChild(createMenuButton('Copy URL', '📋', async () => {
        await navigator.clipboard.writeText(imageUrl);
        if (showToast) showToast('URL copied', true);
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
    hideHoverPreview
  };

})();
