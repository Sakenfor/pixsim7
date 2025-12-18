# Dockview Context Menu Implementation Progress

**Last Updated:** 2025-12-18

## Overview
Building an extensible, registry-based context menu system for dockview and other clickable items (assets, nodes, etc.) across the application.

## Current Status: Phase 3 - Menu Actions (TODO)

### ✅ Phase 1: Core Infrastructure (COMPLETED)

**Files Created:**
1. ✅ `apps/main/src/lib/dockview/contextMenu/types.ts`
   - Generic context types: dockview, asset, node, canvas, custom
   - MenuActionContext with optional fields for different contexts
   - Multi-dockview support: `currentDockviewId`, `getDockviewApi(id)`
   - MenuAction interface
   - MenuItem interface

2. ✅ `apps/main/src/lib/dockview/contextMenu/ContextMenuRegistry.ts`
   - Extends BaseRegistry<MenuAction>
   - `getActionsForContext()` - filters by context type and visibility
   - `toMenuItems()` - converts to MenuItem format
   - Global singleton: `contextMenuRegistry`

3. ✅ `apps/main/src/lib/dockview/contextMenu/ContextMenuProvider.tsx`
   - **Global** React context for menu state (should be at app root)
   - Multi-dockview tracking: `registerDockview(id, api)`, `unregisterDockview(id)`
   - `getDockviewApi(id)` - get any registered dockview's API
   - `getDockviewIds()` - list all registered dockviews
   - `showContextMenu()` - opens menu with context
   - `hideContextMenu()` - closes menu
   - `useContextMenu()` hook (throws if outside provider)
   - `useContextMenuOptional()` hook (returns null if outside provider)

4. ✅ `apps/main/src/lib/dockview/contextMenu/DockviewContextMenu.tsx`
   - `ContextMenuPortal` - renders menu as portal at cursor
   - `MenuItemComponent` - recursive menu item renderer
   - Viewport boundary detection
   - Keyboard support (Escape to close)
   - Click-outside to close
   - Nested menu support with indentation

5. ✅ `apps/main/src/lib/dockview/contextMenu/CustomTabComponent.tsx`
   - Wraps DockviewDefaultTab
   - Adds onContextMenu handler
   - Uses `useContextMenuOptional` (works without provider)
   - Uses `useDockviewId` to know which dockview it's in

6. ✅ `apps/main/src/lib/dockview/contextMenu/DockviewIdContext.tsx`
   - Simple context to provide dockview ID to children
   - `DockviewIdProvider` - wraps SmartDockview content
   - `useDockviewId()` - returns current dockview's ID

7. ✅ `apps/main/src/lib/dockview/contextMenu/index.ts`
   - Barrel export

**Key Features Implemented:**
- ✅ Generic context system (not dockview-specific)
- ✅ Registry pattern following BaseRegistry
- ✅ Context-aware action filtering
- ✅ Automatic positioning with boundary detection
- ✅ Keyboard navigation
- ✅ Nested menus
- ✅ Variant styles (default/danger/success)
- ✅ Icon and shortcut display
- ✅ **Multi-dockview support for cross-dockview communication**

### ✅ Phase 2: Dockview Integration (COMPLETED)

**Files Modified:**
1. ✅ `apps/main/src/lib/dockview/SmartDockview.tsx`
   - Unified single component (no inner/wrapper split)
   - Uses `useContextMenuOptional` for optional context menu support
   - Registers with global provider via `registerDockview(panelManagerId, api)`
   - Unregisters on unmount
   - Wraps with `DockviewIdProvider` so children know their dockview ID
   - `enableContextMenu` prop enables context menu features

2. ✅ `apps/main/src/lib/dockview/contextMenu/index.ts`
   - Added all exports including `DockviewIdContext`

