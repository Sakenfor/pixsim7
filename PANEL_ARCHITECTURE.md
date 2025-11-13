# Panel/Window System Architecture Analysis

## 1. DOCKING LIBRARY

**Primary Library**: `react-mosaic-component` v6.1.1
- Location: `/home/user/pixsim7/frontend/package.json`
- Used in: `MosaicWorkspace.tsx`

**Secondary System**: Custom split-based layout (not currently active)
- Location: `DockLayout.tsx` and `layoutStore.ts`
- Uses: Recursive split nodes with custom chrome

**Why Two Systems?**
- MosaicWorkspace: More mature, handles Mosaic library's tree structure
- DockLayout: Alternative system for panel instances with metadata

### Architecture Details

```
react-mosaic-component features:
- Hierarchical binary tree: direction + first + second + splitPercentage
- MosaicWindow wrappers with chrome (title, controls)
- Drag-to-split, drag-to-rearrange
- Fullscreen mode support
- Keyboard resize support (Alt+Arrow keys)
- Blueprint theme CSS
```

---

## 2. PANEL CREATION & MANAGEMENT

### How Panels Are Created (MosaicWorkspace Flow)

```
1. Panel Registry (PANEL_MAP in MosaicWorkspace.tsx)
   └─ Maps PanelId → { title, Component }
   └─ Example: gallery: { title: 'Gallery', Component: AssetsRoute }

2. Layout State (workspaceStore)
   └─ Stores: currentLayout (MosaicNode<PanelId>)
   └─ State: closedPanels, isLocked, fullscreenPanel, presets

3. Panel Instantiation
   └─ renderTile(panelId, path) in MosaicWorkspace
   └─ Creates: <MosaicWindow><Component /></MosaicWindow>
   └─ Manages: fullscreen button, title

4. Layout Changes
   └─ onChange event → setLayout(newNode)
   └─ Detects closed panels → closePanel(id)
   └─ Persisted to localStorage via zustand persist middleware
```

### Key Store Functions

**workspaceStore.ts** (`/home/user/pixsim7/frontend/src/stores/workspaceStore.ts`)

```typescript
// Type Definition
export type PanelId = 'gallery' | 'scene' | 'graph' | 'inspector' | 'health' | 'game';

// Key Actions
- setLayout(layout: MosaicNode<PanelId>) - Update layout tree
- closePanel(panelId: PanelId) - Track closed panel
- restorePanel(panelId: PanelId) - Add panel back to layout
- setFullscreen(panelId: PanelId | null) - Toggle fullscreen
- savePreset(name: string) - Save current layout
- loadPreset(id: string) - Load saved layout
- toggleLock() - Lock/unlock layout editing
```

---

## 3. CURRENT PANEL ARCHITECTURE

### Existing Panels (6 total)

Located in: `/home/user/pixsim7/frontend/src/components/`

1. **Gallery** (`AssetsRoute.tsx` from routes/Assets.tsx)
   - Asset browser/manager
   
2. **Scene Builder** (`SceneBuilderPanel.tsx`)
   - Graph node editing interface
   - ~150 lines, simple form-based UI
   
3. **Graph** (`GraphPanel.tsx`)
   - React Flow graph visualization
   - Node creation/editing, connections
   - ~300+ lines, complex with node types registry
   
4. **Inspector** (`inspector/InspectorPanel.tsx`)
   - Property inspector
   
5. **Health** (`health/HealthPanel.tsx`)
   - System health monitoring
   
6. **Game** (GameIframePanel)
   - Game frontend iframe
   - Connects to game service via previewBridge

### Panel Component Pattern

```typescript
// Simple Panel (SceneBuilderPanel.tsx example)
export function SceneBuilderPanel() {
  const state = useStore(...);  // Access data
  
  return (
    <div className="...">
      {/* Panel content */}
    </div>
  );
}

// Panel is wrapped by:
// 1. MosaicWorkspace renderTile()
// 2. MosaicWindow (from react-mosaic-component)
// 3. Adds title, resize, fullscreen controls
```

---

## 4. CONTROL CENTER INTEGRATION WITH PANELS

### Control Center Architecture

Location: `/home/user/pixsim7/frontend/src/components/control/ControlCenterDock.tsx`

**Features**:
- Bottom dock widget (auto-hide when unpinned)
- Modularity: Three modules visible via tabs
- Reveal strip at bottom (8px hover area)
- Draggable resize handle (Alt+Arrow for keyboard)

```
ControlCenterDock
├─ QuickGenerateModule (Generate tab)
│  └─ Provider selection, operation type, prompt input
│
├─ ShortcutsModule (Shortcuts tab)
│  └─ Navigation shortcuts (hardcoded, route-based)
│
└─ PresetsModule (Presets tab)
   └─ Dynamic presets from provider specs
   └─ Selection updates control center state
```

### Control Center Store

File: `/home/user/pixsim7/frontend/src/stores/controlCenterStore.ts`

