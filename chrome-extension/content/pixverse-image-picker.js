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
  let assetsCache = [];
  let assetsTotalCount = 0;
  let assetsLoadedCount = 0;
  let loadAssetsFunction = null;
  let assetsSearchQuery = '';
  let activePickerPanel = null;
  let assetsFilterProvider = 'all'; // 'all', 'pixverse', 'runway', etc.
  let assetsFilterMediaType = 'all'; // 'all', 'image', 'video'

  // Z-index constants for picker UI
  const Z_INDEX_PICKER = 9999;
  const Z_INDEX_PICKER_INACTIVE = 900;

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


  // ===== Import utilities from extracted modules =====
  
  const {
    saveInputState,
    restoreInputState,
    setupAutoSave,
    findUploadInputs,
    setupUploadInterceptor,
    setPendingImageUrl,
    injectImageToUpload,
    restoreAllImages
  } = window.PXS7.uploadUtils || {};

  const {
    createImageGrid,
    showUploadSlotMenu,
    showHoverPreview,
    hideHoverPreview
  } = window.PXS7.imageGrid || {};

  const {
    addToRecentlyUsed,
    getRecentlyUsedIndex,
    saveAssetsSort,
    getAssets: getRecentlyUsedAssets,
    getSortBy: getAssetsSortBy
  } = window.PXS7.recentlyUsed || {};

  // Helper to access recently used state
  let recentlyUsedAssets = getRecentlyUsedAssets ? getRecentlyUsedAssets() : [];
  let assetsSortBy = getAssetsSortBy ? getAssetsSortBy() : 'recent';

  // ===== Page Image Scanning =====

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
  // ===== Unified Image Picker UI (Render Functions) =====

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

    const { grid } = createImageGrid(recentSiteImages, (url) => url + '?x-oss-process=style/cover-webp-small');
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

    const { grid } = createImageGrid(urls, (item) => item.thumb, (item) => item.full, (item) => item.name);
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
      id: a.id,
      thumb: getThumbUrl(a),
      full: a.remote_url || a.file_url || a.external_url || a.url || a.src || a.thumbnail_url,
      // Fallback for thumbnail if backend thumbnail 404s (use remote/CDN URL)
      fallback: a.remote_url || a.external_url || a.file_url || a.url || a.src,
      name: a.name || a.original_filename || a.filename || a.title || '',
      createdAt: a.created_at || a.createdAt || '',
      mediaType: a.media_type || a.mediaType || null,
      providerId: a.provider_id || null,
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

    // Filter row
    const filterRow = document.createElement('div');
    filterRow.style.cssText = 'display: flex; gap: 6px; margin-bottom: 8px;';

    // Provider filter
    const providerSelect = document.createElement('select');
    providerSelect.style.cssText = `
      flex: 1; padding: 4px 8px; font-size: 10px;
      background: ${COLORS.bgHover}; border: 1px solid ${COLORS.border};
      border-radius: 4px; color: ${COLORS.text}; outline: none;
    `;
    providerSelect.innerHTML = `
      <option value="all">All Providers</option>
      <option value="pixverse">Pixverse</option>
      <option value="runway">Runway</option>
      <option value="pika">Pika</option>
      <option value="sora">Sora</option>
    `;
    providerSelect.value = assetsFilterProvider;

    // Media type filter
    const mediaTypeSelect = document.createElement('select');
    mediaTypeSelect.style.cssText = `
      flex: 1; padding: 4px 8px; font-size: 10px;
      background: ${COLORS.bgHover}; border: 1px solid ${COLORS.border};
      border-radius: 4px; color: ${COLORS.text}; outline: none;
    `;
    mediaTypeSelect.innerHTML = `
      <option value="all">All Types</option>
      <option value="image">Images</option>
      <option value="video">Videos</option>
    `;
    mediaTypeSelect.value = assetsFilterMediaType;

    filterRow.appendChild(providerSelect);
    filterRow.appendChild(mediaTypeSelect);

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
        const { grid } = createImageGrid(displayUrls, (item) => item.thumb, (item) => item.full, (item) => item.name, (item) => item.fallback, (item) => item.mediaType);
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

    // Add filter change handlers
    const applyFilters = () => {
      let filtered = urls;
      if (assetsFilterProvider !== 'all') {
        filtered = filtered.filter(u => u.providerId === assetsFilterProvider);
      }
      if (assetsFilterMediaType !== 'all') {
        filtered = filtered.filter(u => {
          const mediaType = (u.mediaType || '').toLowerCase();
          return mediaType === assetsFilterMediaType;
        });
      }
      renderGrid(filtered);
    };

    providerSelect.addEventListener('change', () => {
      assetsFilterProvider = providerSelect.value;
      applyFilters();
    });

    mediaTypeSelect.addEventListener('change', () => {
      assetsFilterMediaType = mediaTypeSelect.value;
      applyFilters();
    });

    container.appendChild(filterRow);

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

    // Load saved panel size from localStorage
    const savedSize = localStorage.getItem('pxs7_picker_size');
    let panelWidth = '320px';
    let panelHeight = '480px';
    if (savedSize) {
      try {
        const size = JSON.parse(savedSize);
        if (size.width) panelWidth = size.width;
        if (size.height) panelHeight = size.height;
      } catch (e) {
        debugLog('Failed to parse saved picker size:', e);
      }
    }

    const panel = document.createElement('div');
    panel.className = 'pxs7-image-picker';
    panel.style.cssText = `
      position: fixed; top: 80px; right: 20px; z-index: ${Z_INDEX_PICKER};
      background: ${COLORS.bg}; border: 1px solid ${COLORS.border};
      border-radius: 8px; width: ${panelWidth}; max-height: ${panelHeight};
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; flex-direction: column; resize: both; overflow: hidden;
    `;
    activePickerPanel = panel;

    // Save panel size when resized
    let resizeTimeout = null;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const width = panel.style.width || panel.offsetWidth + 'px';
        const height = panel.style.maxHeight || panel.offsetHeight + 'px';
        localStorage.setItem('pxs7_picker_size', JSON.stringify({ width, height }));
        debugLog('Saved picker size:', { width, height });
      }, 500); // Debounce 500ms
    });
    resizeObserver.observe(panel);

    // Cleanup observer when panel is removed
    const originalRemove = panel.remove.bind(panel);
    panel.remove = function() {
      resizeObserver.disconnect();
      originalRemove();
    };

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
      panel.style.maxHeight = isMinimized ? 'auto' : panelHeight;
      panel.style.width = isMinimized ? 'auto' : panelWidth;
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
    setupAutoSave,
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
