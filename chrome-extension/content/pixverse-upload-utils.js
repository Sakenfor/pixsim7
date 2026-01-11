/**
 * Pixverse Upload Utilities
 * Handles upload detection, image injection, and input preservation
 */

(function() {
  'use strict';

  // Make utilities available globally for other scripts
  window.PXS7 = window.PXS7 || {};
  const storage = window.PXS7.storage || {};
  const { sendMessageWithTimeout, normalizeUrl, extractImageUrl } = window.PXS7.utils || {};
  const showToast = window.PXS7.showToast;

  const SESSION_KEY_PRESERVED_INPUT = 'pxs7_preserved_input';
  const DEBUG_IMAGE_PICKER = localStorage.getItem('pxs7_debug') === 'true';
  const debugLog = (...args) => DEBUG_IMAGE_PICKER && console.log('[PixSim7]', ...args);

  // Track if we've setup beforeunload handler
  let beforeUnloadSetup = false;

  // Persistent ID tracking for upload inputs
  const inputStableIdMap = new WeakMap();
  const baseIdCounters = {};

  // ===== Input Preservation =====

  function saveInputState() {
    try {
      const state = { inputs: {}, images: [], savedAt: Date.now() };

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
          const cleanUrl = normalizeUrl(src);
          if (!state.images.includes(cleanUrl)) {
            state.images.push(cleanUrl);
          }
        }
      });

      // Also check for background images in upload previews
      document.querySelectorAll('[style*="media.pixverse.ai"]').forEach(el => {
        const url = extractImageUrl(el.getAttribute('style'));
        if (url && !state.images.includes(url)) {
          state.images.push(url);
        }
      });

      // Check upload containers with preview images (various Pixverse CDN patterns)
      const cdnPatterns = ['pixverse-fe-upload', 'aliyuncs.com'];
      document.querySelectorAll('.ant-upload-wrapper img, [class*="upload"] img').forEach(img => {
        const src = img.src;
        if (src && cdnPatterns.some(p => src.includes(p))) {
          const cleanUrl = normalizeUrl(src);
          if (!state.images.includes(cleanUrl)) {
            state.images.push(cleanUrl);
          }
        }
      });

      // Save model selection if present
      const modelImg = document.querySelector('img[src*="asset/media/model/model-"]');
      const modelContainer = modelImg?.closest('div.cursor-pointer');
      const modelSpan = modelContainer?.querySelector('span.font-semibold, span[class*="font-semibold"]');
      if (modelSpan?.textContent?.trim()) {
        state.selectedModel = modelSpan.textContent.trim();
      }

      // Save aspect ratio selection if present
      const selectedRatio = document.querySelector('div[class*="aspect-"][class*="bg-button-secondary-hover"]');
      if (selectedRatio?.textContent?.trim()) {
        state.selectedAspectRatio = selectedRatio.textContent.trim();
      }

      // Save current URL path for context
      state.url = window.location.href;
      state.path = window.location.pathname;

      const hasContent = Object.keys(state.inputs).length > 0 ||
                         state.images.length > 0 ||
                         state.selectedModel ||
                         state.selectedAspectRatio;
      if (hasContent) {
        sessionStorage.setItem(SESSION_KEY_PRESERVED_INPUT, JSON.stringify(state));
        debugLog('Saved state:', Object.keys(state.inputs).length, 'inputs,', state.images.length, 'images,',
                 'model:', state.selectedModel || 'none', 'ratio:', state.selectedAspectRatio || 'none');
      } else {
        // Clear stale state if nothing to save
        sessionStorage.removeItem(SESSION_KEY_PRESERVED_INPUT);
      }

      return hasContent;
    } catch (e) {
      console.warn('[PixSim7] Failed to save input state:', e);
      return false;
    }
  }

  /**
   * Setup auto-save on page unload (refresh, navigation, close)
   */
  function setupAutoSave() {
    if (beforeUnloadSetup) return;
    beforeUnloadSetup = true;

    window.addEventListener('beforeunload', () => {
      saveInputState();
    });

    // Also save periodically when user is actively editing (debounced)
    let saveTimeout = null;
    const debouncedSave = () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(saveInputState, 2000);
    };

    // Listen for input changes on textareas
    document.addEventListener('input', (e) => {
      if (e.target.matches('textarea, [contenteditable="true"]')) {
        debouncedSave();
      }
    }, true);

    debugLog('Auto-save enabled');
  }

  /**
   * Restore saved input state from sessionStorage.
   * @param {Object} options - Options for restore behavior
   * @param {Function} options.showImageRestorePanel - Callback to show image restore UI (fallback)
   * @param {boolean} options.autoRestoreImages - If true, auto-restore images without panel (default: true)
   */
  async function restoreInputState(options = {}) {
    // Handle legacy call signature: restoreInputState(showImageRestorePanel)
    if (typeof options === 'function') {
      options = { showImageRestorePanel: options };
    }
    const { showImageRestorePanel, autoRestoreImages = true } = options;

    try {
      const saved = sessionStorage.getItem(SESSION_KEY_PRESERVED_INPUT);
      if (!saved) return { restored: false };

      const state = JSON.parse(saved);

      // Check if state is stale (older than 5 minutes)
      if (state.savedAt && Date.now() - state.savedAt > 5 * 60 * 1000) {
        debugLog('Saved state is stale, ignoring');
        sessionStorage.removeItem(SESSION_KEY_PRESERVED_INPUT);
        return { restored: false };
      }

      // Check if current page matches the saved page path
      const currentPath = window.location.pathname;
      const savedPath = state.path || '';

      debugLog('Restore check - currentPath:', currentPath, 'savedPath:', savedPath);

      // Extract page type from paths (e.g., /create/image, /transition, /fusion)
      const getPageType = (path) => {
        if (path.includes('/transition')) return 'transition';
        if (path.includes('/fusion')) return 'fusion';
        if (path.includes('/extend')) return 'extend';
        if (path.includes('/edit')) return 'edit';
        if (path.includes('/create/image') || path.includes('/image-generation') || path.includes('/create-image')) return 'image';
        if (path.includes('/image-text') || path.includes('/image_text')) return 'image-text';
        if (path.includes('/video') || path.includes('/create')) return 'video'; // Video generation pages
        return 'other';
      };

      const currentPageType = getPageType(currentPath);
      const savedPageType = getPageType(savedPath);

      debugLog('Page types - current:', currentPageType, 'saved:', savedPageType);

      // Only skip restore if page types are clearly different (not 'other')
      if (currentPageType !== savedPageType && currentPageType !== 'other' && savedPageType !== 'other') {
        debugLog('Page type mismatch, not restoring. Current:', currentPageType, 'Saved:', savedPageType);
        // Clear the saved state since it's for a different page type
        sessionStorage.removeItem(SESSION_KEY_PRESERVED_INPUT);
        return { restored: false };
      }

      const inputs = state.inputs || state;
      const images = state.images || [];
      let textRestored = 0;
      let imagesRestored = 0;

      debugLog('Restoring state:', {
        inputs: Object.keys(inputs).length,
        images: images.length,
        model: state.selectedModel,
        aspectRatio: state.selectedAspectRatio,
        pageType: currentPageType
      });

      // Use shared restore utilities
      const { restoreModel, restoreAspectRatio, restorePrompts, restoreContentEditables } = window.PXS7.restoreUtils || {};

      // === Restore model selection ===
      if (state.selectedModel && restoreModel) {
        await restoreModel(state.selectedModel);
        await new Promise(r => setTimeout(r, 400));
      }

      // === Restore aspect ratio ===
      if (state.selectedAspectRatio && restoreAspectRatio) {
        await restoreAspectRatio(state.selectedAspectRatio);
        await new Promise(r => setTimeout(r, 200));
      }

      // === Restore textareas ===
      if (restorePrompts) {
        textRestored += await restorePrompts(inputs);
      }

      // === Restore contenteditable ===
      if (restoreContentEditables) {
        textRestored += restoreContentEditables(inputs);
      }

      // === Restore images ===
      // Pass all images to restoreAllImages - it handles slot detection and adding slots
      if (images.length > 0) {
        if (autoRestoreImages) {
          // Auto-restore images using restoreAllImages (same as account switch flow)
          debugLog('Auto-restoring', images.length, 'images via restoreAllImages');
          const result = await restoreAllImages(images);
          imagesRestored = result.success;

          // Show panel for failed images only
          if (result.failed.length > 0 && showImageRestorePanel) {
            showImageRestorePanel(result.failed);
          }
        } else if (showImageRestorePanel) {
          // Show panel for all images (legacy behavior)
          showImageRestorePanel(images);
        }
      }

      // Show success message
      if (textRestored > 0 || imagesRestored > 0) {
        const parts = [];
        if (textRestored > 0) parts.push(`${textRestored} input(s)`);
        if (imagesRestored > 0) parts.push(`${imagesRestored} image(s)`);
        debugLog('Restored:', parts.join(', '));
        if (showToast) showToast(`Restored ${parts.join(' and ')}`, true);
      }

      sessionStorage.removeItem(SESSION_KEY_PRESERVED_INPUT);
      return { restored: textRestored > 0 || imagesRestored > 0, textRestored, imagesRestored };
    } catch (e) {
      console.warn('[PixSim7] Failed to restore input state:', e);
      return { restored: false, error: e.message };
    }
  }

  // ===== Upload Input Detection =====

  function findUploadInputs() {
    const results = [];
    const seenInputs = new Set();
    const url = window.location.pathname;
    const isImageTextPage = url.includes('image-text') || url.includes('image_text');
    const isImageGenPage = url.includes('create-image') || url.includes('image-generation') || url.includes('/create/image');
    const isTransitionPage = url.includes('/transition');
    const isFusionPage = url.includes('/fusion');
    const isExtendPage = url.includes('/extend');
    const isImageEditPage = url.includes('/edit') && !isExtendPage;

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
      if (seenInputs.has(input)) return;
      seenInputs.add(input);

      let container = input.closest('.ant-upload') ||
                      input.closest('.ant-upload-btn') ||
                      input.closest('[class*="ant-upload"]') ||
                      input.closest('[class*="upload"]');

      // Check if the slot is visible (not hidden)
      const checkVisibility = (el) => {
        if (!el) return false;
        // Check if element is rendered (has layout)
        if (el.offsetParent === null && el.style?.position !== 'fixed') {
          // File inputs are often hidden but their container should be visible
          const wrapper = el.closest('.ant-upload-wrapper') || el.closest('[class*="upload"]')?.parentElement;
          if (wrapper && wrapper.offsetParent !== null) return true;
          return false;
        }
        // Check computed style for display/visibility
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        // Check if element has non-zero dimensions
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
        return true;
      };

      // Skip hidden slots - check container visibility
      const slotContainer = container?.closest('.ant-upload-wrapper') ||
                           container?.parentElement?.parentElement ||
                           container;
      const isVisible = checkVisibility(slotContainer) || checkVisibility(container) || checkVisibility(input);

      // For transition/fusion pages, also check if the slot wrapper is actually rendered
      if (isTransitionPage || isFusionPage) {
        const uploadWrapper = input.closest('[class*="ant-upload"]')?.parentElement;
        if (uploadWrapper) {
          const wrapperRect = uploadWrapper.getBoundingClientRect();
          // If wrapper has zero dimensions, it's likely a hidden slot
          if (wrapperRect.width === 0 || wrapperRect.height === 0) {
            debugLog('[Slots] Skipping hidden transition/fusion slot');
            return; // Skip this slot
          }
        }
        // Also check the slot's direct parent container
        const slotParent = input.closest('[class*="ant-upload"]');
        if (slotParent) {
          const parentRect = slotParent.getBoundingClientRect();
          if (parentRect.width === 0 || parentRect.height === 0) {
            debugLog('[Slots] Skipping hidden slot (parent has no dimensions)');
            return;
          }
        }
      }

      // For any page, skip slots that are completely invisible
      if (!isVisible) {
        debugLog('[Slots] Skipping invisible slot');
        return;
      }

      const parentWithId = input.closest('[id]');
      const containerId = parentWithId?.id || '';

      let priority = 0;
      if (isImageTextPage && containerId.includes('image_text')) {
        priority = 10;
      } else if (isImageGenPage && containerId.includes('create_image')) {
        priority = 10;
      } else if (isTransitionPage && containerId.startsWith('transition')) {
        priority = 10;
      } else if (isFusionPage && containerId.startsWith('fusion')) {
        priority = 10;
      } else if (isExtendPage && (containerId.startsWith('extend') || containerId.includes('extend'))) {
        priority = 10;
      } else if (isImageEditPage && (containerId.includes('edit') || containerId.includes('image_edit'))) {
        priority = 10;
      }

      if (priority === 0) {
        const accept = input.getAttribute('accept') || '';
        const isImageInput = accept.includes('image');
        if (isImageInput && (isTransitionPage || isFusionPage || isExtendPage)) {
          priority = 10;
        }
      }

      if (priority === 0 && (containerId.includes('customer') || containerId.includes('main'))) {
        priority = 5;
      }
      if (containerId.includes('video')) {
        priority = 0;
      }

      let hasImage = false;
      if (container) {
        const parentArea = container.closest('.ant-upload-wrapper') || container.parentElement?.parentElement;
        if (parentArea) {
          const existingImg = parentArea.querySelector('img[src]:not([src=""]):not([src="#"])');
          const bgWithImage = parentArea.querySelector('[style*="background-image"]');
          const uploadListItem = parentArea.querySelector('.ant-upload-list-item, .ant-upload-list-picture-card-container');
          const previewEl = parentArea.querySelector('[class*="preview"], [class*="Preview"]');

          let imgHasContent = false;
          if (existingImg) {
            const src = existingImg.src || '';
            imgHasContent = src.length > 100 || src.includes('media.pixverse') || src.includes('blob:') || src.includes('aliyun');
          }

          let bgHasContent = false;
          if (bgWithImage) {
            const style = bgWithImage.getAttribute('style') || '';
            bgHasContent = style.includes('url(') && !style.includes('data:image/gif');
          }

          let previewHasContent = false;
          if (previewEl) {
            const previewImg = previewEl.querySelector('img[src]');
            const previewBg = previewEl.querySelector('[style*="background-image"]') ||
                              (previewEl.style?.backgroundImage && previewEl.style.backgroundImage !== 'none');
            if (previewImg) {
              const src = previewImg.src || '';
              previewHasContent = src.length > 100 || src.includes('media.pixverse') || src.includes('blob:') || src.includes('aliyun');
            } else if (previewBg) {
              const style = typeof previewBg === 'object' ? (previewBg.getAttribute?.('style') || '') : '';
              previewHasContent = style.includes('url(') && !style.includes('data:image/gif');
            }
          }

          hasImage = imgHasContent || bgHasContent || !!uploadListItem || previewHasContent;
        }
      }

      // For transition/fusion pages without specific containerId, create a descriptive one
      let effectiveContainerId = containerId;
      if (!containerId || containerId === '') {
        if (isTransitionPage) {
          effectiveContainerId = 'transition_slot';
        } else if (isFusionPage) {
          effectiveContainerId = 'fusion_slot';
        } else if (isExtendPage) {
          effectiveContainerId = 'extend_slot';
        } else if (isImageGenPage) {
          effectiveContainerId = 'create_image_slot';
        } else if (isImageTextPage) {
          effectiveContainerId = 'image_text_slot';
        }
      }

      results.push({ input, container, hasImage, priority, containerId: effectiveContainerId });
    });

    results.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return (a.containerId || '').localeCompare(b.containerId || '');
    });

    // Assign persistent IDs
    results.forEach((r) => {
      const input = r.input;
      if (!input) {
        r.containerId = (r.containerId || 'unknown') + '#orphan';
        return;
      }

      let stableId = inputStableIdMap.get(input);

      if (!stableId) {
        const baseId = r.containerId || 'unknown';
        if (baseIdCounters[baseId] === undefined) {
          baseIdCounters[baseId] = 0;
        }
        stableId = `${baseId}#${baseIdCounters[baseId]}`;
        baseIdCounters[baseId]++;
        inputStableIdMap.set(input, stableId);
        debugLog('[Slots] Assigned new stable ID:', stableId);
      }

      r.containerId = stableId;
      input.dataset.pxs7SlotId = stableId;
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

  async function clearUploadContainer(container) {
    try {
      const wrapper = container?.closest('.ant-upload-wrapper') ||
                      container?.closest('[class*="ant-upload"]')?.parentElement ||
                      container?.parentElement?.parentElement;
      if (!wrapper) {
        debugLog('[Clear] Could not find upload wrapper');
        return false;
      }

      const hoverTargets = [
        wrapper.querySelector('.ant-upload-list-item'),
        wrapper.querySelector('[class*="upload-list"]'),
        wrapper.querySelector('[class*="preview"]'),
        wrapper,
      ].filter(Boolean);

      for (const target of hoverTargets) {
        target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      }
      await new Promise(r => setTimeout(r, 150));

      const deleteSelectors = [
        'div.absolute[class*="bg-black"][class*="rounded-full"]',
        'div[class*="-right-"][class*="-top-"][class*="rounded-full"]',
        '.anticon-delete',
        '.anticon-close',
        '.anticon-close-circle',
        '[class*="delete"]',
        '[class*="remove"]',
        '[class*="Delete"]',
        '[class*="Remove"]',
        'svg[class*="close"]',
        'svg[class*="delete"]',
        '[aria-label*="delete"]',
        '[aria-label*="remove"]',
        '[aria-label*="Delete"]',
        '[aria-label*="Remove"]',
        '.ant-upload-list-item-actions button',
        '.ant-upload-list-item-card-actions button',
      ];

      let deleteBtn = null;
      const wrapperParent = wrapper.parentElement;
      const searchAreas = [];

      if (wrapperParent) {
        Array.from(wrapperParent.children).forEach(child => {
          if (child !== wrapper) searchAreas.push(child);
        });
        searchAreas.push(wrapperParent);
      }
      searchAreas.push(wrapper);

      for (const area of searchAreas) {
        if (deleteBtn) break;
        for (const selector of deleteSelectors) {
          deleteBtn = area.querySelector(selector);
          if (deleteBtn) break;
        }
      }

      if (deleteBtn) {
        debugLog('[Clear] Clicking delete button');
        deleteBtn.click();
        await new Promise(r => setTimeout(r, 200));
        return true;
      }

      debugLog('[Clear] No delete button found, trying manual clear');
      const previewDiv = wrapper.querySelector('[style*="background-image"]');
      if (previewDiv) {
        previewDiv.style.backgroundImage = '';
        const placeholder = previewDiv.querySelector('div[style*="display: none"], svg[style*="display: none"]');
        if (placeholder) placeholder.style.display = '';
      }

      const fileInput = wrapper.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';

      debugLog('Cleared upload container (manual)');
      return true;
    } catch (e) {
      console.warn('[PixSim7] Failed to clear container:', e);
      return false;
    }
  }

  function getMimeTypeFromUrl(url) {
    const ext = normalizeUrl(url).split('.').pop()?.toLowerCase();
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
   * Try to directly inject a Pixverse CDN URL into the preview without upload.
   * This works by:
   * 1. Setting the visual preview (background-image or img src)
   * 2. Storing the URL in a data attribute for later retrieval
   * 3. Trying to update React internal state if accessible
   */
  async function tryDirectPreviewInjection(container, imageUrl) {
    try {
      const wrapper = container?.closest('.ant-upload-wrapper') || container?.parentElement?.parentElement;
      if (!wrapper) {
        debugLog('[Direct] No wrapper found');
        return false;
      }

      // Find or create preview element
      let previewEl = wrapper.querySelector('[class*="preview"], [class*="Preview"], .ant-upload-list-item');

      // Look for the upload area that shows the image
      const uploadArea = wrapper.querySelector('.ant-upload, [class*="upload"]');
      const bgDiv = wrapper.querySelector('[style*="background-image"]') ||
                    uploadArea?.querySelector('div[style]');

      // Try setting background-image on existing element (with HTTP proxy support)
      if (bgDiv) {
        let displayUrl = imageUrl;

        // Proxy HTTP URLs to avoid mixed content errors
        if (imageUrl.startsWith('http://')) {
          debugLog('[Direct] HTTP URL detected, proxying for background-image:', imageUrl);
          try {
            const proxyResponse = await chrome.runtime.sendMessage({ action: 'proxyImage', url: imageUrl });
            if (proxyResponse && proxyResponse.success && proxyResponse.dataUrl) {
              displayUrl = proxyResponse.dataUrl;
              debugLog('[Direct] Proxy success for background-image');
            } else {
              console.warn('[pxs7] Background image proxy failed:', proxyResponse);
            }
          } catch (e) {
            console.warn('[pxs7] Background image proxy error:', e.message);
          }
        }

        bgDiv.style.backgroundImage = `url("${displayUrl}")`;
        bgDiv.style.backgroundSize = 'cover';
        bgDiv.style.backgroundPosition = 'center';
        debugLog('[Direct] Set background-image on existing div');
      }

      // Hide the placeholder/upload prompt
      const placeholder = wrapper.querySelector('svg, [class*="placeholder"], [class*="Placeholder"], .ant-upload-drag-icon');
      if (placeholder) {
        placeholder.style.display = 'none';
      }
      const uploadText = wrapper.querySelector('.ant-upload-text, [class*="uploadText"]');
      if (uploadText) {
        uploadText.style.display = 'none';
      }

      // Store the URL in a data attribute for potential later use
      wrapper.dataset.pxs7ImageUrl = imageUrl;
      if (container) {
        container.dataset.pxs7ImageUrl = imageUrl;
      }

      // Try to find React fiber and update state
      // Look for React internal keys
      const reactKey = Object.keys(wrapper).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      if (reactKey) {
        debugLog('[Direct] Found React fiber, attempting state update');
        try {
          const fiber = wrapper[reactKey];
          // Walk up to find component with image state
          let current = fiber;
          let attempts = 0;
          while (current && attempts < 20) {
            const stateNode = current.stateNode;
            if (stateNode && typeof stateNode.setState === 'function') {
              // Found a class component - try to find image-related state
              debugLog('[Direct] Found class component');
            }
            // Check memoizedProps for onChange or value setters
            const props = current.memoizedProps;
            if (props?.onChange && props?.fileList !== undefined) {
              debugLog('[Direct] Found upload component props');
              // This might be an Ant Design Upload component
            }
            current = current.return;
            attempts++;
          }
        } catch (e) {
          debugLog('[Direct] React state update failed:', e.message);
        }
      }

      // Create a visual preview if none exists
      if (!bgDiv && !previewEl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0; z-index: 1;';
        const uploadEl = wrapper.querySelector('.ant-upload') || uploadArea || wrapper;
        if (uploadEl) {
          uploadEl.style.position = 'relative';
          uploadEl.appendChild(img);
          debugLog('[Direct] Created img element');
        }
      }

      // Check if visual was actually set
      await new Promise(r => setTimeout(r, 100));
      const hasVisual = wrapper.querySelector('img[src*="pixverse"], [style*="pixverse"]') ||
                        wrapper.querySelector('[style*="background-image"]')?.style.backgroundImage.includes('pixverse');

      debugLog('[Direct] Has visual after injection:', !!hasVisual);
      return !!hasVisual;
    } catch (e) {
      debugLog('[Direct] Injection error:', e);
      return false;
    }
  }

  // ===== Image Injection =====

  async function injectImageToUpload(imageUrl, targetInputOrContainerId = null, targetSlotIndex = null, expectedContainerId = null) {
    try {
      const uploads = findUploadInputs();

      if (uploads.length === 0) {
        if (showToast) showToast('No upload area found', false);
        return false;
      }

      const relevantSlots = uploads.filter(u => u.priority >= 10);
      const freshSlotSnapshot = relevantSlots.map((s, idx) => ({ idx, containerId: s.containerId, hasImage: s.hasImage }));
      debugLog('[Slots] Fresh slots:', JSON.stringify(freshSlotSnapshot));

      let targetUpload;
      // Helper to match container IDs (handles #N suffix variations)
      const containerIdMatches = (a, b) => {
        if (!a || !b) return false;
        if (a === b) return true;
        // Strip #N suffix for comparison
        const stripSuffix = (s) => s.replace(/#\d+$/, '');
        return stripSuffix(a) === stripSuffix(b);
      };

      if (targetSlotIndex !== null && targetSlotIndex >= 0 && targetSlotIndex < relevantSlots.length) {
        targetUpload = relevantSlots[targetSlotIndex];
        debugLog('Using slot index', targetSlotIndex, 'containerId:', targetUpload?.containerId);

        if (expectedContainerId && !containerIdMatches(targetUpload?.containerId, expectedContainerId)) {
          debugLog('[Slots] ORDER MISMATCH! Expected:', expectedContainerId, 'Got:', targetUpload?.containerId);
          const correctSlot = relevantSlots.find(s => containerIdMatches(s.containerId, expectedContainerId));
          if (correctSlot) {
            debugLog('[Slots] Found correct slot by containerId, using that instead');
            targetUpload = correctSlot;
          } else {
            debugLog('[Slots] Could not find slot by containerId:', expectedContainerId);
            debugLog('[Slots] Available containerIds:', relevantSlots.map(s => s.containerId));
            // Fall back to index-based selection
          }
        } else if (expectedContainerId) {
          debugLog('[Slots] Verified: index', targetSlotIndex, 'matches', expectedContainerId);
        }
      } else if (targetInputOrContainerId) {
        if (typeof targetInputOrContainerId === 'string') {
          targetUpload = relevantSlots.find(u => containerIdMatches(u.containerId, targetInputOrContainerId));
          if (!targetUpload) {
            targetUpload = uploads.find(u => containerIdMatches(u.containerId, targetInputOrContainerId));
          }
          debugLog('Using containerId:', targetInputOrContainerId, 'found:', !!targetUpload);
        } else {
          targetUpload = relevantSlots.find(u => u.input === targetInputOrContainerId) ||
                         uploads.find(u => u.input === targetInputOrContainerId);
          debugLog('Using direct input ref, found:', !!targetUpload);
        }
      } else {
        targetUpload = relevantSlots.find(u => !u.hasImage) || relevantSlots[0];
        debugLog('Auto-selected slot:', targetUpload?.containerId);
      }

      if (!targetUpload) {
        if (showToast) showToast('Could not find upload slot', false);
        return false;
      }

      const input = targetUpload.input;
      const container = targetUpload.container;

      // Clear existing image if present
      if (targetUpload.hasImage && container) {
        const cleared = await clearUploadContainer(container);
        if (!cleared) {
          debugLog('Warning: Failed to clear existing image, continuing anyway');
        }
        await new Promise(r => setTimeout(r, 300));
      }

      // For Pixverse CDN URLs, use a tiny placeholder - interceptor returns original URL
      const isPixverseCdn = imageUrl.includes('media.pixverse.ai') || imageUrl.includes('pixverse-fe-upload');
      let file;

      if (isPixverseCdn) {
        debugLog('Using placeholder for Pixverse CDN URL (interceptor will return original)');
        // 1x1 transparent PNG
        const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const pngData = atob(pngBase64);
        const pngArray = new Uint8Array(pngData.length);
        for (let i = 0; i < pngData.length; i++) {
          pngArray[i] = pngData.charCodeAt(i);
        }
        const placeholderBlob = new Blob([pngArray], { type: 'image/png' });
        file = new File([placeholderBlob], 'image.png', { type: 'image/png' });
      } else {
        // For non-Pixverse URLs, fetch and upload the actual image
        debugLog('Fetching external image for upload');

        let blob;

        // Handle HTTP URLs by proxying through background script to avoid mixed content errors
        if (imageUrl.startsWith('http://')) {
          debugLog('HTTP URL detected, proxying through background script');
          try {
            const proxyResponse = await chrome.runtime.sendMessage({ action: 'proxyImage', url: imageUrl });
            if (!proxyResponse || !proxyResponse.success || !proxyResponse.dataUrl) {
              throw new Error('Failed to proxy HTTP image');
            }
            // Convert data URL to blob
            const dataUrlResponse = await fetch(proxyResponse.dataUrl);
            blob = await dataUrlResponse.blob();
            debugLog('Successfully proxied HTTP image');
          } catch (proxyError) {
            console.warn('[PixSim7] Proxy failed, attempting direct fetch:', proxyError);
            // Fallback to direct fetch (might fail on HTTPS pages)
            const response = await fetch(imageUrl);
            if (!response.ok) {
              throw new Error(`Failed to fetch image: ${response.status}`);
            }
            blob = await response.blob();
          }
        } else {
          // HTTPS or data URLs can be fetched directly
          const response = await fetch(imageUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
          }
          blob = await response.blob();
        }

        const filename = imageUrl.split('/').pop().split('?')[0] || 'image.jpg';
        const mimeType = getMimeTypeFromUrl(imageUrl);
        file = new File([blob], filename, { type: mimeType });
      }

      // Create DataTransfer with file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Trigger upload via input
      setPendingImageUrl(imageUrl);
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));

      setTimeout(() => { if (showToast) showToast('Upload triggered!', true); }, 500);
      return true;
    } catch (e) {
      console.error('[PixSim7] Failed to inject image:', e);
      if (showToast) showToast('Failed to add image', false);
      return false;
    }
  }

  /**
   * Restore multiple images sequentially, waiting for each upload to complete.
   * @param {Array} images - Array of URLs or {url, slot, containerId} objects
   * @param {Object} options - Options: { onProgress, timeout }
   * @returns {Object} - { success: number, failed: string[] }
   */
  async function restoreAllImages(images, options = {}) {
    const { onProgress, timeout = 5000 } = options;
    let success = 0;
    const failed = [];

    // Get fresh slot list
    let uploads = findUploadInputs();
    let relevantSlots = uploads.filter(u => u.priority >= 10);

    debugLog('[RestoreAll] Starting restore of', images.length, 'images');
    debugLog('[RestoreAll] Available slots:', relevantSlots.length);

    // Add slots if we need more total slots (we restore from index 0, so need images.length slots total)
    const slotsNeeded = images.length - relevantSlots.length;
    if (slotsNeeded > 0) {
      debugLog('[RestoreAll] Need to add', slotsNeeded, 'more slot(s)');

      // Find the + button using multiple approaches
      let plusBtn = null;

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
          plusBtn = svg.closest('div.cursor-pointer') ||
                    svg.closest('div[class*="cursor-pointer"]') ||
                    svg.closest('button') ||
                    svg.parentElement?.closest('div.cursor-pointer') ||
                    svg.parentElement?.parentElement;
          if (plusBtn && plusBtn.offsetParent !== null) {
            debugLog('[RestoreAll] Found + button via SVG path prefix:', prefix);
            break;
          }
        }
      }

      // Approach 2: Look for small clickable elements with SVG near upload areas
      if (!plusBtn) {
        const uploadArea = document.querySelector('[class*="transition"], [class*="fusion"]')?.parentElement;
        if (uploadArea) {
          const candidates = uploadArea.querySelectorAll('div[class*="opacity"], div[class*="cursor-pointer"]');
          for (const el of candidates) {
            if (el.querySelector('svg') && el.offsetParent !== null) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0 && rect.width < 100) {
                plusBtn = el;
                debugLog('[RestoreAll] Found + button via upload area sibling');
                break;
              }
            }
          }
        }
      }

      if (plusBtn) {
        for (let i = 0; i < slotsNeeded; i++) {
          plusBtn.click();
          await new Promise(r => setTimeout(r, 150));
        }
        debugLog('[RestoreAll] Added', slotsNeeded, 'slot(s)');
        // Wait for DOM to update
        await new Promise(r => setTimeout(r, 400));

        // Refresh slot list
        uploads = findUploadInputs();
        relevantSlots = uploads.filter(u => u.priority >= 10);
        debugLog('[RestoreAll] After adding, available slots:', relevantSlots.length);
      } else {
        debugLog('[RestoreAll] Could not find + button to add slots');
      }
    }

    for (let i = 0; i < images.length; i++) {
      // Normalize to {url, slot, containerId} format
      const imgData = typeof images[i] === 'string'
        ? { url: images[i], slot: i, containerId: null }
        : images[i];

      const { url, slot, containerId } = imgData;
      debugLog('[RestoreAll] Restoring image', i + 1, 'of', images.length, ':', url);

      // Find target slot - use slot index starting from 0, clear existing if needed
      // Priority: explicit slot > sequential index (starting from 0)
      let targetSlot = null;
      const targetIndex = (slot !== undefined && slot !== null && slot >= 0) ? slot : i;

      if (containerId) {
        // Try to find by containerId first (may have existing image that we'll clear)
        targetSlot = relevantSlots.find(s => s.containerId === containerId);
      }
      if (!targetSlot && targetIndex < relevantSlots.length) {
        // Use the target index directly - start from slot 0, not first empty
        targetSlot = relevantSlots[targetIndex];
      }
      if (!targetSlot) {
        // Fallback to first available slot
        targetSlot = relevantSlots[i] || relevantSlots.find(s => !s.hasImage);
      }

      if (!targetSlot) {
        debugLog('[RestoreAll] No slot found for image', i + 1);
        failed.push(url);
        continue;
      }

      // Create promise that resolves when upload completes or times out
      const uploadComplete = new Promise((resolve) => {
        const timer = setTimeout(() => {
          debugLog('[RestoreAll] Upload timeout for image', i + 1);
          resolve(false);
        }, timeout);

        const handler = (e) => {
          if (e.detail?.url === url || e.detail?.success) {
            clearTimeout(timer);
            window.removeEventListener('__pxs7UploadComplete', handler);
            debugLog('[RestoreAll] Upload complete for image', i + 1);
            resolve(true);
          }
        };
        window.addEventListener('__pxs7UploadComplete', handler);
      });

      // Trigger the upload
      const slotIndex = relevantSlots.indexOf(targetSlot);
      const injected = await injectImageToUpload(url, null, slotIndex, targetSlot.containerId);

      if (injected) {
        // Wait for completion or timeout
        const completed = await uploadComplete;
        if (completed) {
          success++;
          targetSlot.hasImage = true; // Mark as used
        } else {
          failed.push(url);
        }
      } else {
        failed.push(url);
      }

      // Progress callback
      if (onProgress) {
        onProgress({ current: i + 1, total: images.length, success, failed: failed.length });
      }

      // Delay for DOM stability before next image
      await new Promise(r => setTimeout(r, 500));
    }

    debugLog('[RestoreAll] Done. Success:', success, 'Failed:', failed.length);
    return { success, failed };
  }

  // Export to global scope
  window.PXS7.uploadUtils = {
    saveInputState,
    restoreInputState,
    setupAutoSave,
    findUploadInputs,
    setupUploadInterceptor,
    setPendingImageUrl,
    clearUploadContainer,
    getMimeTypeFromUrl,
    injectImageToUpload,
    restoreAllImages
  };

  // Auto-setup on load
  setupAutoSave();

  // ===== SPA NAVIGATION DETECTION =====
  // Pixverse is an SPA - detect URL changes and re-scan for upload inputs
  let lastUrl = window.location.href;
  let lastPath = window.location.pathname;

  function onPageChange() {
    debugLog('[SPA] Page changed to:', window.location.pathname);

    // Re-scan upload inputs after DOM settles
    setTimeout(() => {
      const uploads = findUploadInputs();
      debugLog('[SPA] Re-scanned inputs, found:', uploads.length);
    }, 500);
  }

  // Method 1: Watch for popstate (back/forward navigation)
  window.addEventListener('popstate', () => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      lastPath = window.location.pathname;
      onPageChange();
    }
  });

  // Method 2: Poll for URL changes (catches SPA pushState navigation)
  setInterval(() => {
    const currentUrl = window.location.href;
    const currentPath = window.location.pathname;

    if (currentPath !== lastPath) {
      lastUrl = currentUrl;
      lastPath = currentPath;
      onPageChange();
    }
  }, 500); // Check every 500ms

  debugLog('[SPA] Navigation detection active');

})();
