/**
 * Pixverse Storage Module
 *
 * Handles localStorage operations for account/preset selection and sorting.
 */

window.PXS7 = window.PXS7 || {};

(function() {
  'use strict';

  // Storage keys
  const STORAGE_KEY_PROVIDER_SESSIONS = 'pixsim7ProviderSessions';
  const STORAGE_KEY_SELECTED_ACCOUNT = 'pixsim7SelectedPresetAccount';
  const STORAGE_KEY_SELECTED_PRESET = 'pixsim7SelectedPreset';
  const STORAGE_KEY_ACCOUNT_SORT = 'pixsim7AccountSort';

  // Storage state
  const state = {
    selectedAccountId: null,
    selectedPresetId: null,
    currentSessionAccountId: null,
    accountSortBy: 'credits', // 'credits', 'name', 'recent'
    presetsCache: [],
    accountsCache: [],
  };

  // ===== Account Selection =====

  async function loadSelectedAccount() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY_SELECTED_ACCOUNT);
      if (stored[STORAGE_KEY_SELECTED_ACCOUNT]) {
        state.selectedAccountId = stored[STORAGE_KEY_SELECTED_ACCOUNT];
      }
    } catch (e) {}
  }

  async function saveSelectedAccount(accountId) {
    try {
      state.selectedAccountId = accountId;
      await chrome.storage.local.set({ [STORAGE_KEY_SELECTED_ACCOUNT]: accountId });
    } catch (e) {}
  }

  // ===== Preset Selection =====

  async function loadSelectedPreset() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY_SELECTED_PRESET);
      if (stored[STORAGE_KEY_SELECTED_PRESET]) {
        state.selectedPresetId = stored[STORAGE_KEY_SELECTED_PRESET];
      }
    } catch (e) {}
  }

  async function saveSelectedPreset(presetId) {
    try {
      state.selectedPresetId = presetId;
      await chrome.storage.local.set({ [STORAGE_KEY_SELECTED_PRESET]: presetId });
    } catch (e) {}
  }

  function getCurrentPreset() {
    if (state.selectedPresetId && state.presetsCache.length > 0) {
      const preset = state.presetsCache.find(p => p.id === state.selectedPresetId);
      if (preset) return preset;
    }
    return state.presetsCache[0] || null;
  }

  // ===== Account Sorting =====

  async function loadAccountSort() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY_ACCOUNT_SORT);
      if (stored[STORAGE_KEY_ACCOUNT_SORT]) {
        state.accountSortBy = stored[STORAGE_KEY_ACCOUNT_SORT];
      }
    } catch (e) {}
  }

  async function saveAccountSort(sortBy) {
    state.accountSortBy = sortBy;
    try {
      await chrome.storage.local.set({ [STORAGE_KEY_ACCOUNT_SORT]: sortBy });
    } catch (e) {}
  }

  function getSortedAccounts(accounts) {
    const sorted = [...accounts];
    switch (state.accountSortBy) {
      case 'name':
        sorted.sort((a, b) => {
          const nameA = (a.nickname || a.email || '').toLowerCase();
          const nameB = (b.nickname || b.email || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
        break;
      case 'recent':
        sorted.sort((a, b) => {
          const timeA = a.last_used_at || a.updated_at || 0;
          const timeB = b.last_used_at || b.updated_at || 0;
          return new Date(timeB) - new Date(timeA);
        });
        break;
      case 'credits':
      default:
        sorted.sort((a, b) => (b.total_credits || 0) - (a.total_credits || 0));
        break;
    }
    return sorted;
  }

  // ===== Session Account =====

  async function loadCurrentSessionAccount() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY_PROVIDER_SESSIONS);
      const sessions = stored[STORAGE_KEY_PROVIDER_SESSIONS] || {};
      const pv = sessions['pixverse'];
      if (pv?.accountId) {
        state.currentSessionAccountId = pv.accountId;
      }
    } catch (e) {}
  }

  // ===== Account Helpers =====

  function getCurrentAccount() {
    if (state.selectedAccountId && state.accountsCache.length > 0) {
      const account = state.accountsCache.find(a => a.id === state.selectedAccountId);
      if (account) return account;
    }
    // Fallback: current session, then first account
    if (state.currentSessionAccountId && state.accountsCache.length > 0) {
      const account = state.accountsCache.find(a => a.id === state.currentSessionAccountId);
      if (account) return account;
    }
    return state.accountsCache[0] || null;
  }

  function getCurrentSessionAccount() {
    if (state.currentSessionAccountId && state.accountsCache.length > 0) {
      return state.accountsCache.find(a => a.id === state.currentSessionAccountId) || null;
    }
    return null;
  }

  // Export to global namespace
  window.PXS7.storage = {
    state,
    loadSelectedAccount,
    saveSelectedAccount,
    loadSelectedPreset,
    saveSelectedPreset,
    getCurrentPreset,
    loadAccountSort,
    saveAccountSort,
    getSortedAccounts,
    loadCurrentSessionAccount,
    getCurrentAccount,
    getCurrentSessionAccount,
  };

})();
