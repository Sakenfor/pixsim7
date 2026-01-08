/**
 * PixSim7 Floatable Widget
 *
 * Injects a floating widget on PixSim7 frontend
 * Provides quick access to accounts without opening popup
 */

console.log('[PixSim7 Widget] Loaded on:', window.location.href);

// Inject extension ID into page so web frontend can communicate with it
window.PIXSIM7_EXTENSION_ID = chrome.runtime.id;
console.log('[PixSim7 Widget] Extension ID injected:', window.PIXSIM7_EXTENSION_ID);

// Initialize widget
initializeWidget();

function initializeWidget() {
  // Check if widget already exists
  if (document.getElementById('pixsim7-floating-widget')) {
    console.log('[PixSim7 Widget] Widget already exists');
    return;
  }

  // Create widget container
  const widget = document.createElement('div');
  widget.id = 'pixsim7-floating-widget';
  widget.innerHTML = `
    <div class="widget-minimize-icon" title="Expand PixSim7 Widget">
      ${WIDGET_EMOJI.TITLE}
    </div>
    <div class="widget-content">
      <div class="widget-header">
        <div class="widget-title">
          ${WIDGET_EMOJI.HEADER}
        </div>
        <div class="widget-controls">
          <button class="widget-btn" id="widget-refresh" title="Refresh accounts">
            ${WIDGET_EMOJI.REFRESH_BUTTON}
          </button>
          <button class="widget-btn" id="widget-minimize" title="Minimize">
            −
          </button>
        </div>
      </div>

      <div class="widget-status" id="widget-status">
        Loading accounts...
      </div>

      <!-- Provider Tabs -->
      <div class="widget-provider-tabs" id="widget-provider-tabs">
        <!-- Tabs will be dynamically added here -->
      </div>

      <div class="widget-accounts" id="widget-accounts">
        <!-- Accounts will be loaded here -->
      </div>

      <div class="widget-footer">
        PixSim7 Extension • Click header to drag
      </div>
    </div>
  `;

  document.body.appendChild(widget);

  // Make draggable
  makeDraggable(widget);

  // Add event listeners
  document.getElementById('widget-minimize').addEventListener('click', toggleMinimize);
  document.querySelector('.widget-minimize-icon').addEventListener('click', toggleMinimize);
  document.getElementById('widget-refresh').addEventListener('click', loadAccounts);

  // Load accounts
  loadAccounts();

  console.log('[PixSim7 Widget] Widget initialized');
}

function toggleMinimize() {
  const widget = document.getElementById('pixsim7-floating-widget');
  widget.classList.toggle('minimized');

  // Save state
  const isMinimized = widget.classList.contains('minimized');
  chrome.storage.local.set({ widgetMinimized: isMinimized });
}

function makeDraggable(widget) {
  const header = widget.querySelector('.widget-header');
  let isDragging = false;
  let currentX, currentY, initialX, initialY;

  header.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);

  function dragStart(e) {
    if (e.target.closest('.widget-btn')) return; // Don't drag when clicking buttons

    initialX = e.clientX - widget.offsetLeft;
    initialY = e.clientY - widget.offsetTop;
    isDragging = true;
    widget.classList.add('dragging');
  }

  function drag(e) {
    if (!isDragging) return;
    e.preventDefault();

    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;

    // Keep within viewport
    const maxX = window.innerWidth - widget.offsetWidth;
    const maxY = window.innerHeight - widget.offsetHeight;
    currentX = Math.max(0, Math.min(currentX, maxX));
    currentY = Math.max(0, Math.min(currentY, maxY));

    widget.style.left = currentX + 'px';
    widget.style.top = currentY + 'px';
    widget.style.right = 'auto';
    widget.style.bottom = 'auto';
  }

  function dragEnd() {
    if (isDragging) {
      isDragging = false;
      widget.classList.remove('dragging');

      // Save position
      chrome.storage.local.set({
        widgetPosition: {
          left: widget.style.left,
          top: widget.style.top
        }
      });
    }
  }

  // Restore saved position
  chrome.storage.local.get(['widgetPosition', 'widgetMinimized'], (result) => {
    if (result.widgetPosition) {
      widget.style.left = result.widgetPosition.left;
      widget.style.top = result.widgetPosition.top;
      widget.style.right = 'auto';
      widget.style.bottom = 'auto';
    }
    if (result.widgetMinimized) {
      widget.classList.add('minimized');
    }
  });
}

