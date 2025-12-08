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
      const res = await sendMessageWithTimeout({
        action: 'getAccounts',
        providerId: 'pixverse'
      });
      if (res?.success && Array.isArray(res.data)) {
        accountsCache = res.data.filter(a =>
          a.status === 'active' || (a.total_credits && a.total_credits > 0)
        );
        // Sorting done at display time via getSortedAccounts()

        // Fetch ad status for selected account only (manual refresh for all via extension popup)
        fetchSelectedAccountStatus();

        return accountsCache;
      }
    } catch (e) {
      // Timeout or error - continue with empty cache
    }
    return [];
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

  async function loadAssets(forceRefresh = false, append = false) {
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

    // Ads pill - show from cache only
    const cached = adStatusCache.get(account.id);
    if (cached?.data) {
      const adsPill = document.createElement('span');
      adsPill.style.cssText = `
        font-size: 9px;
        padding: 1px 4px;
        border-radius: 3px;
        background: rgba(0,0,0,0.2);
        color: ${COLORS.textMuted};
      `;
      renderAdsPill(adsPill, cached.data);
      meta.appendChild(adsPill);
    }

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
    const task = payload?.ad_watch_task;
    if (task && typeof task === 'object') {
      const total = task.total_counts ?? 0;
      // Cap progress at total to avoid showing 3/2
      const progress = Math.min(task.progress ?? 0, total);
      pillEl.textContent = `Ads ${progress}/${total}`;
      pillEl.title = `Watch-ad task: ${progress}/${total}`;
      if (progress >= total && total > 0) {
        pillEl.style.color = COLORS.success;
      }
    } else {
      pillEl.textContent = 'Ads 0/0';
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
      const adProgress = Math.min(adTask?.progress || 0, adTotal);
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

    // Shared wheel handler for cycling through accounts (works on any button in the group)
    const handleAccountWheel = async (e) => {
      e.preventDefault();
      e.stopPropagation();

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
      const defaultTab = recentImages.length > 0 ? 'recent' : 'assets';

      // Pass loadAssets wrapper that syncs after loading
      const loadAssetsWrapper = async (forceRefresh = false, append = false) => {
        await loadAssets(forceRefresh, append);
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
    const loadAssetsWrapper = async (forceRefresh = false, append = false) => {
      await loadAssets(forceRefresh, append);
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
        const pendingState = await storage.loadAndClearPendingPageState();
        if (pendingState) {
          console.log('[PixSim7] Found pending page state to restore:', pendingState);

          // Restore prompts to textareas
          if (pendingState.prompts) {
            document.querySelectorAll('textarea').forEach((el, i) => {
              const key = el.id || el.name || el.placeholder || `textarea_${i}`;
              if (pendingState.prompts[key]) {
                el.value = pendingState.prompts[key];
                el.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('[PixSim7] Restored prompt:', key);
              }
            });
          }

          // Show image restore panel if there are images
          if (pendingState.images && pendingState.images.length > 0) {
            showImageRestorePanel(pendingState.images);
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

