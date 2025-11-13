# Panel/Window System - Visual Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend App (App.tsx)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        WorkspaceRoute                            │   │
│  │                                                                   │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │            WorkspaceToolbar                                 │ │   │
│  │  │  [Lock] [Presets ▼] [+ Add Panel ▼] [Restore ▼] [Reset]  │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │                   MosaicWorkspace                           │ │   │
│  │  │                                                             │ │   │
│  │  │  ┌─ Mosaic Tree (MosaicNode<PanelId>)                    │ │   │
│  │  │  │                                                         │ │   │
│  │  │  │     ┌──────────────────────┐                           │ │   │
│  │  │  │     │ direction: 'row'     │                           │ │   │
│  │  │  │     ├──────────────────────┤                           │ │   │
│  │  │  │     │ first:               │                           │ │   │
│  │  │  │     │  ┌────────────────┐  │                           │ │   │
│  │  │  │     │  │direction:'col' │  │                           │ │   │
│  │  │  │     │  ├────────────────┤  │                           │ │   │
│  │  │  │     │  │first: 'gallery'│  │                           │ │   │
│  │  │  │     │  │second:'health' │  │                           │ │   │
│  │  │  │     │  └────────────────┘  │                           │ │   │
│  │  │  │     │ second:              │                           │ │   │
│  │  │  │     │  ┌────────────────┐  │                           │ │   │
│  │  │  │     │  │'graph'         │  │                           │ │   │
│  │  │  │     │  └────────────────┘  │                           │ │   │
│  │  │  │     └──────────────────────┘                           │ │   │
│  │  │  │                                                         │ │   │
│  │  │  └─ renderTile(panelId, path)                            │ │   │
│  │  │     ├─ Looks up: PANEL_MAP[panelId]                      │ │   │
│  │  │     ├─ Returns: <MosaicWindow><Component /></MosaicWindow> │ │   │
│  │  │     │                                                       │ │   │
│  │  │     └─ Example: PANEL_MAP['graph'] =>                      │ │   │
│  │  │        <MosaicWindow title="Graph">                        │ │   │
│  │  │          <GraphPanel />                                    │ │   │
│  │  │        </MosaicWindow>                                     │ │   │
│  │  │                                                             │ │   │
│  │  │  Rendered Panels:                                          │ │   │
│  │  │  ┌──────────┬──────────┬───────────┐                       │ │   │
│  │  │  │ Gallery  │  Health  │   Graph   │                       │ │   │
│  │  │  │          │          │           │                       │ │   │
│  │  │  ├──────────┴──────────┼─────┬─────┤                       │ │   │
│  │  │  │                     │Inspector   │                       │ │   │
│  │  │  │     Panel Content   ├──────┬────┤                       │ │   │
│  │  │  │                     │Game  │    │                       │ │   │
│  │  │  └─────────────────────┴──────┴────┘                       │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    ControlCenterDock                             │   │
│  │  [Generate] [Provider] [Shortcuts] [Presets]  [Hide] [Pin]     │   │
│  │                                                                   │   │
│  │  Active Module Content:                                          │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │ [Provider Selection] [Operation Type] [Prompt Input]        │ │   │
│  │  │ [Generate Button]                                           │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## State Management Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Zustand Stores                                   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  useWorkspaceStore (ACTIVE)                                              │
│  ──────────────────────────────                                          │
│  ├─ currentLayout: MosaicNode<PanelId>  ◄─ Tree structure               │
│  ├─ closedPanels: PanelId[]              ◄─ Closed panel IDs            │
│  ├─ isLocked: boolean                    ◄─ Layout lock state           │
│  ├─ fullscreenPanel: PanelId | null      ◄─ Active fullscreen           │
│  ├─ presets: WorkspacePreset[]           ◄─ Saved layouts              │
│  │                                                                         │
│  ├─ setLayout(layout)                    ◄─ Update tree                 │
│  ├─ closePanel(panelId)                  ◄─ Add to closed list          │
│  ├─ restorePanel(panelId)                ◄─ Add to layout               │
│  ├─ setFullscreen(panelId | null)        ◄─ Toggle fullscreen           │
│  ├─ savePreset(name)                     ◄─ Save snapshot               │
│  ├─ loadPreset(id)                       ◄─ Load snapshot               │
│  └─ toggleLock()                         ◄─ Lock/unlock editing         │
│                                                                            │
│  ├─ Storage: localStorage 'workspace_v2'                                 │
│  └─ Persisted: currentLayout, closedPanels, isLocked, presets           │
│                                                                            │
│                                                                            │
│  useControlCenterStore                                                   │
│  ──────────────────────────                                              │
│  ├─ open: boolean                        ◄─ Dock expanded               │
│  ├─ pinned: boolean                      ◄─ Stay open flag              │
│  ├─ height: number                       ◄─ Dock height px              │
│  ├─ activeModule: ControlModule          ◄─ Active tab                  │
│  ├─ operationType: string                ◄─ Gen operation               │
│  ├─ providerId?: string                  ◄─ Selected provider            │
│  ├─ presetId?: string                    ◄─ Selected preset              │
│  ├─ presetParams: {}                     ◄─ Resolved params             │
│  ├─ generating: boolean                  ◄─ Gen in progress             │
│  └─ recentPrompts: string[]              ◄─ Prompt history              │
│                                                                            │
│  ├─ Storage: localStorage 'control_center_v1'                            │
│  └─ Persisted: open, pinned, height, activeModule, etc.                │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

