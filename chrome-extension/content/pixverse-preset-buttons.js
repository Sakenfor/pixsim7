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

  // ===== Module Imports =====
  const { BTN_GROUP_CLASS, BTN_CLASS, MENU_CLASS, COLORS, injectStyle } = window.PXS7.styles;
  const { showToast, closeMenus, positionMenu, setupOutsideClick, sendMessageWithTimeout } = window.PXS7.utils;
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
  let adStatusCache = new Map();

  // Sync caches with modules
  function syncModuleCaches() {
    storage.state.presetsCache = presetsCache;
    storage.state.accountsCache = accountsCache;
    imagePicker.setAssetsCache(assetsCache);
    imagePicker.setAssetsCounts(assetsLoadedCount, assetsTotalCount);
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

        console.log('[PixSim7] Loaded', accountsCache.length, 'accounts');
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

    // Skip if recently cached
    const cached = adStatusCache.get(selected.id);
    if (cached && (Date.now() - cached.time) < 60000) return;

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
  function prefetchAdStatusForAccounts(accounts, limit = 5) {
    // Only fetch for accounts without recent cache, limited to avoid overload
    const toFetch = accounts
      .filter(a => {
        const cached = adStatusCache.get(a.id);
        return !cached || (Date.now() - cached.time) > 60000;
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

  // Track current search query for pagination
  let assetsCurrentQuery = '';

  async function loadAssets(forceRefresh = false, append = false, options = {}) {
    const { q } = options;

    // If query changed, treat as fresh load
    const queryChanged = q !== undefined && q !== assetsCurrentQuery;
    if (queryChanged) {
      forceRefresh = true;
      append = false;
      assetsCurrentQuery = q || '';
    }

    if (assetsCache.length > 0 && !forceRefresh && !append) {
      return assetsCache;
    }
    try {
      const limit = 100;

      // Build request params - use cursor for pagination if appending
      const params = {
        action: 'getAssets',
        limit: limit
      };

      if (append && assetsNextCursor) {
        // Use cursor for next page
        params.cursor = assetsNextCursor;
      } else if (!append) {
        // Fresh load - start from beginning
        params.offset = 0;
      }

      // Include search query if set
      if (assetsCurrentQuery) {
        params.q = assetsCurrentQuery;
      }

      const res = await sendMessageWithTimeout(params);

      if (!res?.success) {
        return [];
      }

      console.log('[PixSim7] Raw backend response:', {
        success: res.success,
        dataType: Array.isArray(res.data) ? 'array' : typeof res.data,
        dataKeys: res.data && typeof res.data === 'object' ? Object.keys(res.data) : null,
        hasNextCursor: res.data?.next_cursor ? true : false
      });

      // Handle different response formats
      let items = res.data;
      let total = null;
      let nextCursor = null;

      if (items && !Array.isArray(items)) {
        total = items.total || items.count || items.totalCount || items.total_count || null;
        nextCursor = items.next_cursor || items.nextCursor || items.cursor || null;
        items = items.items || items.assets || items.data || items.results || [];
      }

      console.log('[PixSim7] Parsed response:', {
        itemsCount: items?.length,
        total,
        nextCursor: nextCursor ? 'exists' : 'null',
        isArray: Array.isArray(items)
      });

      if (!Array.isArray(items)) {
        return [];
      }

      // Filter to only images
      const newImages = items.filter(a => {
        if (a.media_type === 'image') return true;
        if (a.type === 'image') return true;
        const path = a.file_path || a.file_url || a.external_url || a.remote_url || a.url || '';
        if (path.match(/\.(jpg|jpeg|png|webp|gif)$/i)) return true;
        if (a.mime_type?.startsWith('image/')) return true;
        if (a.file_url || a.external_url || a.remote_url || a.thumbnail_url) return true;
        return false;
      });

      if (append) {
        assetsCache = [...assetsCache, ...newImages];
      } else {
        assetsCache = newImages;
      }

      // Store the next cursor for pagination (or clear if no more pages)
      assetsNextCursor = nextCursor || null;

      assetsLoadedCount = assetsCache.length;

      // For cursor-based pagination, we don't know the true total
      // Only hide "Load More" when we're CERTAIN there are no more items:
      // - We got fewer items than requested (limit), AND
      // - No next_cursor was returned
      // This prevents the button from disappearing prematurely
      const gotFullPage = newImages.length >= limit;
      const definitelyNoMore = !gotFullPage && !nextCursor;

      if (definitelyNoMore) {
        assetsTotalCount = assetsLoadedCount; // No more to load
      } else {
        assetsTotalCount = assetsLoadedCount + 1; // Signal there might be more
      }

      console.log('[PixSim7] Loaded assets:', {
        newCount: newImages.length,
        totalInCache: assetsCache.length,
        assetsLoadedCount,
        assetsTotalCount,
        hasNextCursor: !!assetsNextCursor,
        gotFullPage,
        definitelyNoMore,
        append
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

    // Prefetch ad status for accounts that will be shown in dropdown
    prefetchAdStatusForAccounts(accountsCache, 8);

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
      adsPill.style.display = 'none'; // Hide until data arrives
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
        // Reload session from storage first (in case it changed externally)
        await loadCurrentSessionAccount();

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
        }
        if (currentIndex === -1 && sessionId) {
          currentIndex = sortedAccounts.findIndex(a => a.id === sessionId);
        }
        if (currentIndex === -1) {
          currentIndex = 0;
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
        await loadAssets();
        assetsBtn.classList.remove('loading');
        assetsBtn.textContent = origText;
      }

      // Always sync caches before opening picker to ensure counts are up to date
      syncModuleCaches();

      // Show unified picker - default to Assets tab, but Recent if there are recent images
      const recentImages = imagePicker.getRecentImages();
      const defaultTab = recentImages.length > 0 ? 'page' : 'assets';

      // Pass loadAssets wrapper that syncs after loading
      const loadAssetsWrapper = async (forceRefresh = false, append = false, options = {}) => {
        await loadAssets(forceRefresh, append, options);
        syncModuleCaches();
      };

      // Store the wrapper in the image picker module so it's available even when
      // the picker is opened from other sources (e.g., restore panel)
      imagePicker.setLoadAssetsFunction(loadAssetsWrapper);

      showUnifiedImagePicker(defaultTab, loadAssetsWrapper);
    });

    assetsBtn.addEventListener('wheel', handleAccountWheel);

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
    const loadAssetsWrapper = async (forceRefresh = false, append = false, options = {}) => {
      await loadAssets(forceRefresh, append, options);
      syncModuleCaches();
    };
    imagePicker.setLoadAssetsFunction(loadAssetsWrapper);

    // Load data in background (don't block)
    Promise.all([
      loadPresets(),
      loadAccounts(),
      loadAssets()
    ]).then(() => {
      syncModuleCaches();
      updateAllAccountButtons();
      updateAllRunButtons();
    }).catch(e => {
      console.warn('[PixSim7] init: failed to load some data:', e);
    });

    // Restore any saved input state after a delay (wait for page to fully render)
    setTimeout(restoreInputState, 1000);

    // Also check for pending page state from account switch (chrome.storage)
    setTimeout(async () => {
      try {
        let pendingState = await storage.loadAndClearPendingPageState();

        // Fallback: check direct storage key if module didn't find it
        if (!pendingState) {
          const stored = await chrome.storage.local.get('pxs7_pendingPageState');
          if (stored.pxs7_pendingPageState) {
            const age = Date.now() - (stored.pxs7_pendingPageState.savedAt || 0);
            if (age < 120000) { // 2 minute expiry
              pendingState = stored.pxs7_pendingPageState;
              console.log('[PixSim7] Found pending state via fallback key');
            }
            await chrome.storage.local.remove('pxs7_pendingPageState');
          }
        }

        if (pendingState) {
          console.log('[PixSim7] Found pending page state to restore:', pendingState);

          // Restore prompts to textareas (with retry for slow-loading pages)
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
                console.log('[PixSim7] Restored', restored, 'prompt(s)');
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

          // Restore image slot count by clicking the + button
          if (pendingState.imageSlotCount && pendingState.imageSlotCount > 0) {
            const targetSlots = pendingState.imageSlotCount;
            const currentSlots = document.querySelectorAll('[id*="customer_img"] input[type="file"]').length;
            const slotsToAdd = targetSlots - currentSlots;

            if (slotsToAdd > 0) {
              console.log('[PixSim7] Restoring slot count:', currentSlots, '->', targetSlots);

              // Find the + button by its SVG path
              const plusPath = "M8 2v6m0 0v6m0-6h6M8 8H2";
              const plusSvg = document.querySelector(`svg path[d="${plusPath}"]`);
              const plusBtn = plusSvg?.closest('div[class*="opacity"]') || plusSvg?.parentElement?.parentElement;

              if (plusBtn) {
                for (let i = 0; i < slotsToAdd; i++) {
                  plusBtn.click();
                  await new Promise(r => setTimeout(r, 100)); // Small delay between clicks
                }
                console.log('[PixSim7] Added', slotsToAdd, 'image slot(s)');
                // Wait for DOM to update
                await new Promise(r => setTimeout(r, 300));
              } else {
                console.warn('[PixSim7] Could not find + button to restore slots');
              }
            }
          }

          // Auto-restore images to their original containers
          if (pendingState.images && pendingState.images.length > 0) {
            const { injectImageToUpload } = imagePicker;
            const uploadInputs = imagePicker.findUploadInputs ? imagePicker.findUploadInputs() : [];

            // Normalize images to array of {url, slot, containerId} objects (handle old format)
            const imagesToRestore = pendingState.images.map(img =>
              typeof img === 'string' ? { url: img, slot: -1, containerId: '' } : img
            );

            console.log('[PixSim7] Auto-restoring', imagesToRestore.length, 'images');
            console.log('[PixSim7] Available upload slots:', uploadInputs.map(u => ({
              containerId: u.containerId,
              hasImage: u.hasImage,
              priority: u.priority
            })));

            let restored = 0;
            let failed = [];

            for (const imgData of imagesToRestore) {
              const { url, slot, containerId } = imgData;
              let targetInput = null;
              let matchType = 'none';

              // Priority 1: Match by exact containerId (most reliable)
              if (containerId) {
                const exactMatch = uploadInputs.find(u =>
                  u.containerId === containerId && !u.hasImage
                );
                if (exactMatch) {
                  targetInput = exactMatch.input;
                  matchType = 'containerId';
                }
              }

              // Priority 2: Match by containerId prefix (e.g., "create_image-customer_img" matches any customer_img slot)
              if (!targetInput && containerId) {
                // Extract the base type (e.g., "customer_img" from "create_image-customer_img_paths")
                const baseType = containerId.replace(/^(create_image|image_text|transition|fusion)-/, '');
                const prefixMatch = uploadInputs.find(u =>
                  u.containerId?.includes(baseType) && !u.hasImage
                );
                if (prefixMatch) {
                  targetInput = prefixMatch.input;
                  matchType = 'prefix';
                }
              }

              // Priority 3: Fall back to slot index if on same page type
              if (!targetInput && slot >= 0 && slot < uploadInputs.length) {
                const slotMatch = uploadInputs[slot];
                if (slotMatch && !slotMatch.hasImage) {
                  // Only use slot if it's a high-priority (page-relevant) slot
                  if (slotMatch.priority >= 10) {
                    targetInput = slotMatch.input;
                    matchType = 'slot';
                  }
                }
              }

              // Priority 4: First empty high-priority slot
              if (!targetInput) {
                const emptySlot = uploadInputs.find(u => !u.hasImage && u.priority >= 10);
                if (emptySlot) {
                  targetInput = emptySlot.input;
                  matchType = 'firstEmpty';
                }
              }

              if (targetInput) {
                console.log(`[PixSim7] Restoring image to ${matchType} match:`, containerId || `slot ${slot}`);
                try {
                  const success = await injectImageToUpload(url, targetInput);
                  if (success) {
                    restored++;
                    // Mark slot as used
                    const slotInfo = uploadInputs.find(u => u.input === targetInput);
                    if (slotInfo) slotInfo.hasImage = true;
                  } else {
                    failed.push(url);
                  }
                } catch (e) {
                  console.warn('[PixSim7] Failed to restore image to slot:', e);
                  failed.push(url);
                }
                // Small delay for DOM stability (main waiting is done in injectImageToUpload)
                await new Promise(r => setTimeout(r, 200));
              } else {
                console.log('[PixSim7] No matching slot found for:', containerId || `slot ${slot}`);
                failed.push(url);
              }
            }

            if (restored > 0) {
              showToast(`Restored ${restored} image(s)`, true);
            }

            // If some failed, show the picker panel with remaining images
            if (failed.length > 0) {
              console.log('[PixSim7] Some images failed to auto-restore, showing picker:', failed);
              showImageRestorePanel(failed);
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

    console.log('[PixSim7] Preset buttons ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }

})();

