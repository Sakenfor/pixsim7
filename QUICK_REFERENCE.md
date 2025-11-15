# Quick Reference Guide - Cube & Gallery System

## To Understand How X Works

### "How do gallery cubes display asset thumbnails?"
1. Read: `DraggableGalleryCube.tsx` (wrapper component)
2. Hook: `useGalleryCubeFaceContent()` in `GalleryCubeFaceContent.tsx` (maps assets to faces)
3. Data: `useAssets()` hook fetches from backend, `localFoldersStore` stores local assets
4. Render: `ControlCube.tsx` renders 3D cube with faceContent prop

### "How do cube expansions work?"
1. Registry: `cubeExpansionRegistry.ts` (singleton with register/get methods)
2. Init: `registerCubeExpansions.ts` (registers 'gallery' and 'health' at startup)
3. Render: `CubeExpansionOverlay.tsx` (checks registry, renders as portal)
4. Components: `GalleryCubeExpansion.tsx`, `HealthCubeExpansion.tsx`

### "How do floating panels work?"
1. State: `workspaceStore.ts` - `floatingPanels` array
2. UI: `FloatingPanelsManager.tsx` - renders panels with react-rnd
3. Actions: `openFloatingPanel()`, `closeFloatingPanel()`, `minimizeFloatingPanel()`
4. Issue: `minimizeFloatingPanel()` calls missing `minimizePanelToCube()` action

### "How are cubes positioned and rotated?"
1. Store: `controlCubeStore.ts` - `setCubePosition()`, `setCubeRotation()`
2. Rendering: `DraggableCube.tsx` - syncs position from store via effect
3. Formations: `CubeFormationControlCenter.tsx` - calculates positions, animates transitions
4. Hover: `ControlCube.tsx` - detects face under mouse, applies 15° tilt

### "How do cube connections work?"
1. Create: `addConnection(fromCubeId, fromFace, toCubeId, toFace, type)`
2. Linking Mode: `startLinking()` → `completeLinking()` → creates connection
3. Types: 'image' (blue), 'params' (green), 'command' (purple)
4. Messages: `sendMessage()` - queued, auto-clear after 5s
5. Render: `CubeConnectionsOverlay.tsx` (not fully examined)

### "How do I add a new cube expansion?"
1. Create component file: `/components/{feature}/Cube{Feature}Expansion.tsx`
2. Match interface: `ExpansionComponentProps { cubeId, onClose }`
3. Register in `registerCubeExpansions.ts`:
   ```typescript
   cubeExpansionRegistry.register('feature-id', {
     type: 'preview' | 'status' | 'actions' | 'quickaccess' | 'custom',
     component: CubeFeatureExpansion,
     width: 220,
     height: 280,
     showOnHover: true,
     hoverDelay: 400,
   });
   ```

### "How do I pin an asset to a cube face?"
```typescript
// From anywhere with cubeId and assetId
const { pinAssetToFace } = useControlCubeStore();
pinAssetToFace(cubeId, 'front', assetId);
// Face content updates automatically (useGalleryCubeFaceContent watches pinnedAssets)
```