async function loadAccounts() {
  const statusDiv = document.getElementById('widget-status');
  const accountsDiv = document.getElementById('widget-accounts');
  const providerTabsDiv = document.getElementById('widget-provider-tabs');

  // Try to show cached data immediately (non-blocking)
  const cached = await chrome.storage.local.get(['cachedAccounts', 'cachedAccountsTime']);
  const cacheAge = cached.cachedAccountsTime ? Date.now() - cached.cachedAccountsTime : Infinity;
  const CACHE_MAX_AGE = 60000; // 1 minute

  if (cached.cachedAccounts && cacheAge < CACHE_MAX_AGE) {
    // Show cached data immediately
    const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (settings.pixsim7Token) {
      displayAccounts(cached.cachedAccounts, settings, statusDiv, accountsDiv, providerTabsDiv);
      statusDiv.textContent = `${cached.cachedAccounts.length} accounts (cached)`;
      statusDiv.className = 'widget-status success';
      // Refresh in background after 5 seconds
      setTimeout(() => fetchAndCacheAccounts(false), 5000);
      return;
    }
  }

  statusDiv.textContent = 'Loading...';
  statusDiv.className = 'widget-status loading';
  accountsDiv.innerHTML = '';
  providerTabsDiv.innerHTML = '';

  await fetchAndCacheAccounts(true);
}

async function fetchAndCacheAccounts(updateUI = true) {
  const statusDiv = document.getElementById('widget-status');
  const accountsDiv = document.getElementById('widget-accounts');
  const providerTabsDiv = document.getElementById('widget-provider-tabs');

  try {
    // Get settings from extension storage
    const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });

    if (!settings.pixsim7Token) {
      statusDiv.textContent = EMOJI_STATES.NOT_LOGGED_IN;
      statusDiv.className = 'widget-status error';
      accountsDiv.innerHTML = `
        <div style="text-align: center; padding: 20px; opacity: 0.7;">
          <div style="font-size: 14px; margin-bottom: 8px;">
            Please login to PixSim7 first
          </div>
          <div style="font-size: 12px;">
            Click the extension icon to login
          </div>
        </div>
      `;
      return;
    }

    // Fetch all accounts from backend (not filtered by provider)
    const response = await chrome.runtime.sendMessage({
      action: 'getAccounts',
      providerId: null, // Get all providers
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to load accounts');
    }

    const accounts = response.data;

    // Cache the accounts
    await chrome.storage.local.set({
      cachedAccounts: accounts,
      cachedAccountsTime: Date.now()
    });

    if (updateUI) {
      displayAccounts(accounts, settings, statusDiv, accountsDiv, providerTabsDiv);
      statusDiv.textContent = `${accounts.length} accounts loaded`;
      statusDiv.className = 'widget-status success';
    }

  } catch (error) {
    console.error('[PixSim7 Widget] Error loading accounts:', error);
    if (updateUI) {
      statusDiv.textContent = EMOJI_STATES.ERROR(error.message);
      statusDiv.className = 'widget-status error';
    }
  }
}

