# Codebase Architecture Exploration Summary

## 1. GALLERY SYSTEM

### Location
- Main Route: `/home/user/pixsim7/frontend/src/routes/Assets.tsx`
- Local Folders: `/home/user/pixsim7/frontend/src/components/assets/LocalFoldersPanel.tsx`
- Assets Hook: `/home/user/pixsim7/frontend/src/hooks/useAssets.ts`

### Gallery Components
1. **AssetsRoute** - Main gallery panel component
   - Browse remote/cloud assets
   - Search, filter, sort capabilities
   - Two view modes: Remote (from backend) and Local (File System Access API)
   - Uses MasonryGrid for responsive layout

2. **LocalFoldersPanel** - Local file browsing
   - Uses File System Access API (Chrome/Chromium only)
   - Persists directory handles in IndexedDB
   - Supports recursive folder scanning (5 levels deep)
   - Generates previews and uploads to providers
   - View modes: Grid, Tree, List

3. **Asset Management**
   - Remote assets: From backend via `useAssets()` hook (pagination, filtering)
   - Local assets: Stored in `localFoldersStore` with TypeScript types:
     ```typescript
     type LocalAsset = {
       key: string;              // folderId + relativePath
       name: string;
       relativePath: string;
       kind: 'image' | 'video' | 'other';
       size?: number;
       lastModified?: number;
       fileHandle: FileSystemFileHandle;
       folderId: string;
     };
     ```

### Asset Selection Flows
- **Remote Selection**: Click asset in MasonryGrid → MediaCard component
- **Local Selection**: TreeFolderView → MediaViewerCube → Upload or use locally
- **Recent Assets**: Displayed in GalleryCubeExpansion (first 9 items)

---

## 2. CUBE TYPES & ARCHITECTURE

### Defined Cube Types (CubeType union)
```typescript
type CubeType =
  | 'control'      // Main control cube (quick actions)
  | 'provider'     // Provider controls
  | 'preset'       // Preset management
  | 'panel'        // Panel controls/launcher
  | 'settings'     // Settings/options
  | 'gallery';     // Gallery asset picker
```

### Cube Modes (CubeMode union)
```typescript
type CubeMode = 'idle' | 'rotating' | 'expanded' | 'combined' | 'docked' | 'linking';
```

### Cube Structure (CubeState interface)
```typescript
interface CubeState {
  id: string;
  type: CubeType;
  position: CubePosition;           // {x, y}
  rotation: CubeRotation;           // {x, y, z} in degrees
  scale: number;
  mode: CubeMode;
  visible: boolean;
  activeFace: CubeFace;             // front|back|left|right|top|bottom
  dockedToPanelId?: string;         // If docked to a panel
  zIndex: number;
  pinnedAssets?: Record<CubeFace, string>;  // Asset IDs pinned to faces
  savedPositions?: Record<string, SavedPosition>;
  currentPositionKey?: string;
}
```

### Cube Rendering Components
1. **ControlCube** (`components/control/ControlCube.tsx`)
   - Core 3D cube rendering with CSS transforms
   - Hover detection with rotation-aware face detection
   - Hover tilt effect (15-degree tilt based on mouse position)
   - Face content rendering
   - Expansion overlay on hover

2. **DraggableCube** (`components/control/DraggableCube.tsx`)
   - Wrapper around ControlCube
   - Uses react-draggable library
   - Syncs position with store
   - Disabled dragging when docked

3. **DraggableGalleryCube** (`components/control/DraggableGalleryCube.tsx`)
   - Gallery-specific cube with dynamic asset thumbnails
   - Hooks into asset data via `useGalleryCubeFaceContent()`

### Color Scheme by Type
```typescript
CUBE_TYPE_COLORS: Record<CubeType, string> = {
  control: 'from-blue-500/50 to-purple-500/50',
  provider: 'from-green-500/50 to-teal-500/50',
  preset: 'from-orange-500/50 to-red-500/50',
  panel: 'from-cyan-500/50 to-indigo-500/50',
  settings: 'from-gray-500/50 to-slate-500/50',
  gallery: 'from-pink-500/50 to-violet-500/50',
};
```

---

## 3. CUBE EXPANSION/MORPHING SYSTEM

### CubeExpansionRegistry
Location: `/home/user/pixsim7/frontend/src/lib/cubeExpansionRegistry.ts`

Singleton registry that maps panels/cube types to expansion components:

