/**
 * Authentication Module
 */

import { login as apiLogin, getCurrentUser } from './api.js';
import { showToast } from './utils.js';

export let currentUser = null;

/**
 * Check if user is logged in
 */
export async function checkLogin() {
  const result = await chrome.storage.local.get(['pixsim7Token', 'currentUser']);

  if (!result.pixsim7Token) {
    showLogin();
    return null;
  }

  // Try to get user from cache or fetch from backend
  let user = result.currentUser;
  if (!user) {
    try {
      user = await getCurrentUser();
    } catch (error) {
      console.warn('[Popup Auth] Failed to fetch user:', error);
      showLogin();
      return null;
    }
  }

  currentUser = user;
  showLoggedIn();
  return user;
}

/**
 * Show login screen
 */
export function showLogin() {
  document.getElementById('loginSection').classList.remove('hidden');
  document.getElementById('mainContent').classList.add('hidden');
}

/**
 * Show logged in content
 */
export function showLoggedIn() {
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('mainContent').classList.remove('hidden');

  if (currentUser) {
    const userInfo = document.getElementById('userInfo');
    if (userInfo) {
      userInfo.textContent = currentUser.email || currentUser.username || 'User';
    }
  }
}

/**
 * Handle login
 */
export async function handleLogin() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const loginError = document.getElementById('loginError');

  if (!email || !password) {
    loginError.textContent = 'Please enter email and password';
    loginError.classList.remove('hidden');
    return;
  }

  loginError.classList.add('hidden');
  const loginBtn = document.getElementById('loginBtn');
  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in...';

  try {
    const data = await apiLogin(email, password);
    currentUser = data.user;
    showLoggedIn();
    showToast('success', 'Logged in successfully');

    // Load accounts after login
    const accountsModule = await import('./accounts.js');
    accountsModule.loadAccounts();
  } catch (error) {
    loginError.textContent = error.message;
    loginError.classList.remove('hidden');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
  }
}

/**
 * Handle logout
 */
export async function handleLogout() {
  await chrome.storage.local.remove(['pixsim7Token', 'currentUser']);
  currentUser = null;
  showLogin();
  showToast('info', 'Logged out');
}
