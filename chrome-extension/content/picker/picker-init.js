/**
 * Picker Init - Main exports and initialization
 */
(function() {
  'use strict';

  window.PXS7 = window.PXS7 || {};

  const { state, utils, scan, panel } = window.PXS7.picker;
  const { getActiveExtraFilters } = utils;
  const { scanPageForImages } = scan;
  const { showUnifiedImagePicker, showImageRestorePanel } = panel;

  // Re-export from uploadUtils
  const {
    saveInputState,
    restoreInputState,
    setupAutoSave,
    findUploadInputs,
    setupUploadInterceptor,
    injectImageToUpload,
  } = window.PXS7.uploadUtils || {};

  // Export main API
  window.PXS7.imagePicker = {
    // Upload utils (re-exported)
    saveInputState,
    restoreInputState,
    setupAutoSave,
    setupUploadInterceptor,
    findUploadInputs,
    injectImageToUpload,

    // Picker functions
    scanPageForImages,
    showImageRestorePanel,
    showUnifiedImagePicker,

    // State setters
    setAssetsCache: (cache) => { state.assetsCache = cache; },
    setAssetsPagination: ({ loaded, total, page, totalPages, pageSize }) => {
      state.assetsLoadedCount = loaded;
      state.assetsTotalCount = total;
      state.assetsCurrentPage = page;
      state.assetsTotalPages = totalPages;
      state.assetsPageSize = pageSize;
    },
    setLoadAssetsFunction: (fn) => { state.loadAssetsFunction = fn; },
    getRecentImages: () => state.recentSiteImages,
    setRecentImages: (images) => { state.recentSiteImages = images; },

    // Saved state accessors
    getSavedPage: () => state.assetsCurrentPage,
    getSavedSearch: () => state.assetsSearchQuery,
    getSavedFilters: () => ({
      uploadMethod: state.assetsFilterUploadMethod !== 'all' ? state.assetsFilterUploadMethod : undefined,
      mediaType: state.assetsFilterMediaType !== 'all' ? state.assetsFilterMediaType : undefined,
      providerId: state.assetsFilterProvider !== 'all' ? state.assetsFilterProvider : undefined,
      extraFilters: getActiveExtraFilters(),
    }),

    // Reset position
    resetPosition: () => {
      localStorage.removeItem('pxs7_picker_state');
      if (state.activePickerPanel) {
        state.activePickerPanel.style.top = '80px';
        state.activePickerPanel.style.right = '20px';
        state.activePickerPanel.style.left = 'auto';
        state.activePickerPanel.style.width = '320px';
        state.activePickerPanel.style.maxHeight = '480px';
      }
    },
  };

  console.log('[PixSim7] Image Picker modules loaded');
})();
