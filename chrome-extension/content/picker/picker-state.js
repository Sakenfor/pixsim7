/**
 * Picker State - State management, persistence, and filter utilities
 */
(function() {
  'use strict';

  window.PXS7 = window.PXS7 || {};
  window.PXS7.picker = window.PXS7.picker || {};

  const { sendMessageWithTimeout } = window.PXS7.utils || {};

  // Debug mode
  let DEBUG_IMAGE_PICKER = localStorage.getItem('pxs7_debug') === 'true';
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get({ debugImagePicker: false, debugAll: false }, (result) => {
      DEBUG_IMAGE_PICKER = result.debugImagePicker || result.debugAll || DEBUG_IMAGE_PICKER;
      if (DEBUG_IMAGE_PICKER) console.log('[PixSim7] Image Picker debug mode enabled');
    });
  }
  const debugLog = (...args) => DEBUG_IMAGE_PICKER && console.log('[PixSim7]', ...args);

  // Z-index constants
  const Z_INDEX_PICKER = 9999;
  const Z_INDEX_PICKER_INACTIVE = 900;

  // Persistence keys
  const ASSETS_STATE_KEY = 'pxs7_assets_state';

  // Module state
  const state = {
    recentSiteImages: [],
    assetsCache: [],
    assetsTotalCount: 0,
    assetsLoadedCount: 0,
    assetsCurrentPage: 1,
    assetsTotalPages: 1,
    assetsPageSize: 50,
    loadAssetsFunction: null,
    assetsSearchQuery: '',
    activePickerPanel: null,
    // Filters
    assetsFilterProvider: 'all',
    assetsFilterMediaType: 'all',
    assetsFilterUploadMethod: 'all',
    assetsFilterOptions: { provider_id: null, media_type: null, upload_method: null },
    assetsFilterDefinitions: [],
    assetsFilterExtras: {},
    assetsFilterOptionsContextKey: '',
    assetsFilterOptionsLoaded: false,
    assetsFilterOptionsLoading: false,
  };

  // Load persisted state
  function loadAssetsState() {
    try {
      const saved = JSON.parse(localStorage.getItem(ASSETS_STATE_KEY) || '{}');
      if (saved.page) state.assetsCurrentPage = saved.page;
      if (saved.search) state.assetsSearchQuery = saved.search;
      if (saved.filterProvider) state.assetsFilterProvider = saved.filterProvider;
      if (saved.filterMediaType) state.assetsFilterMediaType = saved.filterMediaType;
      if (saved.filterUploadMethod) state.assetsFilterUploadMethod = saved.filterUploadMethod;
      if (saved.extraFilters && typeof saved.extraFilters === 'object') {
        state.assetsFilterExtras = saved.extraFilters;
      }
      debugLog('Loaded assets state:', saved);
    } catch (e) {
      debugLog('Failed to load assets state:', e);
    }
  }

  function saveAssetsState() {
    try {
      const data = {
        page: state.assetsCurrentPage,
        search: state.assetsSearchQuery,
        filterProvider: state.assetsFilterProvider,
        filterMediaType: state.assetsFilterMediaType,
        filterUploadMethod: state.assetsFilterUploadMethod,
        extraFilters: state.assetsFilterExtras,
      };
      localStorage.setItem(ASSETS_STATE_KEY, JSON.stringify(data));
    } catch (e) {
      debugLog('Failed to save assets state:', e);
    }
  }

  async function loadAssetFilterOptions(context = {}) {
    const contextKey = JSON.stringify(context || {});
    if (state.assetsFilterOptionsLoading) return state.assetsFilterOptionsLoaded;
    if (state.assetsFilterOptionsLoaded && state.assetsFilterOptionsContextKey === contextKey) {
      return state.assetsFilterOptionsLoaded;
    }
    if (!sendMessageWithTimeout) return false;

    state.assetsFilterOptionsLoading = true;
    try {
      const res = await sendMessageWithTimeout({
        action: 'apiRequest',
        path: '/assets/filter-options',
        method: 'POST',
        body: { context },
      }, 5000);

      if (res?.success && res.data?.options) {
        state.assetsFilterOptions = { ...res.data.options };
        state.assetsFilterDefinitions = Array.isArray(res.data.filters) ? res.data.filters : [];
        state.assetsFilterOptionsContextKey = contextKey;
        const validKeys = new Set(state.assetsFilterDefinitions.map(f => f.key));
        state.assetsFilterExtras = Object.fromEntries(
          Object.entries(state.assetsFilterExtras).filter(([key]) => validKeys.has(key))
        );
        state.assetsFilterOptionsLoaded = true;
      }
    } catch (e) {
      debugLog('Failed to load filter metadata', e);
    } finally {
      state.assetsFilterOptionsLoading = false;
    }
    return state.assetsFilterOptionsLoaded;
  }

  function getFilterContext() {
    if (state.assetsFilterUploadMethod && state.assetsFilterUploadMethod !== 'all') {
      return { upload_method: state.assetsFilterUploadMethod };
    }
    return {};
  }

  function getActiveExtraFilters() {
    const active = {};
    Object.entries(state.assetsFilterExtras).forEach(([key, value]) => {
      if (value && value !== 'all') active[key] = value;
    });
    return Object.keys(active).length > 0 ? active : undefined;
  }

  function getExtraFilterDefinitions() {
    const baseKeys = new Set(['provider_id', 'media_type', 'upload_method', 'include_archived', 'tag', 'q']);
    return (state.assetsFilterDefinitions || []).filter(def => {
      if (!def || def.type !== 'enum') return false;
      return !baseKeys.has(def.key);
    });
  }

  // Dev: Pixverse Dry-Run Sync
  async function triggerPixverseDryRunSync() {
    const { showToast } = window.PXS7.utils || {};
    const storage = window.PXS7.storage;
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

      const res = await sendMessageWithTimeout({
        action: 'pixverseDryRunSync',
        accountId: currentAccount.id,
        limit: 20,
        offset: 0,
      }, 15000);

      if (!res?.success) {
        if (showToast) showToast(`Pixverse sync dry-run failed: ${res?.error || 'unknown error'}`, false);
        return;
      }

      const data = res.data || {};
      debugLog('Pixverse dry-run sync result:', data);
      if (showToast) {
        showToast(`Pixverse dry-run: ${data.existing_count ?? 0}/${data.total_remote ?? 0} videos already imported`, true);
      }
    } catch (e) {
      console.warn('[PixSim7] Pixverse dry-run sync failed:', e);
      const { showToast } = window.PXS7.utils || {};
      if (showToast) showToast(`Pixverse sync dry-run error: ${e.message || e}`, false);
    }
  }

  // Initialize
  loadAssetsState();

  // Export
  window.PXS7.picker.state = state;
  window.PXS7.picker.utils = {
    debugLog,
    loadAssetsState,
    saveAssetsState,
    loadAssetFilterOptions,
    getFilterContext,
    getActiveExtraFilters,
    getExtraFilterDefinitions,
    triggerPixverseDryRunSync,
    Z_INDEX_PICKER,
    Z_INDEX_PICKER_INACTIVE,
  };
})();