## Panel Registry & Component Mapping

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    Panel Registry (PANEL_MAP)                             │
│              MosaicWorkspace.tsx: 41-48                                   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Type: Record<PanelId, { title: string; Component: React.ComponentType }> │
│                                                                            │
│  Mapping:                                                                 │
│  ┌──────────────┬─────────────────┬──────────────────────────────────┐   │
│  │ PanelId      │ Title           │ Component                        │   │
│  ├──────────────┼─────────────────┼──────────────────────────────────┤   │
│  │ 'gallery'    │ 'Gallery'       │ AssetsRoute                      │   │
│  │ 'scene'      │ 'Scene Builder' │ SceneBuilderPanel               │   │
│  │ 'graph'      │ 'Graph'         │ GraphPanelWithProvider          │   │
│  │ 'inspector'  │ 'Inspector'     │ InspectorPanel                  │   │
│  │ 'health'     │ 'Health'        │ HealthPanel                     │   │
│  │ 'game'       │ 'Game'          │ GameIframePanel                 │   │
│  └──────────────┴─────────────────┴──────────────────────────────────┘   │
│                                                                            │
│  To add a new panel:                                                      │
│  1. Create component: ProviderSettingsPanel.tsx                          │
│  2. Add to PANEL_MAP: providerSettings: {...}                            │
│  3. Update type: type PanelId = '...' | 'providerSettings'               │
│  4. Add to PANEL_NAMES in WorkspaceToolbar                               │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

## Panel Opening Flow

```
User Action: Click "Add Panel" → Select "Graph"
│
├─ Call: restorePanel('graph')
│
├─ In workspaceStore.restorePanel():
│  ├─ Get current layout: currentLayout (MosaicNode | null)
│  ├─ Create new layout:
│  │  new = {
│  │    direction: 'row',
│  │    first: currentLayout,      ◄─ Existing layout
│  │    second: 'graph',            ◄─ New panel ID
│  │    splitPercentage: 75
│  │  }
│  ├─ Validate (prevent duplicates)
│  └─ set({ currentLayout: new })
│
├─ Zustand persist middleware:
│  └─ Save to localStorage 'workspace_v2'
│
├─ MosaicWorkspace re-renders:
│  ├─ Read new currentLayout from store
│  ├─ Pass to <Mosaic value={currentLayout} />
│  └─ Mosaic renders tree structure
│
├─ Mosaic calls renderTile('graph', [path]):
│  ├─ Lookup: PANEL_MAP['graph']
│  ├─ Get Component: GraphPanelWithProvider
│  ├─ Create: <MosaicWindow path={[...]} title="Graph">
│  │            <GraphPanelWithProvider />
│  │          </MosaicWindow>
│  └─ Return JSX
│
└─ Result: Panel appears in layout, draggable & resizable

```

