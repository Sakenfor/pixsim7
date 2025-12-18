# Panel Orchestration System - Integration Guide

Complete guide for integrating the declarative panel orchestration system into Control Center and Asset Viewer.

## 1. App Initialization

Initialize the panel system at app startup:

```typescript
// apps/main/src/App.tsx or apps/main/src/main.tsx

import { useInitializePanelSystem } from '@features/panels';

function App() {
  // Initialize panel system with user settings
  useInitializePanelSystem(true);

  return (
    <div className="app">
      {/* Your app content */}
    </div>
  );
}
```

Or with loading state:

```typescript
import { usePanelSystemInitialization } from '@features/panels';

function App() {
  const { initialized, initializing, error } = usePanelSystemInitialization();

  if (error) {
    return <ErrorScreen error={error} />;
  }

  if (initializing || !initialized) {
    return <LoadingScreen />;
  }

  return <YourApp />;
}
```

## 2. Control Center Integration

### Step 1: Add Panel Actions

```typescript
// apps/main/src/features/controlCenter/components/ControlCenterContainer.tsx

import { usePanel, usePanelIs } from '@features/panels';

export function ControlCenterContainer() {
  // Get panel state and actions
  const { state, open, close, toggle, retract, expand } = usePanel('controlCenter');
  const isRetracted = usePanelIs('controlCenter', 'retracted');

  // Open/close via panel manager instead of local state
  const handleOpen = () => open();
  const handleClose = () => close();

  return (
    <div
      className={styles.controlCenter}
      style={{
        width: isRetracted ? state?.retractedDimensions?.width : '320px',
        transition: `width ${state?.retractedDimensions ? '200ms' : '0ms'} ease-in-out`,
      }}
    >
      {isRetracted ? (
        <IconBar onExpand={expand} />
      ) : (
        <ControlCenterContent onRetract={retract} />
      )}
    </div>
  );
}
```

### Step 2: Add Retract Button

```typescript
function ControlCenterHeader() {
  const { retract, expand } = usePanel('controlCenter');
  const isRetracted = usePanelIs('controlCenter', 'retracted');

  return (
    <div className={styles.header}>
      <h2>Control Center</h2>
      <button onClick={isRetracted ? expand : retract}>
        {isRetracted ? '→' : '←'}
      </button>
    </div>
  );
}
```

### Step 3: Update QuickGenerateDockview Registration

```typescript
// Already done! Just ensure panelManagerId is passed:
<QuickGenerateDockview
  ref={dockviewRef}
  context={panelContext}
  showAssetPanel={showAssetPanelInLayout}
  onReady={handleDockviewReady}
  panelManagerId="controlCenter"  // ✅ Already integrated
/>
```

## 3. Asset Viewer Integration

### Step 1: Open/Close via Panel Manager

```typescript
// apps/main/src/features/assets/hooks/useAssetViewer.ts

import { usePanel } from '@features/panels';

export function useAssetViewer() {
  const { open, close } = usePanel('assetViewer');

  const openViewer = (assetId: number) => {
    // Open the asset viewer panel
    open();

    // ... rest of your logic to load asset
  };

  const closeViewer = () => {
    close();
    // ... cleanup logic
  };

  return {
    openViewer,
    closeViewer,
    // ... other methods
  };
}
```

### Step 2: Track Viewer State

```typescript
// In your viewer component
import { usePanelState, usePanelIs } from '@features/panels';

export function AssetViewerPanel() {
  const state = usePanelState('assetViewer');
  const isOpen = usePanelIs('assetViewer', 'open');

  // When viewer opens, Control Center will automatically retract
  // (based on interaction rules in CONTROL_CENTER_METADATA)

  if (!isOpen) return null;

  return (
    <div className={styles.assetViewer}>
      <AssetViewerDockview
        panelManagerId="assetViewer"  // Register with panel manager
        {...props}
      />
    </div>
  );
}
```

### Step 3: Update AssetViewerDockview Registration

```typescript
// apps/main/src/components/media/viewer/AssetViewerDockview.tsx

export function AssetViewerDockview({ ... }: AssetViewerDockviewProps) {
  return (
    <SmartDockview
      registry={viewerPanelRegistry}
      storageKey="asset-viewer-dockview-layout"
      context={context}
      defaultLayout={createDefaultLayout}
      minPanelsForTabs={2}
      className={className}
      panelManagerId="assetViewer"  // ✅ Add this
    />
  );
}
```

## 4. Gallery Integration

### Track Gallery State

```typescript
// apps/main/src/features/gallery/components/GalleryPanel.tsx

import { usePanel } from '@features/panels';

export function GalleryPanel() {
  const { state } = usePanel('gallery');

  // Gallery will automatically minimize when asset viewer opens
  // (based on interaction rules in GALLERY_METADATA)

  if (state?.mode === 'minimized') {
    return <MinimizedGalleryTab />;
  }

  return <FullGalleryView />;
}
```

