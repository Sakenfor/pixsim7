/**
 * Pixverse Image Picker Module
 *
 * Handles image upload, injection, restoration, and the unified image picker UI.
 * Includes input preservation for page reloads.
 */

window.PXS7 = window.PXS7 || {};

(function() {
  'use strict';

  const SESSION_KEY_PRESERVED_INPUT = 'pxs7_preserved_input';

  // Import from other modules
  const { COLORS } = window.PXS7.styles || {};
  const showToast = window.PXS7.utils?.showToast;
  const closeMenus = window.PXS7.utils?.closeMenus;
  const sendMessageWithTimeout = window.PXS7.utils?.sendMessageWithTimeout;
  const storage = window.PXS7.storage;

  // Module state
  let recentSiteImages = [];
  let assetsCache = [];
  let assetsTotalCount = 0;
  let assetsLoadedCount = 0;
  let loadAssetsFunction = null;  // Store the loadAssets function for reuse

  // ===== Dev: Pixverse Dry-Run Sync =====

  async function triggerPixverseDryRunSync() {
    try {
      if (!storage || !storage.getCurrentAccount) {
        if (showToast) showToast('Storage module not available', false);
        return;
      }
      const currentAccount = storage.getCurrentAccount();
      if (!currentAccount || currentAccount.provider_id !== 'pixverse') {
        if (showToast) showToast('No Pixverse account selected in extension', false);
        return;
      }
      if (!sendMessageWithTimeout) {
        if (showToast) showToast('Background messaging unavailable', false);
        return;
      }

      const res = await sendMessageWithTimeout(
        {
          action: 'pixverseDryRunSync',
          accountId: currentAccount.id,
          limit: 20,
          offset: 0,
        },
        15000
      );

      if (!res?.success) {
        if (showToast) showToast(`Pixverse sync dry-run failed: ${res?.error || 'unknown error'}`, false);
        return;
      }

      const data = res.data || {};
      const total = data.total_remote ?? 0;
      const existing = data.existing_count ?? 0;

      console.log('[PixSim7] Pixverse dry-run sync result:', data);
      if (showToast) {
        showToast(`Pixverse dry-run: ${existing}/${total} videos already imported`, true);
      }
    } catch (e) {
      console.warn('[PixSim7] Pixverse dry-run sync failed:', e);
      if (showToast) showToast(`Pixverse sync dry-run error: ${e.message || e}`, false);
    }
  }

  // ===== Input Preservation =====

  function saveInputState() {
    try {
      const state = { inputs: {}, images: [] };

      // Save all textareas with content
      document.querySelectorAll('textarea').forEach((el, i) => {
        if (el.value && el.value.trim()) {
          const key = el.id || el.name || el.placeholder || `textarea_${i}`;
          state.inputs[key] = el.value;
        }
      });

      // Save contenteditable divs
      document.querySelectorAll('[contenteditable="true"]').forEach((el, i) => {
        if (el.textContent && el.textContent.trim()) {
          const key = el.id || el.dataset.placeholder || `editable_${i}`;
          state.inputs[`ce_${key}`] = el.innerHTML;
        }
      });

      // Save uploaded image URLs from Ant Design upload containers
      document.querySelectorAll('.ant-upload-drag-container img').forEach(img => {
        const src = img.src;
        if (src && src.includes('media.pixverse.ai')) {
          const cleanUrl = src.split('?')[0];
          if (!state.images.includes(cleanUrl)) {
            state.images.push(cleanUrl);
          }
        }
      });

      // Also check for background images in upload previews
      document.querySelectorAll('[style*="media.pixverse.ai"]').forEach(el => {
        const style = el.getAttribute('style') || '';
        const match = style.match(/url\(["']?(https:\/\/media\.pixverse\.ai[^"')\s]+)/);
        if (match && !state.images.includes(match[1])) {
          state.images.push(match[1].split('?')[0]);
        }
      });

      if (Object.keys(state.inputs).length > 0 || state.images.length > 0) {
        sessionStorage.setItem(SESSION_KEY_PRESERVED_INPUT, JSON.stringify(state));
        console.log('[PixSim7] Saved state:', Object.keys(state.inputs).length, 'inputs,', state.images.length, 'images');
      }
    } catch (e) {
      console.warn('[PixSim7] Failed to save input state:', e);
    }
  }

  function restoreInputState() {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY_PRESERVED_INPUT);
      if (!saved) return;

      const state = JSON.parse(saved);
      const inputs = state.inputs || state;
      const images = state.images || [];

      let restored = 0;

      // Restore textareas
      document.querySelectorAll('textarea').forEach((el, i) => {
        const key = el.id || el.name || el.placeholder || `textarea_${i}`;
        if (inputs[key]) {
          el.value = inputs[key];
          el.dispatchEvent(new Event('input', { bubbles: true }));
          restored++;
        }
      });

      // Restore contenteditable
      document.querySelectorAll('[contenteditable="true"]').forEach((el, i) => {
        const key = el.id || el.dataset.placeholder || `editable_${i}`;
        if (inputs[`ce_${key}`]) {
          el.innerHTML = inputs[`ce_${key}`];
          el.dispatchEvent(new Event('input', { bubbles: true }));
          restored++;
        }
      });

      // Show image restoration panel if there are images
      if (images.length > 0) {
        showImageRestorePanel(images);
      }

      if (restored > 0) {
        console.log('[PixSim7] Restored', restored, 'input(s)');
        if (showToast) showToast(`Restored ${restored} input(s)`, true);
      }

      sessionStorage.removeItem(SESSION_KEY_PRESERVED_INPUT);
    } catch (e) {
      console.warn('[PixSim7] Failed to restore input state:', e);
    }
  }

  // ===== Upload Input Detection =====

  function findUploadInputs() {
    const results = [];
    const url = window.location.pathname;
    const isImageTextPage = url.includes('image-text') || url.includes('image_text');
    const isImageGenPage = url.includes('create-image') || url.includes('image-generation');
    const isTransitionPage = url.includes('transition');
    const isFusionPage = url.includes('fusion');
    const isImageEditPage = url.includes('edit') || url.includes('image-edit');

    const allFileInputs = document.querySelectorAll('input[type="file"]');
    const inputs = Array.from(allFileInputs).filter(input => {
      const accept = input.getAttribute('accept') || '';
      return accept.includes('image') ||
             accept.includes('.jpg') ||
             accept.includes('.png') ||
             accept.includes('.jpeg') ||
             accept.includes('.webp') ||
             input.closest('.ant-upload') ||
             input.closest('[class*="upload"]');
    });

    inputs.forEach(input => {
      let container = input.closest('.ant-upload') ||
                      input.closest('.ant-upload-btn') ||
                      input.closest('[class*="ant-upload"]') ||
                      input.closest('[class*="upload"]');

      const parentWithId = input.closest('[id]');
      const containerId = parentWithId?.id || '';

      let priority = 0;
      if (isImageTextPage && containerId.includes('image_text')) {
        priority = 10;
      } else if (isImageGenPage && containerId.includes('image')) {
        priority = 10;
      } else if (isTransitionPage && (containerId.includes('transition') || containerId.includes('start') || containerId.includes('end'))) {
        priority = 10;
      } else if (isFusionPage && (containerId.includes('fusion') || containerId.includes('character') || containerId.includes('style'))) {
        priority = 10;
      } else if (isImageEditPage && containerId.includes('edit')) {
        priority = 10;
      } else if (containerId.includes('customer') || containerId.includes('main')) {
        priority = 5;
      }

      let hasImage = false;
      if (container) {
        const parentArea = container.closest('.ant-upload-wrapper') || container.parentElement?.parentElement;
        if (parentArea) {
          const existingImg = parentArea.querySelector('img[src*="media.pixverse.ai"], img[src*="blob:"]');
          const bgWithImage = parentArea.querySelector('[style*="background-image"][style*="media.pixverse.ai"]');
          hasImage = !!(existingImg || bgWithImage);
        }
      }

      results.push({ input, container, hasImage, priority, containerId });
    });

    results.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (a.hasImage !== b.hasImage) return a.hasImage ? 1 : -1;
      return 0;
    });

    return results;
  }

  // ===== Upload Interception =====

  function setupUploadInterceptor() {
    setTimeout(() => {
      try {
        if (document.querySelector('#pxs7-upload-interceptor')) return;
        const script = document.createElement('script');
        script.id = 'pxs7-upload-interceptor';
        script.src = chrome.runtime.getURL('injected-upload-interceptor.js');
        script.onerror = (e) => console.warn('[PixSim7] Failed to load upload interceptor:', e);
        (document.head || document.documentElement).appendChild(script);
      } catch (e) {
        console.warn('[PixSim7] Error setting up upload interceptor:', e);
      }
    }, 0);
  }

  function setPendingImageUrl(url) {
    window.dispatchEvent(new CustomEvent('__pxs7SetPendingUrl', { detail: url }));
  }

  // ===== Upload Container Management =====

  function clearUploadContainer(container) {
    try {
      const wrapper = container?.closest('.ant-upload-wrapper') ||
                      container?.closest('[class*="ant-upload"]')?.parentElement;
      if (!wrapper) return;

      const deleteBtn = wrapper.querySelector('[class*="delete"], [class*="remove"], .anticon-delete, .anticon-close');
      if (deleteBtn) {
        deleteBtn.click();
        console.log('[PixSim7] Clicked delete button to clear upload');
        return;
      }

      const previewDiv = wrapper.querySelector('[style*="background-image"]');
      if (previewDiv) {
        previewDiv.style.backgroundImage = '';
        const placeholder = previewDiv.querySelector('div[style*="display: none"], svg[style*="display: none"]');
        if (placeholder) placeholder.style.display = '';
      }

      const fileInput = wrapper.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';

      console.log('[PixSim7] Cleared upload container');
    } catch (e) {
      console.warn('[PixSim7] Failed to clear container:', e);
    }
  }

  function getMimeTypeFromUrl(url) {
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
    const mimeMap = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'webp': 'image/webp',
      'gif': 'image/gif'
    };
    return mimeMap[ext] || 'image/jpeg';
  }

  // ===== Image Injection =====

  async function injectImageToUpload(imageUrl, targetInput = null) {
    try {
      const uploads = findUploadInputs();

      if (uploads.length === 0) {
        if (showToast) showToast('No upload area found', false);
        return false;
      }

      const targetUpload = targetInput
        ? uploads.find(u => u.input === targetInput) || uploads[0]
        : uploads[0];

      const fileInput = targetUpload.input;
      const container = targetUpload.container;

      if (!fileInput) {
        if (showToast) showToast('Upload area not found', false);
        return false;
      }

      if (targetUpload.hasImage) {
        clearUploadContainer(container);
        await new Promise(r => setTimeout(r, 200));
      }

      const isPixverseUrl = imageUrl.includes('media.pixverse.ai');
      if (isPixverseUrl) {
        console.log('[PixSim7] Using upload interception for Pixverse URL');
        if (showToast) showToast('Setting image...', true);

        setPendingImageUrl(imageUrl);

        const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const pngData = atob(pngBase64);
        const pngArray = new Uint8Array(pngData.length);
        for (let i = 0; i < pngData.length; i++) {
          pngArray[i] = pngData.charCodeAt(i);
        }
        const placeholderBlob = new Blob([pngArray], { type: 'image/png' });
        const placeholderFile = new File([placeholderBlob], 'image.png', { type: 'image/png' });

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(placeholderFile);
        fileInput.files = dataTransfer.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));

        setTimeout(() => { if (showToast) showToast('Image set!', true); }, 300);
        return true;
      }

      // For other URLs, fetch and upload normally
      if (showToast) showToast('Fetching image...', true);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      let response;
      try {
        response = await fetch(imageUrl, {
          signal: controller.signal,
          mode: 'cors',
          credentials: 'omit'
        });
        clearTimeout(timeoutId);
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          throw new Error('Fetch timeout - image took too long');
        }
        console.log('[PixSim7] CORS fetch failed, trying no-cors...');
        try {
          response = await fetch(imageUrl, { mode: 'no-cors' });
        } catch (e) {
          throw new Error('Failed to fetch image: ' + fetchErr.message);
        }
      }

      if (!response.ok && response.type !== 'opaque') {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      if (showToast) showToast('Processing image...', true);
      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error('Empty image data received');
      }

      let urlPath = imageUrl.split('/').pop().split('?')[0];
      let filename = decodeURIComponent(urlPath) || '';

      if (!filename || !filename.match(/\.(png|jpg|jpeg|webp|gif)$/i)) {
        const ext = getMimeTypeFromUrl(imageUrl).split('/')[1] || 'jpg';
        filename = `image_${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`;
      }

      let mimeType = getMimeTypeFromUrl(imageUrl);
      if (blob.type && ['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) {
        mimeType = blob.type;
      }

      const extMap = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
      const expectedExt = extMap[mimeType] || '.jpg';
      if (!filename.match(/\.(png|jpg|jpeg|webp)$/i)) {
        filename = filename.replace(/\.[^.]+$/, '') + expectedExt;
        if (!filename.includes('.')) filename += expectedExt;
      }

      const file = new File([blob], filename, { type: mimeType });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      if (showToast) showToast('Uploading to Pixverse...', true);

      fileInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      fileInput.dispatchEvent(new Event('input', { bubbles: true }));

      setTimeout(() => { if (showToast) showToast('Upload triggered!', true); }, 500);
      return true;
    } catch (e) {
      console.error('[PixSim7] Failed to inject image:', e);
      if (showToast) showToast('Failed to add image', false);
      return false;
    }
  }

  async function restoreAllImages(images, panel) {
    let success = 0;
    const uploads = findUploadInputs();
    const emptyUploads = uploads.filter(u => !u.hasImage);

    for (let i = 0; i < images.length; i++) {
      const url = images[i];
      const targetInput = emptyUploads[i]?.input || null;
      const result = await injectImageToUpload(url, targetInput);
      if (result) {
        success++;
        if (emptyUploads[i]) emptyUploads[i].hasImage = true;
      }
      await new Promise(r => setTimeout(r, 500));
    }

    if (success === images.length) {
      panel?.remove();
    }
    return success;
  }

  function scanPageForImages() {
    const images = new Set();

    document.querySelectorAll('img[src*="media.pixverse.ai"]').forEach(img => {
      const src = img.src.split('?')[0];
      if (src) images.add(src);
    });

    document.querySelectorAll('[style*="media.pixverse.ai"]').forEach(el => {
      const style = el.getAttribute('style') || '';
      const match = style.match(/url\(["']?(https:\/\/media\.pixverse\.ai[^"')\s]+)/);
      if (match) images.add(match[1].split('?')[0]);
    });

    return Array.from(images);
  }

  function showImageRestorePanel(images) {
    recentSiteImages = images;
    showUnifiedImagePicker('recent');
  }

  // ===== Unified Image Picker UI =====

  // Show context menu to select upload slot (1-7)
  function showUploadSlotMenu(imageUrl, x, y) {
    // Remove existing menu
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

    // Get all upload inputs using smart detection
    const uploadResults = findUploadInputs();
    const uploadInputs = uploadResults.map(r => r.input);

    if (uploadInputs.length === 0) {
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 8px 12px;
        font-size: 11px;
        color: ${COLORS.textMuted};
        text-align: center;
      `;
      item.textContent = 'No upload slots found';
      menu.appendChild(item);
    } else {
      // Add "Auto" option (default behavior)
      const autoItem = document.createElement('button');
      autoItem.style.cssText = `
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
      autoItem.innerHTML = `<span style="opacity:0.6">↑</span><span>Auto (first empty)</span>`;
      autoItem.addEventListener('mouseenter', () => autoItem.style.background = COLORS.bgHover);
      autoItem.addEventListener('mouseleave', () => autoItem.style.background = 'transparent');
      autoItem.addEventListener('click', async () => {
        menu.remove();
        await injectImageToUpload(imageUrl);
      });
      menu.appendChild(autoItem);

      // Divider
      const divider = document.createElement('div');
      divider.style.cssText = `height: 1px; background: ${COLORS.border}; margin: 4px 0;`;
      menu.appendChild(divider);

      // Add numbered slots (limit to 7 or actual count)
      const slotCount = Math.min(uploadInputs.length, 7);
      for (let i = 0; i < slotCount; i++) {
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

        // Check if this slot already has an image (from smart detection)
        const hasImage = uploadResults[i]?.hasImage || false;

        item.innerHTML = `
          <span style="opacity:0.6">${i + 1}</span>
          <span>Slot ${i + 1}</span>
          ${hasImage ? `<span style="font-size:9px;color:${COLORS.warning};margin-left:auto;">●</span>` : ''}
        `;
        item.title = hasImage ? `Slot ${i + 1} (has image - will replace)` : `Slot ${i + 1} (empty)`;

        item.addEventListener('mouseenter', () => item.style.background = COLORS.bgHover);
        item.addEventListener('mouseleave', () => item.style.background = 'transparent');
        item.addEventListener('click', async () => {
          menu.remove();
          await injectImageToUpload(imageUrl, uploadInputs[i]);
        });
        menu.appendChild(item);
      }
    }

    document.body.appendChild(menu);

    // Close on outside click
    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);

    // Adjust position if off-screen
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

  // Z-index constants - use lower values so site popups can appear above
  const Z_INDEX_PICKER = 100000;
  const Z_INDEX_PICKER_INACTIVE = 99990;
  const Z_INDEX_MENU = 100001;
  const Z_INDEX_PREVIEW = 100002;

  // Hover preview element (shared across grid)
  let hoverPreview = null;
  let hoverPreviewImg = null;
  let hoverTimeout = null;
  let activePickerPanel = null;
  let lastPreviewUrl = null;

  // Convert URL to medium-size preview (Pixverse OSS supports image processing)
  function getPreviewSizeUrl(url) {
    if (!url) return url;
    // If it's a Pixverse CDN URL, request a medium-sized version
    if (url.includes('pixverse') || url.includes('aliyuncs.com')) {
      // Remove any existing processing params and add medium size
      const baseUrl = url.split('?')[0];
      return baseUrl + '?x-oss-process=image/resize,w_400,h_400,m_lfit';
    }
    return url;
  }

  function showHoverPreview(imgUrl, anchorEl) {
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      // Use medium-size preview URL to avoid loading full resolution
      const previewUrl = getPreviewSizeUrl(imgUrl);

      // Skip if anchor is no longer in DOM (user scrolled/moved away)
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
          max-width: 280px;
          max-height: 280px;
        `;
        hoverPreviewImg = document.createElement('img');
        hoverPreviewImg.style.cssText = `
          max-width: 100%;
          max-height: 260px;
          border-radius: 4px;
          display: block;
        `;
        hoverPreview.appendChild(hoverPreviewImg);
        document.body.appendChild(hoverPreview);
      }

      // Only update src if URL changed (avoid reloading same image)
      if (lastPreviewUrl !== previewUrl) {
        hoverPreviewImg.src = previewUrl;
        lastPreviewUrl = previewUrl;
      }

      const rect = anchorEl.getBoundingClientRect();
      const previewWidth = 280;
      let x = rect.left - previewWidth - 12;
      let y = rect.top;

      if (x < 10) x = rect.right + 12;
      y = Math.max(10, Math.min(y, window.innerHeight - 290));

      hoverPreview.style.left = `${x}px`;
      hoverPreview.style.top = `${y}px`;
      hoverPreview.style.display = 'block';
    }, 400); // Slightly longer delay to reduce thrashing on fast mouse movement
  }

  function hideHoverPreview() {
    clearTimeout(hoverTimeout);
    if (hoverPreview) hoverPreview.style.display = 'none';
  }

  // Inject grid styles once
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
    `;
    document.head.appendChild(style);
  }

  function createImageGrid(items, getThumbUrl, getFullUrl = null, getName = null) {
    injectGridStyles();

    const grid = document.createElement('div');
    grid.className = 'pxs7-grid';

    // Build data map for event delegation
    const itemDataMap = new Map();

    items.forEach((item, index) => {
      const thumbUrl = typeof getThumbUrl === 'function' ? getThumbUrl(item) : item;
      const fullUrl = getFullUrl ? getFullUrl(item) : (typeof item === 'string' ? item : item);
      const name = getName ? getName(item) : null;

      const thumb = document.createElement('div');
      thumb.className = 'pxs7-thumb';
      thumb.dataset.idx = index;
      if (name) thumb.title = name;

      const img = document.createElement('img');
      img.src = thumbUrl;
      img.loading = 'lazy';
      img.decoding = 'async';
      thumb.appendChild(img);

      itemDataMap.set(index, { thumbUrl, fullUrl, name, element: thumb });
      grid.appendChild(thumb);
    });

    // Event delegation - single set of listeners on grid
    let currentHoverIdx = null;

    grid.addEventListener('mouseenter', (e) => {
      const thumb = e.target.closest('.pxs7-thumb');
      if (!thumb) return;
      const idx = parseInt(thumb.dataset.idx, 10);
      if (isNaN(idx) || currentHoverIdx === idx) return;
      currentHoverIdx = idx;
      const data = itemDataMap.get(idx);
      if (data) showHoverPreview(data.fullUrl || data.thumbUrl, thumb);
    }, true);

    grid.addEventListener('mouseleave', (e) => {
      const thumb = e.target.closest('.pxs7-thumb');
      if (!thumb) return;
      currentHoverIdx = null;
      hideHoverPreview();
    }, true);

    grid.addEventListener('click', async (e) => {
      const thumb = e.target.closest('.pxs7-thumb');
      if (!thumb) return;
      const idx = parseInt(thumb.dataset.idx, 10);
      const data = itemDataMap.get(idx);
      if (!data) return;

      thumb.classList.add('pxs7-loading');
      const success = await injectImageToUpload(data.fullUrl);
      thumb.classList.remove('pxs7-loading');
      if (success) {
        thumb.classList.add('pxs7-success');
      } else {
        await navigator.clipboard.writeText(data.fullUrl);
        if (showToast) showToast('URL copied - paste manually', true);
      }
    });

    grid.addEventListener('contextmenu', (e) => {
      const thumb = e.target.closest('.pxs7-thumb');
      if (!thumb) return;
      e.preventDefault();
      const idx = parseInt(thumb.dataset.idx, 10);
      const data = itemDataMap.get(idx);
      if (data) showUploadSlotMenu(data.fullUrl, e.clientX, e.clientY);
    });

    return grid;
  }

  function renderRecentTab(container, panel) {
    if (recentSiteImages.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 30px 10px; color: ${COLORS.textMuted};">
          <div style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;">📷</div>
          <div style="font-size: 11px;">No recent images</div>
          <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">
            Images you upload will appear here
          </div>
        </div>
      `;
      return;
    }

    const actionsRow = document.createElement('div');
    actionsRow.style.cssText = 'display: flex; gap: 6px; margin-bottom: 10px;';

    const restoreAllBtn = document.createElement('button');
    restoreAllBtn.textContent = '↻ Restore All';
    restoreAllBtn.style.cssText = `
      flex: 1; padding: 6px; font-size: 10px; font-weight: 600;
      background: ${COLORS.accent}; border: none; border-radius: 4px;
      color: white; cursor: pointer;
    `;
    restoreAllBtn.addEventListener('click', async () => {
      restoreAllBtn.disabled = true;
      restoreAllBtn.textContent = 'Restoring...';
      await restoreAllImages(recentSiteImages, panel);
      restoreAllBtn.textContent = 'Done!';
    });

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 Copy URLs';
    copyBtn.style.cssText = `
      padding: 6px 10px; font-size: 10px;
      background: transparent; border: 1px solid ${COLORS.border};
      border-radius: 4px; color: ${COLORS.textMuted}; cursor: pointer;
    `;
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(recentSiteImages.join('\n')).then(() => {
        if (showToast) showToast(`Copied ${recentSiteImages.length} URL(s)!`, true);
      });
    });

    actionsRow.appendChild(restoreAllBtn);
    actionsRow.appendChild(copyBtn);
    container.appendChild(actionsRow);

    const grid = createImageGrid(recentSiteImages, (url) => url + '?x-oss-process=style/cover-webp-small');
    container.appendChild(grid);
  }

  function renderAssetsTab(container, panel, loadAssets) {
    const urls = assetsCache.map(a => ({
      thumb: a.thumbnail_url || a.remote_url || a.file_url || a.external_url || a.url || a.src,
      full: a.remote_url || a.file_url || a.external_url || a.url || a.src || a.thumbnail_url,
      name: a.name || a.original_filename || a.filename || a.title || ''
    })).filter(u => u.thumb);

    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';

    const countLabel = document.createElement('span');
    countLabel.style.cssText = `font-size: 10px; color: ${COLORS.textMuted};`;
    // For cursor pagination, show + if there are more to load
    const moreAvailable = assetsTotalCount > assetsLoadedCount;
    const totalText = moreAvailable ? '+' : '';
    countLabel.textContent = urls.length > 0 ? `${urls.length}${totalText} image${urls.length !== 1 ? 's' : ''}` : '';

    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '↻ Refresh';
    refreshBtn.style.cssText = `
      padding: 4px 8px; font-size: 10px;
      background: transparent; border: 1px solid ${COLORS.border};
      border-radius: 4px; color: ${COLORS.textMuted}; cursor: pointer;
    `;
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.textContent = '...';
      if (loadAssets) await loadAssets(true, false);
      renderTabContent('assets', container, panel, loadAssets);
    });

    headerRow.appendChild(countLabel);
    headerRow.appendChild(refreshBtn);
    container.appendChild(headerRow);

    if (urls.length === 0) {
      container.innerHTML += `
        <div style="text-align: center; padding: 30px 10px; color: ${COLORS.textMuted};">
          <div style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;">📁</div>
          <div style="font-size: 11px;">No assets found</div>
          <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">
            Upload images via the main app
          </div>
        </div>
      `;
      return;
    }

    const grid = createImageGrid(urls, (item) => item.thumb, (item) => item.full, (item) => item.name);
    container.appendChild(grid);

    // Show Load More button if there are more assets to load
    // For cursor-based pagination: assetsTotalCount > assetsLoadedCount means there's a next_cursor
    const hasMore = assetsTotalCount > assetsLoadedCount;

    if (hasMore && loadAssets) {
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.textContent = `Load More (${assetsLoadedCount} loaded)`;
      loadMoreBtn.style.cssText = `
        width: 100%; padding: 8px; margin-top: 10px;
        font-size: 11px; font-weight: 600;
        background: ${COLORS.accent}; border: none;
        border-radius: 4px; color: white;
        cursor: pointer; transition: opacity 0.2s;
      `;
      loadMoreBtn.addEventListener('mouseover', () => loadMoreBtn.style.opacity = '0.8');
      loadMoreBtn.addEventListener('mouseout', () => loadMoreBtn.style.opacity = '1');
      loadMoreBtn.addEventListener('click', async () => {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = 'Loading...';
        await loadAssets(false, true);
        renderTabContent('assets', container, panel, loadAssets);
      });
      container.appendChild(loadMoreBtn);
    }
  }

  function renderTabContent(tabId, container, panel, loadAssets) {
    container.innerHTML = '';
    if (tabId === 'recent') {
      renderRecentTab(container, panel);
    } else {
      renderAssetsTab(container, panel, loadAssets);
    }
  }

  function showUnifiedImagePicker(activeTab = 'assets', loadAssets = null) {
    // Store the loadAssets function for future use if provided
    if (loadAssets) {
      loadAssetsFunction = loadAssets;
    }
    // Use stored function if no new one provided
    if (!loadAssets && loadAssetsFunction) {
      loadAssets = loadAssetsFunction;
    }

    document.querySelectorAll('.pxs7-restore-panel, .pxs7-image-picker').forEach(p => p.remove());
    if (closeMenus) closeMenus();

    const pageImages = scanPageForImages();
    const allRecent = new Set([...recentSiteImages, ...pageImages]);
    recentSiteImages = Array.from(allRecent);

    const panel = document.createElement('div');
    panel.className = 'pxs7-image-picker';
    panel.style.cssText = `
      position: fixed; top: 80px; right: 20px; z-index: ${Z_INDEX_PICKER};
      background: ${COLORS.bg}; border: 1px solid ${COLORS.border};
      border-radius: 8px; width: 320px; max-height: 480px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; flex-direction: column; resize: both; overflow: hidden;
    `;
    activePickerPanel = panel;

    // Lower z-index when clicking outside so site popups can appear above
    const lowerPriority = () => {
      if (panel.isConnected) {
        panel.style.zIndex = Z_INDEX_PICKER_INACTIVE;
      }
    };
    const raisePriority = () => {
      if (panel.isConnected) {
        panel.style.zIndex = Z_INDEX_PICKER;
      }
    };
    panel.addEventListener('mouseenter', raisePriority);
    panel.addEventListener('mousedown', raisePriority);
    document.addEventListener('mousedown', (e) => {
      if (!panel.contains(e.target)) {
        lowerPriority();
      }
    });

    let isMinimized = false;

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 12px; cursor: move; background: rgba(0,0,0,0.2);
      border-radius: 8px 8px 0 0; user-select: none;
    `;

    const title = document.createElement('span');
    title.style.cssText = `font-size: 12px; font-weight: 600; color: ${COLORS.text};`;
    title.textContent = '🖼 Image Picker';
    header.appendChild(title);

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display: flex; gap: 8px;';

    const minBtn = document.createElement('button');
    minBtn.textContent = '−';
    minBtn.title = 'Minimize';
    minBtn.style.cssText = `
      background: none; border: none; color: ${COLORS.textMuted};
      font-size: 16px; cursor: pointer; padding: 0; line-height: 1; width: 20px;
    `;
    minBtn.addEventListener('click', () => {
      isMinimized = !isMinimized;
      panelBody.style.display = isMinimized ? 'none' : 'flex';
      panel.style.maxHeight = isMinimized ? 'auto' : '480px';
      panel.style.width = isMinimized ? 'auto' : '320px';
      minBtn.textContent = isMinimized ? '+' : '−';
      minBtn.title = isMinimized ? 'Expand' : 'Minimize';
    });
    btnGroup.appendChild(minBtn);

    const syncBtn = document.createElement('button');
    syncBtn.textContent = 'Sync';
    syncBtn.title = 'Pixverse video sync dry-run (backend)';
    syncBtn.style.cssText = `
      background: none; border: none; color: ${COLORS.textMuted};
      font-size: 10px; cursor: pointer; padding: 0 4px; line-height: 1;
    `;
    syncBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      triggerPixverseDryRunSync();
    });
    btnGroup.appendChild(syncBtn);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.title = 'Close';
    closeBtn.style.cssText = `
      background: none; border: none; color: ${COLORS.textMuted};
      font-size: 18px; cursor: pointer; padding: 0; line-height: 1; width: 20px;
    `;
    closeBtn.addEventListener('click', () => {
      panel.remove();
      activePickerPanel = null;
    });
    btnGroup.appendChild(closeBtn);

    header.appendChild(btnGroup);
    panel.appendChild(header);

    // Make draggable
    let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
    header.addEventListener('mousedown', (e) => {
      if (e.target === minBtn || e.target === closeBtn || e.target === syncBtn) return;
      isDragging = true;
      dragOffsetX = e.clientX - panel.offsetLeft;
      dragOffsetY = e.clientY - panel.offsetTop;
      panel.style.transition = 'none';
    });
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panel.style.left = (e.clientX - dragOffsetX) + 'px';
      panel.style.top = (e.clientY - dragOffsetY) + 'px';
      panel.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => {
      isDragging = false;
      panel.style.transition = '';
    });

    const panelBody = document.createElement('div');
    panelBody.style.cssText = 'display: flex; flex-direction: column; flex: 1; overflow: hidden;';

    const tabBar = document.createElement('div');
    tabBar.style.cssText = `display: flex; border-bottom: 1px solid ${COLORS.border}; margin: 8px 12px 0;`;

    const tabs = [
      { id: 'recent', label: 'Recent', count: recentSiteImages.length },
      { id: 'assets', label: 'Assets', count: assetsCache.length }
    ];

    const contentContainer = document.createElement('div');
    contentContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 10px 12px;';

    tabs.forEach(tab => {
      const tabBtn = document.createElement('button');
      tabBtn.dataset.tab = tab.id;
      const hasItems = tab.count > 0;
      tabBtn.style.cssText = `
        flex: 1; padding: 8px; font-size: 11px; font-weight: 600;
        background: transparent; border: none;
        border-bottom: 2px solid transparent;
        color: ${COLORS.textMuted}; cursor: pointer; transition: all 0.15s;
      `;
      tabBtn.innerHTML = `${tab.label} ${hasItems ? `<span style="opacity:0.6">(${tab.count})</span>` : ''}`;

      if (tab.id === activeTab) {
        tabBtn.style.color = COLORS.accent;
        tabBtn.style.borderBottomColor = COLORS.accent;
      }

      tabBtn.addEventListener('click', () => {
        tabBar.querySelectorAll('button').forEach(b => {
          b.style.color = COLORS.textMuted;
          b.style.borderBottomColor = 'transparent';
        });
        tabBtn.style.color = COLORS.accent;
        tabBtn.style.borderBottomColor = COLORS.accent;
        renderTabContent(tab.id, contentContainer, panel, loadAssets);
      });

      tabBar.appendChild(tabBtn);
    });

    panelBody.appendChild(tabBar);
    panelBody.appendChild(contentContainer);
    panel.appendChild(panelBody);

    renderTabContent(activeTab, contentContainer, panel, loadAssets);
    document.body.appendChild(panel);
  }

  // Export all functionality
  window.PXS7.imagePicker = {
    saveInputState,
    restoreInputState,
    setupUploadInterceptor,
    injectImageToUpload,
    scanPageForImages,
    showImageRestorePanel,
    showUnifiedImagePicker,
    // State setters for main file
    setAssetsCache: (cache) => { assetsCache = cache; },
    setAssetsCounts: (loaded, total) => { assetsLoadedCount = loaded; assetsTotalCount = total; },
    setLoadAssetsFunction: (fn) => { loadAssetsFunction = fn; },
    getRecentImages: () => recentSiteImages,
    setRecentImages: (images) => { recentSiteImages = images; },
  };

})();
