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
  const DEBUG_IMAGE_PICKER = localStorage.getItem('pxs7_debug') === 'true';
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
          console.log('[PixSim7 Restore] Starting restore for asset ID:', assetId);

          // Fetch asset details
          const assetRes = await sendMessageWithTimeout({
            action: 'getAsset',
            assetId: assetId
          }, 5000);

          console.log('[PixSim7 Restore] Asset response:', assetRes);

          if (!assetRes?.success) {
            throw new Error(assetRes?.error || 'Failed to fetch asset');
          }

          const asset = assetRes.data;
          console.log('[PixSim7 Restore] Asset data:', asset);
          console.log('[PixSim7 Restore] source_generation_id:', asset.source_generation_id);

          // Check if asset has a source generation
          if (!asset.source_generation_id) {
            console.log('[PixSim7 Restore] No source_generation_id found');
            if (showToast) showToast('No generation data available', false);
            return;
          }

          // Fetch generation details
          const genRes = await sendMessageWithTimeout({
            action: 'getGeneration',
            generationId: asset.source_generation_id
          }, 5000);

          console.log('[PixSim7 Restore] Generation response:', genRes);

          if (!genRes?.success) {
            throw new Error(genRes?.error || 'Failed to fetch generation');
          }

          const generation = genRes.data;
          console.log('[PixSim7 Restore] Generation data:', generation);
          console.log('[PixSim7 Restore] Generation inputs:', generation.inputs);
          console.log('[PixSim7 Restore] Generation final_prompt:', generation.final_prompt);

          // Extract source images from generation inputs
          const sourceImages = [];
          if (generation.inputs && Array.isArray(generation.inputs)) {
            console.log('[PixSim7 Restore] Processing', generation.inputs.length, 'inputs');
            for (const input of generation.inputs) {
              console.log('[PixSim7 Restore] Processing input:', input);
              if (input.url) {
                console.log('[PixSim7 Restore] Found direct URL:', input.url);
                sourceImages.push(input.url);
              } else if (input.asset_id) {
                console.log('[PixSim7 Restore] Fetching source asset:', input.asset_id);
                // Fetch the source asset to get its URL
                const sourceAssetRes = await sendMessageWithTimeout({
                  action: 'getAsset',
                  assetId: input.asset_id
                }, 5000);
                console.log('[PixSim7 Restore] Source asset response:', sourceAssetRes);
                if (sourceAssetRes?.success && sourceAssetRes.data) {
                  const url = sourceAssetRes.data.file_url ||
                              sourceAssetRes.data.remote_url ||
                              sourceAssetRes.data.preview_url;
                  console.log('[PixSim7 Restore] Extracted URL from source asset:', url);
                  if (url) sourceImages.push(url);
                }
              }
            }
          } else {
            console.log('[PixSim7 Restore] No inputs found or inputs is not an array');
          }

          console.log('[PixSim7 Restore] Total source images to inject:', sourceImages.length, sourceImages);

          // Inject source images to page
          if (sourceImages.length > 0) {
            for (let i = 0; i < sourceImages.length; i++) {
              const url = sourceImages[i];
              console.log('[PixSim7 Restore] Injecting image', i + 1, ':', url);
              await injectImageToUpload(url);
              await new Promise(r => setTimeout(r, 300));
            }
          } else {
            console.log('[PixSim7 Restore] No source images to inject');
          }

          // Fill prompt textarea if final_prompt exists
          if (generation.final_prompt) {
            console.log('[PixSim7 Restore] Looking for prompt textarea...');
            const promptTextarea = document.querySelector('textarea[placeholder*="prompt" i], textarea[placeholder*="describe" i]');
            console.log('[PixSim7 Restore] Found textarea:', promptTextarea);
            if (promptTextarea) {
              console.log('[PixSim7 Restore] Setting prompt value:', generation.final_prompt);
              promptTextarea.value = generation.final_prompt;
              promptTextarea.dispatchEvent(new Event('input', { bubbles: true }));
              promptTextarea.dispatchEvent(new Event('change', { bubbles: true }));
              console.log('[PixSim7 Restore] Prompt set and events dispatched');
            } else {
              console.log('[PixSim7 Restore] No prompt textarea found on page');
            }
          } else {
            console.log('[PixSim7 Restore] No final_prompt in generation data');
          }

          // Success feedback
          if (showToast) {
            const msg = sourceImages.length > 0
              ? `Restored ${sourceImages.length} image(s) and prompt`
              : 'Restored prompt';
            showToast(msg, true);
          }

          console.log('[PixSim7 Restore] Restore completed successfully');

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
    }, true); // Capture phase to handle before other click listeners

    return { grid, itemDataMap };
  }

  // ===== Upload Slot Menu =====

  function showUploadSlotMenu(imageUrl, x, y, slotsToShow = null) {
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
      min-width: 140px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;

    const slots = slotsToShow || findUploadInputs().filter(u => u.priority >= 10);
    debugLog('[Slots] Menu slots:', slots.length);

    if (slots.length === 0) {
      const item = document.createElement('div');
      item.style.cssText = `padding: 8px 12px; font-size: 11px; color: ${COLORS.textMuted}; text-align: center;`;
      item.textContent = 'No upload slots found';
      menu.appendChild(item);
    } else {
      const header = document.createElement('div');
      header.style.cssText = `padding: 6px 12px 4px; font-size: 10px; color: ${COLORS.textMuted};`;
      header.textContent = 'Replace which slot?';
      menu.appendChild(header);

      const slotCount = Math.min(slots.length, 7);
      for (let i = 0; i < slotCount; i++) {
        const slotInfo = slots[i];
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

        let slotName = `Slot ${i + 1}`;
        const containerId = slotInfo?.containerId || '';
        if (containerId.includes('image_text')) slotName = 'Image';
        else if (containerId.includes('create_image')) slotName = 'Image';
        else if (containerId.startsWith('transition')) slotName = `Image ${i + 1}`;
        else if (containerId.startsWith('fusion')) slotName = `Image ${i + 1}`;
        else if (containerId.startsWith('extend')) slotName = 'Extend Image';
        else if (containerId.includes('edit')) slotName = 'Edit';

        item.innerHTML = `<span style="opacity:0.6">${i + 1}</span><span>${slotName}</span>`;
        item.title = `Replace ${slotName}`;

        item.addEventListener('mouseenter', () => {
          item.style.background = COLORS.hover;
        });
        item.addEventListener('mouseleave', () => {
          item.style.background = 'transparent';
        });

        item.addEventListener('click', async () => {
          menu.remove();
          const expectedContainerId = slotInfo.containerId;
          debugLog('[Slots] Menu click: index=' + i + ', containerId=' + expectedContainerId);
          await injectImageToUpload(imageUrl, null, i, expectedContainerId);
        });
        menu.appendChild(item);
      }
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
    showHoverPreview,
    hideHoverPreview
  };

})();
