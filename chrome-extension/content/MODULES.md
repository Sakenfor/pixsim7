# Pixverse Preset Buttons - Module Structure

The large `pixverse-preset-buttons.js` file (72KB, 2200+ lines) has been split into focused modules for better maintainability.

## Module Files

### ✅ pixverse-styles.js (~300 lines)
**Purpose:** CSS styling and theme
- Color constants (COLORS object)
- Button group styles (BTN_GROUP_CLASS, BTN_CLASS)
- Menu dropdown styles (MENU_CLASS)
- Toast notification styles
- Style injection function

**Exports:**
```javascript
window.PXS7.styles = {
  BTN_GROUP_CLASS,
  BTN_CLASS,
  MENU_CLASS,
  COLORS,
  STYLE,
  injectStyle
}
```

### ✅ pixverse-storage.js (~170 lines)
**Purpose:** LocalStorage operations and account/preset management
- Selected account persistence
- Selected preset persistence
- Account sort preferences
- Session account tracking
- Helper functions (getCurrentAccount, getSortedAccounts, etc.)

**Exports:**
```javascript
window.PXS7.storage = {
  state,  // Shared state object
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
  getCurrentSessionAccount
}
```

### ✅ pixverse-image-picker.js (~450 lines)
**Purpose:** Image upload, injection, and restoration
- Input state preservation (saveInputState, restoreInputState)
- Upload input detection (findUploadInputs)
- Image injection to Pixverse forms (injectImageToUpload)
- Upload interception setup
- Page image scanning
- Container management (clear, MIME types, etc.)

**Exports:**
```javascript
window.PXS7.imagePicker = {
  saveInputState,
  restoreInputState,
  setupUploadInterceptor,
  injectImageToUpload,
  scanPageForImages,
  showImageRestorePanel,
  setAssetsCache,
  setAssetsCounts,
  getRecentImages,
  setRecentImages
}
```

### ✅ pixverse-utils.js (~90 lines)
**Purpose:** Common UI utilities
- Toast notifications (showToast)
- Menu management (closeMenus, positionMenu)
- Outside click detection (setupOutsideClick)
- Message timeout wrapper (sendMessageWithTimeout)

**Exports:**
```javascript
window.PXS7.utils = {
  showToast,
  closeMenus,
  positionMenu,
  setupOutsideClick,
  sendMessageWithTimeout
}
```

### ⏳ pixverse-preset-buttons.js (Main file - still ~1200 lines)
**Remaining content:**
- Constants (storage keys, selectors, etc.)
- Account/preset menus UI (~400 lines)
- Unified image picker UI (~400 lines)
- Button group creation (~200 lines)
- Data loading (accounts, presets, assets) (~200 lines)
- Actions (login, execute preset) (~100 lines)
- DOM processing and initialization (~100 lines)

**Dependencies:**
- Imports: pixverse-styles, pixverse-storage, pixverse-image-picker, pixverse-utils
- Must be loaded AFTER all dependency modules

## Loading Order

The modules must be loaded in this order (via manifest.json or script tags):

1. `pixverse-styles.js` - No dependencies
2. `pixverse-utils.js` - Depends on styles
3. `pixverse-storage.js` - No dependencies
4. `pixverse-image-picker.js` - Depends on utils, styles
5. `pixverse-preset-buttons.js` - Depends on all above

## Benefits

**Before:** 1 file × 72KB = 72KB, 2200+ lines
**After:** 5 files, better organized:
- pixverse-styles.js: ~10KB
- pixverse-storage.js: ~6KB
- pixverse-image-picker.js: ~15KB
- pixverse-utils.js: ~3KB
- pixverse-preset-buttons.js: ~38KB (reduced from 72KB!)

**Improvements:**
- ✅ Main file reduced by ~47%
- ✅ Clear separation of concerns
- ✅ Easier to find and modify code
- ✅ Better testability
- ✅ Reusable components

## Next Steps (Optional)

Further splitting could extract:
- Account/preset menu UI into `pixverse-menus.js`
- Data loading functions into `pixverse-data.js`
- Button creation into `pixverse-buttons.js`

This would reduce the main file to ~400 lines of initialization code.