```typescript
Key State:
- open: boolean (dock expanded)
- pinned: boolean (stays open)
- height: number (px)
- activeModule: 'quickGenerate' | 'shortcuts' | 'presets'
- operationType: 'text_to_video' | 'image_to_video' | 'video_extend' | 'video_transition' | 'fusion'
- providerId?: string
- presetId?: string
- presetParams: Record<string, any>
- generating: boolean
- recentPrompts: string[]
```

**Current Integration Gap**: 
- Control center CAN'T directly open workspace panels
- ShortcutsModule only does navigation (routes), not panel restoration
- Modules are contained within dock, not connected to MosaicWorkspace

---

## 5. SHORTCUTS & PANEL LAUNCHERS IN CONTROL CENTER

### Current Shortcuts (ShortcutsModule)

File: `/home/user/pixsim7/frontend/src/components/control/ShortcutsModule.tsx`

```typescript
const shortcuts: Shortcut[] = [
  {
    id: 'assets',
    label: 'Open Gallery',
    icon: '🖼️',
    action: () => navigate('/assets'),  // Navigate away from workspace!
  },
  {
    id: 'workspace',
    label: 'Open Workspace',
    icon: '🎨',
    action: () => navigate('/workspace'),
  },
  {
    id: 'graph',
    label: 'Open Graph',
    icon: '🕸️',
    action: () => navigate('/graph/1'),  // Specific route, not workspace panel
  },
];
```

**Issue**: Shortcuts use navigation, not panel restoration

### How Panels Are Actually Opened

From WorkspaceToolbar.tsx:

```typescript
// Add Panel dropdown
onClick={() => {
  if (!alreadyExists) {
    restorePanel(panelId);  // <-- This opens a panel
    setShowAddPanel(false);
  }
}}

// Restore Closed Panels button
{closedPanels.map((panelId) => (
  <button onClick={() => restorePanel(panelId)}>
    {PANEL_NAMES[panelId]}
  </button>
))}
```

---

## 6. EXISTING PANELS REFERENCE

### Panel Registry (PANEL_MAP)

File: `/home/user/pixsim7/frontend/src/components/layout/MosaicWorkspace.tsx:41-48`

```typescript
const PANEL_MAP: Record<PanelId, { title: string; Component: React.ComponentType }> = {
  gallery: { title: 'Gallery', Component: AssetsRoute },
  scene: { title: 'Scene Builder', Component: SceneBuilderPanel },
  graph: { title: 'Graph', Component: GraphPanelWithProvider },
  inspector: { title: 'Inspector', Component: InspectorPanel },
  health: { title: 'Health', Component: HealthPanel },
  game: { title: 'Game', Component: GameIframePanel },
};
```

### Default Workspace Presets

```typescript
// From workspaceStore.ts (lines 35-86)
defaultPresets: [
  {
    id: 'default',
    name: 'Default Workspace',
    layout: {
      direction: 'row',
      first: {
        direction: 'column',
        first: 'gallery',    // Top left
        second: 'health',    // Bottom left
        splitPercentage: 70,
      },
      second: {
        direction: 'row',
        first: 'graph',       // Middle
        second: {
          direction: 'column',
          first: 'inspector',  // Top right
          second: 'game',      // Bottom right
          splitPercentage: 40,
        },
        splitPercentage: 60,
      },
      splitPercentage: 20,
    },
  },
  // ... minimal, creative presets
]
```

---

## 7. PANEL STATE MANAGEMENT

### Layout Persistence

**Zustand with persist middleware**:
- workspaceStore: `STORAGE_KEY = 'workspace_v2'`
- layoutStore: `STORAGE_KEY = 'workspace_layout_v1'`

### State Hierarchy

```
useWorkspaceStore (ACTIVE)
├─ currentLayout: MosaicNode<PanelId> | null
├─ closedPanels: PanelId[]
├─ isLocked: boolean
├─ fullscreenPanel: PanelId | null
└─ presets: WorkspacePreset[]

useLayoutStore (LEGACY/ALTERNATIVE)
├─ panels: Record<string, PanelInstance>
├─ root: SplitNode | null
└─ activePanelId?: string
```

### Panel State Flow

```
User closes panel (X button)
├─ MosaicWindow fires onChange
├─ MosaicWorkspace detects leaf difference
├─ closePanel(id) called
├─ closedPanels array updated
├─ localStorage synced via persist middleware

User clicks "Restore Panel"
├─ restorePanel(panelId) called
├─ Appends panel to right: { direction: 'row', first: currentLayout, second: panelId, splitPercentage: 75 }
├─ Layout tree updated
├─ MosaicWorkspace re-renders with new tree
└─ Panel appears and is added to layout

User saves preset
├─ savePreset(name) called
├─ Captures currentLayout snapshot
├─ Stores in presets array
├─ Can load any preset later
```

### Validation & Duplicate Prevention

```typescript
// validateAndFixLayout() in workspaceStore.ts
// Prevents duplicate panel IDs in tree
// Fallback to default preset if invalid
```

---

## BEST PATTERNS FOR PROVIDER SETTINGS UI

### Recommended Approach: Control Center Module

**Advantages**:
1. No workspace disruption (bottom dock, collapsible)
2. Persistent state via control center store
3. Can access providers via `useProviders()` hook
4. Integrates with existing architecture
5. Follows established module pattern (QuickGenerate, Presets, Shortcuts)

