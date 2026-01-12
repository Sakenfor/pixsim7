/**
 * Picker Tabs - Tab content rendering (Page, Recents, Assets)
 */
(function() {
  'use strict';

  window.PXS7 = window.PXS7 || {};
  window.PXS7.picker = window.PXS7.picker || {};

  const { COLORS } = window.PXS7.styles || {};
  const { showToast } = window.PXS7.utils || {};
  const { createImageGrid } = window.PXS7.imageGrid || {};
  const { restoreAllImages } = window.PXS7.uploadUtils || {};
  const {
    getRecentlyUsedIndex,
    saveAssetsSort,
    getAssets: getRecentlyUsedAssets,
    getSortBy: getAssetsSortBy
  } = window.PXS7.recentlyUsed || {};

  const { state, utils } = window.PXS7.picker;
  const { debugLog, saveAssetsState, loadAssetFilterOptions, getFilterContext, getActiveExtraFilters, getExtraFilterDefinitions } = utils;

  // ===== Page Tab =====
  function renderPageTab(container, panel) {
    if (state.recentSiteImages.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 30px 10px; color: ${COLORS.textMuted};">
          <div style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;">📷</div>
          <div style="font-size: 11px;">No images on page</div>
          <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">User images (with UUID) will appear here</div>
        </div>
      `;
      return;
    }

    const actionsRow = document.createElement('div');
    actionsRow.style.cssText = 'display: flex; gap: 6px; margin-bottom: 10px;';

    const restoreAllBtn = document.createElement('button');
    restoreAllBtn.textContent = '↻ Restore All';
    restoreAllBtn.style.cssText = `flex: 1; padding: 6px; font-size: 10px; font-weight: 600; background: ${COLORS.accent}; border: none; border-radius: 4px; color: white; cursor: pointer;`;
    restoreAllBtn.addEventListener('click', async () => {
      restoreAllBtn.disabled = true;
      restoreAllBtn.textContent = 'Restoring...';
      await restoreAllImages(state.recentSiteImages, panel);
      restoreAllBtn.textContent = 'Done!';
    });

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 Copy';
    copyBtn.style.cssText = `padding: 6px 10px; font-size: 10px; background: transparent; border: 1px solid ${COLORS.border}; border-radius: 4px; color: ${COLORS.textMuted}; cursor: pointer;`;
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(state.recentSiteImages.join('\n')).then(() => {
        if (showToast) showToast(`Copied ${state.recentSiteImages.length} URL(s)!`, true);
      });
    });

    actionsRow.appendChild(restoreAllBtn);
    actionsRow.appendChild(copyBtn);
    container.appendChild(actionsRow);

    const getThumb = (url) => {
      const isPixverseCdn = url && (url.includes('media.pixverse.ai') || url.includes('pixverse-fe-upload'));
      return isPixverseCdn ? url + '?x-oss-process=style/cover-webp-small' : url;
    };
    const { grid } = createImageGrid(state.recentSiteImages, getThumb);
    container.appendChild(grid);
  }

  // ===== Recents Tab =====
  function renderRecentsTab(container, panel) {
    const recentlyUsedAssets = getRecentlyUsedAssets ? getRecentlyUsedAssets() : [];

    if (recentlyUsedAssets.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 30px 10px; color: ${COLORS.textMuted};">
          <div style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;">🕐</div>
          <div style="font-size: 11px;">No recent activity</div>
          <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">Images you inject will appear here</div>
        </div>
      `;
      return;
    }

    const clearBtn = document.createElement('button');
    clearBtn.textContent = '✕ Clear';
    clearBtn.style.cssText = `padding: 4px 8px; font-size: 9px; margin-bottom: 8px; background: transparent; border: 1px solid ${COLORS.border}; border-radius: 3px; color: ${COLORS.textMuted}; cursor: pointer;`;
    clearBtn.addEventListener('click', () => {
      if (window.PXS7.recentlyUsed) {
        window.PXS7.recentlyUsed.setAssets([]);
        window.PXS7.recentlyUsed.saveRecentlyUsed();
      }
      renderRecentsTab(container, panel);
    });
    container.appendChild(clearBtn);

    const urls = recentlyUsedAssets.map(a => {
      const isPixverseCdn = a.url && (a.url.includes('media.pixverse.ai') || a.url.includes('pixverse-fe-upload'));
      return { thumb: isPixverseCdn ? a.url + '?x-oss-process=style/cover-webp-small' : a.url, full: a.url, name: a.name || '' };
    });

    const { grid } = createImageGrid(urls, item => item.thumb, item => item.full, item => item.name);
    container.appendChild(grid);
  }

  // ===== Assets Tab =====
  function renderAssetsTab(container, panel, loadAssets) {
    if (!state.assetsFilterOptionsLoaded && !state.assetsFilterOptionsLoading) {
      loadAssetFilterOptions(getFilterContext()).then(loaded => {
        if (loaded) renderTabContent('assets', container, panel, loadAssets);
      });
    }

    container.style.cssText = 'display: flex; flex-direction: column; height: 100%; overflow: hidden; padding: 0;';

    const assetsSortBy = getAssetsSortBy ? getAssetsSortBy() : 'recent';

    const getThumbUrl = (a) => {
      const candidates = [
        { url: a.remote_url, priority: 1 },
        { url: a.external_url, priority: 1 },
        { url: a.thumbnail_url, priority: 2 },
        { url: a.file_url, priority: 3 },
        { url: a.url, priority: 4 },
        { url: a.src, priority: 4 }
      ].filter(c => c.url);
      const httpsUrl = candidates.find(c => c.url.startsWith('https://'));
      if (httpsUrl) return httpsUrl.url;
      candidates.sort((a, b) => a.priority - b.priority);
      return candidates[0]?.url || a.thumbnail_url;
    };

    const getFullUrl = (a) => {
      if (a.remote_url?.startsWith('https://')) return a.remote_url;
      if (a.external_url?.startsWith('https://')) return a.external_url;
      if (a.file_url?.startsWith('https://')) return a.file_url;
      if (a.url?.startsWith('https://')) return a.url;
      return a.remote_url || a.external_url || a.file_url || a.url || a.src || a.thumbnail_url;
    };

    const isHttpsPage = window.location.protocol === 'https:';
    let urls = state.assetsCache.map(a => ({
      id: a.id,
      thumb: getThumbUrl(a),
      full: getFullUrl(a),
      fallback: isHttpsPage && a.remote_url?.startsWith('https://') ? a.remote_url :
                isHttpsPage && a.external_url?.startsWith('https://') ? a.external_url :
                a.file_url || a.url || a.src || a.remote_url || a.external_url,
      name: a.name || a.original_filename || a.filename || a.title || '',
      mediaType: a.media_type || null,
    })).filter(u => u.thumb);

    // Sort
    if (assetsSortBy === 'recent') {
      urls.sort((a, b) => {
        const aIdx = getRecentlyUsedIndex ? getRecentlyUsedIndex(a.full) : -1;
        const bIdx = getRecentlyUsedIndex ? getRecentlyUsedIndex(b.full) : -1;
        if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
        if (aIdx >= 0) return -1;
        if (bIdx >= 0) return 1;
        return 0;
      });
    } else if (assetsSortBy === 'name') {
      urls.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    // Build UI
    const headerSection = document.createElement('div');
    headerSection.style.cssText = 'flex-shrink: 0; padding: 10px 12px 0;';

    const gridContainer = document.createElement('div');
    gridContainer.id = 'pxs7-assets-grid-container';

    const renderGrid = (displayUrls) => {
      gridContainer.innerHTML = '';
      if (displayUrls.length === 0) {
        gridContainer.innerHTML = `<div style="text-align: center; padding: 20px 10px; color: ${COLORS.textMuted};"><div style="font-size: 11px;">${state.assetsSearchQuery ? `No results for "${state.assetsSearchQuery}"` : 'No assets'}</div></div>`;
      } else {
        const { grid } = createImageGrid(displayUrls, item => item.thumb, item => item.full, item => item.name, item => item.fallback, item => item.mediaType);
        gridContainer.appendChild(grid);
      }
    };

    // Search/filter handlers
    let searchDebounce = null;
    let isSearching = false;

    const performSearch = async (query) => {
      if (isSearching) return;
      isSearching = true;
      gridContainer.innerHTML = `<div style="text-align: center; padding: 20px 10px; color: ${COLORS.textMuted};"><div style="font-size: 11px;">Searching...</div></div>`;
      try {
        if (loadAssets) {
          await loadAssets({ page: 1, q: query, uploadMethod: state.assetsFilterUploadMethod, mediaType: state.assetsFilterMediaType, providerId: state.assetsFilterProvider, extraFilters: getActiveExtraFilters() });
        }
        renderTabContent('assets', container, panel, loadAssets);
      } catch (e) {
        gridContainer.innerHTML = `<div style="text-align: center; padding: 20px 10px; color: ${COLORS.textMuted};"><div style="font-size: 11px;">Search failed</div></div>`;
      } finally {
        isSearching = false;
      }
    };

    const applyFilters = async () => {
      gridContainer.innerHTML = `<div style="text-align: center; padding: 20px 10px; color: ${COLORS.textMuted};"><div style="font-size: 11px;">Loading filtered results...</div></div>`;
      try {
        if (loadAssets) {
          await loadAssets({ page: 1, q: state.assetsSearchQuery || undefined, uploadMethod: state.assetsFilterUploadMethod, mediaType: state.assetsFilterMediaType, providerId: state.assetsFilterProvider, extraFilters: getActiveExtraFilters() });
        }
        renderTabContent('assets', container, panel, loadAssets);
      } catch (e) {
        gridContainer.innerHTML = `<div style="text-align: center; padding: 20px 10px; color: ${COLORS.textMuted};"><div style="font-size: 11px;">Filter failed</div></div>`;
      }
    };

    // Row 1: Search + Pagination
    const searchRow = document.createElement('div');
    searchRow.style.cssText = 'display: flex; gap: 4px; margin-bottom: 6px; align-items: center;';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search...';
    searchInput.value = state.assetsSearchQuery;
    searchInput.style.cssText = `flex: 1; min-width: 80px; padding: 5px 8px; font-size: 10px; background: ${COLORS.bgHover}; border: 1px solid ${COLORS.border}; border-radius: 3px; color: ${COLORS.text}; outline: none;`;
    searchInput.addEventListener('input', e => {
      state.assetsSearchQuery = e.target.value;
      saveAssetsState();
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => performSearch(state.assetsSearchQuery), 400);
    });

    const hasMorePages = state.assetsTotalPages > 1 || state.assetsLoadedCount >= state.assetsPageSize;
    const canGoPrev = state.assetsCurrentPage > 1;
    const canGoNext = hasMorePages && (state.assetsTotalPages > state.assetsCurrentPage || state.assetsLoadedCount >= state.assetsPageSize);

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '‹';
    prevBtn.disabled = !canGoPrev;
    prevBtn.style.cssText = `padding: 3px 6px; font-size: 12px; font-weight: bold; background: transparent; border: 1px solid ${COLORS.border}; border-radius: 3px; cursor: ${canGoPrev ? 'pointer' : 'not-allowed'}; color: ${canGoPrev ? COLORS.text : COLORS.border}; opacity: ${canGoPrev ? '1' : '0.4'};`;
    prevBtn.addEventListener('click', async () => {
      if (!canGoPrev || !loadAssets) return;
      await loadAssets({ page: state.assetsCurrentPage - 1, uploadMethod: state.assetsFilterUploadMethod, mediaType: state.assetsFilterMediaType, providerId: state.assetsFilterProvider, extraFilters: getActiveExtraFilters() });
      saveAssetsState();
      renderTabContent('assets', container, panel, loadAssets);
    });

    const pageLabel = document.createElement('span');
    pageLabel.style.cssText = `font-size: 10px; color: ${COLORS.text}; padding: 0 4px;`;
    pageLabel.textContent = `${state.assetsCurrentPage}/${state.assetsTotalPages > 1 ? state.assetsTotalPages : '?'}`;

    const nextBtn = document.createElement('button');
    nextBtn.textContent = '›';
    nextBtn.disabled = !canGoNext;
    nextBtn.style.cssText = `padding: 3px 6px; font-size: 12px; font-weight: bold; background: transparent; border: 1px solid ${COLORS.border}; border-radius: 3px; cursor: ${canGoNext ? 'pointer' : 'not-allowed'}; color: ${canGoNext ? COLORS.text : COLORS.border}; opacity: ${canGoNext ? '1' : '0.4'};`;
    nextBtn.addEventListener('click', async () => {
      if (!canGoNext || !loadAssets) return;
      await loadAssets({ page: state.assetsCurrentPage + 1, uploadMethod: state.assetsFilterUploadMethod, mediaType: state.assetsFilterMediaType, providerId: state.assetsFilterProvider, extraFilters: getActiveExtraFilters() });
      saveAssetsState();
      renderTabContent('assets', container, panel, loadAssets);
    });

    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '↻';
    refreshBtn.style.cssText = `padding: 3px 5px; font-size: 10px; background: transparent; border: 1px solid ${COLORS.border}; border-radius: 3px; color: ${COLORS.textMuted}; cursor: pointer;`;
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.textContent = '...';
      if (loadAssets) await loadAssets({ page: state.assetsCurrentPage, forceRefresh: true, uploadMethod: state.assetsFilterUploadMethod, mediaType: state.assetsFilterMediaType, providerId: state.assetsFilterProvider, extraFilters: getActiveExtraFilters() });
      renderTabContent('assets', container, panel, loadAssets);
    });

    searchRow.appendChild(searchInput);
    searchRow.appendChild(prevBtn);
    searchRow.appendChild(pageLabel);
    searchRow.appendChild(nextBtn);
    searchRow.appendChild(refreshBtn);
    headerSection.appendChild(searchRow);

    // Row 2: Filters + Sort
    const filterRow = document.createElement('div');
    filterRow.style.cssText = 'display: flex; gap: 4px; margin-bottom: 6px; align-items: center;';

    const createSelect = (options, value, onChange) => {
      const sel = document.createElement('select');
      sel.style.cssText = `flex: 1; padding: 3px 4px; font-size: 9px; background: ${COLORS.bgHover}; border: 1px solid ${COLORS.border}; border-radius: 3px; color: ${COLORS.text}; outline: none;`;
      sel.innerHTML = options;
      sel.value = value;
      sel.addEventListener('change', onChange);
      return sel;
    };

    const providerOpts = state.assetsFilterOptions.provider_id?.map(o => `<option value="${o.value}">${o.label || o.value}</option>`).join('') || '<option value="pixverse">Pixverse</option>';
    const providerSelect = createSelect(`<option value="all">All</option>${providerOpts}`, state.assetsFilterProvider, () => {
      state.assetsFilterProvider = providerSelect.value;
      saveAssetsState();
      applyFilters();
    });

    const mediaOpts = state.assetsFilterOptions.media_type?.map(o => `<option value="${o.value}">${o.label || o.value}</option>`).join('') || '<option value="image">Img</option><option value="video">Vid</option>';
    const mediaSelect = createSelect(`<option value="all">All</option>${mediaOpts}`, state.assetsFilterMediaType, () => {
      state.assetsFilterMediaType = mediaSelect.value;
      saveAssetsState();
      applyFilters();
    });

    const uploadOpts = state.assetsFilterOptions.upload_method?.map(o => `<option value="${o.value}">${o.label || o.value}</option>`).join('') || '';
    const uploadSelect = createSelect(`<option value="all">Source</option>${uploadOpts}`, state.assetsFilterUploadMethod, async () => {
      state.assetsFilterUploadMethod = uploadSelect.value;
      saveAssetsState();
      state.assetsFilterOptionsLoaded = false;
      await loadAssetFilterOptions(getFilterContext());
      applyFilters();
    });

    // Sort buttons
    const sortGroup = document.createElement('div');
    sortGroup.style.cssText = 'display: flex; gap: 1px;';
    [{ id: 'recent', label: '🕐' }, { id: 'name', label: 'AZ' }, { id: 'default', label: '⏱' }].forEach(opt => {
      const btn = document.createElement('button');
      btn.textContent = opt.label;
      const isActive = assetsSortBy === opt.id;
      btn.style.cssText = `padding: 2px 4px; font-size: 9px; background: ${isActive ? COLORS.accent : 'transparent'}; border: 1px solid ${isActive ? COLORS.accent : COLORS.border}; border-radius: 2px; cursor: pointer; color: ${isActive ? 'white' : COLORS.textMuted};`;
      btn.addEventListener('click', () => {
        if (saveAssetsSort) saveAssetsSort(opt.id);
        renderTabContent('assets', container, panel, loadAssets);
      });
      sortGroup.appendChild(btn);
    });

    filterRow.appendChild(providerSelect);
    filterRow.appendChild(mediaSelect);
    filterRow.appendChild(uploadSelect);
    filterRow.appendChild(sortGroup);
    headerSection.appendChild(filterRow);

    // Extra filters
    const extraDefs = getExtraFilterDefinitions();
    if (extraDefs.length > 0) {
      const extraRow = document.createElement('div');
      extraRow.style.cssText = 'display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap;';
      extraDefs.forEach(def => {
        const options = state.assetsFilterOptions[def.key] || [];
        const sel = document.createElement('select');
        sel.style.cssText = `flex: 1; min-width: 90px; padding: 3px 4px; font-size: 9px; background: ${COLORS.bgHover}; border: 1px solid ${COLORS.border}; border-radius: 3px; color: ${COLORS.text}; outline: none;`;
        sel.innerHTML = `<option value="all">${def.label || def.key}</option>${options.map(o => `<option value="${o.value}">${o.label || o.value}</option>`).join('')}`;
        sel.value = state.assetsFilterExtras[def.key] || 'all';
        sel.disabled = options.length === 0;
        sel.addEventListener('change', () => {
          if (sel.value === 'all') delete state.assetsFilterExtras[def.key];
          else state.assetsFilterExtras[def.key] = sel.value;
          saveAssetsState();
          applyFilters();
        });
        extraRow.appendChild(sel);
      });
      if (extraRow.childElementCount > 0) headerSection.appendChild(extraRow);
    }

    container.appendChild(headerSection);

    const scrollSection = document.createElement('div');
    scrollSection.style.cssText = 'flex: 1; overflow-y: auto; padding: 0 12px 10px;';
    scrollSection.appendChild(gridContainer);
    container.appendChild(scrollSection);

    if (urls.length === 0) {
      gridContainer.innerHTML = `<div style="text-align: center; padding: 30px 10px; color: ${COLORS.textMuted};"><div style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;">📁</div><div style="font-size: 11px;">No assets found</div></div>`;
    } else {
      renderGrid(urls);
    }
  }

  // Main render function
  function renderTabContent(tabId, container, panel, loadAssets) {
    container.innerHTML = '';
    if (tabId === 'page') renderPageTab(container, panel);
    else if (tabId === 'recents') renderRecentsTab(container, panel);
    else renderAssetsTab(container, panel, loadAssets);
  }

  // Export
  window.PXS7.picker.tabs = {
    renderPageTab,
    renderRecentsTab,
    renderAssetsTab,
    renderTabContent,
  };
})();
