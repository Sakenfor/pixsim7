/**
 * Pixverse Preset Buttons
 *
 * Injects account selector, login, and run preset buttons on Pixverse site.
 * Layout: [● Account ▼] [↪ Login] [▶ Run]
 */

(function() {
  'use strict';

  const STORAGE_KEY_PROVIDER_SESSIONS = 'pixsim7ProviderSessions';
  const STORAGE_KEY_SELECTED_ACCOUNT = 'pixsim7SelectedPresetAccount';

  const BTN_GROUP_CLASS = 'pxs7-group';
  const BTN_CLASS = 'pxs7-btn';
  const MENU_CLASS = 'pxs7-menu';
  const PROCESSED_ATTR = 'data-pxs7';

  const TASK_SELECTOR = 'span.bg-task.bg-clip-text.text-transparent';

  // Unified dark theme colors
  const COLORS = {
    bg: '#1f2937',
    bgHover: '#374151',
    border: '#4b5563',
    text: '#e5e7eb',
    textMuted: '#9ca3af',
    accent: '#a78bfa',      // purple - primary
    accentAlt: '#60a5fa',   // blue - login
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
  };

  const STYLE = `
    /* Button Group */
    .${BTN_GROUP_CLASS} {
      display: inline-flex;
      align-items: center;
      margin-left: 8px;
      vertical-align: middle;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid ${COLORS.border};
      background: ${COLORS.bg};
    }

    /* Base Button */
    .${BTN_CLASS} {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 500;
      color: ${COLORS.textMuted};
      background: transparent;
      border: none;
      border-right: 1px solid ${COLORS.border};
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .${BTN_CLASS}:last-child {
      border-right: none;
    }
    .${BTN_CLASS}:hover {
      background: ${COLORS.bgHover};
      color: ${COLORS.text};
    }
    .${BTN_CLASS}:active {
      opacity: 0.8;
    }
    .${BTN_CLASS}.loading {
      opacity: 0.5;
      pointer-events: none;
    }

    /* Account Button */
    .${BTN_CLASS}--account {
      max-width: 130px;
      overflow: hidden;
    }
    .${BTN_CLASS}--account .name {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .${BTN_CLASS}--account .arrow {
      font-size: 8px;
      opacity: 0.6;
    }
    .${BTN_CLASS}--account .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .${BTN_CLASS}--account .dot.active { background: ${COLORS.success}; }
    .${BTN_CLASS}--account .dot.exhausted { background: ${COLORS.error}; }
    .${BTN_CLASS}--account .dot.error { background: ${COLORS.warning}; }
    .${BTN_CLASS}--account .dot.disabled { background: ${COLORS.textMuted}; }
    .${BTN_CLASS}--account.mismatch {
      background: rgba(251, 191, 36, 0.1);
    }
    .${BTN_CLASS}--account.mismatch .arrow {
      color: ${COLORS.warning};
    }

    /* Login Button */
    .${BTN_CLASS}--login {
      color: ${COLORS.accentAlt};
    }
    .${BTN_CLASS}--login:hover {
      background: rgba(96, 165, 250, 0.15);
    }

    /* Run Button */
    .${BTN_CLASS}--run {
      color: ${COLORS.accent};
    }
    .${BTN_CLASS}--run:hover {
      background: rgba(167, 139, 250, 0.15);
    }

    /* Dropdown Menu */
    .${MENU_CLASS} {
      position: fixed;
      z-index: 2147483647;
      background: ${COLORS.bg};
      border: 1px solid ${COLORS.border};
      border-radius: 8px;
      padding: 4px 0;
      min-width: 200px;
      max-width: 300px;
      max-height: 360px;
      overflow-y: auto;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    .${MENU_CLASS}__section {
      padding: 6px 10px 4px;
      font-size: 9px;
      font-weight: 600;
      color: ${COLORS.textMuted};
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .${MENU_CLASS}__section::after {
      content: '';
      flex: 1;
      height: 1px;
      background: ${COLORS.border};
    }

    .${MENU_CLASS}__item {
      display: flex;
      align-items: center;
      width: 100%;
      padding: 7px 10px;
      text-align: left;
      background: transparent;
      border: none;
      color: ${COLORS.text};
      font-size: 12px;
      cursor: pointer;
      gap: 8px;
    }
    .${MENU_CLASS}__item:hover {
      background: ${COLORS.bgHover};
    }

    .${MENU_CLASS}__account {
      padding: 6px 10px;
      font-size: 11px;
    }
    .${MENU_CLASS}__account.selected {
      background: rgba(167, 139, 250, 0.12);
    }
    .${MENU_CLASS}__account.current {
      background: rgba(16, 185, 129, 0.1);
    }
    .${MENU_CLASS}__account-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .${MENU_CLASS}__account-dot.active { background: ${COLORS.success}; }
    .${MENU_CLASS}__account-dot.exhausted { background: ${COLORS.error}; }
    .${MENU_CLASS}__account-dot.error { background: ${COLORS.warning}; }
    .${MENU_CLASS}__account-dot.disabled { background: ${COLORS.textMuted}; }
    .${MENU_CLASS}__account-info {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }
    .${MENU_CLASS}__account-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .${MENU_CLASS}__account-meta {
      font-size: 9px;
      color: ${COLORS.textMuted};
      margin-top: 1px;
    }
    .${MENU_CLASS}__account-badge {
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .${MENU_CLASS}__account-badge--current {
      background: rgba(16, 185, 129, 0.2);
      color: ${COLORS.success};
    }
    .${MENU_CLASS}__account-badge--selected {
      background: rgba(167, 139, 250, 0.2);
      color: ${COLORS.accent};
    }
    .${MENU_CLASS}__account-credits {
      font-size: 10px;
      color: ${COLORS.textMuted};
      flex-shrink: 0;
    }

    .${MENU_CLASS}__divider {
      height: 1px;
      background: ${COLORS.border};
      margin: 4px 0;
    }

    .${MENU_CLASS}__empty {
      padding: 12px;
      text-align: center;
      color: ${COLORS.textMuted};
      font-size: 11px;
    }

    .${MENU_CLASS}__refresh {
      padding: 2px 6px;
      font-size: 10px;
      color: ${COLORS.textMuted};
      background: transparent;
      border: 1px solid ${COLORS.border};
      border-radius: 4px;
      cursor: pointer;
      margin-left: auto;
    }
    .${MENU_CLASS}__refresh:hover {
      background: ${COLORS.bgHover};
      color: ${COLORS.text};
    }

    /* Toast */
    .pxs7-toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483648;
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      color: white;
    }
    .pxs7-toast--success {
      background: #065f46;
      border: 1px solid ${COLORS.success};
    }
    .pxs7-toast--error {
      background: #7f1d1d;
      border: 1px solid ${COLORS.error};
    }
  `;

  let styleInjected = false;
  let presetsCache = [];
  let accountsCache = [];
  let selectedAccountId = null;
  let currentSessionAccountId = null; // Account matching browser session

  function injectStyle() {
    if (styleInjected) return;
    const existing = document.getElementById('pxs7-style');
    if (existing) { styleInjected = true; return; }
    const style = document.createElement('style');
    style.id = 'pxs7-style';
    style.textContent = STYLE;
    (document.head || document.documentElement).appendChild(style);
    styleInjected = true;
  }

  // ===== Storage =====

  async function loadSelectedAccount() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY_SELECTED_ACCOUNT);
      if (stored[STORAGE_KEY_SELECTED_ACCOUNT]) {
        selectedAccountId = stored[STORAGE_KEY_SELECTED_ACCOUNT];
      }
    } catch (e) {}
  }

  async function saveSelectedAccount(accountId) {
    try {
      selectedAccountId = accountId;
      await chrome.storage.local.set({ [STORAGE_KEY_SELECTED_ACCOUNT]: accountId });
    } catch (e) {}
  }

  async function loadCurrentSessionAccount() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY_PROVIDER_SESSIONS);
      const sessions = stored[STORAGE_KEY_PROVIDER_SESSIONS] || {};
      const pv = sessions['pixverse'];
      if (pv?.accountId) {
        currentSessionAccountId = pv.accountId;
      }
    } catch (e) {}
  }

  // ===== Data Loading =====

  function getCurrentAccount() {
    if (selectedAccountId && accountsCache.length > 0) {
      const account = accountsCache.find(a => a.id === selectedAccountId);
      if (account) return account;
    }
    // Fallback: current session, then first account
    if (currentSessionAccountId && accountsCache.length > 0) {
      const account = accountsCache.find(a => a.id === currentSessionAccountId);
      if (account) return account;
    }
    return accountsCache[0] || null;
  }

  function getCurrentSessionAccount() {
    if (currentSessionAccountId && accountsCache.length > 0) {
      return accountsCache.find(a => a.id === currentSessionAccountId) || null;
    }
    return null;
  }

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
    } catch (e) {}
    return [];
  }

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
    } catch (e) {}
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

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'loginWithAccount',
        accountId: account.id,
        accountEmail: account.email
      });

      if (res?.success) {
        // Update current session locally
        currentSessionAccountId = account.id;
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

  // ===== UI Helpers =====

  function showToast(message, success = true) {
    document.querySelectorAll('.pxs7-toast').forEach(t => t.remove());
    const toast = document.createElement('div');
    toast.className = `pxs7-toast pxs7-toast--${success ? 'success' : 'error'}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  function closeMenus() {
    document.querySelectorAll(`.${MENU_CLASS}`).forEach(m => m.remove());
  }

  function positionMenu(menu, anchor) {
    const rect = anchor.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.left;

    // Adjust for viewport
    setTimeout(() => {
      const menuRect = menu.getBoundingClientRect();
      if (left + menuRect.width > window.innerWidth - 10) {
        left = window.innerWidth - menuRect.width - 10;
      }
      if (top + menuRect.height > window.innerHeight - 10) {
        top = rect.top - menuRect.height - 4;
      }
      menu.style.top = `${Math.max(10, top)}px`;
      menu.style.left = `${Math.max(10, left)}px`;
    }, 0);

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }

  function setupOutsideClick(menu, anchor) {
    const handler = (e) => {
      if (!menu.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) {
        menu.remove();
        document.removeEventListener('mousedown', handler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
  }

  // ===== Account Menu =====

  function showAccountMenu(btn, onSelect) {
    closeMenus();

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

    // All Accounts Section
    const sectionHeader = document.createElement('div');
    sectionHeader.className = `${MENU_CLASS}__section`;
    sectionHeader.innerHTML = `<span>All Accounts</span>`;

    const refreshBtn = document.createElement('button');
    refreshBtn.className = `${MENU_CLASS}__refresh`;
    refreshBtn.textContent = '↻';
    refreshBtn.title = 'Refresh';
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

    // Account list (excluding current if shown above)
    const otherAccounts = currentSession
      ? accountsCache.filter(a => a.id !== currentSession.id)
      : accountsCache;

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

    if (account.nickname) {
      const meta = document.createElement('div');
      meta.className = `${MENU_CLASS}__account-meta`;
      meta.textContent = account.email;
      info.appendChild(meta);
    }

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

  // ===== Preset Menu =====

  function showPresetMenu(btn) {
    closeMenus();

    const menu = document.createElement('div');
    menu.className = MENU_CLASS;

    const section = document.createElement('div');
    section.className = `${MENU_CLASS}__section`;
    section.textContent = 'Select Preset';
    menu.appendChild(section);

    if (presetsCache.length === 0) {
      const empty = document.createElement('div');
      empty.className = `${MENU_CLASS}__empty`;
      empty.textContent = 'No presets available';
      menu.appendChild(empty);
    } else {
      presetsCache.forEach(preset => {
        const item = document.createElement('button');
        item.className = `${MENU_CLASS}__item`;
        item.innerHTML = `<span style="opacity:0.5">▶</span> ${preset.name || `Preset #${preset.id}`}`;
        item.addEventListener('click', async () => {
          menu.remove();
          btn.classList.add('loading');
          btn.textContent = '...';
          await executePreset(preset.id);
          btn.classList.remove('loading');
          btn.textContent = '▶ Run';
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
      const truncated = name.length > 14 ? name.slice(0, 13) + '…' : name;
      btn.innerHTML = `
        <span class="dot ${account.status || 'active'}"></span>
        <span class="name">${truncated}</span>
        <span class="arrow">${isMismatch ? '⚠' : '▼'}</span>
      `;
      btn.title = isMismatch
        ? `Selected: ${account.email}\nBrowser: ${sessionAccount?.email || 'unknown'}\nClick Login to switch`
        : `${account.email} (${account.total_credits || 0} credits)`;
    } else {
      btn.innerHTML = `<span class="name">Account</span><span class="arrow">▼</span>`;
      btn.title = 'Select account';
    }
  }

  function createButtonGroup() {
    const group = document.createElement('div');
    group.className = BTN_GROUP_CLASS;

    // Account button
    const accountBtn = document.createElement('button');
    accountBtn.className = `${BTN_CLASS} ${BTN_CLASS}--account`;
    updateAccountButton(accountBtn);

    accountBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (accountsCache.length === 0) {
        const orig = accountBtn.innerHTML;
        accountBtn.innerHTML = '<span class="name">...</span>';
        await loadAccounts();
        updateAccountButton(accountBtn);
      }

      showAccountMenu(accountBtn, () => updateAccountButton(accountBtn));
    });

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

    // Run button
    const runBtn = document.createElement('button');
    runBtn.className = `${BTN_CLASS} ${BTN_CLASS}--run`;
    runBtn.textContent = '▶ Run';
    runBtn.title = 'Run preset';

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
        runBtn.textContent = '▶ Run';
      }

      if (presetsCache.length === 1) {
        runBtn.classList.add('loading');
        runBtn.textContent = '...';
        await executePreset(presetsCache[0].id);
        runBtn.classList.remove('loading');
        runBtn.textContent = '▶ Run';
      } else {
        showPresetMenu(runBtn);
      }
    });

    group.appendChild(accountBtn);
    group.appendChild(loginBtn);
    group.appendChild(runBtn);

    return { group, accountBtn };
  }

  // ===== DOM Processing =====

  const buttonRefs = [];

  function processTaskElements() {
    const tasks = document.querySelectorAll(TASK_SELECTOR);

    tasks.forEach(task => {
      if (task.hasAttribute(PROCESSED_ATTR)) return;
      task.setAttribute(PROCESSED_ATTR, 'true');

      const { group, accountBtn } = createButtonGroup();
      buttonRefs.push(accountBtn);

      if (task.nextSibling) {
        task.parentNode.insertBefore(group, task.nextSibling);
      } else {
        task.parentNode.appendChild(group);
      }
    });
  }

  // Update all account buttons when session changes
  function updateAllAccountButtons() {
    buttonRefs.forEach(btn => {
      if (btn.isConnected) updateAccountButton(btn);
    });
  }

  // ===== Init =====

  async function init() {
    injectStyle();

    await Promise.all([
      loadSelectedAccount(),
      loadCurrentSessionAccount()
    ]);

    await Promise.all([
      loadPresets(),
      loadAccounts()
    ]);

    processTaskElements();

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
        loadCurrentSessionAccount().then(updateAllAccountButtons);
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