function displayAccounts(accounts, settings, statusDiv, accountsDiv, providerTabsDiv) {
  accountsDiv.innerHTML = '';
  providerTabsDiv.innerHTML = '';

  if (accounts.length === 0) {
    accountsDiv.innerHTML = `
      <div style="text-align: center; padding: 20px; opacity: 0.7;">
        No accounts found
      </div>
    `;
    return;
  }

  // Group accounts by provider
  const accountsByProvider = {};
  accounts.forEach(account => {
    if (!accountsByProvider[account.provider_id]) {
      accountsByProvider[account.provider_id] = [];
    }
    accountsByProvider[account.provider_id].push(account);
  });

  // Create provider tabs
  const providers = Object.keys(accountsByProvider);
  if (providers.length > 1) {
    providerTabsDiv.innerHTML = providers.map(providerId => `
      <button class="provider-tab ${providerId === providers[0] ? 'active' : ''}"
              data-provider="${providerId}">
        ${providerId.charAt(0).toUpperCase() + providerId.slice(1)}
      </button>
    `).join('');

    // Add tab click handlers
    providerTabsDiv.querySelectorAll('.provider-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        providerTabsDiv.querySelectorAll('.provider-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        displayAccountsForProvider(accountsByProvider[tab.dataset.provider], settings);
      });
    });
  }

  // Display accounts for first provider
  displayAccountsForProvider(accountsByProvider[providers[0]], settings);
}

function displayAccountsForProvider(accounts, settings) {
  const accountsDiv = document.getElementById('widget-accounts');
  accountsDiv.innerHTML = '';

  accounts.forEach(account => {
    const accountDiv = document.createElement('div');
    accountDiv.className = 'widget-account';

    const statusClass = account.status === 'active' ? 'active' : 'exhausted';
    const statusEmoji = {
      'active': '🟢',
      'exhausted': '🔴',
      'error': PROVIDER_STATUS_EMOJI.error,
      'disabled': '⚫',
      'rate_limited': '🟡'
    }[account.status] || '⚪';

    // Format credits
    const creditsInfo = formatCredits(account.credits);

    accountDiv.innerHTML = `
      <div class="widget-account-email" title="${account.email}">
        ${account.email}
      </div>
      <div class="widget-account-info">
        <span class="widget-account-status ${statusClass}">
          ${statusEmoji} ${account.status}
        </span>
        <span>${creditsInfo}</span>
      </div>
      ${account.has_cookies || account.has_jwt
        ? `<button class="widget-account-btn" data-account-id="${account.id}">
             ${WIDGET_EMOJI.OPEN_IN_TAB}
           </button>`
        : `<div style="text-align: center; opacity: 0.5; font-size: 11px;">
             No credentials
           </div>`
      }
    `;

    accountsDiv.appendChild(accountDiv);
  });

  // Add event listeners to buttons
  document.querySelectorAll('.widget-account-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      // Use currentTarget instead of target to get the button element
      // (target could be the emoji text node inside the button)
      const accountId = e.currentTarget.dataset.accountId;
      await openAccountInTab(accountId, settings);
    });
  });
}

function formatCredits(credits) {
  if (!credits || Object.keys(credits).length === 0) {
    return '0 credits';
  }

  const total = Object.values(credits).reduce((sum, val) => sum + val, 0);
  return `${total} credits`;
}

async function openAccountInTab(accountId, settings) {
  const btn = document.querySelector(`[data-account-id="${accountId}"]`);
  const originalText = btn.textContent;

  try {
    btn.textContent = 'Opening...';
    btn.disabled = true;

    // Use the same loginWithAccount flow as the popup
    const response = await chrome.runtime.sendMessage({
      action: 'loginWithAccount',
      accountId: accountId
    });

    if (response && response.success) {
      btn.textContent = EMOJI_STATES.OPENED;
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 2000);
    } else {
      throw new Error(response?.error || 'Failed to open account');
    }

  } catch (error) {
    console.error('[PixSim7 Widget] Error opening account:', error);

    // Use custom dialog if available, fallback to alert
    if (window.PXS7?.dialogs?.showAlert) {
      window.PXS7.dialogs.showAlert(`Failed to open account:\n${error.message}`, {
        title: 'Error',
        icon: '❌'
      });
    } else {
      alert(`Failed to open account:\n${error.message}`);
    }

    btn.textContent = originalText;
    btn.disabled = false;
  }
}
