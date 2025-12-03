/**
 * Pixverse Preset Buttons
 *
 * Injects account selector, login, and run preset buttons on Pixverse site.
 * Layout: [● Account ▼] [↪ Login] [▶ Run]
 */

(function() {
  'use strict';

  const STORAGE_KEY_PROVIDER_SESSIONS = 'pixsim7ProviderSessions';
  const STORAGE_KEY_SELECTED_ACCOUNT = 'pixsim7SelectedPresetAccount';
  const STORAGE_KEY_SELECTED_PRESET = 'pixsim7SelectedPreset';
  const STORAGE_KEY_ACCOUNT_SORT = 'pixsim7AccountSort';
  const SESSION_KEY_PRESERVED_INPUT = 'pxs7_preserved_input';

  const BTN_GROUP_CLASS = 'pxs7-group';
  const BTN_CLASS = 'pxs7-btn';
  const MENU_CLASS = 'pxs7-menu';
  const PROCESSED_ATTR = 'data-pxs7';

  const TASK_SELECTOR = 'span.bg-task.bg-clip-text.text-transparent';

  // Unified dark theme colors
  const COLORS = {
    bg: '#1f2937',
    bgHover: '#374151',
    border: '#4b5563',
    text: '#e5e7eb',
    textMuted: '#9ca3af',
    accent: '#a78bfa',      // purple - primary
    accentAlt: '#60a5fa',   // blue - login
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
  };

  const STYLE = `
    /* Button Group */
    .${BTN_GROUP_CLASS} {
      display: inline-flex;
      align-items: center;
      margin-left: 8px;
      vertical-align: middle;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid ${COLORS.border};
      background: ${COLORS.bg};
    }

    /* Base Button */
    .${BTN_CLASS} {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 500;
      color: ${COLORS.textMuted};
      background: transparent;
      border: none;
      border-right: 1px solid ${COLORS.border};
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .${BTN_CLASS}:last-child {
      border-right: none;
    }
    .${BTN_CLASS}:hover {
      background: ${COLORS.bgHover};
      color: ${COLORS.text};
    }
    .${BTN_CLASS}:active {
      opacity: 0.8;
    }
    .${BTN_CLASS}.loading {
      opacity: 0.5;
      pointer-events: none;
    }

    /* Account Button */
    .${BTN_CLASS}--account {
      max-width: 200px;
      overflow: hidden;
    }
    .${BTN_CLASS}--account .name {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .${BTN_CLASS}--account .arrow {
      font-size: 8px;
      opacity: 0.6;
    }
    .${BTN_CLASS}--account .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .${BTN_CLASS}--account .dot.active { background: ${COLORS.success}; }
    .${BTN_CLASS}--account .dot.exhausted { background: ${COLORS.error}; }
    .${BTN_CLASS}--account .dot.error { background: ${COLORS.warning}; }
    .${BTN_CLASS}--account .dot.disabled { background: ${COLORS.textMuted}; }
    .${BTN_CLASS}--account.mismatch {
      background: rgba(251, 191, 36, 0.1);
    }
    .${BTN_CLASS}--account.mismatch .arrow {
      color: ${COLORS.warning};
    }

    /* Login Button */
    .${BTN_CLASS}--login {
      color: ${COLORS.accentAlt};
    }
    .${BTN_CLASS}--login:hover {
      background: rgba(96, 165, 250, 0.15);
    }

    /* Run Button */
    .${BTN_CLASS}--run {
      color: ${COLORS.accent};
    }
    .${BTN_CLASS}--run:hover {
      background: rgba(167, 139, 250, 0.15);
    }

    /* Dropdown Menu */
    .${MENU_CLASS} {
      position: fixed;
      z-index: 2147483647;
      background: ${COLORS.bg};
      border: 1px solid ${COLORS.border};
      border-radius: 8px;
      padding: 4px 0;
      min-width: 200px;
      max-width: 300px;
      max-height: 360px;
      overflow-y: auto;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    .${MENU_CLASS}__section {
      padding: 6px 10px 4px;
      font-size: 9px;
      font-weight: 600;
      color: ${COLORS.textMuted};
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .${MENU_CLASS}__section::after {
      content: '';
      flex: 1;
      height: 1px;
      background: ${COLORS.border};
    }

    .${MENU_CLASS}__item {
      display: flex;
      align-items: center;
      width: 100%;
      padding: 7px 10px;
      text-align: left;
      background: transparent;
      border: none;
      color: ${COLORS.text};
      font-size: 12px;
      cursor: pointer;
      gap: 8px;
    }
    .${MENU_CLASS}__item:hover {
      background: ${COLORS.bgHover};
    }

    .${MENU_CLASS}__account {
      padding: 6px 10px;
      font-size: 11px;
    }
    .${MENU_CLASS}__account.selected {
      background: rgba(167, 139, 250, 0.12);
    }
    .${MENU_CLASS}__account.current {
      background: rgba(16, 185, 129, 0.1);
    }
    .${MENU_CLASS}__account-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .${MENU_CLASS}__account-dot.active { background: ${COLORS.success}; }
    .${MENU_CLASS}__account-dot.exhausted { background: ${COLORS.error}; }
    .${MENU_CLASS}__account-dot.error { background: ${COLORS.warning}; }
    .${MENU_CLASS}__account-dot.disabled { background: ${COLORS.textMuted}; }
    .${MENU_CLASS}__account-info {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }
    .${MENU_CLASS}__account-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .${MENU_CLASS}__account-meta {
      font-size: 9px;
      color: ${COLORS.textMuted};
      margin-top: 1px;
    }
    .${MENU_CLASS}__account-badge {
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .${MENU_CLASS}__account-badge--current {
      background: rgba(16, 185, 129, 0.2);
      color: ${COLORS.success};
    }
    .${MENU_CLASS}__account-badge--selected {
      background: rgba(167, 139, 250, 0.2);
      color: ${COLORS.accent};
    }
    .${MENU_CLASS}__account-credits {
      font-size: 10px;
      color: ${COLORS.textMuted};
      flex-shrink: 0;
    }

    .${MENU_CLASS}__divider {
      height: 1px;
      background: ${COLORS.border};
      margin: 4px 0;
    }

    .${MENU_CLASS}__empty {
      padding: 12px;
      text-align: center;
      color: ${COLORS.textMuted};
      font-size: 11px;
    }

    .${MENU_CLASS}__refresh {
      padding: 2px 6px;
      font-size: 10px;
      color: ${COLORS.textMuted};
      background: transparent;
      border: 1px solid ${COLORS.border};
      border-radius: 4px;
      cursor: pointer;
      margin-left: auto;
    }
    .${MENU_CLASS}__refresh:hover {
      background: ${COLORS.bgHover};
      color: ${COLORS.text};
    }

    /* Toast */
    .pxs7-toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483648;
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      color: white;
    }
    .pxs7-toast--success {
      background: #065f46;
      border: 1px solid ${COLORS.success};
    }
    .pxs7-toast--error {
      background: #7f1d1d;
      border: 1px solid ${COLORS.error};
    }
  `;

  let styleInjected = false;
  let presetsCache = [];
  let accountsCache = [];
  let assetsCache = [];
  let assetsTotalCount = 0;
  let assetsLoadedCount = 0;
  let selectedAccountId = null;
  let selectedPresetId = null;
  let currentSessionAccountId = null; // Account matching browser session
  let accountSortBy = 'credits'; // 'credits', 'name', 'recent'

  function injectStyle() {
    if (styleInjected) return;
    const existing = document.getElementById('pxs7-style');
    if (existing) { styleInjected = true; return; }
    const style = document.createElement('style');
    style.id = 'pxs7-style';
    style.textContent = STYLE;
    (document.head || document.documentElement).appendChild(style);
    styleInjected = true;
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

      // Save contenteditable divs (some editors use these)
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
          // Get the original URL without query params for cleaner display
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
      // Handle old format (just inputs object)
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
        showToast(`Restored ${restored} input(s)`, true);
      }

      // Clear after restore
      sessionStorage.removeItem(SESSION_KEY_PRESERVED_INPUT);
    } catch (e) {
      console.warn('[PixSim7] Failed to restore input state:', e);
    }
  }

  /**
   * Find all available upload inputs on the page
   * Returns array of { input, container, hasImage } objects
   */
  function findUploadInputs() {
    const results = [];

    // Determine page type from URL
    const url = window.location.pathname;
    const isImageTextPage = url.includes('image-text') || url.includes('image_text');
    const isImageGenPage = url.includes('create-image') || url.includes('image-generation');

    // Find all file inputs that could accept images
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
      // Find the containing upload area
      let container = input.closest('.ant-upload') ||
                      input.closest('.ant-upload-btn') ||
                      input.closest('[class*="ant-upload"]') ||
                      input.closest('[class*="upload"]');

      // Find parent with ID for context
      const parentWithId = input.closest('[id]');
      const containerId = parentWithId?.id || '';

      // Determine priority based on page type and container ID
      let priority = 0;
      if (isImageTextPage && containerId.includes('image_text')) {
        priority = 10; // High priority for image-text page main input
      } else if (isImageGenPage && containerId.includes('image')) {
        priority = 10;
      } else if (containerId.includes('customer') || containerId.includes('main')) {
        priority = 5;
      }

      // Check if this upload area already has an image
      let hasImage = false;
      if (container) {
        const parentArea = container.closest('.ant-upload-wrapper') || container.parentElement?.parentElement;
        if (parentArea) {
          // Check for existing images
          const existingImg = parentArea.querySelector('img[src*="media.pixverse.ai"], img[src*="blob:"]');
          const bgWithImage = parentArea.querySelector('[style*="background-image"][style*="media.pixverse.ai"]');
          hasImage = !!(existingImg || bgWithImage);
        }
      }

      results.push({ input, container, hasImage, priority, containerId });
    });

    // Sort by priority (highest first), then prefer empty containers
    results.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (a.hasImage !== b.hasImage) return a.hasImage ? 1 : -1;
      return 0;
    });

    console.log('[PixSim7] Upload inputs found:', results.map(r => ({
      id: r.containerId,
      priority: r.priority,
      hasImage: r.hasImage
    })));

    return results;
  }

  /**
   * Intercept next upload and return our URL instead
   * This makes Pixverse think the upload succeeded with our existing URL
   * Must run in PAGE context to intercept Pixverse's XHR calls
   */
  function setupUploadInterceptor() {
    // Defer to next tick to avoid blocking init
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
    // Send to page context via custom event
    window.dispatchEvent(new CustomEvent('__pxs7SetPendingUrl', { detail: url }));
  }

  /**
   * Try to set image directly on Pixverse upload component without re-uploading
   * Works for images already on media.pixverse.ai
   */
  function trySetPixverseImageDirectly(imageUrl, container) {
    try {
      // Find the upload wrapper/container
      const wrapper = container?.closest('.ant-upload-wrapper') ||
                      container?.closest('[class*="ant-upload"]')?.parentElement;
      if (!wrapper) return false;

      // Look for the preview container (the div that shows the uploaded image)
      // Pixverse uses a div with background-image style
      const previewDiv = wrapper.querySelector('.ant-upload-drag-container > div[style*="background"]') ||
                         wrapper.querySelector('[style*="background-size: cover"]') ||
                         wrapper.querySelector('.ant-upload-drag-container > div');

      if (previewDiv) {
        // Set the background image directly
        previewDiv.style.backgroundImage = `url("${imageUrl}")`;
        previewDiv.style.backgroundSize = 'cover';
        previewDiv.style.backgroundPosition = 'center';

        // Hide the upload icon/placeholder if present
        const placeholder = previewDiv.querySelector('div, svg');
        if (placeholder) {
          placeholder.style.display = 'none';
        }

        console.log('[PixSim7] Set image preview directly:', imageUrl);
      }

      // Try to find and update React component state
      // Look for __reactFiber or __reactProps on elements
      const reactKey = Object.keys(wrapper).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactProps$'));
      if (reactKey) {
        console.log('[PixSim7] Found React internals, but direct state update not implemented');
        // Direct React state manipulation would go here, but it's fragile
      }

      // Try to find a hidden input or data attribute that stores the URL
      const hiddenInput = wrapper.querySelector('input[type="hidden"]');
      if (hiddenInput) {
        hiddenInput.value = imageUrl;
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Dispatch a custom event in case the component listens for it
      wrapper.dispatchEvent(new CustomEvent('imageSet', {
        detail: { url: imageUrl },
        bubbles: true
      }));

      return true;
    } catch (e) {
      console.warn('[PixSim7] Direct image set failed:', e);
      return false;
    }
  }

  /**
   * Clear existing image from an upload container
   */
  function clearUploadContainer(container) {
    try {
      const wrapper = container?.closest('.ant-upload-wrapper') ||
                      container?.closest('[class*="ant-upload"]')?.parentElement;
      if (!wrapper) return;

      // Find and click delete/remove button if present
      const deleteBtn = wrapper.querySelector('[class*="delete"], [class*="remove"], .anticon-delete, .anticon-close');
      if (deleteBtn) {
        deleteBtn.click();
        console.log('[PixSim7] Clicked delete button to clear upload');
        return;
      }

      // Reset the preview div's background
      const previewDiv = wrapper.querySelector('[style*="background-image"]');
      if (previewDiv) {
        previewDiv.style.backgroundImage = '';
        // Show placeholder again
        const placeholder = previewDiv.querySelector('div[style*="display: none"], svg[style*="display: none"]');
        if (placeholder) {
          placeholder.style.display = '';
        }
      }

      // Clear file input
      const fileInput = wrapper.querySelector('input[type="file"]');
      if (fileInput) {
        fileInput.value = '';
      }

      console.log('[PixSim7] Cleared upload container');
    } catch (e) {
      console.warn('[PixSim7] Failed to clear container:', e);
    }
  }

  /**
   * Get correct MIME type from URL or default to jpeg
   */
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

  /**
   * Inject an image into Pixverse's upload input
   * For Pixverse URLs: tries to set preview directly first
   * For other URLs: fetches and uploads via file input
   * @param {string} imageUrl - URL of image to inject
   * @param {HTMLInputElement} targetInput - Optional specific input to use
   */
  async function injectImageToUpload(imageUrl, targetInput = null) {
    try {
      // Find available upload inputs
      const uploads = findUploadInputs();

      if (uploads.length === 0) {
        showToast('No upload area found', false);
        return false;
      }

      // Use targetInput if specified, otherwise first result (already sorted by priority)
      const targetUpload = targetInput
        ? uploads.find(u => u.input === targetInput) || uploads[0]
        : uploads[0];

      const fileInput = targetUpload.input;
      const container = targetUpload.container;

      if (!fileInput) {
        showToast('Upload area not found', false);
        return false;
      }

      // Clear existing image first
      if (targetUpload.hasImage) {
        clearUploadContainer(container);
        // Small delay to let the clear take effect
        await new Promise(r => setTimeout(r, 200));
      }

      // For images already on Pixverse CDN, use upload interception
      // This triggers a fake upload that returns our existing URL
      const isPixverseUrl = imageUrl.includes('media.pixverse.ai');
      if (isPixverseUrl) {
        console.log('[PixSim7] Using upload interception for Pixverse URL');
        showToast('Setting image...', true);

        // Set pending URL for interceptor (in page context)
        setPendingImageUrl(imageUrl);

        // Create a tiny valid image to trigger the upload flow
        // Using a 1x1 transparent PNG
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

        // Trigger upload - interceptor will return our URL
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));

        setTimeout(() => showToast('Image set!', true), 300);
        return true;
      }

      // For other URLs, fetch and upload normally
      showToast('Fetching image...', true);

      // Fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

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
        // Try without CORS mode as fallback
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

      showToast('Processing image...', true);
      const blob = await response.blob();

      // Check if we got actual data
      if (blob.size === 0) {
        throw new Error('Empty image data received');
      }

      console.log('[PixSim7] Fetched blob:', blob.size, 'bytes, type:', blob.type);

      // Determine filename and MIME type from URL
      let urlPath = imageUrl.split('/').pop().split('?')[0];
      let filename = decodeURIComponent(urlPath) || '';

      // If filename doesn't look like an image file, generate one
      if (!filename || !filename.match(/\.(png|jpg|jpeg|webp|gif)$/i)) {
        // Generate unique filename based on timestamp
        const ext = getMimeTypeFromUrl(imageUrl).split('/')[1] || 'jpg';
        filename = `image_${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`;
        console.log('[PixSim7] Generated filename:', filename);
      }

      // Ensure correct MIME type - Pixverse only accepts png, jpeg, webp
      let mimeType = getMimeTypeFromUrl(imageUrl);

      // If blob has a type, validate it; otherwise use URL-derived type
      if (blob.type && ['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) {
        mimeType = blob.type;
      }

      // Ensure filename has correct extension matching MIME type
      const extMap = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
      const expectedExt = extMap[mimeType] || '.jpg';
      if (!filename.match(/\.(png|jpg|jpeg|webp)$/i)) {
        filename = filename.replace(/\.[^.]+$/, '') + expectedExt;
        if (!filename.includes('.')) {
          filename += expectedExt;
        }
      }

      console.log('[PixSim7] Creating file:', filename, 'type:', mimeType, 'size:', blob.size);

      // Create a File from the blob with correct MIME type
      const file = new File([blob], filename, { type: mimeType });

      // Use DataTransfer to set the file input's files
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      showToast('Uploading to Pixverse...', true);

      console.log('[PixSim7] File input accept:', fileInput.accept);
      console.log('[PixSim7] File object:', file.name, file.type, file.size);
      console.log('[PixSim7] DataTransfer files:', dataTransfer.files.length);

      // Dispatch change event to trigger the upload
      const changeEvent = new Event('change', { bubbles: true, cancelable: true });
      fileInput.dispatchEvent(changeEvent);

      // Also try input event
      fileInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Note: The actual upload happens asynchronously by Pixverse's code
      // We can't easily detect when it completes, so we just report success
      // after triggering. User will see Pixverse's own loading indicator.
      setTimeout(() => showToast('Upload triggered!', true), 500);
      return true;
    } catch (e) {
      console.error('[PixSim7] Failed to inject image:', e);
      showToast('Failed to add image', false);
      return false;
    }
  }

  /**
   * Restore all images automatically
   * Distributes images across available empty upload inputs
   */
  async function restoreAllImages(images, panel) {
    let success = 0;

    // Get all available upload inputs
    const uploads = findUploadInputs();
    const emptyUploads = uploads.filter(u => !u.hasImage);

    for (let i = 0; i < images.length; i++) {
      const url = images[i];

      // Try to use a specific empty upload slot if available
      // Otherwise fall back to auto-detection
      const targetInput = emptyUploads[i]?.input || null;

      const result = await injectImageToUpload(url, targetInput);
      if (result) {
        success++;
        // Mark this upload as used for subsequent iterations
        if (emptyUploads[i]) {
          emptyUploads[i].hasImage = true;
        }
      }
      // Small delay between uploads
      await new Promise(r => setTimeout(r, 500));
    }

    if (success === images.length) {
      panel?.remove();
    }
    return success;
  }

  // Track recent images from the site for the unified picker
  let recentSiteImages = [];

  /**
   * Scan the page for currently uploaded images in upload areas
   */
  function scanPageForImages() {
    const images = new Set();

    // Check for img tags with pixverse media URLs
    document.querySelectorAll('img[src*="media.pixverse.ai"]').forEach(img => {
      const src = img.src.split('?')[0];
      if (src) images.add(src);
    });

    // Check for background images with pixverse media URLs
    document.querySelectorAll('[style*="media.pixverse.ai"]').forEach(el => {
      const style = el.getAttribute('style') || '';
      const match = style.match(/url\(["']?(https:\/\/media\.pixverse\.ai[^"')\s]+)/);
      if (match) {
        images.add(match[1].split('?')[0]);
      }
    });

    return Array.from(images);
  }

  function showImageRestorePanel(images) {
    // Store images for the unified picker
    recentSiteImages = images;
    // Show unified picker with Recent tab active
    showUnifiedImagePicker('recent');
  }

  /**
   * Unified Image Picker with tabs for Recent (site images) and Assets (backend)
   */
  function showUnifiedImagePicker(activeTab = 'assets') {
    // Remove existing panels/menus
    document.querySelectorAll('.pxs7-restore-panel, .pxs7-image-picker').forEach(p => p.remove());
    closeMenus();

    // Scan page for current images and merge with stored recent images
    const pageImages = scanPageForImages();
    const allRecent = new Set([...recentSiteImages, ...pageImages]);
    recentSiteImages = Array.from(allRecent);

    const panel = document.createElement('div');
    panel.className = 'pxs7-image-picker';
    panel.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 2147483647;
      background: ${COLORS.bg};
      border: 1px solid ${COLORS.border};
      border-radius: 8px;
      width: 320px;
      max-height: 480px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      flex-direction: column;
      resize: both;
      overflow: hidden;
    `;

    let isMinimized = false;

    // Header - draggable
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      cursor: move;
      background: rgba(0,0,0,0.2);
      border-radius: 8px 8px 0 0;
      user-select: none;
    `;

    const title = document.createElement('span');
    title.style.cssText = `font-size: 12px; font-weight: 600; color: ${COLORS.text};`;
    title.textContent = '🖼 Image Picker';
    header.appendChild(title);

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display: flex; gap: 8px;';

    // Minimize button
    const minBtn = document.createElement('button');
    minBtn.textContent = '−';
    minBtn.title = 'Minimize';
    minBtn.style.cssText = `
      background: none;
      border: none;
      color: ${COLORS.textMuted};
      font-size: 16px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
      width: 20px;
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

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.title = 'Close';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: ${COLORS.textMuted};
      font-size: 18px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
      width: 20px;
    `;
    closeBtn.addEventListener('click', () => panel.remove());
    btnGroup.appendChild(closeBtn);

    header.appendChild(btnGroup);
    panel.appendChild(header);

    // Make draggable
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target === minBtn || e.target === closeBtn) return;
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

    // Panel body (collapsible)
    const panelBody = document.createElement('div');
    panelBody.style.cssText = 'display: flex; flex-direction: column; flex: 1; overflow: hidden;';

    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.style.cssText = `
      display: flex;
      border-bottom: 1px solid ${COLORS.border};
      margin: 8px 12px 0;
    `;

    const tabs = [
      { id: 'recent', label: 'Recent', count: recentSiteImages.length },
      { id: 'assets', label: 'Assets', count: assetsCache.length }
    ];

    const contentContainer = document.createElement('div');
    contentContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 10px 12px;
    `;

    tabs.forEach(tab => {
      const tabBtn = document.createElement('button');
      tabBtn.dataset.tab = tab.id;
      const hasItems = tab.count > 0;
      tabBtn.style.cssText = `
        flex: 1;
        padding: 8px;
        font-size: 11px;
        font-weight: 600;
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        color: ${COLORS.textMuted};
        cursor: pointer;
        transition: all 0.15s;
      `;
      tabBtn.innerHTML = `${tab.label} ${hasItems ? `<span style="opacity:0.6">(${tab.count})</span>` : ''}`;

      if (tab.id === activeTab) {
        tabBtn.style.color = COLORS.accent;
        tabBtn.style.borderBottomColor = COLORS.accent;
      }

      tabBtn.addEventListener('click', () => {
        // Update tab styles
        tabBar.querySelectorAll('button').forEach(b => {
          b.style.color = COLORS.textMuted;
          b.style.borderBottomColor = 'transparent';
        });
        tabBtn.style.color = COLORS.accent;
        tabBtn.style.borderBottomColor = COLORS.accent;

        // Render content
        renderTabContent(tab.id, contentContainer, panel);
      });

      tabBar.appendChild(tabBtn);
    });

    panelBody.appendChild(tabBar);
    panelBody.appendChild(contentContainer);
    panel.appendChild(panelBody);

    // Render initial tab content
    renderTabContent(activeTab, contentContainer, panel);

    document.body.appendChild(panel);
  }

  function renderTabContent(tabId, container, panel) {
    container.innerHTML = '';

    if (tabId === 'recent') {
      renderRecentTab(container, panel);
    } else {
      renderAssetsTab(container, panel);
    }
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

    // Actions row
    const actionsRow = document.createElement('div');
    actionsRow.style.cssText = `
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
    `;

    const restoreAllBtn = document.createElement('button');
    restoreAllBtn.textContent = '↻ Restore All';
    restoreAllBtn.style.cssText = `
      flex: 1;
      padding: 6px;
      font-size: 10px;
      font-weight: 600;
      background: ${COLORS.accent};
      border: none;
      border-radius: 4px;
      color: white;
      cursor: pointer;
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
      padding: 6px 10px;
      font-size: 10px;
      background: transparent;
      border: 1px solid ${COLORS.border};
      border-radius: 4px;
      color: ${COLORS.textMuted};
      cursor: pointer;
    `;
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(recentSiteImages.join('\n')).then(() => {
        showToast(`Copied ${recentSiteImages.length} URL(s)!`, true);
      });
    });

    actionsRow.appendChild(restoreAllBtn);
    actionsRow.appendChild(copyBtn);
    container.appendChild(actionsRow);

    // Image grid
    const grid = createImageGrid(recentSiteImages, (url) => {
      return url + '?x-oss-process=style/cover-webp-small';
    });
    container.appendChild(grid);
  }

  function renderAssetsTab(container, panel) {
    // Prepare asset URLs first to get accurate count
    // Note: remote_url is used for Pixverse openapi uploads
    const urls = assetsCache.map(a => ({
      thumb: a.thumbnail_url || a.remote_url || a.file_url || a.external_url || a.url || a.src,
      full: a.remote_url || a.file_url || a.external_url || a.url || a.src || a.thumbnail_url,
      name: a.name || a.original_filename || a.filename || a.title || ''
    })).filter(u => u.thumb); // Only include assets with a valid URL

    // Refresh button row
    const headerRow = document.createElement('div');
    headerRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    `;

    const countLabel = document.createElement('span');
    countLabel.style.cssText = `font-size: 10px; color: ${COLORS.textMuted};`;
    const totalText = assetsTotalCount > 0 ? ` of ${assetsTotalCount}` : '';
    countLabel.textContent = urls.length > 0 ? `${urls.length}${totalText} image${urls.length !== 1 ? 's' : ''}` : '';

    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '↻ Refresh';
    refreshBtn.style.cssText = `
      padding: 4px 8px;
      font-size: 10px;
      background: transparent;
      border: 1px solid ${COLORS.border};
      border-radius: 4px;
      color: ${COLORS.textMuted};
      cursor: pointer;
    `;
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.textContent = '...';
      await loadAssets(true, false);
      renderTabContent('assets', container, panel);
    });

    headerRow.appendChild(countLabel);
    headerRow.appendChild(refreshBtn);
    container.appendChild(headerRow);

    if (urls.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.cssText = `text-align: center; padding: 30px 10px; color: ${COLORS.textMuted};`;
      emptyDiv.innerHTML = `
        <div style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;">📁</div>
        <div style="font-size: 11px;">No assets found</div>
        <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">
          Upload images via the main app
        </div>
      `;
      container.appendChild(emptyDiv);
      return;
    }

    const grid = createImageGrid(urls, (item) => item.thumb, (item) => item.full, (item) => item.name);
    container.appendChild(grid);

    // Load More button (if there are more assets available)
    const hasMore = assetsTotalCount === 0 || assetsLoadedCount < assetsTotalCount;
    if (hasMore) {
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.textContent = 'Load More';
      loadMoreBtn.style.cssText = `
        width: 100%;
        padding: 8px;
        margin-top: 10px;
        font-size: 11px;
        font-weight: 600;
        background: ${COLORS.accent};
        border: none;
        border-radius: 4px;
        color: white;
        cursor: pointer;
        transition: opacity 0.2s;
      `;
      loadMoreBtn.addEventListener('mouseover', () => {
        loadMoreBtn.style.opacity = '0.8';
      });
      loadMoreBtn.addEventListener('mouseout', () => {
        loadMoreBtn.style.opacity = '1';
      });
      loadMoreBtn.addEventListener('click', async () => {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = 'Loading...';
        await loadAssets(false, true);
        renderTabContent('assets', container, panel);
      });
      container.appendChild(loadMoreBtn);
    }
  }

  // Hover preview element (shared across grid)
  let hoverPreview = null;
  let hoverTimeout = null;

  function showHoverPreview(imgUrl, anchorEl) {
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      if (!hoverPreview) {
        hoverPreview = document.createElement('div');
        hoverPreview.style.cssText = `
          position: fixed;
          z-index: 2147483647;
          background: ${COLORS.bg};
          border: 2px solid ${COLORS.accent};
          border-radius: 8px;
          padding: 4px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.5);
          pointer-events: none;
          max-width: 280px;
          max-height: 280px;
        `;
        document.body.appendChild(hoverPreview);
      }

      hoverPreview.innerHTML = `<img src="${imgUrl}" style="
        max-width: 100%;
        max-height: 260px;
        border-radius: 4px;
        display: block;
      "/>`;

      // Position to the left of the picker panel
      const rect = anchorEl.getBoundingClientRect();
      const previewWidth = 280;
      let x = rect.left - previewWidth - 12;
      let y = rect.top;

      // If no room on left, show on right
      if (x < 10) {
        x = rect.right + 12;
      }

      // Keep within viewport
      y = Math.max(10, Math.min(y, window.innerHeight - 290));

      hoverPreview.style.left = `${x}px`;
      hoverPreview.style.top = `${y}px`;
      hoverPreview.style.display = 'block';
    }, 300); // Delay before showing preview
  }

  function hideHoverPreview() {
    clearTimeout(hoverTimeout);
    if (hoverPreview) {
      hoverPreview.style.display = 'none';
    }
  }

  function createImageGrid(items, getThumbUrl, getFullUrl = null, getName = null) {
    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
    `;

    items.forEach((item, idx) => {
      const thumbUrl = typeof getThumbUrl === 'function' ? getThumbUrl(item) : item;
      const fullUrl = getFullUrl ? getFullUrl(item) : (typeof item === 'string' ? item : item);
      const name = getName ? getName(item) : null;

      const thumb = document.createElement('div');
      thumb.style.cssText = `
        position: relative;
        aspect-ratio: 1;
        border-radius: 4px;
        overflow: hidden;
        cursor: pointer;
        border: 2px solid ${COLORS.border};
        transition: border-color 0.2s, transform 0.15s;
      `;

      const img = document.createElement('img');
      img.src = thumbUrl;
      img.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: cover;
      `;
      img.loading = 'lazy';
      thumb.appendChild(img);

      if (name) {
        thumb.title = name;
      }

      thumb.addEventListener('mouseenter', () => {
        thumb.style.borderColor = COLORS.accent;
        thumb.style.transform = 'scale(1.05)';
        // Show larger preview with full URL
        showHoverPreview(fullUrl || thumbUrl, thumb);
      });
      thumb.addEventListener('mouseleave', () => {
        thumb.style.borderColor = COLORS.border;
        thumb.style.transform = 'scale(1)';
        hideHoverPreview();
      });

      thumb.addEventListener('click', async () => {
        thumb.style.opacity = '0.5';
        thumb.style.pointerEvents = 'none';
        const success = await injectImageToUpload(fullUrl);
        if (success) {
          thumb.style.borderColor = COLORS.success;
          thumb.style.opacity = '1';
          thumb.style.pointerEvents = 'auto';
        } else {
          // Fallback: copy URL
          await navigator.clipboard.writeText(fullUrl);
          showToast('URL copied - paste manually', true);
          thumb.style.opacity = '1';
          thumb.style.pointerEvents = 'auto';
        }
      });

      grid.appendChild(thumb);
    });

    return grid;
  }

  // ===== Storage =====

  async function loadSelectedAccount() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY_SELECTED_ACCOUNT);
      if (stored[STORAGE_KEY_SELECTED_ACCOUNT]) {
        selectedAccountId = stored[STORAGE_KEY_SELECTED_ACCOUNT];
      }
    } catch (e) {}
  }

  async function saveSelectedAccount(accountId) {
    try {
      selectedAccountId = accountId;
      await chrome.storage.local.set({ [STORAGE_KEY_SELECTED_ACCOUNT]: accountId });
    } catch (e) {}
  }

  async function loadSelectedPreset() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY_SELECTED_PRESET);
      if (stored[STORAGE_KEY_SELECTED_PRESET]) {
        selectedPresetId = stored[STORAGE_KEY_SELECTED_PRESET];
      }
    } catch (e) {}
  }

  async function saveSelectedPreset(presetId) {
    try {
      selectedPresetId = presetId;
      await chrome.storage.local.set({ [STORAGE_KEY_SELECTED_PRESET]: presetId });
    } catch (e) {}
  }

  function getCurrentPreset() {
    if (selectedPresetId && presetsCache.length > 0) {
      const preset = presetsCache.find(p => p.id === selectedPresetId);
      if (preset) return preset;
    }
    return presetsCache[0] || null;
  }

  async function loadAccountSort() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY_ACCOUNT_SORT);
      if (stored[STORAGE_KEY_ACCOUNT_SORT]) {
        accountSortBy = stored[STORAGE_KEY_ACCOUNT_SORT];
      }
    } catch (e) {}
  }

  async function saveAccountSort(sortBy) {
    accountSortBy = sortBy;
    try {
      await chrome.storage.local.set({ [STORAGE_KEY_ACCOUNT_SORT]: sortBy });
    } catch (e) {}
  }

  function getSortedAccounts(accounts) {
    const sorted = [...accounts];
    switch (accountSortBy) {
      case 'name':
        sorted.sort((a, b) => {
          const nameA = (a.nickname || a.email || '').toLowerCase();
          const nameB = (b.nickname || b.email || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
        break;
      case 'recent':
        sorted.sort((a, b) => {
          const timeA = a.last_used_at || a.updated_at || 0;
          const timeB = b.last_used_at || b.updated_at || 0;
          return new Date(timeB) - new Date(timeA);
        });
        break;
      case 'credits':
      default:
        sorted.sort((a, b) => (b.total_credits || 0) - (a.total_credits || 0));
        break;
    }
    return sorted;
  }

  async function loadCurrentSessionAccount() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY_PROVIDER_SESSIONS);
      const sessions = stored[STORAGE_KEY_PROVIDER_SESSIONS] || {};
      const pv = sessions['pixverse'];
      if (pv?.accountId) {
        currentSessionAccountId = pv.accountId;
      }
    } catch (e) {}
  }

  // ===== Data Loading =====

  function getCurrentAccount() {
    if (selectedAccountId && accountsCache.length > 0) {
      const account = accountsCache.find(a => a.id === selectedAccountId);
      if (account) return account;
    }
    // Fallback: current session, then first account
    if (currentSessionAccountId && accountsCache.length > 0) {
      const account = accountsCache.find(a => a.id === currentSessionAccountId);
      if (account) return account;
    }
    return accountsCache[0] || null;
  }

  function getCurrentSessionAccount() {
    if (currentSessionAccountId && accountsCache.length > 0) {
      return accountsCache.find(a => a.id === currentSessionAccountId) || null;
    }
    return null;
  }

  // Helper to add timeout to sendMessage
  function sendMessageWithTimeout(msg, timeoutMs = 3000) {
    return Promise.race([
      chrome.runtime.sendMessage(msg),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('sendMessage timeout')), timeoutMs)
      )
    ]);
  }

  async function loadAccounts() {
    try {
      const res = await sendMessageWithTimeout({
        action: 'getAccounts',
        providerId: 'pixverse'
      });
      if (res?.success && Array.isArray(res.data)) {
        accountsCache = res.data.filter(a =>
          a.status === 'active' || (a.total_credits && a.total_credits > 0)
        );
        // Sorting done at display time via getSortedAccounts()

        // Prefetch ad status for all accounts in background
        prefetchAdStatus(accountsCache);

        return accountsCache;
      }
    } catch (e) {
      // Timeout or error - continue with empty cache
    }
    return [];
  }

  // Prefetch ad status for accounts (background, no await)
  function prefetchAdStatus(accounts) {
    accounts.forEach(account => {
      // Skip if recently cached
      const cached = adStatusCache.get(account.id);
      if (cached && (Date.now() - cached.time) < 60000) return;

      sendMessageWithTimeout({
        action: 'getPixverseStatus',
        accountId: account.id
      }, 5000).then(res => {
        if (res?.success && res.data) {
          adStatusCache.set(account.id, { data: res.data, time: Date.now() });
        }
      }).catch(() => {});
    });
  }

  // Refresh ad status for a single account (force refresh, ignores cache TTL)
  function refreshAccountAdStatus(accountId) {
    sendMessageWithTimeout({
      action: 'getPixverseStatus',
      accountId
    }, 5000).then(res => {
      if (res?.success && res.data) {
        adStatusCache.set(accountId, { data: res.data, time: Date.now() });
        // Update buttons to reflect new data
        updateAllAccountButtons();
      }
    }).catch(() => {});
  }

  async function loadPresets() {
    try {
      const res = await sendMessageWithTimeout({
        action: 'getPresets',
        providerId: 'pixverse'
      });
      if (res?.success && Array.isArray(res.data)) {
        // Filter out "snippet(s)" - check both type and category fields
        presetsCache = res.data.filter(p => {
          const typeStr = (p.type || '').toLowerCase();
          const catStr = (p.category || '').toLowerCase();
          return !typeStr.includes('snippet') && !catStr.includes('snippet');
        });
        return presetsCache;
      }
    } catch (e) {
      // Timeout or error - continue with empty cache
    }
    return [];
  }

  async function loadAssets(forceRefresh = false, append = false) {
    if (assetsCache.length > 0 && !forceRefresh && !append) {
      return assetsCache;
    }
    try {
      const limit = 100;
      const offset = append ? assetsLoadedCount : 0;

      const res = await sendMessageWithTimeout({
        action: 'getAssets',
        limit: limit,
        offset: offset
      });

      if (!res?.success) {
        return [];
      }

      // Handle different response formats
      let items = res.data;
      let total = null;
      if (items && !Array.isArray(items)) {
        total = items.total || items.count || null;
        items = items.items || items.assets || items.data || [];
      }

      if (!Array.isArray(items)) {
        return [];
      }

      // Filter to only images
      const newImages = items.filter(a => {
        if (a.media_type === 'image') return true;
        if (a.type === 'image') return true;
        const path = a.file_path || a.file_url || a.external_url || a.remote_url || a.url || '';
        if (path.match(/\.(jpg|jpeg|png|webp|gif)$/i)) return true;
        if (a.mime_type?.startsWith('image/')) return true;
        if (a.file_url || a.external_url || a.remote_url || a.thumbnail_url) return true;
        return false;
      });

      if (append) {
        assetsCache = [...assetsCache, ...newImages];
      } else {
        assetsCache = newImages;
      }

      assetsLoadedCount = assetsCache.length;
      if (total !== null) {
        assetsTotalCount = total;
      }

      return assetsCache;
    } catch (e) {
      console.warn('[PixSim7] Failed to load assets:', e);
    }
    return [];
  }

  // ===== Actions =====

  async function executePreset(presetId) {
    const account = getCurrentAccount();
    if (!account) {
      showToast('Select an account first', false);
      return false;
    }

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'executePreset',
        presetId: presetId,
        accountId: account.id
      });

      if (res?.success) {
        showToast(`Queued for ${account.nickname || account.email}`, true);
        return true;
      } else {
        showToast(res?.error || 'Failed', false);
        return false;
      }
    } catch (e) {
      showToast(e.message || 'Error', false);
      return false;
    }
  }

  async function loginWithAccount() {
    const account = getCurrentAccount();
    if (!account) {
      showToast('Select an account first', false);
      return false;
    }

    // Save current input state before page reloads
    saveInputState();

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'loginWithAccount',
        accountId: account.id,
        accountEmail: account.email
        // No tabId needed - background uses sender.tab.id
      });

      if (res?.success) {
        // Update current session locally
        currentSessionAccountId = account.id;
        showToast(`Switched to ${account.nickname || account.email}`, true);
        return true;
      } else {
        showToast(res?.error || 'Login failed', false);
        return false;
      }
    } catch (e) {
      showToast(e.message || 'Error', false);
      return false;
    }
  }

  // ===== UI Helpers =====

  function showToast(message, success = true) {
    document.querySelectorAll('.pxs7-toast').forEach(t => t.remove());
    const toast = document.createElement('div');
    toast.className = `pxs7-toast pxs7-toast--${success ? 'success' : 'error'}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  function closeMenus() {
    document.querySelectorAll(`.${MENU_CLASS}`).forEach(m => m.remove());
  }

  function positionMenu(menu, anchor) {
    const rect = anchor.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.left;

    // Adjust for viewport
    setTimeout(() => {
      const menuRect = menu.getBoundingClientRect();
      if (left + menuRect.width > window.innerWidth - 10) {
        left = window.innerWidth - menuRect.width - 10;
      }
      if (top + menuRect.height > window.innerHeight - 10) {
        top = rect.top - menuRect.height - 4;
      }
      menu.style.top = `${Math.max(10, top)}px`;
      menu.style.left = `${Math.max(10, left)}px`;
    }, 0);

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }

  function setupOutsideClick(menu, anchor) {
    const handler = (e) => {
      if (!menu.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) {
        menu.remove();
        document.removeEventListener('mousedown', handler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
  }

  // ===== Account Menu =====

  function showAccountMenu(btn, onSelect) {
    closeMenus();

    const menu = document.createElement('div');
    menu.className = MENU_CLASS;

    const currentSession = getCurrentSessionAccount();
    const selected = getCurrentAccount();

    // Current Session Section
    if (currentSession) {
      const section = document.createElement('div');
      section.className = `${MENU_CLASS}__section`;
      section.textContent = 'Browser Session';
      menu.appendChild(section);

      const item = createAccountMenuItem(currentSession, {
        isCurrent: true,
        isSelected: selected?.id === currentSession.id
      });
      item.addEventListener('click', async () => {
        await saveSelectedAccount(currentSession.id);
        menu.remove();
        if (onSelect) onSelect(currentSession);
      });
      menu.appendChild(item);

      menu.appendChild(document.createElement('div')).className = `${MENU_CLASS}__divider`;
    }

    // All Accounts Section with sort & refresh
    const sectionHeader = document.createElement('div');
    sectionHeader.className = `${MENU_CLASS}__section`;
    sectionHeader.style.cssText = 'display: flex; align-items: center; gap: 4px;';
    sectionHeader.innerHTML = `<span style="flex:1">Accounts</span>`;

    // Sort buttons
    const sortOpts = [
      { id: 'credits', label: '💰', title: 'Sort by credits' },
      { id: 'name', label: 'A-Z', title: 'Sort by name' },
      { id: 'recent', label: '🕐', title: 'Sort by recent' }
    ];
    sortOpts.forEach(opt => {
      const sortBtn = document.createElement('button');
      sortBtn.className = `${MENU_CLASS}__sort`;
      sortBtn.textContent = opt.label;
      sortBtn.title = opt.title;
      sortBtn.style.cssText = `
        padding: 2px 4px; font-size: 9px; background: transparent;
        border: 1px solid ${accountSortBy === opt.id ? COLORS.accent : 'transparent'};
        border-radius: 3px; cursor: pointer; color: ${accountSortBy === opt.id ? COLORS.accent : COLORS.textMuted};
      `;
      sortBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await saveAccountSort(opt.id);
        menu.remove();
        showAccountMenu(btn, onSelect);
      });
      sectionHeader.appendChild(sortBtn);
    });

    // Refresh button
    const refreshBtn = document.createElement('button');
    refreshBtn.className = `${MENU_CLASS}__refresh`;
    refreshBtn.textContent = '↻';
    refreshBtn.title = 'Refresh';
    refreshBtn.style.cssText = 'margin-left: 4px;';
    refreshBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      refreshBtn.textContent = '...';
      await loadAccounts();
      await loadCurrentSessionAccount();
      menu.remove();
      showAccountMenu(btn, onSelect);
    });
    sectionHeader.appendChild(refreshBtn);
    menu.appendChild(sectionHeader);

    // Account list (excluding current if shown above), sorted
    const filteredAccounts = currentSession
      ? accountsCache.filter(a => a.id !== currentSession.id)
      : accountsCache;
    const otherAccounts = getSortedAccounts(filteredAccounts);

    if (otherAccounts.length === 0 && !currentSession) {
      const empty = document.createElement('div');
      empty.className = `${MENU_CLASS}__empty`;
      empty.textContent = 'No accounts available';
      menu.appendChild(empty);
    } else {
      otherAccounts.forEach(account => {
        const item = createAccountMenuItem(account, {
          isCurrent: false,
          isSelected: selected?.id === account.id
        });
        item.addEventListener('click', async () => {
          // Refresh ads for current account before switching (in background)
          const previousAccount = getCurrentAccount();
          if (previousAccount && previousAccount.id !== account.id) {
            refreshAccountAdStatus(previousAccount.id);
          }

          await saveSelectedAccount(account.id);
          menu.remove();
          if (onSelect) onSelect(account);
        });
        menu.appendChild(item);
      });
    }

    document.body.appendChild(menu);
    positionMenu(menu, btn);
    setupOutsideClick(menu, btn);
  }

  // Cache for Pixverse ad status
  const adStatusCache = new Map();

  function createAccountMenuItem(account, { isCurrent, isSelected }) {
    const item = document.createElement('button');
    item.className = `${MENU_CLASS}__item ${MENU_CLASS}__account`;
    if (isSelected) item.classList.add('selected');
    if (isCurrent) item.classList.add('current');

    const dot = document.createElement('div');
    dot.className = `${MENU_CLASS}__account-dot ${account.status || 'active'}`;

    const info = document.createElement('div');
    info.className = `${MENU_CLASS}__account-info`;

    const name = document.createElement('div');
    name.className = `${MENU_CLASS}__account-name`;
    name.textContent = account.nickname || account.email;
    name.title = account.email;
    info.appendChild(name);

    // Meta row with email (if nickname) and ads
    const meta = document.createElement('div');
    meta.className = `${MENU_CLASS}__account-meta`;
    meta.style.cssText = 'display: flex; gap: 8px; align-items: center;';

    if (account.nickname) {
      const emailSpan = document.createElement('span');
      emailSpan.textContent = account.email;
      meta.appendChild(emailSpan);
    }

    // Ads pill - show from cache only
    const cached = adStatusCache.get(account.id);
    if (cached?.data) {
      const adsPill = document.createElement('span');
      adsPill.style.cssText = `
        font-size: 9px;
        padding: 1px 4px;
        border-radius: 3px;
        background: rgba(0,0,0,0.2);
        color: ${COLORS.textMuted};
      `;
      renderAdsPill(adsPill, cached.data);
      meta.appendChild(adsPill);
    }

    info.appendChild(meta);

    item.appendChild(dot);
    item.appendChild(info);

    // Badges
    if (isCurrent) {
      const badge = document.createElement('span');
      badge.className = `${MENU_CLASS}__account-badge ${MENU_CLASS}__account-badge--current`;
      badge.textContent = 'current';
      item.appendChild(badge);
    } else if (isSelected) {
      const badge = document.createElement('span');
      badge.className = `${MENU_CLASS}__account-badge ${MENU_CLASS}__account-badge--selected`;
      badge.textContent = 'selected';
      item.appendChild(badge);
    }

    const credits = document.createElement('span');
    credits.className = `${MENU_CLASS}__account-credits`;
    credits.textContent = account.total_credits || 0;
    item.appendChild(credits);

    return item;
  }

  function renderAdsPill(pillEl, payload) {
    const task = payload?.ad_watch_task;
    if (task && typeof task === 'object') {
      const total = task.total_counts ?? 0;
      // Cap progress at total to avoid showing 3/2
      const progress = Math.min(task.progress ?? 0, total);
      pillEl.textContent = `Ads ${progress}/${total}`;
      pillEl.title = `Watch-ad task: ${progress}/${total}`;
      if (progress >= total && total > 0) {
        pillEl.style.color = COLORS.success;
      }
    } else {
      pillEl.textContent = 'Ads 0/0';
    }
  }

  // ===== Preset Menu =====

  function showPresetMenu(btn, onSelect) {
    closeMenus();

    const menu = document.createElement('div');
    menu.className = MENU_CLASS;

    const section = document.createElement('div');
    section.className = `${MENU_CLASS}__section`;
    section.textContent = 'Select Default Preset';
    menu.appendChild(section);

    if (presetsCache.length === 0) {
      const empty = document.createElement('div');
      empty.className = `${MENU_CLASS}__empty`;
      empty.textContent = 'No presets available';
      menu.appendChild(empty);
    } else {
      const currentPreset = getCurrentPreset();
      presetsCache.forEach(preset => {
        const isSelected = currentPreset?.id === preset.id;
        const item = document.createElement('button');
        item.className = `${MENU_CLASS}__item`;
        if (isSelected) item.classList.add('selected');
        item.innerHTML = `
          <span style="opacity:0.5">${isSelected ? '✓' : '▶'}</span>
          <span style="flex:1">${preset.name || `Preset #${preset.id}`}</span>
          ${isSelected ? `<span style="font-size:9px;color:${COLORS.accent}">default</span>` : ''}
        `;
        item.style.cssText += 'display: flex; align-items: center; gap: 6px;';
        item.addEventListener('click', async () => {
          await saveSelectedPreset(preset.id);
          menu.remove();
          if (onSelect) onSelect(preset);
        });
        menu.appendChild(item);
      });
    }

    document.body.appendChild(menu);
    positionMenu(menu, btn);
    setupOutsideClick(menu, btn);
  }
  // ===== Button Group =====

  function updateAccountButton(btn) {
    const account = getCurrentAccount();
    const sessionAccount = getCurrentSessionAccount();
    const isMismatch = account && sessionAccount && account.id !== sessionAccount.id;

    btn.classList.toggle('mismatch', isMismatch);

    if (account) {
      const name = account.nickname || account.email?.split('@')[0] || 'Account';
      const truncated = name.length > 12 ? name.slice(0, 11) + '…' : name;
      const credits = account.total_credits || 0;

      // Get ads from cache
      const cached = adStatusCache.get(account.id);
      const adTask = cached?.data?.ad_watch_task;
      const adTotal = adTask?.total_counts || 0;
      const adProgress = Math.min(adTask?.progress || 0, adTotal);
      const adsText = adTask ? `${adProgress}/${adTotal}` : '';

      btn.innerHTML = `
        <span class="dot ${account.status || 'active'}"></span>
        <span class="name">${truncated}</span>
        <span style="font-size:10px;opacity:0.7;margin-left:2px;">${credits}cr${adsText ? ` · ${adsText}` : ''}</span>
        <span class="arrow">${isMismatch ? '⚠' : '▼'}</span>
      `;
      btn.title = isMismatch
        ? `Selected: ${account.email}\nBrowser: ${sessionAccount?.email || 'unknown'}\nClick Login to switch`
        : `${account.email}\n${credits} credits${adsText ? `\nAds: ${adsText}` : ''}`;
    } else {
      btn.innerHTML = `<span class="name">Account</span><span class="arrow">▼</span>`;
      btn.title = 'Select account';
    }
  }

  function updateRunButton(btn) {
    const preset = getCurrentPreset();
    if (preset) {
      const name = preset.name || `Preset #${preset.id}`;
      const truncated = name.length > 16 ? name.slice(0, 15) + '…' : name;
      btn.innerHTML = `<span style="opacity:0.6">▶</span> <span class="name">${truncated}</span>`;
      btn.title = `Run: ${preset.name}\nRight-click to change preset`;
    } else {
      btn.innerHTML = '<span style="opacity:0.6">▶</span> <span class="name">Run</span>';
      btn.title = 'No preset selected\nClick dropdown to select';
    }
  }

  function createButtonGroup() {
    const group = document.createElement('div');
    group.className = BTN_GROUP_CLASS;

    // Account button
    const accountBtn = document.createElement('button');
    accountBtn.className = `${BTN_CLASS} ${BTN_CLASS}--account`;
    updateAccountButton(accountBtn);

    accountBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (accountsCache.length === 0) {
        const orig = accountBtn.innerHTML;
        accountBtn.innerHTML = '<span class="name">...</span>';
        await loadAccounts();
        updateAccountButton(accountBtn);
      }

      showAccountMenu(accountBtn, () => updateAccountButton(accountBtn));
    });

    // Login button
    const loginBtn = document.createElement('button');
    loginBtn.className = `${BTN_CLASS} ${BTN_CLASS}--login`;
    loginBtn.textContent = '↪';
    loginBtn.title = 'Login with selected account';

    loginBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      loginBtn.classList.add('loading');
      const origText = loginBtn.textContent;
      loginBtn.textContent = '...';

      await loginWithAccount();

      loginBtn.classList.remove('loading');
      loginBtn.textContent = origText;
      updateAccountButton(accountBtn);
    });

    // Assets button
    const assetsBtn = document.createElement('button');
    assetsBtn.className = `${BTN_CLASS} ${BTN_CLASS}--assets`;
    assetsBtn.textContent = '🖼';
    assetsBtn.title = 'Image picker (assets & recent)';
    assetsBtn.style.cssText += `color: ${COLORS.success};`;

    assetsBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (assetsCache.length === 0) {
        assetsBtn.classList.add('loading');
        const origText = assetsBtn.textContent;
        assetsBtn.textContent = '...';
        await loadAssets();
        assetsBtn.classList.remove('loading');
        assetsBtn.textContent = origText;
      }

      // Show unified picker - default to Assets tab, but Recent if there are recent images
      const defaultTab = recentSiteImages.length > 0 ? 'recent' : 'assets';
      showUnifiedImagePicker(defaultTab);
    });

    // Run button - shows selected preset, click to run
    const runBtn = document.createElement('button');
    runBtn.className = `${BTN_CLASS} ${BTN_CLASS}--run`;
    updateRunButton(runBtn);

    runBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const account = getCurrentAccount();
      if (!account) {
        showToast('Select an account first', false);
        return;
      }

      const preset = getCurrentPreset();
      if (!preset) {
        showToast('No preset selected', false);
        return;
      }

      runBtn.classList.add('loading');
      const origHtml = runBtn.innerHTML;
      runBtn.innerHTML = '<span class="name">Running...</span>';
      await executePreset(preset.id);
      runBtn.classList.remove('loading');
      updateRunButton(runBtn);
    });

    // Right-click or long-press to change preset
    runBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showPresetMenu(runBtn, () => updateRunButton(runBtn));
    });

    // Preset selector dropdown button
    const presetArrow = document.createElement('button');
    presetArrow.className = `${BTN_CLASS}`;
    presetArrow.innerHTML = '▼';
    presetArrow.title = 'Select preset';
    presetArrow.style.cssText += 'padding: 4px 6px; font-size: 8px;';
    presetArrow.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showPresetMenu(presetArrow, () => updateRunButton(runBtn));
    });

    group.appendChild(accountBtn);
    group.appendChild(loginBtn);
    group.appendChild(assetsBtn);
    group.appendChild(runBtn);
    group.appendChild(presetArrow);

    return { group, accountBtn, runBtn };
  }

  // ===== DOM Processing =====

  const accountBtnRefs = [];
  const runBtnRefs = [];

  function processTaskElements() {
    const tasks = document.querySelectorAll(TASK_SELECTOR);

    tasks.forEach(task => {
      if (task.hasAttribute(PROCESSED_ATTR)) return;
      task.setAttribute(PROCESSED_ATTR, 'true');

      const { group, accountBtn, runBtn } = createButtonGroup();
      accountBtnRefs.push(accountBtn);
      runBtnRefs.push(runBtn);

      if (task.nextSibling) {
        task.parentNode.insertBefore(group, task.nextSibling);
      } else {
        task.parentNode.appendChild(group);
      }
    });
  }

  // Update all account buttons when session changes
  function updateAllAccountButtons() {
    accountBtnRefs.forEach(btn => {
      if (btn.isConnected) updateAccountButton(btn);
    });
  }

  // Update all run buttons when presets load
  function updateAllRunButtons() {
    runBtnRefs.forEach(btn => {
      if (btn.isConnected) updateRunButton(btn);
    });
  }

  // ===== Init =====

  async function init() {
    injectStyle();

    // Setup interceptor in background - don't block init
    try {
      setupUploadInterceptor();
    } catch (e) {
      console.warn('[PixSim7] Interceptor setup failed:', e);
    }

    await Promise.all([
      loadSelectedAccount(),
      loadSelectedPreset(),
      loadAccountSort(),
      loadCurrentSessionAccount()
    ]);

    // Show buttons immediately, load data in background
    processTaskElements();

    // Load data in background (don't block)
    Promise.all([
      loadPresets(),
      loadAccounts(),
      loadAssets()
    ]).then(() => {
      updateAllAccountButtons();
      updateAllRunButtons();
    }).catch(e => {
      console.warn('[PixSim7] init: failed to load some data:', e);
    });

    // Restore any saved input state after a delay (wait for page to fully render)
    setTimeout(restoreInputState, 1000);

    // Watch for DOM changes
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          clearTimeout(observer._t);
          observer._t = setTimeout(processTaskElements, 200);
          break;
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Listen for session changes
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY_PROVIDER_SESSIONS]) {
        loadCurrentSessionAccount().then(updateAllAccountButtons);
      }
    });

    console.log('[PixSim7] Preset buttons ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }

})();
