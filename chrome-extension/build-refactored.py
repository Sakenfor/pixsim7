#!/usr/bin/env python3
"""Build refactored pixverse-preset-buttons.js from original file"""

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
with open('content/pixverse-preset-buttons.js', 'w', encoding='utf-8') as f:
    f.write(result)

print('SUCCESS: Refactored main file created!')
print(f'  Original: {len(lines)} lines')
print(f'  New: {len(output)} lines')
print(f'  Reduction: {round((1 - len(output)/len(lines)) * 100)}%')
