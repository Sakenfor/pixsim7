/**
 * Pixverse Recently Used Assets Tracking
 * Manages recently used assets and sort preferences
 */

(function() {
  'use strict';

  window.PXS7 = window.PXS7 || {};
  const { normalizeUrl } = window.PXS7.utils || {};

  // Constants
  const RECENTLY_USED_KEY = 'pxs7_recently_used_assets';
  const ASSETS_SORT_KEY = 'pxs7_assets_sort';
  const MAX_RECENTLY_USED = 50;

  // State
  let recentlyUsedAssets = [];
  let assetsSortBy = 'recent'; // 'recent', 'name', 'default'
  let recentlyUsedMap = null; // Cache for lookup

  // ===== Storage Functions =====

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

  function buildRecentlyUsedMap() {
    recentlyUsedMap = new Map();
    recentlyUsedAssets.forEach((asset, idx) => {
      recentlyUsedMap.set(normalizeUrl(asset.url), idx);
    });
  }

  function getRecentlyUsedIndex(url) {
    if (!recentlyUsedMap) buildRecentlyUsedMap();
    const normalizedUrl = normalizeUrl(url);
    const idx = recentlyUsedMap.get(normalizedUrl);
    return idx !== undefined ? idx : -1;
  }

  // Load on init
  loadRecentlyUsed();

  // Export
  window.PXS7.recentlyUsed = {
    // Functions
    loadRecentlyUsed,
    saveRecentlyUsed,
    saveAssetsSort,
    addToRecentlyUsed,
    buildRecentlyUsedMap,
    getRecentlyUsedIndex,
    // State getters/setters
    getAssets: () => recentlyUsedAssets,
    setAssets: (assets) => { recentlyUsedAssets = assets; },
    getSortBy: () => assetsSortBy,
    setSortBy: (sort) => { assetsSortBy = sort; },
    // Constants
    MAX_RECENTLY_USED
  };

})();