**Implementation Pattern**:

```typescript
// 1. Add to control center store type
type ControlModule = 'quickGenerate' | 'shortcuts' | 'presets' | 'providerSettings';

// 2. Create module component (e.g., ProviderSettingsModule.tsx)
export function ProviderSettingsModule() {
  const { providers } = useProviders();
  const providerId = useControlCenterStore(s => s.providerId);
  
  return (
    <div className="p-4 space-y-3">
      {/* Settings form for selected provider */}
    </div>
  );
}

// 3. Add to MODULES array in ControlCenterDock
const MODULES = [
  { id: 'quickGenerate', label: 'Generate' },
  { id: 'providerSettings', label: 'Provider' },  // NEW
  // ...
];

// 4. Add to renderModule() switch
case 'providerSettings':
  return <ProviderSettingsModule />;
```

### Alternative: Workspace Panel

If provider settings need full screen real estate:

```typescript
// 1. Add panel type
type PanelId = '...' | 'providerSettings';

// 2. Create ProviderSettingsPanel.tsx
export function ProviderSettingsPanel() {
  const { providers } = useProviders();
  // Full panel UI
}

// 3. Register in PANEL_MAP
const PANEL_MAP = {
  // ...
  providerSettings: { 
    title: 'Provider Settings', 
    Component: ProviderSettingsPanel 
  },
};

// 4. Update type
type PanelId = 'gallery' | '...' | 'providerSettings';

// 5. Add to WorkspaceToolbar Add Panel menu (via PANEL_NAMES)
const PANEL_NAMES: Record<PanelId, string> = {
  // ...
  providerSettings: 'Provider Settings',
};
```

### Hybrid Approach (Recommended)

Combine both:
- **Control center module**: Quick provider selection/configuration
- **Workspace panel**: Detailed settings, advanced options
- **Integration**: Module has "Open Settings Panel" button

---

## FILE REFERENCE SUMMARY

| File | Purpose | Key Type/Function |
|------|---------|-------------------|
| `MosaicWorkspace.tsx` | Panel rendering engine | `PANEL_MAP`, `renderTile()` |
| `workspaceStore.ts` | Panel layout state | `useWorkspaceStore`, `PanelId` |
| `layoutStore.ts` | Alternative layout system | `useLayoutStore`, `PanelInstance` |
| `ControlCenterDock.tsx` | Bottom dock container | Module tabs, pin/resize |
| `controlCenterStore.ts` | Control center state | `useControlCenterStore` |
| `WorkspaceToolbar.tsx` | Workspace UI controls | Panel add/restore, presets, lock |
| `PanelChrome.tsx` | Panel wrapper (unused currently) | Panel border, title |
| `ShortcutsModule.tsx` | Navigation shortcuts | `Shortcut[]` interface |
| `PresetsModule.tsx` | Parameter preset selection | Dynamic generation from specs |
| `QuickGenerateModule.tsx` | Generation interface | Provider/operation selection |

---

## QUICK START FOR PROVIDER SETTINGS

### 1. Create ProviderSettingsModule.tsx

```typescript
import { useProviders } from '../../hooks/useProviders';
import { useControlCenterStore } from '../../stores/controlCenterStore';

export function ProviderSettingsModule() {
  const { providers } = useProviders();
  const providerId = useControlCenterStore(s => s.providerId);
  const provider = providers.find(p => p.id === providerId);
  
  if (!provider) {
    return <div className="p-4 text-sm text-neutral-500">Select a provider in Generate tab</div>;
  }
  
  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold">{provider.name} Settings</h3>
      {/* Settings form here */}
    </div>
  );
}
```

### 2. Update ControlCenterDock.tsx

```typescript
const MODULES = [
  { id: 'quickGenerate', label: 'Generate' },
  { id: 'providerSettings', label: 'Provider' },  // ADD THIS
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'presets', label: 'Presets' },
];

// In renderModule():
case 'providerSettings':
  return <ProviderSettingsModule />;
```

### 3. Update controlCenterStore.ts

```typescript
export type ControlModule = 'quickGenerate' | 'providerSettings' | 'shortcuts' | 'presets' | 'none';
```

Done! The module appears in control center tabs.

---

## KEY HOOKS AVAILABLE

From `/home/user/pixsim7/frontend/src/hooks/`:

- `useProviders()` - Get list of providers
- `useProviderSpecs(providerId)` - Get operation specs for provider
- `useWorkspaceStore()` - Panel/layout state
- `useControlCenterStore()` - Control center state
- `useGraphStore()` - Scene graph state
- `useSelectionStore()` - Current selection
- `useToast()` - Toast notifications
- `useJobsStore()` - Background jobs tracking

---

## SUMMARY

**Docking System**: react-mosaic-component (binary tree layout)
**Panel Management**: Zustand store + registry pattern
**State Persistence**: localStorage via zustand persist
**Panel Registration**: PANEL_MAP in MosaicWorkspace
**Panel Opening**: restorePanel() in workspaceStore
**Control Center**: Modular dock system with 3 modules (extensible)
**Best Practice**: Add as Control Center module, optionally add workspace panel

