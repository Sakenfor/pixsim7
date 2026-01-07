/**
 * Authentication module
 *
 * Handles user login/logout and auth state management.
 */


async function checkLogin() {
  const result = await chrome.storage.local.get(['pixsim7Token', 'currentUser']);

  if (result.pixsim7Token && result.currentUser) {
    currentUser = result.currentUser;
    showLoggedIn();
  } else if (result.pixsim7Token && !result.currentUser) {
    // Token exists but user not cached (e.g., after extension restart)
    try {
      const me = await chrome.runtime.sendMessage({ action: 'getMe' });
      if (me && me.success) {
        currentUser = me.data;
        showLoggedIn();
      } else {
        showLogin();
      }
    } catch (e) {
      showLogin();
    }
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('loginSection').classList.remove('hidden');
  document.getElementById('loggedInSection').classList.add('hidden');
  document.getElementById('notLoggedInWarning').classList.remove('hidden');
}

function showLoggedIn() {
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('loggedInSection').classList.remove('hidden');
  document.getElementById('notLoggedInWarning').classList.add('hidden');
  document.getElementById('loggedInUser').textContent = currentUser.username;

  // Load accounts when switching to Accounts tab or on login
  if (document.getElementById('tab-accounts').classList.contains('active')) {
    loadAccounts();
  }

  // Update devices tab if it's active
  if (document.getElementById('tab-devices').classList.contains('active')) {
    updateDevicesTab();
  }
}

async function handleLogin() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) {
    showError('Please enter email and password');
    return;
  }

  const loginBtn = document.getElementById('loginBtn');
  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'login',
      email,
      password,
    });

    if (response.success) {
      currentUser = response.data.user;
      showLoggedIn();
    } else {
      showError(response.error || 'Login failed');
    }
  } catch (error) {
    showError(`Login error: ${error.message}`);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login to PixSim7';
  }
}

async function handleLogout() {
  await chrome.storage.local.remove(['pixsim7Token', 'currentUser']);
  currentUser = null;
  currentProvider = null;
  showLogin();

  // Update devices tab if it's active
  if (document.getElementById('tab-devices').classList.contains('active')) {
    updateDevicesTab();
  }
}

/**
 * Attempt to auto-relogin when backend comes back online.
 * If we have a stored token, try to use it to get user info.
 * If that fails (token expired), silently fail - user will need to manually log in.
 */
async function attemptAutoRelogin() {
  console.log('[Auth] Attempting auto-relogin...');

  const result = await chrome.storage.local.get(['pixsim7Token']);

  if (!result.pixsim7Token) {
    console.log('[Auth] No stored token, skipping auto-relogin');
    return;
  }

  try {
    // Try to get user info with existing token
    const me = await chrome.runtime.sendMessage({ action: 'getMe' });

    if (me && me.success && me.data) {
      currentUser = me.data;
      showLoggedIn();
      console.log('[Auth] Auto-relogin successful');
      showToast('success', 'Reconnected successfully');

      // Refresh data
      if (typeof detectProviderFromTab === 'function') {
        await detectProviderFromTab();
      }
      if (typeof loadAccounts === 'function') {
        await loadAccounts();
      }
    } else {
      console.log('[Auth] Auto-relogin failed - token may be expired');
      // Don't show error - user can manually log in if needed
    }
  } catch (error) {
    console.warn('[Auth] Auto-relogin error:', error);
    // Silently fail - user can manually log in
  }
}

// Export main functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { checkLogin, showLogin, showLoggedIn, handleLogin, handleLogout, attemptAutoRelogin };
}
