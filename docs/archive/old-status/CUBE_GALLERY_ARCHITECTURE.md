# Cube-Gallery System Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PIXSIM7 FRONTEND                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              PANEL/WORKSPACE SYSTEM                          │  │
│  │  (workspaceStore, FloatingPanelsManager)                     │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                              │  │
│  │  ┌─────────────────┐  ┌─────────────────┐                  │  │
│  │  │ Docked Panels   │  │ Floating Panels │                  │  │
│  │  │ (Dockview)      │  │ (React-RND)     │                  │  │
│  │  ├────────────────┤  ├─────────────────┤                  │  │
│  │  │ Gallery        │  │ Gallery (float) │─────┐             │  │
│  │  │ Scene Builder  │  │ Scene (float)   │     │             │  │
│  │  │ Graph          │  │ Inspector (fl)  │     │             │  │
│  │  │ Inspector      │  │ Health (float)  │     │             │  │
│  │  │ Health         │  └─────────────────┘     │             │  │
│  │  │ Game           │                          ↓             │  │
│  │  └────────────────┘                    ┌──────────────┐    │  │
│  │                                        │ MINIMIZE BTN │    │  │
│  │                                        │ (creates    │    │  │
│  │                                        │  cube)      │    │  │
│  │                                        └──────────────┘    │  │
│  │                                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                           ↕ (minimize/restore)                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              CUBE SYSTEM                                     │  │
│  │  (controlCubeStore, ControlCube, DraggableCube)              │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                              │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │         Cube Types & Instances                       │  │  │
│  │  ├────────────────────────────────────────────────────┤  │  │
│  │  │                                                    │  │  │
│  │  │  Gallery Cube      Control Cubes    Other Types   │  │  │
│  │  │  - Pink/Violet     - Blue/Purple    - Provider    │  │  │
│  │  │  - Asset faces     - Formation      - Preset      │  │  │
│  │  │  - Pin assets      - Modules        - Panel       │  │  │
│  │  │  - Draggable                        - Settings    │  │  │
│  │  │                                                    │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │           ↕ (hover)                                      │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │    Expansion System (CubeExpansionRegistry)          │  │  │
│  │  ├────────────────────────────────────────────────────┤  │  │
│  │  │                                                    │  │  │
│  │  │ ┌──────────────────┐  ┌──────────────────────────┐ │  │  │
│  │  │ │ Health Expansion │  │ Gallery Expansion       │ │  │  │
│  │  │ │ (status type)    │  │ (preview type)          │ │  │  │
│  │  │ │ - 220x280px      │  │ - 220x260px             │ │  │  │
│  │  │ │ - Validation     │  │ - 3x3 asset grid        │ │  │  │
│  │  │ │ - Issues display │  │ - Asset count           │ │  │  │
│  │  │ │ - 400ms delay    │  │ - 400ms delay           │ │  │  │
│  │  │ └──────────────────┘  └──────────────────────────┘ │  │  │
│  │  │                                                    │  │  │
│  │  │ [+] Extensible: Register custom expansions        │  │  │
│  │  │                                                    │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                                                              │  │
│  │  Cube Interactions:                                        │  │
│  │  ├─ Position/Rotation: Full 3D control                    │  │
│  │  ├─ Draggable: React-draggable                           │  │
│  │  ├─ Hover Tilt: 15° tilt based on mouse               │  │
│  │  ├─ Formations: Arc/Line/Circle/Grid/Star            │  │
│  │  ├─ Connections: Cube-to-cube linking                │  │
│  │  └─ Face Detection: 6-face rotation-aware             │  │
│  │                                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              GALLERY SYSTEM                                  │  │
│  │  (localFoldersStore, AssetsRoute)                            │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                              │  │
│  │  ┌──────────────────┐        ┌──────────────────────────┐   │  │
│  │  │ Remote Assets    │        │ Local Assets             │   │  │
│  │  │ (Backend API)    │        │ (File System Access API) │   │  │
│  │  ├──────────────────┤        ├──────────────────────────┤   │  │
│  │  │ - Pagination     │        │ - IndexedDB persistence  │   │  │
│  │  │ - Filtering      │        │ - Directory handles      │   │  │
│  │  │ - Sorting        │        │ - Recursive scanning     │   │  │
│  │  │ - Tags/Scope     │        │ - Preview generation     │   │  │
│  │  │ - MasonryGrid UI │        │ - Tree/Grid/List views  │   │  │
│  │  │                  │        │ - Upload to providers    │   │  │
│  │  └──────────────────┘        └──────────────────────────┘   │  │
│  │           ↕                           ↕                       │  │
│  │    ┌──────────────────────────────────────────────────────┐   │  │
│  │    │  Asset Data                                          │   │  │
│  │    │  - Thumbnails (remote_url)                           │   │  │
│  │    │  - Asset ID, Type, Tags                              │   │  │
│  │    │  - Object URLs (local files)                         │   │  │
│  │    │  - Usage stats, timestamps                           │   │  │
│  │    └──────────────────────────────────────────────────────┘   │  │
│  │                                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Cube-Gallery Integration Points