```typescript
interface ExpansionProvider {
  type: ExpansionType;                    // 'preview'|'status'|'actions'|'quickaccess'|'custom'
  component: ComponentType<ExpansionComponentProps>;
  getData?: () => any;
  width?: number;
  height?: number;
  showOnHover?: boolean;                  // default: true
  hoverDelay?: number;                    // default: 300ms
}
```

### Registered Expansions
Location: `/home/user/pixsim7/frontend/src/lib/registerCubeExpansions.ts`

**Registered at App Init:**
1. **Health** expansion (status type)
   - Component: HealthCubeExpansion
   - Shows validation errors/warnings
   - Size: 220x280px
   - Hover delay: 400ms

2. **Gallery** expansion (preview type)
   - Component: GalleryCubeExpansion
   - Shows 3x3 grid of recent assets
   - Size: 220x260px
   - Hover delay: 400ms

### Expansion Rendering
**CubeExpansionOverlay** (`components/control/CubeExpansionOverlay.tsx`)
- Renders expansion as portal (z-index 10000)
- Smart positioning: above cube, falls back to below if off-screen
- Handles screen edge clamping
- Updates on window resize
- Shows type indicator badge

### Default Expansion Sizes
```typescript
{
  preview: { width: 200, height: 200 },
  status: { width: 220, height: 150 },
  actions: { width: 180, height: 160 },
  quickaccess: { width: 160, height: 180 },
  custom: { width: 200, height: 200 },
}
```

### How Expansions Work
1. On cube hover, check for expansion provider:
   ```typescript
   const providerId = cube?.minimizedPanel?.panelId || cube?.type;
   const provider = cubeExpansionRegistry.get(providerId);
   ```
2. If provider exists, render expansion component after hover delay
3. Expansion receives `cubeId` and `onClose` callback
4. Portal renders above cube with smart positioning

---

## 4. FLOATING PANELS MANAGER

Location: `/home/user/pixsim7/frontend/src/components/layout/FloatingPanelsManager.tsx`

### Purpose
Manages floating/draggable panel windows separate from docked workspace layout.

### Architecture
**Panel State:**
```typescript
interface FloatingPanelState {
  id: PanelId;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}
```

**Managed by:** `useWorkspaceStore` actions
- `openFloatingPanel(panelId)` - Create floating window
- `closeFloatingPanel(panelId)` - Close floating window
- `minimizeFloatingPanel(panelId)` - Remove panel (becomes cube)
- `restoreFloatingPanel(panelState)` - Restore from cube
- `updateFloatingPanelPosition(panelId, x, y)`
- `updateFloatingPanelSize(panelId, width, height)`
- `bringFloatingPanelToFront(panelId)`

### Supported Floating Panels
Panel Map in FloatingPanelsManager:
```typescript
{
  gallery: AssetsRoute,
  scene: SceneBuilderPanel,
  graph: GraphPanelWithProvider,
  inspector: InspectorPanel,
  health: HealthPanel,
  game: GameIframePanel,
  providers: ProviderSettingsPanel,
}
```

### Features
- Draggable (via react-rnd library)
- Resizable (min 300x200)
- Window bounds constraint
- Minimize button (▪) → creates cube
- Close button (✕) → closes floating panel
- Blue "FLOATING" badge on header
- Brings to front on mousedown

### Panel to Cube Minimization Flow
**Current Implementation Issue:** References `minimizePanelToCube` action that doesn't exist in controlCubeStore

```typescript
// In FloatingPanelsManager.handleMinimize():
minimizePanelToCube(
  {
    panelId: panel.id,
    originalPosition: { x: panel.x, y: panel.y },
    originalSize: { width: panel.width, height: panel.height },
    zIndex: panel.zIndex,
  },
  { x: centerX, y: centerY }
);
```

**Missing Implementation:** Should add to controlCubeStore actions:
- Store panel metadata on cube
- Create cube at panel center
- Enable restoration via cube click
- Handle cube→panel expand mapping

---

## 5. CUBE-GALLERY INTEGRATIONS

### 1. Gallery Cube Face Content
**File:** `components/control/GalleryCubeFaceContent.tsx`

Syncs cube faces with asset thumbnails:
- Maps 6 cube faces to first 6 assets
- Shows asset thumbnails on faces
- Supports pinned assets (via `cube.pinnedAssets` record)
- Falls back to default emoji if no asset

**Asset Mapping:**
```typescript
const faces: CubeFace[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
faces.forEach((face, index) => {
  const pinnedAssetId = pinnedAssets[face];
  if (pinnedAssetId) {
    // Use pinned asset
  } else {
    // Use recent asset at index
  }
});
```

