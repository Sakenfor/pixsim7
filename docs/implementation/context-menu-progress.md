# Dockview Context Menu Implementation Progress

**Last Updated:** 2024-12-18

## Overview
Building an extensible, registry-based context menu system for dockview and other clickable items (assets, nodes, etc.) across the application.

## Current Status: Phase 2 - Dockview Integration (In Progress)

### ✅ Phase 1: Core Infrastructure (COMPLETED)

**Files Created:**
1. ✅ `apps/main/src/lib/dockview/contextMenu/types.ts` (147 lines)
   - Generic context types: dockview, asset, node, canvas, custom
   - MenuActionContext with optional fields for different contexts
   - MenuAction interface
   - MenuItem interface

2. ✅ `apps/main/src/lib/dockview/contextMenu/ContextMenuRegistry.ts` (105 lines)
   - Extends BaseRegistry<MenuAction>
   - `getActionsForContext()` - filters by context type and visibility
   - `toMenuItems()` - converts to MenuItem format
   - Global singleton: `contextMenuRegistry`

3. ✅ `apps/main/src/lib/dockview/contextMenu/ContextMenuProvider.tsx` (96 lines)
   - React context for menu state
   - `showContextMenu()` - opens menu with context
   - `hideContextMenu()` - closes menu
   - `useContextMenu()` hook
   - Works with or without dockview API (generic)

4. ✅ `apps/main/src/lib/dockview/contextMenu/DockviewContextMenu.tsx` (166 lines)
   - `ContextMenuPortal` - renders menu as portal at cursor
   - `MenuItemComponent` - recursive menu item renderer
   - Viewport boundary detection
   - Keyboard support (Escape to close)
   - Click-outside to close
   - Nested menu support with indentation

5. ✅ `apps/main/src/lib/dockview/contextMenu/CustomTabComponent.tsx` (37 lines)
   - Wraps DockviewDefaultTab
   - Adds onContextMenu handler
   - Calls showContextMenu with tab context

6. ✅ `apps/main/src/lib/dockview/contextMenu/index.ts` (10 lines)
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

### 🚧 Phase 2: Dockview Integration (IN PROGRESS)

**Files Modified:**
1. 🚧 `apps/main/src/lib/dockview/SmartDockview.tsx` (partial)
   - ✅ Added imports for context menu
   - ✅ Added props: `enableContextMenu`, `contextMenuRegistry`
   - ✅ Renamed main function to `SmartDockviewInner`
   - ⏳ Need to add: context menu hooks, tab components, background handler, portal
   - ⏳ Need to: wrap with ContextMenuProvider and create wrapper component

**Remaining Work for Phase 2:**
- [ ] Add context menu hooks to SmartDockviewInner
- [ ] Set dockview API when ready (call `setDockviewApi`)
- [ ] Pass `tabComponents={{ default: CustomTabComponent }}` to DockviewReact when enabled
- [ ] Add background context menu handler (onContextMenu on wrapper div)
- [ ] Render `<ContextMenuPortal />` when enabled
- [ ] Create wrapper component that provides ContextMenuProvider
- [ ] Export wrapper as `SmartDockview`

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

## Architecture Decisions

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

### Optional Fields Pattern
**Decision:** Made all context-specific fields optional in MenuActionContext

**Example:**
```typescript
interface MenuActionContext {
  contextType: ContextMenuContext;
  position: { x, y };
  data?: any; // Generic payload

  // Optional: Dockview
  api?: DockviewApi;
  panelId?: string;

  // Optional: Assets
  assetId?: string;

  // Optional: Graph
  nodeId?: string;

  [key: string]: any; // Custom fields
}
```

**Benefits:**
- Works with or without dockview API
- Supports multiple context types
- Extensible for future contexts

## Next Steps

1. **Finish SmartDockview Integration:**
   ```typescript
   // Add to SmartDockviewInner:
   const { setDockviewApi } = useContextMenu();

   // In handleReady:
   setDockviewApi(event.api);

   // Add tabComponents when enabled:
   const tabComponents = useMemo(() => {
     if (!enableContextMenu) return undefined;
     return { default: CustomTabComponent };
   }, [enableContextMenu]);

   // Add background handler:
   const handleBackgroundContextMenu = (e: React.MouseEvent) => {
     e.preventDefault();
     showContextMenu({
       contextType: 'background',
       position: { x: e.clientX, y: e.clientY },
     });
   };

   // Wrap with provider and render portal
   ```

2. **Implement Menu Actions:**
   - Start with panelActions.ts (Add Panel with categories)
   - Then presetActions.ts (integrate workspace store)
   - Then layoutActions.ts (split right/down)
   - Finally panel operations

3. **Test in DockviewWorkspace:**
   ```typescript
   <SmartDockview
     registry={workspaceRegistry}
     enableContextMenu={true}
     storageKey="workspace-layout"
     // ...
   />
   ```

4. **Extend to Other Contexts:**
   - Add asset card context menu
   - Add graph node context menu
   - Register context-specific actions

## Usage Example (Future)

### Dockview
```typescript
<SmartDockview enableContextMenu={true} />
```

### Asset Card
```typescript
<div onContextMenu={(e) => {
  e.preventDefault();
  showContextMenu({
    contextType: 'asset-card',
    assetId: asset.id,
    data: asset,
    position: { x: e.clientX, y: e.clientY },
  });
}}>
  {/* Asset card content */}
</div>
```

### Custom Action Registration
```typescript
contextMenuRegistry.register({
  id: 'export-asset',
  label: 'Export Asset',
  icon: 'download',
  availableIn: ['asset', 'asset-card'],
  execute: async (ctx) => {
    const asset = ctx.data;
    // Export logic
  },
});
```

## Files Summary

### Created (6 files)
- `contextMenu/types.ts` - Type definitions
- `contextMenu/ContextMenuRegistry.ts` - Registry class
- `contextMenu/ContextMenuProvider.tsx` - React context
- `contextMenu/DockviewContextMenu.tsx` - Menu component
- `contextMenu/CustomTabComponent.tsx` - Tab wrapper
- `contextMenu/index.ts` - Barrel export

### Modified (1 file, partial)
- `SmartDockview.tsx` - Added props and imports (incomplete)

### To Create (4 files)
- `contextMenu/actions/panelActions.ts`
- `contextMenu/actions/layoutActions.ts`
- `contextMenu/actions/presetActions.ts`
- `contextMenu/actions/index.ts`

## Plan File
Reference: `C:\Users\Stefan\.claude\plans\soft-watching-honey.md`