## 5. Settings UI Integration

### Add Panel Settings to Settings Panel

```typescript
// apps/main/src/features/settings/components/SettingsPanel.tsx

import { PanelInteractionSettings } from './PanelInteractionSettings';
import { DynamicPanelSettings } from './DynamicPanelSettings';

export function SettingsPanel() {
  return (
    <div className={styles.settings}>
      <Tabs>
        <Tab title="General">
          <GeneralSettings />
        </Tab>

        {/* Add panel interaction settings */}
        <Tab title="Panel Interactions">
          <PanelInteractionSettings />
        </Tab>

        {/* Add dynamic panel settings */}
        <Tab title="Panel Settings">
          <DynamicPanelSettings />
        </Tab>

        <Tab title="Appearance">
          <AppearanceSettings />
        </Tab>
      </Tabs>
    </div>
  );
}
```

### Reload Panels When Settings Change

```typescript
import { reloadPanelsWithSettings } from '@features/panels';

function PanelInteractionSettings() {
  const { setInteractionOverride } = usePanelInteractionSettingsStore();

  const handleChange = async (panelId: string, targetId: string, action: PanelAction) => {
    // Update settings
    setInteractionOverride(panelId, targetId, { whenOpens: action });

    // Reload panels with new settings
    await reloadPanelsWithSettings();
  };

  // ... rest of component
}
```

## 6. Testing the Integration

### Test Interaction Rules

1. **Open Asset Viewer**:
   ```typescript
   const { open } = usePanel('assetViewer');
   open();
   ```
   - Control Center should automatically retract
   - Gallery should minimize to tab

2. **Close Asset Viewer**:
   ```typescript
   const { close } = usePanel('assetViewer');
   close();
   ```
   - Control Center should expand back
   - Gallery should restore

3. **Manual Retraction**:
   ```typescript
   const { retract, expand } = usePanel('controlCenter');
   retract(); // or expand();
   ```

### Verify Settings UI

1. Open Settings → Panel Interactions
2. Change "Control Center" behavior when "Asset Viewer" opens
3. Click save/apply
4. Open Asset Viewer and verify new behavior

### Debug in Console

```javascript
// View current panel state
window.__panelManager.getDebugInfo()

// Manually trigger actions
window.__panelManager.openPanel('assetViewer')
window.__panelManager.retractPanel('controlCenter')

// Check if settings are applied
window.__panelManager.getPanelMetadata('controlCenter')
```

## 7. Migration Checklist

- [ ] Initialize panel system in App.tsx
- [ ] Update Control Center to use `usePanel('controlCenter')`
- [ ] Add retract/expand buttons to Control Center
- [ ] Update Asset Viewer to use `usePanel('assetViewer')`
- [ ] Add `panelManagerId` to AssetViewerDockview
- [ ] Update Gallery to handle minimized state
- [ ] Add Panel Interaction Settings to settings UI
- [ ] Add Dynamic Panel Settings to settings UI
- [ ] Test all interaction rules
- [ ] Test settings changes
- [ ] Verify retraction animations
- [ ] Test with localStorage cleared (default layouts)

## 8. Customizing Panel Metadata

### Add New Panel

```typescript
// In panelMetadataRegistry.ts

export const MY_CUSTOM_PANEL: PanelMetadata = {
  id: 'myPanel',
  title: 'My Panel',
  type: 'zone-panel',
  defaultZone: 'right',
  priority: 50,

  retraction: {
    canRetract: true,
    retractedWidth: 40,
  },

  interactionRules: {
    whenOpens: {
      assetViewer: 'hide',
    },
    whenCloses: {
      assetViewer: 'show',
    },
  },
};

export const ALL_PANEL_METADATA = [
  // ... existing panels
  MY_CUSTOM_PANEL,
];
```

### Register at Runtime

```typescript
import { panelManager } from '@features/panels';

panelManager.registerPanel({
  id: 'dynamicPanel',
  title: 'Dynamic Panel',
  type: 'zone-panel',
  defaultZone: 'floating',
  priority: 100,
});
```

## Summary

The panel orchestration system provides:

✅ **Declarative Interactions**: Define rules once in metadata
✅ **User Customization**: Settings UI for user overrides
✅ **Dynamic Settings**: Automatically discover and display panel settings
✅ **Type-Safe**: Full TypeScript support
✅ **Testable**: Debug via console, clear separation of concerns
✅ **Persistent**: Remembers user preferences
✅ **Performant**: Lazy loading, efficient updates

All existing functionality is preserved while removing hardcoded conditional logic and adding powerful customization capabilities.