```
┌─────────────────────────────────────────────────────────────────┐
│              CUBE-GALLERY INTEGRATION                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. GALLERY CUBE FACE CONTENT                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                                                          │  │
│  │  DraggableGalleryCube                                   │  │
│  │  └─ useGalleryCubeFaceContent()                         │  │
│  │     └─ Maps 6 faces → Asset thumbnails                 │  │
│  │        ├─ Pinned assets (persistent)                   │  │
│  │        └─ Recent assets (dynamic)                       │  │
│  │           └─ useAssets(limit: 6)                       │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  2. ASSET PINNING TO FACES                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                                                          │  │
│  │  cube.pinnedAssets: Record<CubeFace, string>            │  │
│  │                                                          │  │
│  │  Actions:                                               │  │
│  │  - pinAssetToFace(cubeId, face, assetId)              │  │
│  │  - unpinAssetFromFace(cubeId, face)                    │  │
│  │  - getPinnedAsset(cubeId, face)                        │  │
│  │                                                          │  │
│  │  Persistent: Saved in localStorage                      │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  3. GALLERY CUBE EXPANSION (Hover Preview)                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                                                          │  │
│  │  GalleryCubeExpansion                                   │  │
│  │  ├─ Renders on hover (400ms delay)                      │  │
│  │  ├─ Shows 3x3 grid of recent assets                     │  │
│  │  └─ Data source: localFoldersStore.assets               │  │
│  │                                                          │  │
│  │  Registry Entry:                                        │  │
│  │  {                                                      │  │
│  │    type: 'preview',                                     │  │
│  │    component: GalleryCubeExpansion,                     │  │
│  │    width: 220, height: 260                              │  │
│  │  }                                                      │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  4. MISSING: PANEL MINIMIZATION & RESTORATION                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                                                          │  │
│  │  Issue: FloatingPanelsManager calls                     │  │
│  │    minimizePanelToCube() - NOT IMPLEMENTED             │  │
│  │                                                          │  │
│  │  Needed Implementation:                                 │  │
│  │  ├─ Store panel metadata on cube                        │  │
│  │  │  (panelId, position, size)                          │  │
│  │  │                                                      │  │
│  │  ├─ Create cube at panel center                         │  │
│  │  │  (type: 'panel'?)                                   │  │
│  │  │                                                      │  │
│  │  ├─ Show custom expansion for minimized panel           │  │
│  │  │  (lookup by panelId, not just type)                │  │
│  │  │                                                      │  │
│  │  └─ Click cube → restore panel to floating state        │  │
│  │     (position, size, zIndex)                           │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow: Gallery to Cube

```
localFoldersStore.assets
    ↓
useLocalFolders() hook
    ↓
    ├─→ GalleryCubeExpansion (on hover)
    │   └─ Shows 3x3 grid
    │
    ├─→ useGalleryCubeFaceContent()
    │   ├─ Fetches 6 recent assets
    │   └─ Renders thumbnails on faces
    │
    └─→ GalleryCubeFaceContent.getAssetFromCubeFace()
        └─ Returns asset ID from face position