**Architecture (Global Provider):**
```
App (root)
└── ContextMenuProvider (GLOBAL - placed at app root)
    ├── dockviewApis: Map<id, api>  ← tracks all dockviews
    ├── registerDockview(id, api)
    ├── unregisterDockview(id)
    ├── getDockviewApi(id)          ← get specific dockview
    └── showContextMenu()           ← global

    ├── Workspace (SmartDockview panelManagerId="workspace")
    │   ├── DockviewIdProvider (dockviewId="workspace")
    │   ├── on ready: registerDockview('workspace', api)
    │   └── on unmount: unregisterDockview('workspace')
    │
    ├── ControlCenter (SmartDockview panelManagerId="control-center")
    │   ├── DockviewIdProvider (dockviewId="control-center")
    │   ├── on ready: registerDockview('control-center', api)
    │   └── on unmount: unregisterDockview('control-center')
    │
    └── AssetCard (anywhere in app)
        └── showContextMenu({ contextType: 'asset' })
            └── action can: getDockviewApi('workspace').addPanel(...)
```

**Cross-Dockview Communication:**
```typescript
// Action can target specific dockview
contextMenuRegistry.register({
  id: 'open-in-workspace',
  label: 'Open in Workspace',
  availableIn: ['asset', 'asset-card'],
  execute: async (ctx) => {
    // Get workspace dockview (even if triggered from control-center)
    const workspaceApi = ctx.getDockviewApi?.('workspace');
    if (workspaceApi) {
      workspaceApi.addPanel({
        id: `asset-${ctx.assetId}`,
        component: 'asset-viewer',
        params: { assetId: ctx.assetId },
      });
    }
  },
});
```

### ⏳ Phase 3: Menu Actions (TODO)

**Files to Create:**
1. ⏳ `apps/main/src/lib/dockview/contextMenu/actions/panelActions.ts`
   - Add Panel (nested by category)
   - Close Panel
   - Maximize Panel
   - Float Panel

2. ⏳ `apps/main/src/lib/dockview/contextMenu/actions/layoutActions.ts`
   - Split Right
   - Split Down

3. ⏳ `apps/main/src/lib/dockview/contextMenu/actions/presetActions.ts`
   - Save Current Layout
   - Load Preset (nested menu)
   - Delete Preset (nested menu)
   - Reset to Default

4. ⏳ `apps/main/src/lib/dockview/contextMenu/actions/index.ts`
   - Register all actions on import

**Action Implementation Details:**
- Add Panel: Query `panelRegistry.getByCategory()`, show nested menu by CATEGORY_ORDER
- Layout Presets: Integrate with `workspaceStore.savePreset/loadPreset/deletePreset`
- Split: Use `api.addPanel()` with `direction: 'right' | 'below'`
- Panel ops: `api.removePanel()`, `panel.api.maximize()`, workspace float

### ⏳ Phase 4: Testing & Polish (TODO)

**Testing Checklist:**
- [ ] Right-click on tab shows tab-specific menu
- [ ] Right-click on empty group area shows group menu
- [ ] Right-click on dockview background shows global menu
- [ ] Add Panel nested menu shows all categories
- [ ] Layout presets save/load/delete correctly
- [ ] Split actions create new panels in correct direction
- [ ] Close/Maximize/Float panel operations work
- [ ] Menu closes on outside click
- [ ] Menu repositions when near viewport edge
- [ ] Test with asset context (future)
- [ ] Test with node context (future)
- [ ] **Cross-dockview actions work (e.g., open asset from ControlCenter in Workspace)**

## Architecture Decisions

### Global Context Menu Provider
**Decision:** Single global ContextMenuProvider at app root (not per-dockview)

**Rationale:**
- Enables cross-dockview communication (e.g., asset in ControlCenter opens panel in Workspace)
- Single source of truth for menu state
- Dockviews register themselves; actions can target any registered dockview

**Trade-offs:**
- Requires ContextMenuProvider at app root
- Components must handle case where provider doesn't exist (useContextMenuOptional)

### Generic Context System
**Decision:** Made context menu system generic, not dockview-specific