### "How do I minimize a floating panel to a cube?"
**Currently broken:**
- FloatingPanelsManager calls `minimizePanelToCube()` (doesn't exist)
- Need to implement in controlCubeStore

**Should work like:**
```typescript
minimizePanelToCube: (panelMetadata, cubePosition) => {
  const cubeId = addCube('panel', cubePosition);
  updateCube(cubeId, {
    minimizedPanel: {
      panelId: panelMetadata.panelId,
      originalPosition: panelMetadata.originalPosition,
      originalSize: panelMetadata.originalSize,
      zIndex: panelMetadata.zIndex,
    }
  });
};
```

### "How do I restore a minimized panel from a cube?"
**Not yet implemented - needs:**
1. Cube click handler to detect `minimizedPanel` field
2. Call `restoreFloatingPanel(panelState)` from workspace store
3. Remove cube or hide it

---

## File Lookup Quick Index

### Store Files
- `/frontend/src/stores/controlCubeStore.ts` - Cube state & actions (649 lines)
- `/frontend/src/stores/workspaceStore.ts` - Panel/layout state & actions (317 lines)
- `/frontend/src/stores/localFoldersStore.ts` - Local asset persistence
- `/frontend/src/stores/controlCenterStore.ts` - Control module state

### Component - Cube Core
- `/frontend/src/components/control/ControlCube.tsx` - 3D cube rendering, face detection
- `/frontend/src/components/control/DraggableCube.tsx` - Draggable wrapper
- `/frontend/src/components/control/CubeExpansionOverlay.tsx` - Expansion portal

### Component - Cube Types
- `/frontend/src/components/control/DraggableGalleryCube.tsx` - Gallery cube
- `/frontend/src/components/control/CubeFormationControlCenter.tsx` - Control formations
- `/frontend/src/components/control/ControlCubeManager.tsx` - Cube management

### Component - Gallery
- `/frontend/src/routes/Assets.tsx` - Main gallery panel (AssetsRoute)
- `/frontend/src/components/assets/LocalFoldersPanel.tsx` - Local file browser
- `/frontend/src/components/assets/GalleryCubeFaceContent.tsx` - Asset→face mapping
- `/frontend/src/components/assets/GalleryCubeExpansion.tsx` - Expansion UI
- `/frontend/src/components/assets/MediaViewerCube.tsx` - Local asset preview

### Component - Panels
- `/frontend/src/components/layout/FloatingPanelsManager.tsx` - Floating panel UI
- `/frontend/src/components/layout/DockviewWorkspace.tsx` - Main workspace layout
- `/frontend/src/components/control/PanelLauncherModule.tsx` - Panel control module

### Registry & Hooks
- `/frontend/src/lib/cubeExpansionRegistry.ts` - Singleton registry
- `/frontend/src/lib/registerCubeExpansions.ts` - App initialization
- `/frontend/src/hooks/useAssets.ts` - Asset fetching hook
- `/frontend/src/hooks/useAsset.ts` - Single asset hook

### Utilities
- `/frontend/src/lib/cubeFormations.ts` - Formation calculations
- `/frontend/src/lib/panelActions.ts` - Panel action utilities
- `/frontend/src/components/control/CubeFaceContent.tsx` - Face content helpers
- `/frontend/src/components/control/CubeConnectionsOverlay.tsx` - Connection rendering

---

## Common Patterns

### Accessing Cube Store
```typescript
import { useControlCubeStore } from '../../stores/controlCubeStore';

// In component:
const cubes = useControlCubeStore((s) => s.cubes);
const addCube = useControlCubeStore((s) => s.addCube);
const cube = useControlCubeStore((s) => s.cubes[cubeId]);
```

### Accessing Workspace Store
```typescript
import { useWorkspaceStore } from '../../stores/workspaceStore';

// In component:
const floatingPanels = useWorkspaceStore((s) => s.floatingPanels);
const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
```

### Accessing Local Folders
```typescript
import { useLocalFolders } from '../../stores/localFoldersStore';

// In component:
const { assets, previews, addFolder } = useLocalFolders();
```

### Registering Expansion
```typescript
import { cubeExpansionRegistry } from './cubeExpansionRegistry';
import MyExpansion from '../components/MyExpansion';

cubeExpansionRegistry.register('my-type', {
  type: 'preview',
  component: MyExpansion,
  width: 220,
  height: 260,
});
```

### Creating a Gallery Cube
```typescript
const { addCube } = useControlCubeStore();
const cubeId = addCube('gallery', { x: 100, y: 100 });
// Automatically gets gallery-colored and uses useGalleryCubeFaceContent()
```

### Pinning Asset to Face
```typescript
const { pinAssetToFace } = useControlCubeStore();
pinAssetToFace(cubeId, 'front', assetId);
// Persisted in localStorage, updates face content automatically
```

---

## Missing Features (Implementation TODO)

### 1. Panel Minimization Complete Implementation
**Status:** Partially implemented - missing action

**Need to add to controlCubeStore:**
```typescript
minimizePanelToCube: (panelMetadata, cubePosition) => {
  // 1. Create cube at position
  // 2. Store panel metadata on cube
  // 3. Register expansion for panel if needed
  // 4. Enable restoration flow
};

restorePanelFromCube: (cubeId) => {
  // 1. Get minimized panel metadata from cube
  // 2. Restore floating panel with original state
  // 3. Remove or hide cube
};
```

**Expansion lookup needs update:**
In CubeExpansionOverlay:
```typescript
const providerId = cube?.minimizedPanel?.panelId || cube?.type;
```

### 2. Asset Selection from Cube Face
**Status:** Not implemented

**Needed:**
- Click handler on cube faces
- Asset selection callback
- Integration with workflow/asset pipeline

### 3. Custom Panel Expansions
**Status:** Architecture ready, needs usage

**To implement:**
- Register expansion for specific panelId
- Show custom UI when panel is minimized
- Example: Gallery panel → GalleryCubeExpansion

### 4. Cube-to-Cube Asset Transfer
**Status:** Message system exists, needs UI

**Mechanism:**
- Use `sendMessage()` for data transfer
- Use `addConnection()` with type: 'image'
- Visualize via CubeConnectionsOverlay

---

## Testing Checklist

### Gallery Cube Display
- [ ] Create gallery cube
- [ ] Verify asset thumbnails on faces
- [ ] Check pinned assets persist on reload
- [ ] Hover shows expansion with 3x3 grid
- [ ] Recent assets update when gallery changes

### Expansions
- [ ] Hover gallery cube → shows expansion
- [ ] Hover health cube → shows validation
- [ ] Expansion positions correctly (above/below)
- [ ] Expansion smart positioning at screen edges
- [ ] Close button hides expansion

### Floating Panels
- [ ] Open panel as floating
- [ ] Drag/resize floating panel
- [ ] Minimize button → should create cube (currently broken)
- [ ] Click cube → should restore panel (not implemented)

### Cube Formations
- [ ] Create control center formation
- [ ] Switch between formation types
- [ ] 800ms animation plays smoothly
- [ ] Save/recall formation

---

## Quick Fixes Needed

1. **Float→Cube Missing**: Implement `minimizePanelToCube()` in controlCubeStore
2. **Cube→Float Missing**: Implement cube click to restore panel
3. **Expansion Lookup**: Update to support panelId-based lookups
4. **Asset Selection**: Add click handlers to cube face content
5. **Workflow Integration**: Connect cube connections to asset pipeline

---

## Architecture Decision Points

### Expansion Lookup Strategy
Current: Type-based (cube.type = 'gallery' → GalleryCubeExpansion)
Needed: Panel-based (cube.minimizedPanel.panelId = 'gallery' → Custom expansion)

### Cube Types for Panels
Option 1: Use 'panel' type for all minimized panels
Option 2: Create type 'panel-{panelId}' for specificity
Option 3: Don't use type, only minimizedPanel reference

### Panel Metadata Storage
Option 1: Store on cube as minimizedPanel field
Option 2: Separate cube-panel mapping in workspaceStore
Option 3: Reference via panelId lookup

### Asset Selection Flow
Option 1: Click face → Pin to cube
Option 2: Click face → Select in workflow
Option 3: Drag face → Drop in other UI
Option 4: Context menu on face