```

## Data Flow: Asset Selection

```
Asset in Gallery
    ↓
Click Asset (MediaCard)
    ↓
User Action: Pin to Cube / Select
    ↓
    ├─ Option 1: Pin to Cube Face
    │ └─ pinAssetToFace(cubeId, face, assetId)
    │   └─ cube.pinnedAssets[face] = assetId
    │   └─ Persisted in localStorage
    │   └─ Face content updates
    │
    └─ Option 2: Use in Workflow
      └─ sendMessage(cubeId, targetCubeId, assetData)
        └─ Message queue with 5s auto-clear
```

## Store Action Relationships

```
Cube Store ↔ Workspace Store
├─ Cube position/visibility: Independent
├─ Cube modes: Independent
├─ Cube-Panel docking: Via dockedToPanelId field
│  └─ dockCubeToPanel(cubeId, panelId)
│  └─ undockCube(cubeId)
│
└─ Panel minimization:
   └─ FloatingPanelsManager.minimizeFloatingPanel()
      → minimizeFloatingPanel(panelId) [workspaceStore]
      → minimizePanelToCube() [MISSING - controlCubeStore]
         └─ Should create cube with panel reference
         └─ Should enable restoration
```

## Expansion Lookup Mechanism

```
Cube Hovering
    ↓
CubeExpansionOverlay checks:
    ├─ cube.minimizedPanel?.panelId  (if panel-minimized)
    └─ cube.type                      (if normal cube)
    ↓
Lookup in cubeExpansionRegistry:
    ├─ 'gallery' → GalleryCubeExpansion
    ├─ 'health' → HealthCubeExpansion
    ├─ 'custom-panel-id' → Custom expansion (potential)
    └─ null → No expansion
    ↓
If found:
    ├─ Check showOnHover & hoverDelay
    ├─ Render component with cubeId prop
    └─ Portal renders at smart position
```

## File Dependencies

```
Core Data Layer:
├── controlCubeStore.ts (649 lines)
│   ├─ CubeType, CubeState, CubeConnection
│   └─ All cube actions
│
├── workspaceStore.ts (317 lines)
│   ├─ FloatingPanelState
│   └─ Panel actions
│
└── localFoldersStore.ts
    ├─ LocalAsset type
    └─ Folder/asset persistence

Rendering Layer:
├── Cubes
│   ├── ControlCube.tsx (3D rendering, face detection)
│   ├── DraggableCube.tsx (draggable wrapper)
│   └── DraggableGalleryCube.tsx (gallery-specific)
│
├── Expansions
│   ├── CubeExpansionOverlay.tsx (portal rendering)
│   ├── GalleryCubeExpansion.tsx (gallery preview)
│   └── HealthCubeExpansion.tsx (health status)
│
├── Gallery
│   ├── AssetsRoute.tsx (main gallery)
│   ├── LocalFoldersPanel.tsx (local files)
│   └── GalleryCubeFaceContent.tsx (cube face sync)
│
└── Panels
    └── FloatingPanelsManager.tsx (floating UI)

Registry Layer:
├── cubeExpansionRegistry.ts (singleton)
└── registerCubeExpansions.ts (app init)
```

## Integration Checklist

### Current (Implemented)
- [x] Gallery cube displays asset thumbnails on faces
- [x] Asset pinning to cube faces
- [x] Cube expansion system with registry
- [x] Gallery expansion on hover (3x3 grid)
- [x] Floating panels with minimize button
- [x] Cube formations (control center)
- [x] Cube-to-cube connections

### Missing (Implementation Needed)
- [ ] `minimizePanelToCube()` action in controlCubeStore
- [ ] Panel metadata storage on cube
- [ ] Panel restoration from cube click
- [ ] Custom expansion registration for panels
- [ ] Asset selection callback from cube faces
- [ ] Cube-panel integration for workflow

### Future Opportunities
- [ ] Pin assets to cube faces from expansion UI
- [ ] Asset data transfer via cube connections
- [ ] Workflow formations with asset pipelines
- [ ] Multi-panel cube aggregation
- [ ] Custom cube types for different workflows
