/**
 * Picker SPA - Navigation detection for single-page app
 */
(function() {
  'use strict';

  window.PXS7 = window.PXS7 || {};
  window.PXS7.picker = window.PXS7.picker || {};

  const { COLORS } = window.PXS7.styles || {};
  const { state, utils, scan, tabs } = window.PXS7.picker;
  const { debugLog } = utils;
  const { scanPageForImages } = scan;
  const { renderTabContent } = tabs;

  let lastPickerUrl = window.location.href;
  let lastPickerPath = window.location.pathname;

  function onPickerPageChange() {
    debugLog('[Picker SPA] Page changed to:', window.location.pathname);

    if (state.activePickerPanel) {
      debugLog('[Picker SPA] Keeping picker open, refreshing page images');

      // Re-scan page
      const pageImages = scanPageForImages();
      const allRecent = new Set([...state.recentSiteImages, ...pageImages]);
      state.recentSiteImages = Array.from(allRecent);

      // Update Page tab count
      const pageTab = state.activePickerPanel.querySelector('[data-tab="page"]');
      if (pageTab) {
        pageTab.innerHTML = `Page <span style="opacity:0.6">(${state.recentSiteImages.length})</span>`;
      }

      // Re-render if on Page tab
      const activeTabBtn = state.activePickerPanel.querySelector(`button[style*="border-bottom-color: ${COLORS.accent}"], button[style*="border-bottom-color: rgb"]`);
      if (activeTabBtn?.dataset.tab === 'page') {
        const contentContainer = state.activePickerPanel.querySelector('div[style*="overflow-y: auto"]');
        if (contentContainer) {
          renderTabContent('page', contentContainer, state.activePickerPanel, state.loadAssetsFunction);
        }
      }
    }
  }

  // Watch popstate
  window.addEventListener('popstate', () => {
    if (window.location.href !== lastPickerUrl) {
      lastPickerUrl = window.location.href;
      lastPickerPath = window.location.pathname;
      onPickerPageChange();
    }
  });

  // Poll for URL changes (SPA pushState)
  setInterval(() => {
    const currentPath = window.location.pathname;
    if (currentPath !== lastPickerPath) {
      lastPickerUrl = window.location.href;
      lastPickerPath = currentPath;
      onPickerPageChange();
    }
  }, 500);

  debugLog('[Picker SPA] Navigation detection active');
})();
