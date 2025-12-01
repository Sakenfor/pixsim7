/**
 * Pixverse Preset Buttons
 *
 * Injects account selector and "Run Preset" buttons next to task elements on Pixverse site.
 * Two separate dropdowns: [Account ▼] [▶ Run]
 */

(function() {
  'use strict';

  console.log('[PixSim7 Preset Buttons] Script loaded on:', window.location.href);

  const STORAGE_KEY_PROVIDER_SESSIONS = 'pixsim7ProviderSessions';
  const STORAGE_KEY_SELECTED_ACCOUNT = 'pixsim7SelectedPresetAccount';

  const BUTTON_CLASS = 'pixsim7-preset-btn';
  const ACCOUNT_BTN_CLASS = 'pixsim7-account-btn';
  const MENU_CLASS = 'pixsim7-preset-menu';
  const PROCESSED_ATTR = 'data-pixsim7-preset-btn';

  // Selector for Pixverse task titles
  const TASK_SELECTOR = 'span.bg-task.bg-clip-text.text-transparent';

  const STYLE = `
    .pixsim7-btn-group {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      margin-left: 6px;
      vertical-align: middle;
    }

    .${ACCOUNT_BTN_CLASS} {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 6px;
      font-size: 10px;
      font-weight: 500;
      color: #9ca3af;
      background: rgba(75, 85, 99, 0.3);
      border: 1px solid #4b5563;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .${ACCOUNT_BTN_CLASS}:hover {
      background: rgba(75, 85, 99, 0.5);
      color: #e5e7eb;
    }
    .${ACCOUNT_BTN_CLASS} .arrow {
      font-size: 8px;
      opacity: 0.7;
    }
    .${ACCOUNT_BTN_CLASS} .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .${ACCOUNT_BTN_CLASS} .status-dot.active { background: #10b981; }
    .${ACCOUNT_BTN_CLASS} .status-dot.exhausted { background: #ef4444; }
    .${ACCOUNT_BTN_CLASS} .status-dot.error { background: #f59e0b; }
    .${ACCOUNT_BTN_CLASS} .status-dot.disabled { background: #6b7280; }

    .${BUTTON_CLASS} {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 6px;
      font-size: 10px;
      font-weight: 500;
      color: #a78bfa;
      background: transparent;
      border: 1px solid #a78bfa;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
    }
    .${BUTTON_CLASS}:hover {
      background: rgba(167, 139, 250, 0.15);
      color: #c4b5fd;
    }
    .${BUTTON_CLASS}:active {
      opacity: 0.8;
    }
    .${BUTTON_CLASS}.loading {
      opacity: 0.5;
      pointer-events: none;
    }

    .${MENU_CLASS} {
      position: fixed;
      z-index: 2147483647;
      background: #1f2937;
      border: 1px solid #374151;
      border-radius: 8px;
      padding: 4px 0;
      min-width: 180px;
      max-width: 280px;
      max-height: 320px;
      overflow-y: auto;
      box-shadow: 0 10px 40px rgba(0,0,0,0.4);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .${MENU_CLASS}-item {
      display: flex;
      align-items: center;
      width: 100%;
      padding: 8px 12px;
      text-align: left;
      background: transparent;
      border: none;
      color: #e5e7eb;
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      gap: 8px;
    }
    .${MENU_CLASS}-item:hover {
      background: #374151;
    }
    .${MENU_CLASS}-divider {
      height: 1px;
      background: #374151;
      margin: 4px 0;
    }
    .${MENU_CLASS}-header {
      padding: 6px 12px;
      font-size: 10px;
      font-weight: 600;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .${MENU_CLASS}-empty {
      padding: 12px;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
    }

    /* Account menu items */
    .${MENU_CLASS}-account {
      display: flex;
      align-items: center;
      width: 100%;
      padding: 6px 12px;
      text-align: left;
      background: transparent;
      border: none;
      color: #e5e7eb;
      font-size: 11px;
      cursor: pointer;
      gap: 8px;
    }
    .${MENU_CLASS}-account:hover {
      background: #374151;
    }
    .${MENU_CLASS}-account.selected {
      background: rgba(167, 139, 250, 0.15);
    }
    .${MENU_CLASS}-account-check {
      width: 14px;
      font-size: 11px;
      color: #a78bfa;
      flex-shrink: 0;
    }
    .${MENU_CLASS}-account-status {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .${MENU_CLASS}-account-status.active { background: #10b981; }
    .${MENU_CLASS}-account-status.exhausted { background: #ef4444; }
    .${MENU_CLASS}-account-status.error { background: #f59e0b; }
    .${MENU_CLASS}-account-status.disabled { background: #6b7280; }
    .${MENU_CLASS}-account-info {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }
    .${MENU_CLASS}-account-email {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .${MENU_CLASS}-account-credits {
      flex-shrink: 0;
      font-size: 10px;
      color: #9ca3af;
      padding-left: 8px;
    }

    .${MENU_CLASS}-header-row {
      display: flex;
      align-items: center;
      padding: 6px 12px;
    }
    .${MENU_CLASS}-refresh {
      padding: 2px 6px;
      font-size: 10px;
      color: #9ca3af;
      background: transparent;
      border: 1px solid #374151;
      border-radius: 4px;
      cursor: pointer;
      margin-left: auto;
    }
    .${MENU_CLASS}-refresh:hover {
      background: #374151;
      color: #e5e7eb;
    }
  `;

  let styleInjected = false;
  let presetsCache = [];
  let accountsCache = [];
  let selectedAccountId = null;

  function injectStyle() {
    if (styleInjected) return;
    if (document.getElementById('pixsim7-preset-buttons-style')) {
      styleInjected = true;
      return;
    }
    const style = document.createElement('style');
    style.id = 'pixsim7-preset-buttons-style';
    style.textContent = STYLE;
    (document.head || document.documentElement).appendChild(style);
    styleInjected = true;
  }

  /**
   * Load selected account from storage
   */
  async function loadSelectedAccount() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY_SELECTED_ACCOUNT);
      if (stored[STORAGE_KEY_SELECTED_ACCOUNT]) {
        selectedAccountId = stored[STORAGE_KEY_SELECTED_ACCOUNT];
      }
    } catch (e) {
      console.warn('[PixSim7] Failed to load selected account:', e);
    }
  }

  /**
   * Save selected account to storage
   */
  async function saveSelectedAccount(accountId) {
    try {
      selectedAccountId = accountId;
      await chrome.storage.local.set({ [STORAGE_KEY_SELECTED_ACCOUNT]: accountId });
    } catch (e) {
      console.warn('[PixSim7] Failed to save selected account:', e);
    }
  }

  /**
   * Get the current account (selected or fallback)
   */
  function getCurrentAccount() {
    if (selectedAccountId && accountsCache.length > 0) {
      const account = accountsCache.find(a => a.id === selectedAccountId);
      if (account) return account;
    }
    // Fallback to first account
    return accountsCache[0] || null;
  }

  /**
   * Load Pixverse accounts from backend
   */
  async function loadAccounts() {
    try {
      const res = await chrome.runtime.sendMessage({
        action: 'getAccounts',
        providerId: 'pixverse'
      });
      if (res?.success && Array.isArray(res.data)) {
        accountsCache = res.data.filter(a =>
          a.status === 'active' || (a.total_credits && a.total_credits > 0)
        );
        accountsCache.sort((a, b) => (b.total_credits || 0) - (a.total_credits || 0));
        return accountsCache;
      }
    } catch (e) {
      console.warn('[PixSim7] Failed to load accounts:', e);
    }
    return [];
  }

  /**
   * Load presets from backend
   */
  async function loadPresets() {
    try {
      const res = await chrome.runtime.sendMessage({
        action: 'getPresets',
        providerId: 'pixverse'
      });
      if (res?.success && Array.isArray(res.data)) {
        presetsCache = res.data;
        return res.data;
      }
    } catch (e) {
      console.warn('[PixSim7] Failed to load presets:', e);
    }
    return [];
  }

  /**
   * Execute a preset
   */
  async function executePreset(presetId) {
    const account = getCurrentAccount();
    if (!account) {
      showToast('No account selected', false);
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
        showToast(res?.error || 'Failed to queue', false);
        return false;
      }
    } catch (e) {
      showToast(e.message || 'Error', false);
      return false;
    }
  }

  /**
   * Show toast
   */
  function showToast(message, success = true) {
    const existing = document.querySelector('.pixsim7-preset-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'pixsim7-preset-toast';
    toast.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 2147483648;
      padding: 10px 14px; border-radius: 6px; font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      background: ${success ? '#065f46' : '#7f1d1d'};
      color: white; border: 1px solid ${success ? '#10b981' : '#ef4444'};
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  /**
   * Close any open menu
   */
  function closeMenus() {
    document.querySelectorAll(`.${MENU_CLASS}`).forEach(m => m.remove());
  }

  /**
   * Show account selection menu
   */
  function showAccountMenu(btn, onSelect) {
    closeMenus();

    const menu = document.createElement('div');
    menu.className = MENU_CLASS;

    // Header with refresh
    const headerRow = document.createElement('div');
    headerRow.className = `${MENU_CLASS}-header-row`;
    const header = document.createElement('span');
    header.style.cssText = 'font-size: 10px; font-weight: 600; color: #9ca3af; text-transform: uppercase;';
    header.textContent = 'Select Account';
    headerRow.appendChild(header);

    const refreshBtn = document.createElement('button');
    refreshBtn.className = `${MENU_CLASS}-refresh`;
    refreshBtn.textContent = '↻';
    refreshBtn.title = 'Refresh';
    refreshBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      refreshBtn.textContent = '...';
      await loadAccounts();
      menu.remove();
      showAccountMenu(btn, onSelect);
    });
    headerRow.appendChild(refreshBtn);
    menu.appendChild(headerRow);

    if (accountsCache.length === 0) {
      const empty = document.createElement('div');
      empty.className = `${MENU_CLASS}-empty`;
      empty.textContent = 'No accounts';
      menu.appendChild(empty);
    } else {
      const currentId = selectedAccountId || accountsCache[0]?.id;

      accountsCache.forEach(account => {
        const item = document.createElement('button');
        item.className = `${MENU_CLASS}-account`;
        if (account.id === currentId) item.classList.add('selected');

        const check = document.createElement('span');
        check.className = `${MENU_CLASS}-account-check`;
        check.textContent = account.id === currentId ? '✓' : '';

        const status = document.createElement('div');
        status.className = `${MENU_CLASS}-account-status ${account.status || 'active'}`;

        const info = document.createElement('div');
        info.className = `${MENU_CLASS}-account-info`;
        const email = document.createElement('div');
        email.className = `${MENU_CLASS}-account-email`;
        email.textContent = account.nickname || account.email;
        email.title = account.email;
        info.appendChild(email);

        const credits = document.createElement('span');
        credits.className = `${MENU_CLASS}-account-credits`;
        credits.textContent = account.total_credits || 0;

        item.appendChild(check);
        item.appendChild(status);
        item.appendChild(info);
        item.appendChild(credits);

        item.addEventListener('click', async () => {
          await saveSelectedAccount(account.id);
          menu.remove();
          if (onSelect) onSelect(account);
        });

        menu.appendChild(item);
      });
    }

    // Position
    const rect = btn.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.left;
    if (left + 200 > window.innerWidth) left = window.innerWidth - 210;
    if (top + 300 > window.innerHeight) top = rect.top - 304;
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;

    document.body.appendChild(menu);

    const closeHandler = (e) => {
      if (!menu.contains(e.target) && e.target !== btn) {
        menu.remove();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  }

  /**
   * Show preset selection menu
   */
  function showPresetMenu(btn) {
    closeMenus();

    const menu = document.createElement('div');
    menu.className = MENU_CLASS;

    const header = document.createElement('div');
    header.className = `${MENU_CLASS}-header`;
    header.textContent = 'Run Preset';
    menu.appendChild(header);

    if (presetsCache.length === 0) {
      const empty = document.createElement('div');
      empty.className = `${MENU_CLASS}-empty`;
      empty.textContent = 'No presets';
      menu.appendChild(empty);
    } else {
      presetsCache.forEach(preset => {
        const item = document.createElement('button');
        item.className = `${MENU_CLASS}-item`;
        item.innerHTML = `<span style="opacity: 0.6;">▶</span> ${preset.name || `Preset #${preset.id}`}`;
        item.addEventListener('click', async () => {
          menu.remove();
          btn.classList.add('loading');
          btn.textContent = '...';
          await executePreset(preset.id);
          btn.classList.remove('loading');
          btn.innerHTML = '▶ Run';
        });
        menu.appendChild(item);
      });
    }

    const rect = btn.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.left;
    if (left + 180 > window.innerWidth) left = window.innerWidth - 190;
    if (top + 200 > window.innerHeight) top = rect.top - 204;
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;

    document.body.appendChild(menu);

    const closeHandler = (e) => {
      if (!menu.contains(e.target) && e.target !== btn) {
        menu.remove();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  }

  /**
   * Update account button display
   */
  function updateAccountButton(btn) {
    const account = getCurrentAccount();
    if (account) {
      const name = account.nickname || account.email?.split('@')[0] || 'Account';
      const truncated = name.length > 12 ? name.slice(0, 11) + '…' : name;
      btn.innerHTML = `
        <span class="status-dot ${account.status || 'active'}"></span>
        <span>${truncated}</span>
        <span class="arrow">▼</span>
      `;
      btn.title = `${account.email} (${account.total_credits || 0} credits)`;
    } else {
      btn.innerHTML = `<span>Account</span><span class="arrow">▼</span>`;
      btn.title = 'Select account';
    }
  }

  /**
   * Login with selected account (inject cookies and refresh page)
   */
  async function loginWithAccount() {
    const account = getCurrentAccount();
    if (!account) {
      showToast('Select an account first', false);
      return false;
    }

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'loginWithAccount',
        accountId: account.id,
        accountEmail: account.email
      });

      if (res?.success) {
        showToast(`Logged in as ${account.nickname || account.email}`, true);
        // Page will reload from background script
        return true;
      } else {
        showToast(res?.error || 'Login failed', false);
        return false;
      }
    } catch (e) {
      showToast(e.message || 'Login error', false);
      return false;
    }
  }

  /**
   * Create button group with account selector, login, and run button
   */
  function createButtonGroup() {
    const group = document.createElement('div');
    group.className = 'pixsim7-btn-group';

    // Account button
    const accountBtn = document.createElement('button');
    accountBtn.className = ACCOUNT_BTN_CLASS;
    updateAccountButton(accountBtn);

    accountBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (accountsCache.length === 0) {
        accountBtn.textContent = '...';
        await loadAccounts();
        updateAccountButton(accountBtn);
      }

      showAccountMenu(accountBtn, (account) => {
        updateAccountButton(accountBtn);
      });
    });

    // Login button
    const loginBtn = document.createElement('button');
    loginBtn.className = BUTTON_CLASS;
    loginBtn.style.cssText = 'color: #60a5fa; border-color: #60a5fa;';
    loginBtn.innerHTML = '↪ Login';
    loginBtn.title = 'Login with selected account';

    loginBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      loginBtn.classList.add('loading');
      loginBtn.textContent = '...';
      await loginWithAccount();
      loginBtn.classList.remove('loading');
      loginBtn.innerHTML = '↪ Login';
    });

    // Run button
    const runBtn = document.createElement('button');
    runBtn.className = BUTTON_CLASS;
    runBtn.innerHTML = '▶ Run';
    runBtn.title = 'Run Preset';

    runBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const account = getCurrentAccount();
      if (!account) {
        showToast('Select an account first', false);
        return;
      }

      if (presetsCache.length === 0) {
        runBtn.classList.add('loading');
        runBtn.textContent = '...';
        await loadPresets();
        runBtn.classList.remove('loading');
        runBtn.innerHTML = '▶ Run';
      }

      if (presetsCache.length === 1) {
        runBtn.classList.add('loading');
        runBtn.textContent = '...';
        await executePreset(presetsCache[0].id);
        runBtn.classList.remove('loading');
        runBtn.innerHTML = '▶ Run';
      } else {
        showPresetMenu(runBtn);
      }
    });

    group.appendChild(accountBtn);
    group.appendChild(loginBtn);
    group.appendChild(runBtn);

    return group;
  }

  /**
   * Process task elements
   */
  function processTaskElements() {
    const tasks = document.querySelectorAll(TASK_SELECTOR);

    tasks.forEach(task => {
      if (task.hasAttribute(PROCESSED_ATTR)) return;
      task.setAttribute(PROCESSED_ATTR, 'true');

      const group = createButtonGroup();

      if (task.nextSibling) {
        task.parentNode.insertBefore(group, task.nextSibling);
      } else {
        task.parentNode.appendChild(group);
      }
    });
  }

  /**
   * Initialize
   */
  async function init() {
    console.log('[PixSim7 Preset Buttons] Initializing...');

    injectStyle();
    await loadSelectedAccount();
    await Promise.all([loadPresets(), loadAccounts()]);

    processTaskElements();

    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldProcess = true;
          break;
        }
      }
      if (shouldProcess) {
        clearTimeout(observer._timeout);
        observer._timeout = setTimeout(processTaskElements, 200);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[PixSim7 Preset Buttons] Ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }

})();
