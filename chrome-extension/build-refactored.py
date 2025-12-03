#!/usr/bin/env python3
"""Build refactored pixverse-preset-buttons.js from original file

IMPORTANT: After building, the following fixes must be applied:
1. Add syncModuleCaches() call after loadAssets() in assets button click handler
2. Add syncModuleCaches() call in init's Promise.all().then() callback
3. Fix variable references: currentSessionAccountId, accountSortBy, recentSiteImages
4. Add mouse wheel scroll handler to account button (see current refactored version)

Note: Some features (like wheel scroll) are only in the refactored version.
"""

# Read original file
with open('content/pixverse-preset-buttons-original.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Header with module imports
header = '''/**
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
    setupUploadInterceptor, showUnifiedImagePicker
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
  let adStatusCache = new Map();

  // Sync caches with modules
  function syncModuleCaches() {
    storage.state.presetsCache = presetsCache;
    storage.state.accountsCache = accountsCache;
    imagePicker.setAssetsCache(assetsCache);
    imagePicker.setAssetsCounts(assetsLoadedCount, assetsTotalCount);
  }

  // ===== Data Loading =====

'''

# Sections to keep (line ranges, 0-indexed)
sections = [
    (1504, 1638),  # loadAccounts, loadPresets, loadAssets
    (1639, 1700),  # executePreset, loginWithAccount
    (1748, 1953),  # Account menu
    (1954, 1998),  # Preset menu (include closing brace)
    (1998, 2171),  # Button group
    (2172, 2276),  # DOM processing + init + IIFE closing
]

# Build output
output = [header]

for start, end in sections:
    output.extend(lines[start:end])
    output.append('\n')

# Write result
result = ''.join(output)

# Post-processing fixes for module integration
print('Applying post-processing fixes...')

# Fix 1: Add syncModuleCaches() after loadAssets() in assets button
result = result.replace(
    'await loadAssets();\n        assetsBtn.classList.remove',
    'await loadAssets();\n        syncModuleCaches();\n        assetsBtn.classList.remove'
)

# Fix 2: Add syncModuleCaches() in init's Promise.all().then()
result = result.replace(
    ']).then(() => {\n      updateAllAccountButtons();',
    ']).then(() => {\n      syncModuleCaches();\n      updateAllAccountButtons();'
)

# Fix 3: Fix variable references
result = result.replace('currentSessionAccountId = account.id;', 'storage.state.currentSessionAccountId = account.id;')
result = result.replace('${accountSortBy === opt.id', '${storage.state.accountSortBy === opt.id')
result = result.replace(
    'const defaultTab = recentSiteImages.length > 0',
    'const recentImages = imagePicker.getRecentImages();\n      const defaultTab = recentImages.length > 0'
)

# Fix 4: Remove duplicate adStatusCache declaration
result = result.replace('\n  // Cache for Pixverse ad status\n  const adStatusCache = new Map();\n\n  function createAccountMenuItem', '\n  function createAccountMenuItem')

with open('content/pixverse-preset-buttons.js', 'w', encoding='utf-8') as f:
    f.write(result)

print('Post-processing complete!')
print('SUCCESS: Refactored main file created!')
print(f'  Original: {len(lines)} lines')
print(f'  New: {len(output)} lines')
print(f'  Reduction: {round((1 - len(output)/len(lines)) * 100)}%')