### 2. Asset Pinning to Cube Faces
**Store Actions:**
```typescript
pinAssetToFace: (cubeId: string, face: CubeFace, assetId: string) => void;
unpinAssetFromFace: (cubeId: string, face: CubeFace) => void;
getPinnedAsset: (cubeId: string, face: CubeFace) => string | undefined;
```

### 3. Gallery Cube Expansion
**File:** `components/assets/GalleryCubeExpansion.tsx`

Hover expansion showing:
- Gallery icon and name
- 3x3 grid of recent assets (from localFoldersStore)
- Asset count
- Click hint: "Click cube to restore panel"

### 4. Connection Between Systems
1. **DraggableGalleryCube** creates a gallery-typed cube
2. Face content comes from `useGalleryCubeFaceContent()` hook
3. Expansion lookup finds 'gallery' provider in registry
4. GalleryCubeExpansion renders from localFoldersStore data

### 5. Missing: Panel Restoration from Cube
Currently missing ability to:
- Click cube to restore minimized panel
- Store minimized panel metadata on cube
- Map cube back to original floating panel state

---

## 6. CONTROL CENTER FORMATIONS

### CubeFormationControlCenter
Location: `/home/user/pixsim7/frontend/src/components/control/CubeFormationControlCenter.tsx`

Creates dynamic cube formations for control modules:
- 5 control modules (QuickGenerate, Shortcuts, Presets, Providers, Panels)
- Each module → cube (control, preset, or provider type)
- Formations: 'arc', 'line', 'circle', 'grid', 'star', 'custom'
- Smooth 800ms animation transitions
- Each cube displays module-specific content

### Cube Positions Storage
```typescript
interface SavedPosition {
  name: string;
  position: CubePosition;
  rotation: CubeRotation;
  scale: number;
  timestamp: number;
}

// Store in controlCubeStore
cube.savedPositions?: Record<string, SavedPosition>;
```

### Formation Management
```typescript
saveFormation: (name: string, cubeIds: string[], type?: Formation['type']) => string;
recallFormation: (formationId: string, animated?: boolean) => void;
deleteFormation: (formationId: string) => void;
arrangeInFormation: (cubeIds: string[], type: Formation['type'], options?: {...}) => void;
```

---

## 7. CUBE CONNECTIONS SYSTEM

### Connection Types
```typescript
interface CubeConnection {
  id: string;
  fromCubeId: string;
  fromFace: CubeFace;
  toCubeId: string;
  toFace: CubeFace;
  type?: string;           // 'image', 'params', 'command'
  color?: string;          // Auto-colored based on type
}
```

**Type Colors:**
- image: #3b82f6 (blue)
- params: #10b981 (green)
- command: #8b5cf6 (purple)

### Connection Workflow
1. Start linking: `startLinking(cubeId, face)` → cube enters 'linking' mode
2. Complete: `completeLinking(toCubeId, toFace)` → creates connection
3. Cancel: `cancelLinking()` → resets state
4. Remove: `removeConnection(connectionId)`

### Messages Between Cubes
```typescript
sendMessage: (fromCubeId: string, toCubeId: string, data: any, type?: string) => void;
```
- Auto-clears after 5 seconds
- Queued in `state.messages`

### Visualization
**CubeConnectionsOverlay** - Renders connection lines between cubes (file not fully examined)

---

## 8. KEY INTEGRATION OPPORTUNITIES

### Missing Implementations
1. **minimizePanelToCube action** in controlCubeStore
   - Should store panel reference on cube
   - Should enable panel restoration
   - Should handle panel→cube→panel lifecycle

2. **Cube-to-Panel Expansion Mapping**
   - Currently only supports type-based expansion (e.g., 'gallery' → GalleryCubeExpansion)
   - Need to support panelId-based expansion for minimized panels
   - Example: gallery panel minimized → shows GalleryCubeExpansion OR custom panel expansion

3. **Asset Selection from Cube**
   - Gallery cube faces show assets
   - Need ability to click asset on face to select/use it
   - Should trigger panel actions or asset selection callbacks

### Potential Integrations
1. **Gallery Panel ↔ Gallery Cube**
   - Minimize gallery panel → gallery cube
   - Cube expansion shows asset grid (already implemented)
   - Click cube → restore gallery panel
   - Click asset on cube face → trigger asset selection

2. **Custom Panel Expansions**
   - Register expansions for any floatable panel
   - Each panel can have custom expansion UI
   - Registry-based approach already supports this

3. **Cube Formations for Workflows**
   - Save cube arrangements with connections
   - Use formations for specific workflows
   - Already supports formation save/recall

