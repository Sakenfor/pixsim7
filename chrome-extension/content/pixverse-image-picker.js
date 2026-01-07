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
  let assetsCurrentPage = 1;
  let assetsTotalPages = 1;
  let assetsPageSize = 50;
  let loadAssetsFunction = null;
  let assetsSearchQuery = '';
  let activePickerPanel = null;
  let assetsFilterProvider = 'all'; // 'all', 'pixverse', 'runway', etc.
  let assetsFilterMediaType = 'all'; // 'all', 'image', 'video'
  let assetsFilterUploadMethod = 'all'; // 'all', 'extension', 'local_folders', 'generated', 'api'
  let assetsFilterOptions = {
    provider_id: null,
    media_type: null,
    upload_method: null,
  };
  let assetsFilterOptionsLoaded = false;
  let assetsFilterOptionsLoading = false;

  // Persistence keys
  const ASSETS_STATE_KEY = 'pxs7_assets_state';

  // Load persisted assets state (page, search, filters)
  function loadAssetsState() {
    try {
      const saved = JSON.parse(localStorage.getItem(ASSETS_STATE_KEY) || '{}');
      if (saved.page) assetsCurrentPage = saved.page;
      if (saved.search) assetsSearchQuery = saved.search;
      if (saved.filterProvider) assetsFilterProvider = saved.filterProvider;
      if (saved.filterMediaType) assetsFilterMediaType = saved.filterMediaType;
      if (saved.filterUploadMethod) assetsFilterUploadMethod = saved.filterUploadMethod;
      debugLog('Loaded assets state:', saved);
    } catch (e) {
      debugLog('Failed to load assets state:', e);
    }
  }

  // Save assets state to localStorage
  function saveAssetsState() {
    try {
      const state = {
        page: assetsCurrentPage,
        search: assetsSearchQuery,
        filterProvider: assetsFilterProvider,
        filterMediaType: assetsFilterMediaType,
        filterUploadMethod: assetsFilterUploadMethod,
      };
      localStorage.setItem(ASSETS_STATE_KEY, JSON.stringify(state));
    } catch (e) {
      debugLog('Failed to save assets state:', e);
    }
  }

  // Load state on module init
  loadAssetsState();

  async function loadAssetFilterOptions() {
    if (assetsFilterOptionsLoading || assetsFilterOptionsLoaded) {
      return assetsFilterOptionsLoaded;
    }
    if (!sendMessageWithTimeout) {
      return false;
    }

    assetsFilterOptionsLoading = true;
    try {
      const res = await sendMessageWithTimeout(
        {
          action: 'apiRequest',
          path: '/assets/filter-metadata?include=provider_id,media_type,upload_method',
        },
        5000
      );

      if (res?.success && res.data?.options) {
        assetsFilterOptions = {
          provider_id: res.data.options.provider_id || null,
          media_type: res.data.options.media_type || null,
          upload_method: res.data.options.upload_method || null,
        };
        assetsFilterOptionsLoaded = true;
      }
    } catch (e) {
      debugLog('Failed to load filter metadata', e);
    } finally {
      assetsFilterOptionsLoading = false;
    }
    return assetsFilterOptionsLoaded;
  }

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
    if (!assetsFilterOptionsLoaded && !assetsFilterOptionsLoading) {
      loadAssetFilterOptions().then((loaded) => {
        if (loaded) {
          renderTabContent('assets', container, panel, loadAssets);
        }
      });
    }
    // Make container a flex column so we can have fixed header + scrollable grid
    container.style.cssText = 'display: flex; flex-direction: column; height: 100%; overflow: hidden; padding: 0;';

    // For thumbnails: prefer HTTPS URLs on HTTPS pages, otherwise prefer backend
    // On HTTPS pages, avoid HTTP URLs to prevent mixed content (even with proxy overhead)
    // On HTTP pages, prefer backend for better control
    const isHttpsPage = window.location.protocol === 'https:';

    const getThumbUrl = (a) => {
      const candidates = [
        { url: a.thumbnail_url, source: 'backend_thumb' },
        { url: a.file_url, source: 'backend_file' },
        { url: a.url, source: 'generic' },
        { url: a.src, source: 'generic' },
        { url: a.remote_url, source: 'provider' },
        { url: a.external_url, source: 'provider' }
      ].filter(c => c.url);

      if (isHttpsPage) {
        // On HTTPS pages: prefer HTTPS URLs to avoid proxy overhead
        const httpsUrl = candidates.find(c => c.url.startsWith('https://'));
        if (httpsUrl) return httpsUrl.url;
      }

      // Fallback: use backend first (will be proxied if HTTP)
      return a.thumbnail_url || a.file_url || a.url || a.src || a.remote_url || a.external_url;
    };

    const getFullUrl = (a) => {
      if (isHttpsPage) {
        // Prefer HTTPS URLs on HTTPS pages
        return a.remote_url?.startsWith('https://') ? a.remote_url :
               a.external_url?.startsWith('https://') ? a.external_url :
               a.file_url?.startsWith('https://') ? a.file_url :
               a.url?.startsWith('https://') ? a.url :
               // Fallback to any URL (will be proxied if HTTP)
               a.file_url || a.url || a.src || a.thumbnail_url || a.remote_url || a.external_url;
      }
      return a.file_url || a.url || a.src || a.thumbnail_url || a.remote_url || a.external_url;
    };

    let urls = assetsCache.map(a => ({
      id: a.id,
      thumb: getThumbUrl(a),
      full: getFullUrl(a),
      // Fallback: prefer HTTPS if available
      fallback: isHttpsPage && a.remote_url?.startsWith('https://') ? a.remote_url :
                isHttpsPage && a.external_url?.startsWith('https://') ? a.external_url :
                a.file_url || a.url || a.src || a.remote_url || a.external_url,
      name: a.name || a.original_filename || a.filename || a.title || '',
      createdAt: a.created_at || a.createdAt || '',
      mediaType: a.media_type || a.mediaType || null,
      providerId: a.provider_id || null,
      uploadMethod: a.upload_method || null,
    })).filter(u => u.thumb);

    // Fixed header for search/filters (doesn't scroll)
    const headerSection = document.createElement('div');
    headerSection.style.cssText = 'flex-shrink: 0; padding: 10px 12px 0;';

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
          // Call loadAssets with search query - resets to page 1
          await loadAssets({ page: 1, q: query });
        }
        // Re-render entire tab to update pagination
        renderTabContent('assets', container, panel, loadAssets);
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

    // Filter handler
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
      if (assetsFilterUploadMethod !== 'all') {
        filtered = filtered.filter(u => u.uploadMethod === assetsFilterUploadMethod);
      }
      renderGrid(filtered);
    };

    // === ROW 1: Search + Pagination (compact) ===
    const searchPaginationRow = document.createElement('div');
    searchPaginationRow.style.cssText = 'display: flex; gap: 4px; margin-bottom: 6px; align-items: center;';

    // Search input (flex grow)
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search...';
    searchInput.value = assetsSearchQuery;
    searchInput.style.cssText = `
      flex: 1; min-width: 80px; padding: 5px 8px; font-size: 10px;
      background: ${COLORS.bgHover}; border: 1px solid ${COLORS.border};
      border-radius: 3px; color: ${COLORS.text}; outline: none;
    `;
    searchInput.addEventListener('input', (e) => {
      assetsSearchQuery = e.target.value;
      saveAssetsState();
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => performSearch(assetsSearchQuery), 400);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        assetsSearchQuery = '';
        searchInput.value = '';
        saveAssetsState();
        clearTimeout(searchDebounce);
        performSearch('');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(searchDebounce);
        performSearch(assetsSearchQuery);
      }
    });

    // Pagination: ‹ [1/15] › ↻
    const hasMorePages = assetsTotalPages > 1 || assetsLoadedCount >= assetsPageSize;
    const canGoPrev = assetsCurrentPage > 1;
    const canGoNext = hasMorePages && (assetsTotalPages > assetsCurrentPage || assetsLoadedCount >= assetsPageSize);

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '‹';
    prevBtn.title = 'Previous page';
    prevBtn.disabled = !canGoPrev;
    prevBtn.style.cssText = `
      padding: 3px 6px; font-size: 12px; font-weight: bold;
      background: transparent; border: 1px solid ${COLORS.border};
      border-radius: 3px; cursor: ${canGoPrev ? 'pointer' : 'not-allowed'};
      color: ${canGoPrev ? COLORS.text : COLORS.border};
      opacity: ${canGoPrev ? '1' : '0.4'};
    `;
    prevBtn.addEventListener('click', async () => {
      if (!canGoPrev || !loadAssets) return;
      prevBtn.textContent = '...';
      await loadAssets({ page: assetsCurrentPage - 1 });
      saveAssetsState();
      renderTabContent('assets', container, panel, loadAssets);
    });

    // Page indicator: [1]/[15] (compact) - click to edit inline
    const pageContainer = document.createElement('span');
    pageContainer.style.cssText = `display: inline-flex; align-items: center;`;

    const pageLabel = document.createElement('span');
    pageLabel.style.cssText = `font-size: 10px; color: ${COLORS.text}; white-space: nowrap; cursor: pointer; padding: 0 4px;`;
    pageLabel.textContent = `${assetsCurrentPage}/${assetsTotalPages > 1 ? assetsTotalPages : '?'}`;
    pageLabel.title = 'Click to enter page number';

    const pageInput = document.createElement('input');
    pageInput.type = 'number';
    pageInput.min = '1';
    pageInput.max = assetsTotalPages > 1 ? assetsTotalPages : '999';
    pageInput.value = assetsCurrentPage;
    pageInput.style.cssText = `
      width: 40px; height: 20px; padding: 2px 4px; font-size: 10px;
      background: ${COLORS.bgHover}; border: 1px solid ${COLORS.accent};
      border-radius: 3px; color: ${COLORS.text}; outline: none;
      text-align: center; display: none;
    `;

    // Click label to show input
    pageLabel.addEventListener('click', () => {
      pageLabel.style.display = 'none';
      pageInput.style.display = 'inline-block';
      pageInput.focus();
      pageInput.select();
    });

    // Handle input submission
    const submitPageChange = () => {
      const page = parseInt(pageInput.value, 10);
      if (!isNaN(page) && page >= 1 && loadAssets) {
        loadAssets({ page }).then(() => {
          saveAssetsState();
          renderTabContent('assets', container, panel, loadAssets);
        });
      } else {
        // Restore original view
        pageInput.style.display = 'none';
        pageLabel.style.display = 'inline-block';
      }
    };

    // Submit on Enter or blur
    pageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitPageChange();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        pageInput.value = assetsCurrentPage;
        pageInput.style.display = 'none';
        pageLabel.style.display = 'inline-block';
      }
    });

    pageInput.addEventListener('blur', () => {
      // Small delay to allow click events to fire
      setTimeout(() => {
        pageInput.style.display = 'none';
        pageLabel.style.display = 'inline-block';
      }, 150);
    });

    pageContainer.appendChild(pageLabel);
    pageContainer.appendChild(pageInput);

    const nextBtn = document.createElement('button');
    nextBtn.textContent = '›';
    nextBtn.title = 'Next page';
    nextBtn.disabled = !canGoNext;
    nextBtn.style.cssText = `
      padding: 3px 6px; font-size: 12px; font-weight: bold;
      background: transparent; border: 1px solid ${COLORS.border};
      border-radius: 3px; cursor: ${canGoNext ? 'pointer' : 'not-allowed'};
      color: ${canGoNext ? COLORS.text : COLORS.border};
      opacity: ${canGoNext ? '1' : '0.4'};
    `;
    nextBtn.addEventListener('click', async () => {
      if (!canGoNext || !loadAssets) return;
      nextBtn.textContent = '...';
      await loadAssets({ page: assetsCurrentPage + 1 });
      saveAssetsState();
      renderTabContent('assets', container, panel, loadAssets);
    });

    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '↻';
    refreshBtn.title = 'Refresh';
    refreshBtn.style.cssText = `
      padding: 3px 5px; font-size: 10px;
      background: transparent; border: 1px solid ${COLORS.border};
      border-radius: 3px; color: ${COLORS.textMuted}; cursor: pointer;
    `;
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.textContent = '...';
      if (loadAssets) await loadAssets({ page: assetsCurrentPage, forceRefresh: true });
      renderTabContent('assets', container, panel, loadAssets);
    });

    // Build row 1
    searchPaginationRow.appendChild(searchInput);
    searchPaginationRow.appendChild(prevBtn);
    searchPaginationRow.appendChild(pageContainer);
    searchPaginationRow.appendChild(nextBtn);
    searchPaginationRow.appendChild(refreshBtn);
    headerSection.appendChild(searchPaginationRow);

    // === ROW 2: Filters + Sort ===
    const filterSortRow = document.createElement('div');
    filterSortRow.style.cssText = 'display: flex; gap: 4px; margin-bottom: 6px; align-items: center;';

    // Provider filter
    const providerSelect = document.createElement('select');
    providerSelect.style.cssText = `
      flex: 1; padding: 3px 4px; font-size: 9px;
      background: ${COLORS.bgHover}; border: 1px solid ${COLORS.border};
      border-radius: 3px; color: ${COLORS.text}; outline: none;
    `;
    if (Array.isArray(assetsFilterOptions.provider_id) && assetsFilterOptions.provider_id.length > 0) {
      const providerOptions = assetsFilterOptions.provider_id
        .map(o => `<option value="${o.value}">${o.label || o.value}</option>`)
        .join('');
      providerSelect.innerHTML = `<option value="all">All</option>${providerOptions}`;
    } else {
      providerSelect.innerHTML = `
        <option value="all">All</option>
        <option value="pixverse">Pixverse</option>
        <option value="runway">Runway</option>
        <option value="pika">Pika</option>
      `;
    }
    providerSelect.value = assetsFilterProvider;
    if (!providerSelect.querySelector(`option[value="${assetsFilterProvider}"]`)) {
      assetsFilterProvider = 'all';
      providerSelect.value = 'all';
    }
    providerSelect.addEventListener('change', () => {
      assetsFilterProvider = providerSelect.value;
      saveAssetsState();
      applyFilters();
    });

    // Media type filter
    const mediaTypeSelect = document.createElement('select');
    mediaTypeSelect.style.cssText = `
      flex: 1; padding: 3px 4px; font-size: 9px;
      background: ${COLORS.bgHover}; border: 1px solid ${COLORS.border};
      border-radius: 3px; color: ${COLORS.text}; outline: none;
    `;
    if (Array.isArray(assetsFilterOptions.media_type) && assetsFilterOptions.media_type.length > 0) {
      const mediaOptions = assetsFilterOptions.media_type
        .map(o => `<option value="${o.value}">${o.label || o.value}</option>`)
        .join('');
      mediaTypeSelect.innerHTML = `<option value="all">All</option>${mediaOptions}`;
    } else {
      mediaTypeSelect.innerHTML = `
        <option value="all">All</option>
        <option value="image">Img</option>
        <option value="video">Vid</option>
      `;
    }
    mediaTypeSelect.value = assetsFilterMediaType;
    if (!mediaTypeSelect.querySelector(`option[value="${assetsFilterMediaType}"]`)) {
      assetsFilterMediaType = 'all';
      mediaTypeSelect.value = 'all';
    }
    mediaTypeSelect.addEventListener('change', () => {
      assetsFilterMediaType = mediaTypeSelect.value;
      saveAssetsState();
      applyFilters();
    });

    // Upload method filter (Source)
    const uploadMethodSelect = document.createElement('select');
    uploadMethodSelect.style.cssText = `
      flex: 1; padding: 3px 4px; font-size: 9px;
      background: ${COLORS.bgHover}; border: 1px solid ${COLORS.border};
      border-radius: 3px; color: ${COLORS.text}; outline: none;
    `;
    if (Array.isArray(assetsFilterOptions.upload_method) && assetsFilterOptions.upload_method.length > 0) {
      const uploadOptions = assetsFilterOptions.upload_method
        .map(o => `<option value="${o.value}">${o.label || o.value}</option>`)
        .join('');
      uploadMethodSelect.innerHTML = `<option value="all">Source</option>${uploadOptions}`;
    } else {
      uploadMethodSelect.innerHTML = `
        <option value="all">Source</option>
        <option value="extension">Ext</option>
        <option value="local_folders">Local</option>
        <option value="generated">Gen</option>
        <option value="api">API</option>
      `;
    }
    uploadMethodSelect.value = assetsFilterUploadMethod;
    if (!uploadMethodSelect.querySelector(`option[value="${assetsFilterUploadMethod}"]`)) {
      assetsFilterUploadMethod = 'all';
      uploadMethodSelect.value = 'all';
    }
    uploadMethodSelect.addEventListener('change', () => {
      assetsFilterUploadMethod = uploadMethodSelect.value;
      saveAssetsState();
      applyFilters();
    });

    // Sort buttons
    const sortGroup = document.createElement('div');
    sortGroup.style.cssText = 'display: flex; gap: 1px;';
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
        padding: 2px 4px; font-size: 9px;
        background: ${isActive ? COLORS.accent : 'transparent'};
        border: 1px solid ${isActive ? COLORS.accent : COLORS.border};
        border-radius: 2px; cursor: pointer;
        color: ${isActive ? 'white' : COLORS.textMuted};
      `;
      btn.addEventListener('click', () => {
        saveAssetsSort(opt.id);
        renderTabContent('assets', container, panel, loadAssets);
      });
      sortGroup.appendChild(btn);
    });

    filterSortRow.appendChild(providerSelect);
    filterSortRow.appendChild(mediaTypeSelect);
    filterSortRow.appendChild(uploadMethodSelect);
    filterSortRow.appendChild(sortGroup);
    headerSection.appendChild(filterSortRow);

    // Add header section to container (fixed, non-scrolling)
    container.appendChild(headerSection);

    // Scrollable section for the grid only
    const scrollSection = document.createElement('div');
    scrollSection.style.cssText = 'flex: 1; overflow-y: auto; padding: 0 12px 10px;';
    scrollSection.appendChild(gridContainer);
    container.appendChild(scrollSection);

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
      renderGrid(urls);
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

    // Default panel dimensions
    const defaultWidth = '320px';
    const defaultHeight = '480px';

    // Load saved panel state (position, size, minimized)
    let savedState = {};
    try {
      savedState = JSON.parse(localStorage.getItem('pxs7_picker_state') || '{}');
    } catch (e) {
      debugLog('Failed to parse saved picker state:', e);
    }
    const savedPos = savedState.position || {};
    const savedSize = savedState.size || {};
    const savedMinimized = savedState.minimized || false;
    const panelWidth = savedSize.width || defaultWidth;
    const panelHeight = savedSize.height || defaultHeight;

    // Check if saved position is off-screen and reset if needed
    const checkBounds = (top, left, right) => {
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      const panelW = parseInt(panelWidth) || 320;
      const panelH = parseInt(panelHeight) || 480;

      let topVal = parseInt(top) || 80;
      let leftVal = left ? parseInt(left) : null;
      let rightVal = right ? parseInt(right) : 20;

      // If using left positioning
      if (leftVal !== null) {
        // Check if panel is mostly off-screen
        if (leftVal < -panelW + 50 || leftVal > screenW - 50) {
          return { reset: true };
        }
      } else {
        // Using right positioning
        if (rightVal < -panelW + 50 || rightVal > screenW - 50) {
          return { reset: true };
        }
      }

      // Check vertical bounds
      if (topVal < -panelH + 50 || topVal > screenH - 50) {
        return { reset: true };
      }

      return { reset: false };
    };

    const boundsCheck = checkBounds(savedPos.top, savedPos.left, savedPos.right);
    const useDefaults = boundsCheck.reset;

    if (useDefaults) {
      debugLog('Panel position was off-screen, resetting to defaults');
    }

    const panel = document.createElement('div');
    panel.className = 'pxs7-image-picker';
    panel.style.cssText = `
      position: fixed;
      top: ${useDefaults ? '80px' : (savedPos.top || '80px')};
      ${useDefaults ? 'right: 20px;' : (savedPos.left ? `left: ${savedPos.left};` : `right: ${savedPos.right || '20px'};`)}
      z-index: ${Z_INDEX_PICKER};
      background: ${COLORS.bg}; border: 1px solid ${COLORS.border};
      border-radius: 8px;
      width: ${savedMinimized ? 'auto' : (savedSize.width || panelWidth)};
      max-height: ${savedMinimized ? 'auto' : (savedSize.height || panelHeight)};
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; flex-direction: column; overflow: hidden;
    `;
    activePickerPanel = panel;

    // Reset position function
    const resetPosition = () => {
      panel.style.top = '80px';
      panel.style.right = '20px';
      panel.style.left = 'auto';
      panel.style.width = defaultWidth;
      panel.style.maxHeight = defaultHeight;
      localStorage.removeItem('pxs7_picker_state');
      debugLog('Panel position reset');
    };

    // Save panel state helper
    const saveState = () => {
      const state = {
        position: {
          top: panel.style.top,
          left: panel.style.left || null,
          right: panel.style.left ? null : panel.style.right,
        },
        size: {
          width: panel.style.width,
          height: panel.style.maxHeight,
        },
        minimized: panel.dataset.minimized === 'true',
      };
      localStorage.setItem('pxs7_picker_state', JSON.stringify(state));
    };

    // Save panel size when resized (debounced)
    let resizeTimeout = null;
    const resizeObserver = new ResizeObserver(() => {
      if (panel.dataset.minimized === 'true') return; // Don't save size when minimized
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        panel.style.width = panel.offsetWidth + 'px';
        panel.style.maxHeight = panel.offsetHeight + 'px';
        saveState();
        debugLog('Saved picker size');
      }, 500);
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

    let isMinimized = savedMinimized;
    panel.dataset.minimized = isMinimized ? 'true' : 'false';

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 12px; cursor: move; background: rgba(0,0,0,0.2);
      border-radius: 8px 8px 0 0; user-select: none; flex-shrink: 0;
    `;

    const title = document.createElement('span');
    title.style.cssText = `font-size: 12px; font-weight: 600; color: ${COLORS.text};`;
    title.textContent = '🖼 Image Picker';
    header.appendChild(title);

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display: flex; gap: 8px;';

    // Reset position button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = '⌂';
    resetBtn.title = 'Reset position (or double-click header)';
    resetBtn.style.cssText = `
      background: none; border: none; color: ${COLORS.textMuted};
      font-size: 12px; cursor: pointer; padding: 0; line-height: 1; width: 20px;
    `;
    resetBtn.addEventListener('click', resetPosition);
    btnGroup.appendChild(resetBtn);

    const minBtn = document.createElement('button');
    minBtn.textContent = isMinimized ? '+' : '−';
    minBtn.title = isMinimized ? 'Expand' : 'Minimize';
    minBtn.style.cssText = `
      background: none; border: none; color: ${COLORS.textMuted};
      font-size: 16px; cursor: pointer; padding: 0; line-height: 1; width: 20px;
    `;
    minBtn.addEventListener('click', () => {
      isMinimized = !isMinimized;
      panel.dataset.minimized = isMinimized ? 'true' : 'false';
      panelBody.style.display = isMinimized ? 'none' : 'flex';
      resizeHandle.style.display = isMinimized ? 'none' : 'block';
      panel.style.maxHeight = isMinimized ? 'auto' : panelHeight;
      panel.style.width = isMinimized ? 'auto' : panelWidth;
      minBtn.textContent = isMinimized ? '+' : '−';
      minBtn.title = isMinimized ? 'Expand' : 'Minimize';
      saveState();
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

    // Make draggable (header only)
    let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
    header.addEventListener('mousedown', (e) => {
      if (e.target === minBtn || e.target === closeBtn || e.target === syncBtn || e.target === resetBtn) return;
      isDragging = true;
      dragOffsetX = e.clientX - panel.offsetLeft;
      dragOffsetY = e.clientY - panel.offsetTop;
      panel.style.transition = 'none';
      e.preventDefault(); // Prevent text selection
    });
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      // Clamp position to keep at least 50px on screen
      const newLeft = e.clientX - dragOffsetX;
      const newTop = e.clientY - dragOffsetY;
      const clampedLeft = Math.max(-panel.offsetWidth + 50, Math.min(window.innerWidth - 50, newLeft));
      const clampedTop = Math.max(0, Math.min(window.innerHeight - 50, newTop));
      panel.style.left = clampedLeft + 'px';
      panel.style.top = clampedTop + 'px';
      panel.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        panel.style.transition = '';
        saveState(); // Save position after drag
      }
    });

    // Double-click header to reset position
    header.addEventListener('dblclick', (e) => {
      if (e.target === minBtn || e.target === closeBtn || e.target === syncBtn || e.target === resetBtn) return;
      resetPosition();
    });

    // Custom resize handle (bottom-right corner)
    const resizeHandle = document.createElement('div');
    resizeHandle.style.cssText = `
      position: absolute; bottom: 0; right: 0;
      width: 16px; height: 16px; cursor: se-resize;
      background: linear-gradient(135deg, transparent 50%, ${COLORS.border} 50%);
      border-radius: 0 0 8px 0;
    `;
    resizeHandle.style.display = isMinimized ? 'none' : 'block';

    let isResizing = false, resizeStartX = 0, resizeStartY = 0, startWidth = 0, startHeight = 0;
    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      resizeStartX = e.clientX;
      resizeStartY = e.clientY;
      startWidth = panel.offsetWidth;
      startHeight = panel.offsetHeight;
      panel.style.transition = 'none';
      e.preventDefault();
      e.stopPropagation();
    });
    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const newWidth = Math.max(200, startWidth + (e.clientX - resizeStartX));
      const newHeight = Math.max(150, startHeight + (e.clientY - resizeStartY));
      panel.style.width = newWidth + 'px';
      panel.style.maxHeight = newHeight + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        panel.style.transition = '';
        saveState(); // Save size after resize
      }
    });
    panel.appendChild(resizeHandle);

    const panelBody = document.createElement('div');
    panelBody.style.cssText = `display: ${isMinimized ? 'none' : 'flex'}; flex-direction: column; flex: 1; overflow: hidden;`;

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
    setAssetsPagination: ({ loaded, total, page, totalPages, pageSize }) => {
      assetsLoadedCount = loaded;
      assetsTotalCount = total;
      assetsCurrentPage = page;
      assetsTotalPages = totalPages;
      assetsPageSize = pageSize;
    },
    setLoadAssetsFunction: (fn) => { loadAssetsFunction = fn; },
    getRecentImages: () => recentSiteImages,
    setRecentImages: (images) => { recentSiteImages = images; },
    // Expose saved state for initial load
    getSavedPage: () => assetsCurrentPage,
    getSavedSearch: () => assetsSearchQuery,
    // Reset picker position (can call from console: PXS7.imagePicker.resetPosition())
    resetPosition: () => {
      localStorage.removeItem('pxs7_picker_state');
      if (activePickerPanel) {
        activePickerPanel.style.top = '80px';
        activePickerPanel.style.right = '20px';
        activePickerPanel.style.left = 'auto';
        activePickerPanel.style.width = '320px';
        activePickerPanel.style.maxHeight = '480px';
      }
      debugLog('Picker position reset');
    },
  };

})();
