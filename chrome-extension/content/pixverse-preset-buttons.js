/**
 * Pixverse Preset Buttons
 *
 * Injects "Run Preset" buttons next to task elements on Pixverse site.
 * Uses the currently logged-in account (from browser session) to execute presets.
 */

(function() {
  'use strict';

  console.log('[PixSim7 Preset Buttons] Script loaded on:', window.location.href);

  const STORAGE_KEY_PROVIDER_SESSIONS = 'pixsim7ProviderSessions';

  const BUTTON_CLASS = 'pixsim7-preset-btn';
  const MENU_CLASS = 'pixsim7-preset-menu';
  const PROCESSED_ATTR = 'data-pixsim7-preset-btn';

  // Selector for Pixverse task titles
  const TASK_SELECTOR = 'span.bg-task.bg-clip-text.text-transparent';

  const STYLE = `
    .${BUTTON_CLASS} {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: 8px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 500;
      color: #a78bfa;
      background: rgba(139, 92, 246, 0.15);
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
      vertical-align: middle;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .${BUTTON_CLASS}:hover {
      background: rgba(139, 92, 246, 0.25);
      border-color: rgba(139, 92, 246, 0.5);
      color: #c4b5fd;
    }
    .${BUTTON_CLASS}:active {
      transform: scale(0.97);
    }
    .${BUTTON_CLASS}.loading {
      opacity: 0.6;
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
      max-height: 300px;
      overflow-y: auto;
      box-shadow: 0 10px 40px rgba(0,0,0,0.4);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .${MENU_CLASS}-item {
      display: block;
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
  `;

  let styleInjected = false;
  let presetsCache = [];

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
    console.log('[PixSim7 Preset Buttons] Style injected');
  }

  /**
   * Get the currently logged-in account for Pixverse from stored session
   */
  async function getCurrentAccount() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY_PROVIDER_SESSIONS);
      const sessions = stored[STORAGE_KEY_PROVIDER_SESSIONS] || {};
      const pixverseSession = sessions['pixverse'];
      if (pixverseSession?.accountId) {
        return pixverseSession;
      }
    } catch (e) {
      console.warn('[PixSim7 Preset Buttons] Failed to get current account:', e);
    }
    return null;
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
        console.log('[PixSim7 Preset Buttons] Loaded', presetsCache.length, 'presets');
        return res.data;
      }
    } catch (e) {
      console.warn('[PixSim7 Preset Buttons] Failed to load presets:', e);
    }
    return [];
  }

  /**
   * Execute a preset for the current account
   */
  async function executePreset(presetId) {
    const account = await getCurrentAccount();
    if (!account?.accountId) {
      showToast('No logged-in account detected. Visit Pixverse while logged in.', false);
      return false;
    }

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'executePreset',
        presetId: presetId,
        accountId: account.accountId
      });

      if (res?.success) {
        showToast(`Preset queued for ${account.email || 'account'}`, true);
        return true;
      } else {
        showToast(res?.error || 'Failed to queue preset', false);
        return false;
      }
    } catch (e) {
      showToast(e.message || 'Error executing preset', false);
      return false;
    }
  }

  /**
   * Show toast notification
   */
  function showToast(message, success = true) {
    const existing = document.querySelector('.pixsim7-preset-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'pixsim7-preset-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483648;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      background: ${success ? '#065f46' : '#7f1d1d'};
      color: white;
      border: 1px solid ${success ? '#10b981' : '#ef4444'};
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  /**
   * Show preset selection menu
   */
  function showPresetMenu(button, presets) {
    // Remove any existing menu
    const existingMenu = document.querySelector(`.${MENU_CLASS}`);
    if (existingMenu) existingMenu.remove();

    const rect = button.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = MENU_CLASS;

    if (presets.length === 0) {
      const empty = document.createElement('div');
      empty.className = `${MENU_CLASS}-empty`;
      empty.textContent = 'No presets available';
      menu.appendChild(empty);
    } else {
      const header = document.createElement('div');
      header.className = `${MENU_CLASS}-header`;
      header.textContent = 'Select Preset';
      menu.appendChild(header);

      presets.forEach(preset => {
        const item = document.createElement('button');
        item.className = `${MENU_CLASS}-item`;
        item.textContent = preset.name || `Preset #${preset.id}`;
        item.title = preset.name || '';
        item.addEventListener('click', async () => {
          menu.remove();
          button.classList.add('loading');
          button.textContent = '...';
          await executePreset(preset.id);
          button.classList.remove('loading');
          button.innerHTML = '<span>▶</span> Run';
        });
        menu.appendChild(item);
      });
    }

    // Position menu below button
    let top = rect.bottom + 4;
    let left = rect.left;

    // Adjust if off-screen
    if (left + 200 > window.innerWidth) {
      left = window.innerWidth - 210;
    }
    if (top + 300 > window.innerHeight) {
      top = rect.top - 304;
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;

    document.body.appendChild(menu);

    // Close on outside click
    const closeHandler = (e) => {
      if (!menu.contains(e.target) && e.target !== button) {
        menu.remove();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  }

  /**
   * Create a preset button
   */
  function createPresetButton() {
    const btn = document.createElement('button');
    btn.className = BUTTON_CLASS;
    btn.innerHTML = '<span>▶</span> Run';
    btn.title = 'Run Preset with current account';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Check if we have an account
      const account = await getCurrentAccount();
      if (!account?.accountId) {
        showToast('No logged-in account detected. Login to Pixverse first.', false);
        return;
      }

      // Load presets if not cached
      if (presetsCache.length === 0) {
        btn.classList.add('loading');
        btn.textContent = '...';
        await loadPresets();
        btn.classList.remove('loading');
        btn.innerHTML = '<span>▶</span> Run';
      }

      // If only one preset, execute directly
      if (presetsCache.length === 1) {
        btn.classList.add('loading');
        btn.textContent = '...';
        await executePreset(presetsCache[0].id);
        btn.classList.remove('loading');
        btn.innerHTML = '<span>▶</span> Run';
      } else {
        // Show menu
        showPresetMenu(btn, presetsCache);
      }
    });

    return btn;
  }

  /**
   * Process task elements and add buttons
   */
  function processTaskElements() {
    const tasks = document.querySelectorAll(TASK_SELECTOR);
    console.log('[PixSim7 Preset Buttons] Found', tasks.length, 'task elements');

    tasks.forEach(task => {
      // Skip if already processed
      if (task.hasAttribute(PROCESSED_ATTR)) return;
      task.setAttribute(PROCESSED_ATTR, 'true');

      console.log('[PixSim7 Preset Buttons] Adding button to:', task.textContent);

      // Create and insert button
      const btn = createPresetButton();

      // Insert after the task element
      if (task.nextSibling) {
        task.parentNode.insertBefore(btn, task.nextSibling);
      } else {
        task.parentNode.appendChild(btn);
      }
    });
  }

  /**
   * Initialize
   */
  async function init() {
    console.log('[PixSim7 Preset Buttons] Initializing...');

    injectStyle();

    // Load presets early
    await loadPresets();

    // Initial scan
    processTaskElements();

    // Watch for dynamic content
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldProcess = true;
          break;
        }
      }
      if (shouldProcess) {
        // Debounce processing
        clearTimeout(observer._timeout);
        observer._timeout = setTimeout(processTaskElements, 200);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('[PixSim7 Preset Buttons] Initialization complete');
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Small delay to ensure page has rendered
    setTimeout(init, 500);
  }

})();