4. **Asset Workflow in Cubes**
   - Pin assets to cube faces
   - Connect cubes with asset data types
   - Use cube connections for asset pipeline

---

## FILE LOCATIONS REFERENCE

### Core Stores
- **controlCubeStore.ts** - `/home/user/pixsim7/frontend/src/stores/controlCubeStore.ts` (649 lines)
- **workspaceStore.ts** - `/home/user/pixsim7/frontend/src/stores/workspaceStore.ts` (317 lines)
- **localFoldersStore.ts** - `/home/user/pixsim7/frontend/src/stores/localFoldersStore.ts`

### Cube Components
- **ControlCube.tsx** - Core 3D cube rendering
- **DraggableCube.tsx** - Draggable wrapper
- **DraggableGalleryCube.tsx** - Gallery-specific cube
- **CubeExpansionOverlay.tsx** - Hover expansion rendering
- **CubeFormationControlCenter.tsx** - Control module formations

### Gallery Components
- **AssetsRoute.tsx** - Main gallery panel (`routes/Assets.tsx`)
- **LocalFoldersPanel.tsx** - Local file browser
- **GalleryCubeExpansion.tsx** - Cube expansion for gallery
- **GalleryCubeFaceContent.tsx** - Asset thumbnails on cube faces

### Expansion System
- **cubeExpansionRegistry.ts** - Registry singleton
- **registerCubeExpansions.ts** - Registration initialization

### Panel Management
- **FloatingPanelsManager.tsx** - Floating panel UI and interactions
- **PanelLauncherModule.tsx** - Panel control module (in cube)

### Layout
- **DockviewWorkspace.tsx** - Modern dockview layout (newer)
- **MosaicWorkspace.tsx** - Legacy mosaic layout

---

## SUMMARY OF CUBE TYPES & ROLES

| Type | Purpose | Color | Used In |
|------|---------|-------|---------|
| `control` | Quick actions, shortcuts, generation | Blue/Purple | CubeFormationControlCenter |
| `gallery` | Asset browsing and pinning | Pink/Violet | DraggableGalleryCube |
| `provider` | Provider selection/management | Green/Teal | CubeFormationControlCenter |
| `preset` | Preset management | Orange/Red | CubeFormationControlCenter |
| `panel` | Panel launcher module | Cyan/Indigo | CubeFormationControlCenter |
| `settings` | Settings options | Gray/Slate | (Not yet implemented) |

---

## GALLERY UI COMPONENT HIERARCHY

```
AssetsRoute
├── Tabs (scope selector: all/favorites/mine/recent)
├── Search/Filter/Sort controls
├── View toggle (remote/local)
├── Remote View
│   └── MasonryGrid
│       └── MediaCard[] (for each asset)
│           └── Click → detail view
└── Local View
    └── LocalFoldersPanel
        ├── Add Folder button
        ├── TreeFolderView (left sidebar)
        ├── MediaViewerCube (center)
        └── Upload controls
```

---

## QUICK REFERENCE: STORE ACTIONS

### Control Cube Store
- Cube management: `addCube()`, `removeCube()`, `updateCube()`
- Position/rotation: `setCubePosition()`, `setCubeRotation()`, `rotateCubeFace()`
- State: `setCubeMode()`, `setActiveCube()`, `toggleCubeVisibility()`
- Docking: `dockCubeToPanel()`, `undockCube()` (dockedToPanelId field)
- Combining: `combineCubes()`, `separateCubes()`
- Connections: `addConnection()`, `removeConnection()`, `getConnectionsForCube()`
- Messages: `sendMessage()`, `clearMessages()`
- Linking: `startLinking()`, `completeLinking()`, `cancelLinking()`
- Assets: `pinAssetToFace()`, `unpinAssetFromFace()`, `getPinnedAsset()`
- Positions: `savePosition()`, `recallPosition()`, `shufflePositions()`
- Formations: `saveFormation()`, `recallFormation()`, `arrangeInFormation()`

### Workspace Store
- Layout: `setLayout()`, `setDockviewLayout()`
- Panels: `closePanel()`, `restorePanel()`, `clearClosedPanels()`
- Lock: `toggleLock()`
- Fullscreen: `setFullscreen()`
- Presets: `savePreset()`, `loadPreset()`, `deletePreset()`
- Floating: `openFloatingPanel()`, `closeFloatingPanel()`, `minimizeFloatingPanel()`, `restoreFloatingPanel()`, `updateFloatingPanelPosition()`, `updateFloatingPanelSize()`, `bringFloatingPanelToFront()`