## Control Center Module Integration

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      Control Center Modules                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  const MODULES = [                                                        │
│    { id: 'quickGenerate', label: 'Generate' },                           │
│    { id: 'shortcuts', label: 'Shortcuts' },                              │
│    { id: 'presets', label: 'Presets' },                                  │
│    { id: 'providerSettings', label: 'Provider' }  ◄─ NEW                │
│  ];                                                                        │
│                                                                            │
│  Flow: User clicks tab                                                    │
│  ├─ setActiveModule('providerSettings')                                   │
│  ├─ activeModule state updated in store                                   │
│  ├─ ControlCenterDock re-renders                                         │
│  ├─ renderModule() switch hits 'providerSettings' case                    │
│  ├─ Returns: <ProviderSettingsModule />                                   │
│  └─ Module renders in dock bottom area                                    │
│                                                                            │
│  Module Component:                                                        │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ export function ProviderSettingsModule() {                         │  │
│  │   const providerId = useControlCenterStore(s => s.providerId);    │  │
│  │   const { providers } = useProviders();                           │  │
│  │                                                                    │  │
│  │   return (                                                         │  │
│  │     <div className="p-4 space-y-3">                              │  │
│  │       {/* Provider-specific settings form */}                     │  │
│  │     </div>                                                        │  │
│  │   );                                                              │  │
│  │ }                                                                 │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  No need to:                                                              │
│  - Register in PANEL_MAP                                                 │
│  - Update PanelId type                                                   │
│  - Add to workspace layouts                                              │
│  - Use restorePanel()                                                    │
│                                                                            │
│  Advantages:                                                              │
│  ✓ Non-intrusive (doesn't disrupt workspace)                             │
│  ✓ Always accessible from control center                                 │
│  ✓ Can access providerId from shared store                               │
│  ✓ Minimal code changes required                                         │
│  ✓ Follows existing module pattern                                       │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

## Alternative: Workspace Panel Implementation

```
If provider settings need full panel:

1. Create ProviderSettingsPanel.tsx
2. Add to PANEL_MAP:
   const PANEL_MAP = {
     ...
     providerSettings: {
       title: 'Provider Settings',
       Component: ProviderSettingsPanel
     }
   };

3. Update PanelId type:
   type PanelId = 'gallery' | ... | 'providerSettings';

4. Add to PANEL_NAMES in WorkspaceToolbar:
   const PANEL_NAMES = {
     ...
     providerSettings: 'Provider Settings',
   };

5. User opens via: Workspace Toolbar → Add Panel → Provider Settings

Then:
- Click "Add Panel" dropdown
- Select "Provider Settings"
- restorePanel('providerSettings') called
- Panel appears in layout
- Full screen real estate available
```

## Hybrid Approach (RECOMMENDED)

```
┌──────────────────────────────────────────────────────────────────────────┐
│           Control Center Module + Workspace Panel Together               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ControlCenter:                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Provider Settings Module (Quick Access)                            │ │
│  │ ├─ List providers                                                  │ │
│  │ ├─ Quick toggles                                                   │ │
│  │ └─ [Open Full Settings Panel] button                              │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                    │                                       │
│                                    ▼                                       │
│  Workspace:                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Provider Settings Panel (Detailed)                                 │ │
│  │ ├─ Full provider config UI                                        │ │
│  │ ├─ Advanced options                                               │ │
│  │ ├─ Resource limits                                                │ │
│  │ └─ Save/Apply buttons                                             │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  Benefits:                                                                │
│  ✓ Quick access from control center                                      │
│  ✓ Deep settings in full panel                                           │
│  ✓ Both can read/write controlCenterStore.providerId                     │
│  ✓ Flexible workflow                                                     │
│  ✓ Professional UX                                                       │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Key Files Location Summary

```
/home/user/pixsim7/frontend/src/

├─ components/
│  ├─ layout/
│  │  ├─ MosaicWorkspace.tsx      ◄─ Panel renderer, PANEL_MAP
│  │  ├─ WorkspaceToolbar.tsx     ◄─ Add/restore panels UI
│  │  ├─ PanelChrome.tsx          ◄─ Panel wrapper (unused)
│  │  └─ DockLayout.tsx           ◄─ Alternative layout
│  │
│  ├─ control/
│  │  ├─ ControlCenterDock.tsx    ◄─ Main dock container
│  │  ├─ QuickGenerateModule.tsx  ◄─ Generate module
│  │  ├─ ShortcutsModule.tsx      ◄─ Shortcuts module
│  │  ├─ PresetsModule.tsx        ◄─ Presets module
│  │  └─ [NEW: ProviderSettingsModule.tsx]
│  │
│  ├─ SceneBuilderPanel.tsx
│  ├─ GraphPanel.tsx
│  ├─ inspector/InspectorPanel.tsx
│  ├─ health/HealthPanel.tsx
│  └─ [NEW: ProviderSettingsPanel.tsx]
│
├─ stores/
│  ├─ workspaceStore.ts          ◄─ Panel layout state
│  ├─ layoutStore.ts             ◄─ Alternative layout store
│  ├─ controlCenterStore.ts      ◄─ Control center state
│  └─ [UPDATE: Add module type]
│
├─ routes/
│  ├─ Workspace.tsx              ◄─ Workspace page
│  └─ [Other routes...]
│
└─ App.tsx                        ◄─ Main app with ControlCenterDock
```