**Context Types:**
```typescript
type ContextMenuContext =
  // Dockview
  | 'tab' | 'group' | 'panel-content' | 'background'
  // Assets
  | 'asset' | 'asset-card'
  // Graph
  | 'node' | 'edge' | 'canvas'
  // Generic
  | 'item' | 'list-item'
  | string; // Custom from plugins
```

**Benefits:**
- Can be used anywhere (asset cards, graph nodes, lists, etc.)
- Not limited to dockview panels
- Plugins can add custom context types
- Each context can have different menu actions

### Multi-Dockview MenuActionContext
**Decision:** Added multi-dockview fields to context

```typescript
interface MenuActionContext {
  contextType: ContextMenuContext;
  position: { x, y };
  data?: any;

  // Multi-dockview support
  currentDockviewId?: string;           // Which dockview triggered this
  getDockviewApi?: (id) => DockviewApi; // Get any dockview's API

  // Convenience shortcut
  api?: DockviewApi; // Current dockview's API (if applicable)

  // Other optional fields...
  assetId?: string;
  nodeId?: string;
  [key: string]: any;
}
```

**Benefits:**
- Actions know which dockview triggered them
- Actions can target specific dockviews by ID
- Backwards compatible (api still works for current dockview)

## Next Steps

1. **Add ContextMenuProvider to App Root:**
   ```typescript
   // In App.tsx or main layout
   import { ContextMenuProvider } from '@lib/dockview/contextMenu';

   function App() {
     return (
       <ContextMenuProvider>
         <MainLayout />
       </ContextMenuProvider>
     );
   }
   ```

2. **Implement Menu Actions (Phase 3):**
   - Start with panelActions.ts (Add Panel with categories)
   - Then presetActions.ts (integrate workspace store)
   - Then layoutActions.ts (split right/down)
   - Finally panel operations

3. **Test Context Menu (Phase 4):**
   - Right-click on tabs
   - Right-click on dockview background
   - Cross-dockview actions

## Usage Examples

### Enable Context Menu on SmartDockview
```typescript
<SmartDockview
  components={components}
  onReady={handleReady}
  enableContextMenu
  panelManagerId="workspace"  // Required for context menu
/>
```

### Asset Card with Context Menu
```typescript
const { showContextMenu } = useContextMenu();

<div onContextMenu={(e) => {
  e.preventDefault();
  showContextMenu({
    contextType: 'asset-card',
    assetId: asset.id,
    data: asset,
    position: { x: e.clientX, y: e.clientY },
    // No currentDockviewId - asset card isn't in a dockview
  });
}}>
  {/* Asset card content */}
</div>
```

### Cross-Dockview Action
```typescript
contextMenuRegistry.register({
  id: 'open-in-workspace',
  label: 'Open in Workspace',
  availableIn: ['asset', 'asset-card'],
  execute: async (ctx) => {
    // Get workspace even if triggered elsewhere
    const workspaceApi = ctx.getDockviewApi?.('workspace');
    if (workspaceApi) {
      workspaceApi.addPanel({
        id: `asset-${ctx.assetId}`,
        component: 'panel',
        params: { panelId: 'inspector', assetId: ctx.assetId },
      });
    }
  },
});
```

## Files Summary

### Created (7 files) - Phase 1 & 2
- `contextMenu/types.ts` - Type definitions with multi-dockview support
- `contextMenu/ContextMenuRegistry.ts` - Registry class
- `contextMenu/ContextMenuProvider.tsx` - Global React context with dockview tracking
- `contextMenu/DockviewContextMenu.tsx` - Menu component
- `contextMenu/CustomTabComponent.tsx` - Tab wrapper with optional context menu
- `contextMenu/DockviewIdContext.tsx` - Context for dockview ID
- `contextMenu/index.ts` - Barrel export

### Modified (1 file) - Phase 2
- `SmartDockview.tsx` - Simplified, uses global provider

### To Create (4 files) - Phase 3
- `contextMenu/actions/panelActions.ts`
- `contextMenu/actions/layoutActions.ts`
- `contextMenu/actions/presetActions.ts`
- `contextMenu/actions/index.ts`
