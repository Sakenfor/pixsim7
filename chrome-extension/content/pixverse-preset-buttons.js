/**
 * Pixverse Preset Buttons (Refactored)
 *
 * Injects account selector, login, and run preset buttons on Pixverse site.
 * Layout: [● Account ▼] [↪ Login] [▶ Run]
 *
 * Dependencies: pixverse-styles, pixverse-utils, pixverse-storage, pixverse-image-picker
 */

(function() {
  'use strict';

  // Debug mode - controlled by extension settings
  let DEBUG_PRESETS = false;
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get({ debugPresets: false, debugAll: false }, (result) => {
      DEBUG_PRESETS = result.debugPresets || result.debugAll;
    });
  }
  const debugLog = (...args) => DEBUG_PRESETS && console.log('[PixSim7]', ...args);

  // ===== Module Imports =====
  const { BTN_GROUP_CLASS, BTN_CLASS, MENU_CLASS, COLORS, injectStyle } = window.PXS7.styles;
  const {
    showToast, closeMenus, positionMenu, setupOutsideClick, sendMessageWithTimeout,
    normalizeUrl, addHoverEffect, withLoadingState, createMenuItem, createDivider
  } = window.PXS7.utils;
  const storage = window.PXS7.storage;
  const imagePicker = window.PXS7.imagePicker;

  // Re-export module functions for convenience
  const {
    STORAGE_KEY_PROVIDER_SESSIONS,
    loadSelectedAccount, saveSelectedAccount,
    loadSelectedPreset, saveSelectedPreset,
    getCurrentPreset, loadAccountSort, saveAccountSort,
    getSortedAccounts, loadCurrentSessionAccount,
    getCurrentAccount, getCurrentSessionAccount
  } = storage;

  const {
    saveInputState, restoreInputState,
    setupUploadInterceptor, showUnifiedImagePicker,
    showImageRestorePanel
  } = imagePicker;

  // Local constants
  const PROCESSED_ATTR = 'data-pxs7';
  const TASK_SELECTOR = 'span.bg-task.bg-clip-text.text-transparent';

  // Local state (data caches)
  let presetsCache = [];
  let accountsCache = [];
  let assetsCache = [];
  let assetsTotalCount = 0;
  let assetsLoadedCount = 0;
  let assetsNextCursor = null;
  let assetsCurrentPage = 1;
  let assetsTotalPages = 1;
  const ASSETS_PAGE_SIZE = 50; // Smaller page size for true pagination
  let adStatusCache = new Map();
  // Cache TTL in milliseconds (5 minutes to match backend cache)
  const AD_STATUS_CACHE_TTL = 5 * 60 * 1000;

  // Sync caches with modules
  function syncModuleCaches() {
    storage.state.presetsCache = presetsCache;
    storage.state.accountsCache = accountsCache;
    imagePicker.setAssetsCache(assetsCache);
    imagePicker.setAssetsPagination({
      loaded: assetsLoadedCount,
      total: assetsTotalCount,
      page: assetsCurrentPage,
      totalPages: assetsTotalPages,
      pageSize: ASSETS_PAGE_SIZE,
    });
  }

  // ===== Data Loading =====

  async function loadAccounts() {
    try {
      // Use longer timeout - backend API can take time
      const res = await sendMessageWithTimeout({
        action: 'getAccounts',
        providerId: 'pixverse'
      }, 10000); // 10 second timeout

      if (res?.success && Array.isArray(res.data)) {
        // Keep all accounts - only filter out explicitly disabled/suspended
        // (Don't filter by credits - accounts may not have synced yet)
        accountsCache = res.data.filter(a =>
          a.status !== 'disabled' && a.status !== 'suspended'
        );
        // Sorting done at display time via getSortedAccounts()

        // Fetch ad status for selected account only (manual refresh for all via extension popup)
        fetchSelectedAccountStatus();

        debugLog('Loaded', accountsCache.length, 'accounts');
        return accountsCache;
      } else {
        console.warn('[PixSim7] loadAccounts failed:', res?.error || 'unknown error');
      }
    } catch (e) {
      console.warn('[PixSim7] loadAccounts error:', e.message);
      // Show toast on error so user knows something went wrong
      if (showToast && accountsCache.length === 0) {
        showToast('Failed to load accounts', false);
      }
    }
    return accountsCache; // Return existing cache on error (don't clear it)
  }

  // Fetch ad status for selected account only (background, no await)
  function fetchSelectedAccountStatus() {
    const selected = getCurrentAccount();
    if (!selected) return;

    // Skip if recently cached (use same TTL as prefetch)
    const cached = adStatusCache.get(selected.id);
    if (cached && (Date.now() - cached.time) < AD_STATUS_CACHE_TTL) return;

    sendMessageWithTimeout({
      action: 'getPixverseStatus',
      accountId: selected.id
    }, 5000).then(res => {
      if (res?.success && res.data) {
        adStatusCache.set(selected.id, { data: res.data, time: Date.now() });
        updateAllAccountButtons();
      }
    }).catch(() => {});
  }

  // Update ad status in any open menu items
  function updateOpenMenuAdStatus(accountId) {
    const menuItem = document.querySelector(`.${MENU_CLASS}__account[data-account-id="${accountId}"]`);
    if (!menuItem) return;

    const adsPill = menuItem.querySelector(`.${MENU_CLASS}__account-ads`);
    if (!adsPill) return;

    const cached = adStatusCache.get(accountId);
    if (cached?.data) {
      renderAdsPill(adsPill, cached.data);
      adsPill.style.display = ''; // Show the pill
    }
  }

  // Prefetch ad status for multiple accounts (used when menu opens)
  function prefetchAdStatusForAccounts(accounts, limit = 20) {
    // Only fetch for accounts without recent cache, limited to avoid overload
    const toFetch = accounts
      .filter(a => {
        const cached = adStatusCache.get(a.id);
        return !cached || (Date.now() - cached.time) > AD_STATUS_CACHE_TTL;
      })
      .slice(0, limit);

    toFetch.forEach(account => {
      sendMessageWithTimeout({
        action: 'getPixverseStatus',
        accountId: account.id
      }, 5000).then(res => {
        if (res?.success && res.data) {
          adStatusCache.set(account.id, { data: res.data, time: Date.now() });
          // Update open menu item immediately
          updateOpenMenuAdStatus(account.id);
        }
      }).catch(() => {});
    });

    // Also update page buttons after a delay
    if (toFetch.length > 0) {
      setTimeout(updateAllAccountButtons, 2000);
    }
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

  // Track current search query and filters for cache invalidation
  let assetsCurrentQuery = '';
  let assetsCurrentFilters = {
    uploadMethod: undefined,
    mediaType: undefined,
    providerId: undefined
  };

  /**
   * Load assets with true pagination (page replacement, not append)
   * @param {Object} options
   * @param {number} options.page - Page number to load (1-based)
   * @param {string} options.q - Search query
   * @param {string} options.uploadMethod - Upload method filter (e.g., 'local_folders', 'extension')
   * @param {string} options.mediaType - Media type filter (e.g., 'image', 'video')
   * @param {string} options.providerId - Provider ID filter (e.g., 'pixverse', 'runway')
   * @param {boolean} options.forceRefresh - Force reload even if cached
   */
  async function loadAssets(options = {}) {
    const { page = 1, q, uploadMethod, mediaType, providerId, forceRefresh = false } = options;

    // Check if query or filters changed
    const queryChanged = q !== undefined && q !== assetsCurrentQuery;
    const filtersChanged =
      uploadMethod !== assetsCurrentFilters.uploadMethod ||
      mediaType !== assetsCurrentFilters.mediaType ||
      providerId !== assetsCurrentFilters.providerId;

    // Update tracked state
    if (queryChanged) {
      assetsCurrentQuery = q || '';
    }
    if (filtersChanged) {
      assetsCurrentFilters = { uploadMethod, mediaType, providerId };
    }

    // Check cache - only use if same page, query, filters, and not forcing refresh
    if (!forceRefresh && !queryChanged && !filtersChanged && assetsCache.length > 0 && assetsCurrentPage === page) {
      return assetsCache;
    }

    try {
      const limit = ASSETS_PAGE_SIZE;
      const offset = (page - 1) * limit;

      // Build request params - use offset for page jumping
      const params = {
        action: 'getAssets',
        limit: limit,
        offset: offset
      };

      // Include search query if set
      if (assetsCurrentQuery) {
        params.q = assetsCurrentQuery;
      }

      // Include server-side filter parameters
      if (uploadMethod && uploadMethod !== 'all') {
        params.uploadMethod = uploadMethod;
      }
      if (mediaType && mediaType !== 'all') {
        params.mediaType = mediaType;
      }
      if (providerId && providerId !== 'all') {
        params.providerId = providerId;
      }

      const res = await sendMessageWithTimeout(params);

      if (!res?.success) {
        return [];
      }

      debugLog('Raw backend response:', {
        success: res.success,
        page,
        offset,
        dataType: Array.isArray(res.data) ? 'array' : typeof res.data,
        dataKeys: res.data && typeof res.data === 'object' ? Object.keys(res.data) : null,
      });

      // Handle different response formats
      let items = res.data;
      let total = null;

      if (items && !Array.isArray(items)) {
        total = items.total || items.count || items.totalCount || items.total_count || null;
        items = items.items || items.assets || items.data || items.results || [];
      }

      debugLog('Parsed response:', {
        itemsCount: items?.length,
        total,
        isArray: Array.isArray(items)
      });

      if (!Array.isArray(items)) {
        return [];
      }

      // Filter to only images (keep all for now since we want images for picker)
      const pageImages = items.filter(a => {
        if (a.media_type === 'image') return true;
        if (a.type === 'image') return true;
        const path = a.file_path || a.file_url || a.external_url || a.remote_url || a.url || '';
        if (path.match(/\.(jpg|jpeg|png|webp|gif)$/i)) return true;
        if (a.mime_type?.startsWith('image/')) return true;
        if (a.file_url || a.external_url || a.remote_url || a.thumbnail_url) return true;
        return false;
      });

      // Replace cache with current page (not append)
      assetsCache = pageImages;
      assetsCurrentPage = page;
      assetsLoadedCount = pageImages.length;

      // Calculate total pages
      // Note: Backend currently returns total = len(current_page), not total items
      // So we use "got full page" heuristic to detect if there are more
      const gotFullPage = pageImages.length >= limit;

      // If total is significantly larger than limit, it's a real total count
      // Otherwise assume it's just the page count and use heuristic
      const isRealTotal = total !== null && total > limit;

      if (isRealTotal) {
        assetsTotalCount = total;
        assetsTotalPages = Math.ceil(total / limit);
      } else if (gotFullPage) {
        // Got full page, assume there's more
        assetsTotalCount = offset + pageImages.length + limit; // Estimate
        assetsTotalPages = page + 1; // At least one more page
      } else {
        // Got partial page, this is the last page
        assetsTotalCount = offset + pageImages.length;
        assetsTotalPages = page;
      }

      debugLog('Loaded assets page:', {
        page,
        pageCount: pageImages.length,
        totalCount: assetsTotalCount,
        totalPages: assetsTotalPages,
      });

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

    // Note: Credit sync for both old and new accounts is handled in background.js
    // via ensureAccountSessionHealth() which calls sync-credits endpoint

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
        storage.state.currentSessionAccountId = account.id;
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

  // ===== Account Menu =====

  function showAccountMenu(btn, onSelect) {
    closeMenus();

    // Trigger batch sync for all pixverse accounts (backend handles TTL + exhausted skip)
    // Fire-and-forget - accounts will refresh in background
    sendMessageWithTimeout({
      action: 'batchSyncCredits',
      providerId: 'pixverse'
    }, 15000).then(res => {
      if (res?.success && res.data?.synced > 0) {
        // Reload accounts to get updated credits and refresh UI
        loadAccounts().then(() => {
          updateAllAccountButtons();
        });
      }
    }).catch(() => {});

    // Prefetch ad status for all accounts in dropdown (uses default limit of 20)
    prefetchAdStatusForAccounts(accountsCache);

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
        border: 1px solid ${storage.state.accountSortBy === opt.id ? COLORS.accent : 'transparent'};
        border-radius: 3px; cursor: pointer; color: ${storage.state.accountSortBy === opt.id ? COLORS.accent : COLORS.textMuted};
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
          // No sync needed here - dropdown open already triggered batch sync
          // Just refresh ad status for display
          refreshAccountAdStatus(account.id);

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

  function createAccountMenuItem(account, { isCurrent, isSelected }) {
    const item = document.createElement('button');
    item.className = `${MENU_CLASS}__item ${MENU_CLASS}__account`;
    item.dataset.accountId = account.id; // For live updates
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

    // Ads pill - always create (may be populated later via live update)
    const adsPill = document.createElement('span');
    adsPill.className = `${MENU_CLASS}__account-ads`;
    adsPill.style.cssText = `
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(0,0,0,0.2);
      color: ${COLORS.textMuted};
    `;
    const cached = adStatusCache.get(account.id);
    if (cached?.data) {
      renderAdsPill(adsPill, cached.data);
    } else {
      // Show placeholder instead of hiding - will be updated when data arrives
      adsPill.textContent = 'Ads ?/?';
      adsPill.title = 'Loading ad status...';
      adsPill.style.color = COLORS.textMuted;
    }
    meta.appendChild(adsPill);

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
    if (!pillEl) return;

    const task = payload?.ad_watch_task;

    if (!task || typeof task !== 'object') {
      // Show 0/0 when no task data
      pillEl.textContent = 'Ads 0/0';
      pillEl.title = 'No ad watch task available';
      pillEl.style.fontSize = '10px';
      pillEl.style.color = '#9ca3af';
      return;
    }

    // Prefer completed_counts (most accurate), fallback to progress
    const rawProgress = task.completed_counts ?? task.progress ?? 0;
    const total = task.total_counts ?? 0;
    const progress = Math.min(rawProgress, total); // Cap at total

    // Build display
    pillEl.textContent = `Ads ${progress}/${total}`;
    pillEl.title = `Watch-ad task: ${progress}/${total}`;
    pillEl.style.fontSize = '10px';

    // Color: green if complete, normal gray otherwise
    if (progress >= total && total > 0) {
      pillEl.style.color = COLORS.success;
    } else {
      pillEl.style.color = '#6b7280';
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
      const truncated = name.length > 15 ? name.slice(0, 14) + '…' : name;
      const credits = account.total_credits || 0;

      // Get ads from cache
      const cached = adStatusCache.get(account.id);
      const adTask = cached?.data?.ad_watch_task;
      const adTotal = adTask?.total_counts || 0;
      // Prefer completed_counts, fallback to progress
      const rawProgress = adTask?.completed_counts ?? adTask?.progress ?? 0;
      const adProgress = Math.min(rawProgress, adTotal);
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

    // Lock to prevent concurrent wheel events from racing
    let wheelProcessing = false;

    // Shared wheel handler for cycling through accounts (works on any button in the group)
    const handleAccountWheel = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Prevent concurrent wheel events from interfering with each other
      if (wheelProcessing) return;
      wheelProcessing = true;

      try {
        // Reload from storage first (in case it changed externally)
        await Promise.all([
          loadCurrentSessionAccount(),
          loadSelectedAccount()
        ]);

        // Load accounts if not loaded
        if (accountsCache.length === 0) {
          await loadAccounts();
        }

        if (accountsCache.length === 0) return;

        // Sync caches to ensure storage.state has current account data
        syncModuleCaches();

        // Build sorted account list matching the menu order:
        // 1. Session account at top (if exists and in cache)
        // 2. Other accounts sorted by user preference
        const sessionId = storage.state.currentSessionAccountId;
        const sessionAccount = sessionId ? accountsCache.find(a => a.id === sessionId) : null;
        const otherAccounts = sessionAccount
          ? accountsCache.filter(a => a.id !== sessionId)
          : accountsCache;
        const sortedOthers = getSortedAccounts(otherAccounts);
        const sortedAccounts = sessionAccount
          ? [sessionAccount, ...sortedOthers]
          : sortedOthers;

        if (sortedAccounts.length === 0) return;

        // Find current account index
        // Priority: selected account > session account > first account
        const selectedId = storage.state.selectedAccountId;
        let currentIndex = -1;

        if (selectedId) {
          currentIndex = sortedAccounts.findIndex(a => a.id === selectedId);
          if (currentIndex === -1) {
            console.warn('[PixSim7] Wheel: selectedId not found in sorted list:', selectedId, 'list has:', sortedAccounts.map(a => a.id));
          }
        }
        if (currentIndex === -1 && sessionId) {
          currentIndex = sortedAccounts.findIndex(a => a.id === sessionId);
        }
        if (currentIndex === -1) {
          currentIndex = 0;
          console.warn('[PixSim7] Wheel: falling back to index 0');
        }

        // Scroll up = previous, scroll down = next
        let newIndex;
        if (e.deltaY < 0) {
          // Scroll up - go to previous account
          newIndex = currentIndex - 1;
          if (newIndex < 0) newIndex = sortedAccounts.length - 1; // wrap to last
        } else {
          // Scroll down - go to next account
          newIndex = currentIndex + 1;
          if (newIndex >= sortedAccounts.length) newIndex = 0; // wrap to first
        }

        // Select the new account
        const newAccount = sortedAccounts[newIndex];
        if (newAccount) {
          await saveSelectedAccount(newAccount.id);
          updateAccountButton(accountBtn);
        }
      } finally {
        wheelProcessing = false;
      }
    };

    accountBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (accountsCache.length === 0) {
        const orig = accountBtn.innerHTML;
        accountBtn.innerHTML = '<span class="name">...</span>';
        await loadAccounts();
        syncModuleCaches();
        updateAccountButton(accountBtn);
      }

      showAccountMenu(accountBtn, () => updateAccountButton(accountBtn));
    });

    // Mouse wheel scroll to cycle through accounts
    accountBtn.addEventListener('wheel', handleAccountWheel);

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

    loginBtn.addEventListener('wheel', handleAccountWheel);

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
        // Use saved page/search from image picker if available
        const savedPage = imagePicker.getSavedPage?.() || 1;
        const savedSearch = imagePicker.getSavedSearch?.() || '';
        await loadAssets({ page: savedPage, q: savedSearch || undefined });
        assetsBtn.classList.remove('loading');
        assetsBtn.textContent = origText;
      }

      // Always sync caches before opening picker to ensure counts are up to date
      syncModuleCaches();

      // Show unified picker - default to Assets tab, but Recent if there are recent images
      const recentImages = imagePicker.getRecentImages();
      const defaultTab = recentImages.length > 0 ? 'page' : 'assets';

      // Pass loadAssets wrapper that syncs after loading
      // New signature: loadAssets({ page, q, forceRefresh })
      const loadAssetsWrapper = async (options = {}) => {
        await loadAssets(options);
        syncModuleCaches();
      };

      // Store the wrapper in the image picker module so it's available even when
      // the picker is opened from other sources (e.g., restore panel)
      imagePicker.setLoadAssetsFunction(loadAssetsWrapper);

      showUnifiedImagePicker(defaultTab, loadAssetsWrapper);
    });

    assetsBtn.addEventListener('wheel', handleAccountWheel);

    // Double-click to reset picker position
    assetsBtn.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      imagePicker.resetPosition();
      showToast('Picker position reset', true);
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

    runBtn.addEventListener('wheel', handleAccountWheel);

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

    presetArrow.addEventListener('wheel', handleAccountWheel);

    // Also add wheel handler to the group container itself
    group.addEventListener('wheel', handleAccountWheel);

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

    // Create and store loadAssets wrapper early so it's available for image picker
    // even if opened via restore panel before Assets button is clicked
    // New signature: loadAssets({ page, q, forceRefresh })
    const loadAssetsWrapper = async (options = {}) => {
      await loadAssets(options);
      syncModuleCaches();
    };
    imagePicker.setLoadAssetsFunction(loadAssetsWrapper);

    // Load data in background (don't block)
    // Use saved page/search/filters from image picker for assets
    const savedPage = imagePicker.getSavedPage?.() || 1;
    const savedSearch = imagePicker.getSavedSearch?.() || '';
    const savedFilters = imagePicker.getSavedFilters?.() || {};
    Promise.all([
      loadPresets(),
      loadAccounts(),
      loadAssets({
        page: savedPage,
        q: savedSearch || undefined,
        ...savedFilters
      })
    ]).then(() => {
      syncModuleCaches();
      updateAllAccountButtons();
      updateAllRunButtons();
    }).catch(e => {
      console.warn('[PixSim7] init: failed to load some data:', e);
    });

    // Restore any saved input state after a delay (wait for page to fully render)
    // This handles page refresh restore (sessionStorage-based)
    // Skip if there's chrome.storage pending state (account switch takes precedence)
    setTimeout(async () => {
      try {
        // Check if there's pending chrome.storage state - if so, let that flow handle it
        const stored = await chrome.storage.local.get('pixsim7PendingPageState');
        if (stored.pixsim7PendingPageState) {
          debugLog('Skipping sessionStorage restore - chrome.storage pending state exists');
          return;
        }
        await restoreInputState({ autoRestoreImages: true });
      } catch (e) {
        console.warn('[PixSim7] restoreInputState error:', e);
      }
    }, 1200); // Run before chrome.storage restore (1500ms)

    // Also check for pending page state from account switch (chrome.storage)
    setTimeout(async () => {
      try {
        let pendingState = await storage.loadAndClearPendingPageState();

        // Fallback: check direct storage key if module didn't find it
        // Use same key as storage module: 'pixsim7PendingPageState'
        if (!pendingState) {
          const stored = await chrome.storage.local.get('pixsim7PendingPageState');
          if (stored.pixsim7PendingPageState) {
            const age = Date.now() - (stored.pixsim7PendingPageState.savedAt || 0);
            if (age < 120000) { // 2 minute expiry
              pendingState = stored.pixsim7PendingPageState;
              debugLog('Found pending state via fallback key');
            }
            await chrome.storage.local.remove('pixsim7PendingPageState');
          }
        }

        if (pendingState) {
          debugLog('Found pending page state to restore:', pendingState);

          // === STEP 1: Restore model first (may affect available options) ===
          if (pendingState.selectedModel) {
            const restoreModel = async (retries = 3) => {
              const modelImg = document.querySelector('img[src*="asset/media/model/model-"]');
              const modelContainer = modelImg?.closest('div.cursor-pointer');

              if (!modelContainer) {
                if (retries > 0) setTimeout(() => restoreModel(retries - 1), 500);
                return;
              }

              const currentModelSpan = modelContainer.querySelector('span.font-semibold, span[class*="font-semibold"]');
              if (currentModelSpan?.textContent?.trim() === pendingState.selectedModel) {
                debugLog(' Model already correct:', pendingState.selectedModel);
                return;
              }

              debugLog(' Opening model selector to restore:', pendingState.selectedModel);
              modelContainer.click();
              await new Promise(r => setTimeout(r, 400));

              // Find model options in dropdown (larger images w-16 vs w-11 in selector)
              const modelOptions = document.querySelectorAll('img[src*="asset/media/model/model-"]');
              debugLog(' Found', modelOptions.length, 'model images in dropdown');

              for (const optionImg of modelOptions) {
                // Skip the small image in the selector itself (w-11)
                if (optionImg.className.includes('w-11')) continue;

                // Find the clickable parent - traverse up to find element with cursor-pointer
                let clickTarget = optionImg.parentElement;
                while (clickTarget && !clickTarget.className?.includes('cursor-pointer')) {
                  clickTarget = clickTarget.parentElement;
                  if (clickTarget === document.body) {
                    clickTarget = null;
                    break;
                  }
                }

                // Find model name - could be sibling span or inside parent
                const optionName = clickTarget?.querySelector('span.font-semibold, span[class*="font-semibold"]') ||
                                   clickTarget?.querySelector('span');
                const modelName = optionName?.textContent?.trim();

                debugLog(' Checking model option:', modelName);

                if (modelName === pendingState.selectedModel) {
                  debugLog(' Found and clicking model:', modelName);
                  clickTarget.click();
                  return;
                }
              }
              document.body.click(); // Close dropdown if not found
              console.warn('[PixSim7] Could not find model option:', pendingState.selectedModel);
            };
            await restoreModel();
            await new Promise(r => setTimeout(r, 300)); // Let model change settle
          }

          // === STEP 2: Restore aspect ratio ===
          if (pendingState.selectedAspectRatio) {
            const restoreAspectRatio = (retries = 3) => {
              const ratioButtons = document.querySelectorAll('div[class*="aspect-"][class*="cursor-pointer"]');
              for (const btn of ratioButtons) {
                const ratioText = btn.textContent?.trim();
                if (ratioText === pendingState.selectedAspectRatio) {
                  // Check if already selected
                  if (!btn.className.includes('bg-button-secondary-hover')) {
                    debugLog(' Clicking aspect ratio:', ratioText);
                    btn.click();
                  } else {
                    debugLog(' Aspect ratio already correct:', ratioText);
                  }
                  return true;
                }
              }
              if (retries > 0) {
                setTimeout(() => restoreAspectRatio(retries - 1), 500);
              } else {
                console.warn('[PixSim7] Could not find aspect ratio:', pendingState.selectedAspectRatio);
              }
              return false;
            };
            restoreAspectRatio();
            await new Promise(r => setTimeout(r, 200));
          }

          // === STEP 3: Restore prompts to textareas (with retry for slow-loading pages) ===
          if (pendingState.prompts && Object.keys(pendingState.prompts).length > 0) {
            let promptsRestored = false;

            const restorePrompts = () => {
              if (promptsRestored) return true; // Already done

              const textareas = document.querySelectorAll('textarea');
              if (textareas.length === 0) return false;

              let restored = 0;
              const promptKeys = Object.keys(pendingState.prompts);

              const usedKeys = new Set();

              textareas.forEach((el, i) => {
                // Skip if already has content (don't overwrite user input)
                if (el.value && el.value.trim()) return;

                const key = el.id || el.name || el.placeholder || `textarea_${i}`;

                // Try exact key match first
                if (pendingState.prompts[key] && !usedKeys.has(key)) {
                  el.value = pendingState.prompts[key];
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  usedKeys.add(key);
                  restored++;
                  return;
                }

                // Try position-based fallback (textarea_N)
                const posKey = `textarea_${i}`;
                if (pendingState.prompts[posKey] && !usedKeys.has(posKey)) {
                  el.value = pendingState.prompts[posKey];
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  usedKeys.add(posKey);
                  restored++;
                  return;
                }

                // Try partial placeholder match (first 30 chars)
                const elPlaceholder = (el.placeholder || '').substring(0, 30).toLowerCase();
                for (const savedKey of promptKeys) {
                  if (usedKeys.has(savedKey)) continue;
                  const savedKeyStart = savedKey.substring(0, 30).toLowerCase();
                  if (elPlaceholder && savedKeyStart === elPlaceholder) {
                    el.value = pendingState.prompts[savedKey];
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    usedKeys.add(savedKey);
                    restored++;
                    return;
                  }
                }

                // Try finding any long saved prompt (likely the main prompt)
                // if this textarea looks like a main prompt area (has placeholder with "describe")
                const isMainPromptArea = (el.placeholder || '').toLowerCase().includes('describe');
                if (isMainPromptArea) {
                  for (const savedKey of promptKeys) {
                    if (usedKeys.has(savedKey)) continue;
                    // Skip position-based keys, look for placeholder-based keys with substantial content
                    if (!savedKey.startsWith('textarea_') && pendingState.prompts[savedKey].length > 20) {
                      el.value = pendingState.prompts[savedKey];
                      el.dispatchEvent(new Event('input', { bubbles: true }));
                      usedKeys.add(savedKey);
                      restored++;
                      return;
                    }
                  }
                }
              });

              if (restored > 0) {
                debugLog(' Restored', restored, 'prompt(s)');
                promptsRestored = true;
              }
              return restored > 0;
            };

            // Try immediately, then retry after delays if needed
            if (!restorePrompts()) {
              setTimeout(() => {
                if (!restorePrompts()) {
                  setTimeout(restorePrompts, 1500);
                }
              }, 500);
            }
          }

          // === STEP 4 & 5: Restore images using shared restoreAllImages ===
          // (handles slot adding and sequential upload with completion waiting)
          if (pendingState.images && pendingState.images.length > 0) {
            const { restoreAllImages } = window.PXS7.uploadUtils || {};

            if (restoreAllImages) {
              debugLog(' Using restoreAllImages for', pendingState.images.length, 'images');
              const result = await restoreAllImages(pendingState.images);

              if (result.success > 0) {
                showToast(`Restored ${result.success} image(s)`, true);
              }

              // If some failed, show the picker panel with remaining images
              if (result.failed.length > 0) {
                debugLog(' Some images failed to auto-restore, showing picker:', result.failed);
                showImageRestorePanel(result.failed);
              }
            } else {
              console.warn('[PixSim7] restoreAllImages not available');
            }
          }
        }
      } catch (e) {
        console.warn('[PixSim7] Failed to restore pending page state:', e);
      }
    }, 1500);

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
        // Session changed - reload session ID and refresh accounts to stay in sync
        loadCurrentSessionAccount().then(async () => {
          // Refresh accounts in case the new session is a new account
          await loadAccounts();
          syncModuleCaches();
          updateAllAccountButtons();
        });
      }
    });

    debugLog(' Preset buttons ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }

})();

