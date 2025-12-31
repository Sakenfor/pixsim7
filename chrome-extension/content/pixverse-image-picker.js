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
  const {
    showToast,
    closeMenus,
    sendMessageWithTimeout,
    normalizeUrl,
    extractImageUrl,
    addHoverEffect,
    createMenuItem,
    createDivider,
  } = window.PXS7.utils || {};
  const storage = window.PXS7.storage;

  // Debug mode - controlled by extension settings (chrome.storage)
  // Falls back to localStorage for manual override
  let DEBUG_IMAGE_PICKER = localStorage.getItem('pxs7_debug') === 'true';

  // Load debug setting from chrome.storage (async)
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get({ debugImagePicker: false, debugAll: false }, (result) => {
      DEBUG_IMAGE_PICKER = result.debugImagePicker || result.debugAll || DEBUG_IMAGE_PICKER;
      if (DEBUG_IMAGE_PICKER) {
        console.log('[PixSim7] Image Picker debug mode enabled');
      }
    });
  }

  const debugLog = (...args) => DEBUG_IMAGE_PICKER && console.log('[PixSim7]', ...args);

  // Module state
  let recentSiteImages = [];
  let recentlyUsedAssets = [];  // Assets recently injected by user
  let assetsCache = [];
  let assetsTotalCount = 0;
  let assetsLoadedCount = 0;
  let loadAssetsFunction = null;  // Store the loadAssets function for reuse

  // Recently used assets persistence
  const RECENTLY_USED_KEY = 'pxs7_recently_used_assets';
  const ASSETS_SORT_KEY = 'pxs7_assets_sort';
  const MAX_RECENTLY_USED = 50;
  let assetsSortBy = 'recent'; // 'recent', 'name', 'default'
  let assetsSearchQuery = ''; // Search filter for assets

  // Persistent ID tracking for input elements
  // Using WeakMap so entries are automatically cleaned up when inputs are garbage collected
  const inputStableIdMap = new WeakMap();
  const baseIdCounters = {}; // Track next available number for each baseId

  function loadRecentlyUsed() {
    try {
      const stored = localStorage.getItem(RECENTLY_USED_KEY);
      if (stored) {
        recentlyUsedAssets = JSON.parse(stored);
      }
      const sort = localStorage.getItem(ASSETS_SORT_KEY);
      if (sort) {
        assetsSortBy = sort;
      }
    } catch (e) {
      console.warn('[PixSim7] Failed to load recently used:', e);
    }
  }

  function saveRecentlyUsed() {
    try {
      localStorage.setItem(RECENTLY_USED_KEY, JSON.stringify(recentlyUsedAssets));
    } catch (e) {
      console.warn('[PixSim7] Failed to save recently used:', e);
    }
  }

  function saveAssetsSort(sortBy) {
    assetsSortBy = sortBy;
    try {
      localStorage.setItem(ASSETS_SORT_KEY, sortBy);
    } catch (e) {}
  }

  function addToRecentlyUsed(url, name = null) {
    if (!url) return;
    // Normalize URL for comparison (remove query params)
    const normalizedUrl = normalizeUrl(url);
    // Remove if already exists (to move to front)
    recentlyUsedAssets = recentlyUsedAssets.filter(a => normalizeUrl(a.url) !== normalizedUrl);
    // Add to front
    recentlyUsedAssets.unshift({
      url,
      name: name || normalizeUrl(url.split('/').pop()) || 'Image',
      usedAt: Date.now()
    });
    // Limit size
    if (recentlyUsedAssets.length > MAX_RECENTLY_USED) {
      recentlyUsedAssets = recentlyUsedAssets.slice(0, MAX_RECENTLY_USED);
    }
    // Invalidate lookup cache
    recentlyUsedMap = null;
    saveRecentlyUsed();
  }

  // Cache for recently used lookup (rebuilt when recentlyUsedAssets changes)
  let recentlyUsedMap = null;

  function buildRecentlyUsedMap() {
    recentlyUsedMap = new Map();
    recentlyUsedAssets.forEach((a, idx) => {
      recentlyUsedMap.set(normalizeUrl(a.url), idx);
    });
  }

  function getRecentlyUsedIndex(url) {
    if (!url) return -1;
    if (!recentlyUsedMap) buildRecentlyUsedMap();
    const idx = recentlyUsedMap.get(normalizeUrl(url));
    return idx !== undefined ? idx : -1;
  }

  // Load on module init
  loadRecentlyUsed();

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

      debugLog('Pixverse dry-run sync result:', data);
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

      if (Object.keys(state.inputs).length > 0 || state.images.length > 0) {
        sessionStorage.setItem(SESSION_KEY_PRESERVED_INPUT, JSON.stringify(state));
        debugLog('Saved state:', Object.keys(state.inputs).length, 'inputs,', state.images.length, 'images');
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
        debugLog('Restored', restored, 'input(s)');
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
    const seenInputs = new Set(); // Track unique input elements
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
      // Skip duplicate input elements (same element found through multiple paths)
      if (seenInputs.has(input)) {
        return;
      }
      seenInputs.add(input);

      let container = input.closest('.ant-upload') ||
                      input.closest('.ant-upload-btn') ||
                      input.closest('[class*="ant-upload"]') ||
                      input.closest('[class*="upload"]');

      const parentWithId = input.closest('[id]');
      const containerId = parentWithId?.id || '';

      let priority = 0;
      // Match container to current page - be specific to avoid cross-matching
      if (isImageTextPage && containerId.includes('image_text')) {
        priority = 10;
      } else if (isImageGenPage && containerId.includes('create_image')) {
        priority = 10;
      } else if (isTransitionPage && containerId.startsWith('transition')) {
        // transition-undefined, transition-0, etc.
        priority = 10;
      } else if (isFusionPage && containerId.startsWith('fusion')) {
        // fusion-fusion-0, fusion-fusion-1, fusion-fusion-2
        priority = 10;
      } else if (isExtendPage && (containerId.startsWith('extend') || containerId.includes('extend'))) {
        priority = 10;
      } else if (isImageEditPage && (containerId.includes('edit') || containerId.includes('image_edit'))) {
        priority = 10;
      }

      // Fallback: if on a specific page type but no matching ID found,
      // still give priority to image upload inputs (they're likely the right ones)
      if (priority === 0) {
        const accept = input.getAttribute('accept') || '';
        const isImageInput = accept.includes('image');
        if (isImageInput && (isTransitionPage || isFusionPage || isExtendPage)) {
          // On these pages, image inputs without video are likely correct
          priority = 10;
        }
      }

      // Lower priority for generic customer/main containers (fallback)
      if (priority === 0 && (containerId.includes('customer') || containerId.includes('main'))) {
        priority = 5;
      }
      // Exclude video containers from image injection
      if (containerId.includes('video')) {
        priority = 0;
      }

      let hasImage = false;
      if (container) {
        const parentArea = container.closest('.ant-upload-wrapper') || container.parentElement?.parentElement;
        if (parentArea) {
          // Check for any img with a real src (not placeholder/empty)
          const existingImg = parentArea.querySelector('img[src]:not([src=""]):not([src="#"])');
          // Check for background-image style (any URL)
          const bgWithImage = parentArea.querySelector('[style*="background-image"]');
          // Check for Ant Design upload list items (indicates uploaded file)
          const uploadListItem = parentArea.querySelector('.ant-upload-list-item, .ant-upload-list-picture-card-container');
          // Check for preview elements
          const previewEl = parentArea.querySelector('[class*="preview"], [class*="Preview"]');

          // Validate that img actually has content (not 1x1 placeholder)
          let imgHasContent = false;
          if (existingImg) {
            const src = existingImg.src || '';
            // Real images have substantial URLs, not data:image/gif placeholders
            imgHasContent = src.length > 100 || src.includes('media.pixverse') || src.includes('blob:') || src.includes('aliyun');
          }

          // Validate background-image has a real URL
          let bgHasContent = false;
          if (bgWithImage) {
            const style = bgWithImage.getAttribute('style') || '';
            bgHasContent = style.includes('url(') && !style.includes('data:image/gif');
          }

          // Validate preview element actually contains an image
          let previewHasContent = false;
          if (previewEl) {
            // Check if preview element itself or its children have actual image content
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

      results.push({ input, container, hasImage, priority, containerId });
    });

    // Sort by priority (descending), then by containerId for stable order
    // Don't sort by hasImage - that would cause slot order to change after adding images
    results.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      // Stable sort by containerId to maintain consistent slot numbering
      return (a.containerId || '').localeCompare(b.containerId || '');
    });

    // Assign persistent unique IDs using WeakMap
    // This ensures the same physical input element always gets the same ID,
    // even if the DOM order changes between calls (which was causing slot 2 → slot 1 bug)
    results.forEach((r, idx) => {
      const input = r.input;
      if (!input) {
        r.containerId = (r.containerId || 'unknown') + '#orphan';
        return;
      }

      // Check if this input already has a stable ID assigned
      let stableId = inputStableIdMap.get(input);

      if (!stableId) {
        // First time seeing this input - assign a new unique ID
        const baseId = r.containerId || 'unknown';

        if (baseIdCounters[baseId] === undefined) {
          baseIdCounters[baseId] = 0;
        }

        stableId = `${baseId}#${baseIdCounters[baseId]}`;
        baseIdCounters[baseId]++;

        // Store in WeakMap for future lookups
        inputStableIdMap.set(input, stableId);
        debugLog('[Slots] Assigned new stable ID:', stableId, 'to input');
      }

      r.containerId = stableId;

      // Store on input for debugging
      input.dataset.pxs7SlotId = stableId;
    });

    // Debug: log if we have duplicate containerIds (shouldn't happen now)
    const containerIds = results.map(r => r.containerId);
    const uniqueIds = new Set(containerIds);
    if (uniqueIds.size !== containerIds.length) {
      console.error('[PixSim7] DUPLICATE containerIds after assignment!', containerIds);
    }

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
      // Search in multiple possible wrapper elements
      const wrapper = container?.closest('.ant-upload-wrapper') ||
                      container?.closest('[class*="ant-upload"]')?.parentElement ||
                      container?.parentElement?.parentElement;
      if (!wrapper) {
        debugLog('[Clear] Could not find upload wrapper');
        return false;
      }

      // Trigger hover state FIRST - delete buttons only appear on hover in Pixverse
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
      // Wait for hover effects to reveal delete button
      await new Promise(r => setTimeout(r, 150));


      // Extended selectors for delete/remove buttons (Ant Design + Pixverse custom)
      const deleteSelectors = [
        // Pixverse specific - the X button is a div with these Tailwind classes
        'div.absolute[class*="bg-black"][class*="rounded-full"]',
        'div[class*="-right-"][class*="-top-"][class*="rounded-full"]',
        // Ant Design icons
        '.anticon-delete',
        '.anticon-close',
        '.anticon-close-circle',
        // Class-based
        '[class*="delete"]',
        '[class*="remove"]',
        '[class*="Delete"]',
        '[class*="Remove"]',
        // SVG icons that might be delete buttons
        'svg[class*="close"]',
        'svg[class*="delete"]',
        // Button with aria labels
        '[aria-label*="delete"]',
        '[aria-label*="remove"]',
        '[aria-label*="Delete"]',
        '[aria-label*="Remove"]',
        // Pixverse specific (hover-revealed buttons)
        '.ant-upload-list-item-actions button',
        '.ant-upload-list-item-card-actions button',
      ];

      let deleteBtn = null;

      // The delete button is in a sibling element (the preview area) of the wrapper
      // Look at wrapper's siblings and parent's children
      const wrapperParent = wrapper.parentElement;
      const searchAreas = [];

      if (wrapperParent) {
        // Add all siblings of the wrapper
        Array.from(wrapperParent.children).forEach(child => {
          if (child !== wrapper) searchAreas.push(child);
        });
        // Also add the parent itself
        searchAreas.push(wrapperParent);
      }

      // Also check the wrapper itself
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
        // Wait for React to process deletion
        await new Promise(r => setTimeout(r, 200));
        return true;
      }

      // Fallback: manually clear preview
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

  // ===== Image Injection =====

  async function injectImageToUpload(imageUrl, targetInputOrContainerId = null, targetSlotIndex = null, expectedContainerId = null) {
    try {
      const uploads = findUploadInputs();

      if (uploads.length === 0) {
        if (showToast) showToast('No upload area found', false);
        return false;
      }

      // Filter to relevant slots (page-specific)
      const relevantSlots = uploads.filter(u => u.priority >= 10);

      // Log fresh slots for debugging order issues
      const freshSlotSnapshot = relevantSlots.map((s, idx) => ({ idx, containerId: s.containerId, hasImage: s.hasImage }));
      debugLog('[Slots] Fresh slots:', JSON.stringify(freshSlotSnapshot));

      // If specific target provided, use it; otherwise use smart selection
      // targetInputOrContainerId can be either an input element reference OR a containerId string
      // targetSlotIndex is the index within relevant slots (most reliable for replacement)
      let targetUpload;
      if (targetSlotIndex !== null && targetSlotIndex >= 0 && targetSlotIndex < relevantSlots.length) {
        // Index-based targeting (most reliable for slot replacement)
        targetUpload = relevantSlots[targetSlotIndex];
        debugLog('Using slot index', targetSlotIndex, 'containerId:', targetUpload?.containerId);

        // Verify the slot matches expected containerId (if provided)
        if (expectedContainerId && targetUpload?.containerId !== expectedContainerId) {
          debugLog('[Slots] ORDER MISMATCH! Expected:', expectedContainerId, 'Got:', targetUpload?.containerId);
          // Try to find the correct slot by containerId instead
          const correctSlot = relevantSlots.find(s => s.containerId === expectedContainerId);
          if (correctSlot) {
            debugLog('[Slots] Found correct slot by containerId, using that instead');
            targetUpload = correctSlot;
          } else {
            console.warn('[PixSim7] Could not find slot by containerId:', expectedContainerId);
            debugLog('[Slots] Available containerIds:', relevantSlots.map(s => s.containerId));
          }
        } else if (expectedContainerId) {
          debugLog('[Slots] Verified: index', targetSlotIndex, 'matches', expectedContainerId);
        }
      } else if (targetInputOrContainerId) {
        if (typeof targetInputOrContainerId === 'string') {
          // It's a containerId - look up by containerId (may not survive React re-render)
          targetUpload = uploads.find(u => u.containerId === targetInputOrContainerId);
          if (!targetUpload) {
            console.warn('[PixSim7] Could not find slot by containerId:', targetInputOrContainerId);
            targetUpload = uploads[0];
          }
        } else {
          // It's an input element reference - look up by reference, with containerId fallback
          targetUpload = uploads.find(u => u.input === targetInputOrContainerId) || uploads[0];
        }
      } else {
        // No specific target - use smart selection from relevant slots
        if (relevantSlots.length > 0) {
          // Prefer empty slots first, fall back to first slot (for replacement)
          targetUpload = relevantSlots.find(u => !u.hasImage) || relevantSlots[0];
        } else {
          // Fall back to first empty slot, or first slot if all have images
          targetUpload = uploads.find(u => !u.hasImage) || uploads[0];
        }
      }

      debugLog('Upload slots (relevant):', relevantSlots.map(u => ({
        hasImage: u.hasImage,
        containerId: u.containerId,
        priority: u.priority
      })));
      debugLog('Target slot:', { hasImage: targetUpload.hasImage, containerId: targetUpload.containerId });

      let fileInput = targetUpload.input;
      let container = targetUpload.container;

      if (!fileInput) {
        if (showToast) showToast('Upload area not found', false);
        return false;
      }

      if (targetUpload.hasImage) {
        if (showToast) showToast('Replacing existing image...', true);
        // Store slot index before clearing - this is the most reliable way to re-find after React re-renders
        const targetIndex = relevantSlots.indexOf(targetUpload);
        debugLog('[Slots] Clearing slot at index:', targetIndex, 'containerId:', targetUpload.containerId);

        // Mark the target input with a temporary attribute before clearing
        // This helps us find it again after React re-renders
        if (fileInput) {
          fileInput.dataset.pxs7TargetSlot = 'true';
        }

        await clearUploadContainer(container);
        // Wait for React/Ant to process the deletion and re-render
        await new Promise(r => setTimeout(r, 300));

        // Try to find by the temporary marker first (most reliable if input survived)
        let refreshedUploads = findUploadInputs();
        let refreshedRelevant = refreshedUploads.filter(u => u.priority >= 10);


        // Look for our marked input first
        let refreshedTarget = refreshedRelevant.find(u => u.input?.dataset?.pxs7TargetSlot === 'true');
        if (refreshedTarget) {
          // Found by marker - clean up and use it
          delete refreshedTarget.input.dataset.pxs7TargetSlot;
          targetUpload = refreshedTarget;
          fileInput = refreshedTarget.input;
          container = refreshedTarget.container;
          debugLog('[Slots] Re-found target by marker, containerId:', refreshedTarget.containerId);
        } else {
          // Marker not found (input was recreated) - fall back to index
          debugLog('[Slots] Marker not found, falling back to index:', targetIndex);
          if (targetIndex >= 0 && targetIndex < refreshedRelevant.length) {
            refreshedTarget = refreshedRelevant[targetIndex];
            targetUpload = refreshedTarget;
            fileInput = refreshedTarget.input;
            container = refreshedTarget.container;
            debugLog('[Slots] Re-found by index:', targetIndex, 'containerId:', refreshedTarget.containerId);
          } else {
            console.warn('[PixSim7] Could not find slot at index', targetIndex, 'after clearing');
            // Fall back to first empty slot
            const emptySlot = refreshedRelevant.find(u => !u.hasImage);
            if (emptySlot) {
              targetUpload = emptySlot;
              fileInput = emptySlot.input;
              container = emptySlot.container;
              debugLog('[Slots] Falling back to empty slot:', emptySlot.containerId);
            }
          }
        }
      }

      const isPixverseUrl = imageUrl.includes('media.pixverse.ai');
      if (isPixverseUrl) {
        debugLog('Using upload interception for Pixverse URL');
        if (showToast) showToast('Setting image...', true);

        // Create a promise that waits for the interception to complete
        const completionPromise = new Promise((resolve) => {
          const timeout = setTimeout(() => {
            console.warn('[PixSim7] Upload completion timeout, proceeding anyway');
            window.removeEventListener('__pxs7UploadComplete', handler);
            resolve(false);
          }, 3000); // 3 second timeout

          const handler = (e) => {
            if (e.detail?.url === imageUrl) {
              clearTimeout(timeout);
              window.removeEventListener('__pxs7UploadComplete', handler);
              debugLog('Upload interception completed for:', imageUrl);
              resolve(true);
            }
          };
          window.addEventListener('__pxs7UploadComplete', handler);
        });

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
        const targetSlotId = fileInput?.dataset?.pxs7SlotId || 'unknown';
        debugLog('[Slots] INJECTING to slot:', targetSlotId, 'hasImage:', targetUpload?.hasImage);
        fileInput.files = dataTransfer.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));

        // Wait for the interception to complete before returning
        await completionPromise;

        // Track as recently used
        addToRecentlyUsed(imageUrl);

        if (showToast) showToast('Image set!', true);
        return true;
      }

      // For other URLs, fetch and upload normally
      if (showToast) showToast('Fetching image...', true);

      let blob;

      // HTTP URLs must be proxied through background script (mixed content + PNA restrictions)
      if (imageUrl.startsWith('http://')) {
        debugLog('Using proxy for HTTP image fetch');
        try {
          const proxyResponse = await chrome.runtime.sendMessage({ action: 'proxyImage', url: imageUrl });
          if (!proxyResponse || !proxyResponse.success || !proxyResponse.dataUrl) {
            throw new Error(proxyResponse?.error || 'Proxy failed');
          }
          // Convert data URL to blob
          const dataUrlParts = proxyResponse.dataUrl.split(',');
          const mimeMatch = dataUrlParts[0].match(/:(.*?);/);
          const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
          const binaryStr = atob(dataUrlParts[1]);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          blob = new Blob([bytes], { type: mime });
        } catch (proxyErr) {
          throw new Error('Failed to fetch image via proxy: ' + proxyErr.message);
        }
      } else {
        // HTTPS URLs can be fetched directly
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
          debugLog('CORS fetch failed, trying no-cors...');
          try {
            response = await fetch(imageUrl, { mode: 'no-cors' });
          } catch (e) {
            throw new Error('Failed to fetch image: ' + fetchErr.message);
          }
        }

        if (!response.ok && response.type !== 'opaque') {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }

        blob = await response.blob();
      }

      if (showToast) showToast('Processing image...', true);

      if (blob.size === 0) {
        throw new Error('Empty image data received');
      }

      let urlPath = normalizeUrl(imageUrl.split('/').pop());
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

      // Track as recently used
      addToRecentlyUsed(imageUrl);

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

  // UUID pattern for valid user content (not UI assets)
  const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  // Patterns to exclude (UI assets, not user content)
  const EXCLUDE_PATTERNS = [
    /profile-picture/i,
    /asset\/media\/model/i,
    /\/model-.*\.png/i,
    /\/icon/i,
    /\/logo/i,
    /\/avatar/i,
  ];

  function isValidUserImage(url) {
    if (!url) return false;
    // Must have UUID pattern (indicates user-generated content)
    if (!UUID_PATTERN.test(url)) return false;
    // Must not match exclude patterns
    for (const pattern of EXCLUDE_PATTERNS) {
      if (pattern.test(url)) return false;
    }
    return true;
  }

  function scanPageForImages() {
    const images = new Set();

    // Scan all pixverse images on page, but filter to valid user content
    document.querySelectorAll('img[src*="media.pixverse.ai"]').forEach(img => {
      const src = normalizeUrl(img.src);
      if (isValidUserImage(src)) {
        images.add(src);
      }
    });

    // Also check background-image styles
    document.querySelectorAll('[style*="media.pixverse.ai"]').forEach(el => {
      const src = extractImageUrl(el.getAttribute('style'));
      if (src && isValidUserImage(src)) {
        images.add(src);
      }
    });

    return Array.from(images);
  }

  // Scan only images in upload containers (for state preservation)
  function scanUploadContainerImages() {
    const images = new Set();
    const uploadContainers = document.querySelectorAll('.ant-upload-wrapper, .ant-upload, [class*="ant-upload"]');

    uploadContainers.forEach(container => {
      container.querySelectorAll('img[src*="media.pixverse.ai"], img[src*="aliyun"]').forEach(img => {
        const src = normalizeUrl(img.src);
        if (src && src.length > 50) images.add(src);
      });

      container.querySelectorAll('[style*="media.pixverse.ai"]').forEach(el => {
        const src = extractImageUrl(el.getAttribute('style'));
        if (src) images.add(src);
      });
    });

    return Array.from(images);
  }

  function showImageRestorePanel(images) {
    recentSiteImages = images;
    showUnifiedImagePicker('page');
  }

  // ===== Unified Image Picker UI =====

  // Show context menu to select upload slot for replacement
  function showUploadSlotMenu(imageUrl, x, y, slotsToShow = null) {
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

    // Use provided slots (pre-filtered) or get relevant slots only
    const slots = slotsToShow || findUploadInputs().filter(u => u.priority >= 10);
    // Store slot snapshot for verification
    const slotSnapshot = slots.map((s, idx) => ({ idx, containerId: s.containerId, hasImage: s.hasImage }));
    debugLog('[Slots] Menu slots snapshot:', JSON.stringify(slotSnapshot));

    if (slots.length === 0) {
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
      // Header showing this is a replacement menu
      const header = document.createElement('div');
      header.style.cssText = `
        padding: 6px 12px 4px;
        font-size: 10px;
        color: ${COLORS.textMuted};
      `;
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

        // Extract a friendly name from containerId
        let slotName = `Slot ${i + 1}`;
        const containerId = slotInfo?.containerId || '';
        if (containerId.includes('image_text')) slotName = 'Image';
        else if (containerId.includes('create_image')) {
          // For create_image, number the slots
          const match = containerId.match(/customer_img_paths(\d*)/);
          slotName = match && match[1] ? `Image ${parseInt(match[1]) + 1}` : 'Image';
        }
        else if (containerId.startsWith('transition')) {
          // transition-undefined or transition-N
          slotName = `Image ${i + 1}`;
        }
        else if (containerId.startsWith('fusion')) {
          // fusion-fusion-0, fusion-fusion-1, fusion-fusion-2
          const match = containerId.match(/fusion-(\d+)/);
          slotName = match ? `Image ${parseInt(match[1]) + 1}` : `Image ${i + 1}`;
        }
        else if (containerId.startsWith('extend') || containerId.includes('extend')) {
          slotName = 'Extend Image';
        }
        else if (containerId.includes('edit')) slotName = 'Edit';

        item.innerHTML = `
          <span style="opacity:0.6">${i + 1}</span>
          <span>${slotName}</span>
        `;
        item.title = `Replace ${slotName}`;

        addHoverEffect(item);
        item.addEventListener('click', async () => {
          menu.remove();
          // Pass slot index for reliable targeting (containerId may not survive React re-render)
          const expectedContainerId = slotInfo.containerId;
          debugLog('[Slots] Menu click: index=' + i + ', expectedContainerId=' + expectedContainerId);
          await injectImageToUpload(imageUrl, null, i, expectedContainerId);
        });
        menu.appendChild(item);
      }

      // Check if + button exists to add new slot option
      const plusPath = "M8 2v6m0 0v6m0-6h6M8 8H2";
      const plusSvg = document.querySelector(`svg path[d="${plusPath}"]`);
      const plusBtn = plusSvg?.closest('div[class*="opacity"]') || plusSvg?.parentElement?.parentElement;

      if (plusBtn) {
        menu.appendChild(createDivider());

        // Add new slot option
        const addItem = createMenuItem({
          icon: '+',
          label: 'Add new slot',
          title: 'Add a new image slot and fill it',
          color: COLORS.accent,
        });
        addItem.addEventListener('click', async () => {
          menu.remove();
          // Get current slots before adding new one
          const beforeSlots = findUploadInputs().map(u => u.containerId);
          // Click + to add new slot
          plusBtn.click();
          // Wait for DOM to update
          await new Promise(r => setTimeout(r, 400));
          // Find the new slot that wasn't there before
          const afterSlots = findUploadInputs();
          const newSlot = afterSlots.find(u => !beforeSlots.includes(u.containerId) && !u.hasImage);
          if (newSlot) {
            // Target the newly added slot specifically
            await injectImageToUpload(imageUrl, newSlot.containerId);
          } else {
            // Fallback: find any empty slot
            const emptySlot = afterSlots.find(u => !u.hasImage);
            if (emptySlot) {
              await injectImageToUpload(imageUrl, emptySlot.containerId);
            } else {
              // Last resort: auto-selection
              await injectImageToUpload(imageUrl);
            }
          }
        });
        menu.appendChild(addItem);
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

  // Z-index values - keep reasonable to not block site modals/previews
  // Pixverse typically uses z-index 1000-2000 for modals
  const Z_INDEX_PICKER = 9999;
  const Z_INDEX_PICKER_INACTIVE = 900;  // Much lower when inactive so site popups appear above
  const Z_INDEX_MENU = 10000;
  const Z_INDEX_PREVIEW = 10001;

  // Hover preview element (shared across grid)
  let hoverPreview = null;
  let hoverPreviewImg = null;
  let hoverPreviewVideo = null;
  let hoverTimeout = null;
  let activePickerPanel = null;
  let lastPreviewUrl = null;
  let lastPreviewIsVideo = false;

  // Check if URL is a video (by URL pattern or explicit media type)
  function isVideoUrl(url, mediaType = null) {
    // Check explicit media type first
    if (mediaType === 'VIDEO' || mediaType === 'video') return true;
    if (mediaType === 'IMAGE' || mediaType === 'image') return false;
    // Fall back to URL pattern detection
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.mov') ||
           lower.includes('/video/') || lower.includes('video_url');
  }

  // Convert URL to medium-size preview (Pixverse OSS supports image processing)
  function getPreviewSizeUrl(url, mediaType = null) {
    if (!url) return url;
    // Don't resize videos
    if (isVideoUrl(url, mediaType)) return normalizeUrl(url);
    // If it's a Pixverse CDN URL, request a medium-sized version
    if (url.includes('pixverse') || url.includes('aliyuncs.com')) {
      // Remove any existing processing params and add medium size
      return normalizeUrl(url) + '?x-oss-process=image/resize,w_400,h_400,m_lfit';
    }
    return url;
  }

  function showHoverPreview(mediaUrl, anchorEl, mediaType = null) {
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      const isVideo = isVideoUrl(mediaUrl, mediaType);
      const previewUrl = getPreviewSizeUrl(mediaUrl, mediaType);

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
          overflow: hidden;
        `;
        // Create both img and video elements, show one at a time
        hoverPreviewImg = document.createElement('img');
        hoverPreviewImg.style.cssText = `
          max-width: 100%;
          max-height: 260px;
          border-radius: 4px;
          display: block;
          transition: opacity 0.15s ease-out;
        `;
        hoverPreviewVideo = document.createElement('video');
        hoverPreviewVideo.style.cssText = `
          max-width: 100%;
          max-height: 260px;
          border-radius: 4px;
          display: none;
        `;
        hoverPreviewVideo.muted = true;
        hoverPreviewVideo.loop = true;
        hoverPreviewVideo.playsInline = true;
        hoverPreview.appendChild(hoverPreviewImg);
        hoverPreview.appendChild(hoverPreviewVideo);
        document.body.appendChild(hoverPreview);
      }

      // Only update src if URL changed (avoid reloading)
      if (lastPreviewUrl !== previewUrl || lastPreviewIsVideo !== isVideo) {
        if (isVideo) {
          hoverPreviewImg.style.display = 'none';
          hoverPreviewVideo.style.display = 'block';
          hoverPreviewVideo.src = previewUrl;
          hoverPreviewVideo.play().catch(() => {}); // Ignore autoplay errors
        } else {
          hoverPreviewVideo.style.display = 'none';
          hoverPreviewVideo.pause();
          hoverPreviewVideo.src = '';
          // Hide img until new image loads to prevent flash of old image
          hoverPreviewImg.style.opacity = '0';
          hoverPreviewImg.style.display = 'block';
          hoverPreviewImg.onload = () => { hoverPreviewImg.style.opacity = '1'; };
          loadImageSrc(hoverPreviewImg, previewUrl);
        }
        lastPreviewUrl = previewUrl;
        lastPreviewIsVideo = isVideo;
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
    if (hoverPreview) {
      hoverPreview.style.display = 'none';
      // Pause video when hiding to save resources
      if (hoverPreviewVideo) {
        hoverPreviewVideo.pause();
      }
    }
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

  // Load image src, proxying HTTP URLs through background script to avoid mixed content issues
  // HTTPS URLs are loaded directly (no proxy needed)
  // Returns true on success, false on failure (triggers onerror for fallback handling)
  async function loadImageSrc(img, url) {
    if (!url) {
      // Trigger onerror so fallback can be attempted
      if (img.onerror) img.dispatchEvent(new Event('error'));
      return false;
    }
    // HTTPS, data, and blob URLs can be loaded directly
    if (url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
      img.src = url;
      return true;
    }
    // HTTP URLs must be proxied through background script (mixed content + PNA restrictions)
    if (url.startsWith('http://')) {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'proxyImage', url });
        if (response && response.success && response.dataUrl) {
          img.src = response.dataUrl;
          return true;
        }
        // Proxy returned error - trigger onerror so fallback can be attempted
        if (img.onerror) img.dispatchEvent(new Event('error'));
        return false;
      } catch (e) {
        console.warn('[pxs7] Image proxy error:', e.message, url);
        if (img.onerror) img.dispatchEvent(new Event('error'));
        return false;
      }
    }
    // Relative URLs or other protocols - try direct load
    img.src = url;
    return true;
  }

  function createImageGrid(items, getThumbUrl, getFullUrl = null, getName = null, getFallbackUrl = null, getMediaType = null) {
    injectGridStyles();

    const grid = document.createElement('div');
    grid.className = 'pxs7-grid';

    // Build data map for event delegation
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

      // Add error handler to fallback to remote URL if thumbnail fails (404)
      if (fallbackUrl && fallbackUrl !== thumbUrl) {
        img.onerror = () => {
          if (!img.dataset.fallbackAttempted) {
            img.dataset.fallbackAttempted = 'true';
            loadImageSrc(img, fallbackUrl);
          }
        };
      }

      loadImageSrc(img, thumbUrl); // Proxies HTTP URLs through background script
      thumb.appendChild(img);

      itemDataMap.set(index, { thumbUrl, fullUrl, name, mediaType, element: thumb });
      grid.appendChild(thumb);
    });

    // Event delegation - single set of listeners on grid
    let currentHoverIdx = null;
    let isScrolling = false;
    let scrollTimeout = null;

    grid.addEventListener('mouseenter', (e) => {
      if (isScrolling) return; // Don't show preview while scrolling
      const thumb = e.target.closest('.pxs7-thumb');
      if (!thumb) return;
      const idx = parseInt(thumb.dataset.idx, 10);
      if (isNaN(idx) || currentHoverIdx === idx) return;
      currentHoverIdx = idx;
      const data = itemDataMap.get(idx);
      if (data) showHoverPreview(data.fullUrl || data.thumbUrl, thumb, data.mediaType);
    }, true);

    grid.addEventListener('mouseleave', (e) => {
      const thumb = e.target.closest('.pxs7-thumb');
      if (!thumb) return;
      currentHoverIdx = null;
      hideHoverPreview();
    }, true);

    // Hide preview during scroll to prevent jank
    const handleScroll = () => {
      isScrolling = true;
      hideHoverPreview();
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
      }, 150); // Resume hover after scrolling stops
    };

    // Listen on scroll container
    const scrollContainer = grid.closest('[style*="overflow"]') || grid.parentElement;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    }

    // Also listen on wheel events on grid itself (catches all scroll attempts)
    grid.addEventListener('wheel', handleScroll, { passive: true });

    grid.addEventListener('click', async (e) => {
      const thumb = e.target.closest('.pxs7-thumb');
      if (!thumb) return;
      const idx = parseInt(thumb.dataset.idx, 10);
      const data = itemDataMap.get(idx);
      if (!data) return;

      // Check relevant upload slots for current page
      const uploads = findUploadInputs();
      const relevantSlots = uploads.filter(u => u.priority >= 10);
      const emptyRelevantSlots = relevantSlots.filter(u => !u.hasImage);

      // Smart click behavior:
      // - If there's an empty relevant slot → fill it directly
      // - If all relevant slots are filled → show menu to choose which to replace
      if (relevantSlots.length >= 2 && emptyRelevantSlots.length === 0) {
        // All slots filled - show menu to pick which to replace
        const rect = thumb.getBoundingClientRect();
        showUploadSlotMenu(data.fullUrl, rect.right + 5, rect.top, relevantSlots);
        return;
      }

      // Has empty slot or single slot - auto-inject to first empty
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

  // Page tab - shows valid user images found on current page (with UUID)
  function renderPageTab(container, panel) {
    if (recentSiteImages.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 30px 10px; color: ${COLORS.textMuted};">
          <div style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;">📷</div>
          <div style="font-size: 11px;">No images on page</div>
          <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">
            User images (with UUID) will appear here
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
    copyBtn.textContent = '📋 Copy';
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

  // Recents tab - shows recently used/injected images
  function renderRecentsTab(container, panel) {
    if (recentlyUsedAssets.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 30px 10px; color: ${COLORS.textMuted};">
          <div style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;">🕐</div>
          <div style="font-size: 11px;">No recent activity</div>
          <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">
            Images you inject will appear here
          </div>
        </div>
      `;
      return;
    }

    const clearBtn = document.createElement('button');
    clearBtn.textContent = '✕ Clear';
    clearBtn.style.cssText = `
      padding: 4px 8px; font-size: 9px; margin-bottom: 8px;
      background: transparent; border: 1px solid ${COLORS.border};
      border-radius: 3px; color: ${COLORS.textMuted}; cursor: pointer;
    `;
    clearBtn.addEventListener('click', () => {
      recentlyUsedAssets = [];
      recentlyUsedMap = null;
      saveRecentlyUsed();
      renderRecentsTab(container, panel);
    });
    container.appendChild(clearBtn);

    const urls = recentlyUsedAssets.map(a => ({
      thumb: a.url + '?x-oss-process=style/cover-webp-small',
      full: a.url,
      name: a.name || ''
    }));

    const grid = createImageGrid(urls, (item) => item.thumb, (item) => item.full, (item) => item.name);
    container.appendChild(grid);
  }

  function renderAssetsTab(container, panel, loadAssets) {
    // For thumbnails: prefer backend thumbnail_url (local control, consistent sizing)
    // HTTP URLs are automatically proxied through background script to avoid mixed content issues
    // Once backend has HTTPS, proxy is bypassed automatically
    const getThumbUrl = (a) => {
      // Prefer backend thumbnail (local control over quality/size)
      if (a.thumbnail_url) return a.thumbnail_url;
      // Fall back to CDN/remote URLs
      return a.remote_url || a.file_url || a.external_url || a.url || a.src;
    };

    let urls = assetsCache.map(a => ({
      thumb: getThumbUrl(a),
      full: a.remote_url || a.file_url || a.external_url || a.url || a.src || a.thumbnail_url,
      // Fallback for thumbnail if backend thumbnail 404s (use remote/CDN URL)
      fallback: a.remote_url || a.external_url || a.file_url || a.url || a.src,
      name: a.name || a.original_filename || a.filename || a.title || '',
      createdAt: a.created_at || a.createdAt || '',
      mediaType: a.media_type || a.mediaType || null,
    })).filter(u => u.thumb);

    // Sort assets based on current sort preference
    if (assetsSortBy === 'recent') {
      // Sort by recently used (used first, then others by original order)
      urls.sort((a, b) => {
        const aIdx = getRecentlyUsedIndex(a.full);
        const bIdx = getRecentlyUsedIndex(b.full);
        // Both recently used: sort by recency (lower index = more recent)
        if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
        // Only a is recently used: a comes first
        if (aIdx >= 0) return -1;
        // Only b is recently used: b comes first
        if (bIdx >= 0) return 1;
        // Neither: keep original order
        return 0;
      });
    } else if (assetsSortBy === 'name') {
      urls.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    // 'default' keeps original order

    // Search bar
    const searchRow = document.createElement('div');
    searchRow.style.cssText = 'margin-bottom: 8px;';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search description, tags...';
    searchInput.value = assetsSearchQuery;
    searchInput.style.cssText = `
      width: 100%; padding: 6px 10px; font-size: 11px;
      background: ${COLORS.bgHover}; border: 1px solid ${COLORS.border};
      border-radius: 4px; color: ${COLORS.text}; outline: none;
      box-sizing: border-box;
    `;

    // Grid container for live updates
    const gridContainer = document.createElement('div');
    gridContainer.id = 'pxs7-assets-grid-container';

    // Render the grid with current urls
    const renderGrid = (displayUrls) => {
      gridContainer.innerHTML = '';
      if (displayUrls.length === 0) {
        gridContainer.innerHTML = `
          <div style="text-align: center; padding: 20px 10px; color: ${COLORS.textMuted};">
            <div style="font-size: 11px;">${assetsSearchQuery ? `No results for "${assetsSearchQuery}"` : 'No assets'}</div>
          </div>
        `;
      } else {
        const grid = createImageGrid(displayUrls, (item) => item.thumb, (item) => item.full, (item) => item.name, (item) => item.fallback, (item) => item.mediaType);
        gridContainer.appendChild(grid);
      }

      // Update count
      const countEl = container.querySelector('.pxs7-assets-count');
      if (countEl) {
        const moreAvailable = assetsTotalCount > assetsLoadedCount;
        const searchText = assetsSearchQuery.trim() ? ' (search)' : '';
        countEl.textContent = `${displayUrls.length}${moreAvailable ? '+' : ''}${searchText}`;
      }
    };

    // Server-side search handler
    let searchDebounce = null;
    let isSearching = false;

    const performSearch = async (query) => {
      if (isSearching) return;
      isSearching = true;

      // Show loading state
      gridContainer.innerHTML = `
        <div style="text-align: center; padding: 20px 10px; color: ${COLORS.textMuted};">
          <div style="font-size: 11px;">Searching...</div>
        </div>
      `;

      try {
        if (loadAssets) {
          // Call loadAssets with search query - this triggers server-side search
          await loadAssets(true, false, { q: query });
        }
        // Re-render with updated cache (urls reference will be stale, need fresh)
        const freshUrls = assetsCache.map(a => ({
          thumb: a.thumbnail_url || a.file_url,
          full: a.file_url || a.external_url || a.remote_url || a.url,
          name: a.description || a.file_name || a.name || '',
          fallback: a.external_url || a.remote_url || a.url,
          mediaType: a.media_type
        })).filter(u => u.thumb || u.full);

        renderGrid(freshUrls);
      } catch (e) {
        console.warn('[PixSim7] Search failed:', e);
        gridContainer.innerHTML = `
          <div style="text-align: center; padding: 20px 10px; color: ${COLORS.textMuted};">
            <div style="font-size: 11px;">Search failed</div>
          </div>
        `;
      } finally {
        isSearching = false;
      }
    };

    searchInput.addEventListener('input', (e) => {
      assetsSearchQuery = e.target.value;
      clearTimeout(searchDebounce);
      // Debounce server search (longer delay for network)
      searchDebounce = setTimeout(() => {
        performSearch(assetsSearchQuery);
      }, 400);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        assetsSearchQuery = '';
        searchInput.value = '';
        clearTimeout(searchDebounce);
        performSearch(''); // Clear search, reload all
      } else if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(searchDebounce);
        performSearch(assetsSearchQuery);
      }
    });
    searchRow.appendChild(searchInput);
    container.appendChild(searchRow);

    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 6px;';

    const countLabel = document.createElement('span');
    countLabel.className = 'pxs7-assets-count';
    countLabel.style.cssText = `font-size: 10px; color: ${COLORS.textMuted};`;
    const moreAvailable = assetsTotalCount > assetsLoadedCount;
    countLabel.textContent = urls.length > 0 ? `${urls.length}${moreAvailable ? '+' : ''}` : '';

    // Sort buttons
    const sortGroup = document.createElement('div');
    sortGroup.style.cssText = 'display: flex; gap: 2px;';
    const sortOpts = [
      { id: 'recent', label: '🕐', title: 'Recently used first' },
      { id: 'name', label: 'AZ', title: 'Sort by name' },
      { id: 'default', label: '⏱', title: 'Default order' }
    ];
    sortOpts.forEach(opt => {
      const btn = document.createElement('button');
      btn.textContent = opt.label;
      btn.title = opt.title;
      const isActive = assetsSortBy === opt.id;
      btn.style.cssText = `
        padding: 3px 6px; font-size: 9px;
        background: ${isActive ? COLORS.accent : 'transparent'};
        border: 1px solid ${isActive ? COLORS.accent : COLORS.border};
        border-radius: 3px; cursor: pointer;
        color: ${isActive ? 'white' : COLORS.textMuted};
      `;
      btn.addEventListener('click', () => {
        saveAssetsSort(opt.id);
        renderTabContent('assets', container, panel, loadAssets);
      });
      sortGroup.appendChild(btn);
    });

    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '↻';
    refreshBtn.title = 'Refresh';
    refreshBtn.style.cssText = `
      padding: 3px 6px; font-size: 10px;
      background: transparent; border: 1px solid ${COLORS.border};
      border-radius: 3px; color: ${COLORS.textMuted}; cursor: pointer;
    `;
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.textContent = '...';
      if (loadAssets) await loadAssets(true, false);
      renderTabContent('assets', container, panel, loadAssets);
    });

    headerRow.appendChild(countLabel);
    headerRow.appendChild(sortGroup);
    headerRow.appendChild(refreshBtn);
    container.appendChild(headerRow);

    // Add grid container and render initial grid
    container.appendChild(gridContainer);

    if (urls.length === 0) {
      gridContainer.innerHTML = `
        <div style="text-align: center; padding: 30px 10px; color: ${COLORS.textMuted};">
          <div style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;">📁</div>
          <div style="font-size: 11px;">No assets found</div>
          <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">
            Upload images via the main app
          </div>
        </div>
      `;
    } else {
      // Initial grid render
      renderGrid(urls);
    }

    // Show Load More button if there are more assets to load
    if (moreAvailable && loadAssets) {
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
    if (tabId === 'page') {
      renderPageTab(container, panel);
    } else if (tabId === 'recents') {
      renderRecentsTab(container, panel);
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
      { id: 'page', label: 'Page', count: recentSiteImages.length },
      { id: 'recents', label: 'Recents', count: recentlyUsedAssets.length },
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
    findUploadInputs,
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
