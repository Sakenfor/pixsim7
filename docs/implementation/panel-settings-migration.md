# Panel Settings Migration Guide

Complete guide for consolidating panel settings from UI tab to Panels tab.

## Problem

Panel-related settings were split across two places:
- **UI Tab**: Media Viewer and Control Center settings
- **Panels Tab**: Panel enable/disable and plugin management

With the new panel orchestration system, we need to consolidate everything under **Panels**.

## Solution

### New Unified Panels Tab Structure

```
Panels Tab
├── Panel Interactions      (NEW - declarative orchestration rules)
├── Panel Management        (EXISTING - enable/disable, plugins)
└── Panel Settings          (NEW - all panel-specific settings)
    ├── Asset Viewer
    ├── Control Center
    ├── Gallery
    └── [Other panels...]
```

## Migration Steps

### 1. Replace PanelsSettings.tsx

**Before** (`apps/main/src/features/settings/components/modules/PanelsSettings.tsx`):
```typescript
export function PanelsSettings() {
  return <PanelConfigurationPanel />;
}
```

**After** - Use UnifiedPanelsSettings:
```typescript
// Delete old PanelsSettings.tsx
// Use UnifiedPanelsSettings.tsx instead
```

Update the import in your settings index:
```typescript
// apps/main/src/features/settings/components/modules/index.ts

// Old
export { PanelsSettings } from './PanelsSettings';

// New
export { UnifiedPanelsSettings as PanelsSettings } from './UnifiedPanelsSettings';
```

### 2. Update UI Settings (Remove Panel Settings)

Edit `apps/main/src/features/settings/lib/schemas/ui.settings.tsx`:

**Option A: Delete panel-related settings entirely**
```typescript
// Remove mediaViewerTab
// Remove controlCenterTab
// Keep only general UI settings (if any)
```

**Option B: Keep UI tab for non-panel settings**
If you have other UI settings (theme, fonts, etc.), keep the UI tab but remove panel-specific tabs.

### 3. Register Panel Settings

Update `apps/main/src/features/settings/components/modules/UnifiedPanelsSettings.tsx`:

```typescript
import { registerPanelSettings } from '../../lib/schemas/panel.settings';

// Auto-register when module loads
registerPanelSettings();

export function UnifiedPanelsSettings() {
  // ... rest of component
}
```

### 4. Verify Registration Order

Make sure panels are registered in the correct order:

```typescript
// apps/main/src/features/settings/components/modules/index.ts

// Ensure panels come after general settings but before advanced
settingsRegistry.register({
  id: 'panels',
  label: 'Panels',
  icon: '🎨',
  component: UnifiedPanelsSettings,
  order: 16,  // Adjust as needed
});
```

## Final Structure

After migration, your Settings UI will have:

### Panels Tab (order: 16)
1. **Panel Interactions** sub-tab
   - Global automatic interactions toggle
   - Animation duration slider
   - Per-panel interaction rules
   - Example: "When Asset Viewer opens → Control Center retracts"

2. **Panel Management** sub-tab
   - List of all panels (Game2D, SceneGraph, Gallery, etc.)
   - Enable/disable panels
   - Plugin management
   - Panel metadata

3. **Panel Settings** sub-tab
   - Asset Viewer settings (auto-play, loop, metadata)
   - Control Center settings (dock position, layout behavior)
   - Gallery settings (if any)
   - Dynamically discovered panel settings

### UI Tab (order: 15) - Optional
Keep only if you have general UI settings:
- Theme (dark/light)
- Font sizes
- Accessibility options
- **NO** panel-specific settings

## Testing

### 1. Open Settings
```typescript
// Settings should show "Panels" tab
```

### 2. Verify Panel Interactions Tab
- [ ] Global settings visible (enable interactions, animation duration)
- [ ] Control Center → Asset Viewer rules shown
- [ ] Can change interaction rules
- [ ] Changes save and persist

### 3. Verify Panel Management Tab
- [ ] All panels listed
- [ ] Can enable/disable panels
- [ ] Plugin metadata shown
- [ ] Settings sections render (if available)

### 4. Verify Panel Settings Tab
- [ ] Asset Viewer settings shown (auto-play, loop, etc.)
- [ ] Control Center settings shown (dock position, etc.)
- [ ] All panels with settings auto-discovered
- [ ] Settings changes save properly

### 5. Verify UI Tab Cleanup
- [ ] Panel settings removed from UI tab (if keeping UI tab)
- [ ] Or UI tab removed entirely (if no other UI settings)

## Benefits

✅ **Single source of truth** - All panel settings in one place
✅ **Better organization** - Clear separation: interactions vs management vs settings
✅ **Auto-discovery** - New panels automatically appear in settings
✅ **User-friendly** - Clearer navigation with sub-tabs
✅ **Consistent** - All panel-related configuration in Panels tab

## Rollback

If you need to rollback:

1. Keep `ui.settings.tsx` unchanged
2. Use old `PanelsSettings.tsx` (just PanelConfigurationPanel)
3. Don't register `panel.settings.tsx`
4. Don't use `UnifiedPanelsSettings.tsx`

## Summary

**Before:**
- UI Tab: Media Viewer, Control Center settings
- Panels Tab: Enable/disable panels

**After:**
- Panels Tab (3 sub-tabs):
  1. Panel Interactions (orchestration rules)
  2. Panel Management (enable/disable)
  3. Panel Settings (all panel configs)
- UI Tab: Only general UI settings (optional)

This consolidation makes the settings more intuitive and leverages the new panel orchestration system!
