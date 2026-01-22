# Model Inspector Panel

A dockview panel that hosts a reusable 3D inspector surface. v1 focuses on tool contact zones, but the shell must support future modules like character rig preview, animation assignment, or prop placement without being rewritten.

## Overview

The Model Inspector enables artists and developers to:
- Import and view glTF/GLB 3D models (shared viewport foundation for tools, NPCs, props)
- Preview model animations via the same player used elsewhere
- Configure contact zones using Blender vertex groups or mesh naming conventions
- Assign interaction properties (sensitivity, stat modifiers) to zones and save them back to the active tool definition
- Reuse editor/runtime context (selected tool, scene presets, packs) so edits round-trip immediately

Design principles:
- Layered architecture: panel shell + shared store + generic R3F viewport, with feature modules (tool zones today, animation/rig later).
- Context-aware: consume the same editor snapshot used by the console (`getEditorContextSnapshot`) to fetch/save assets instead of duplicating state.
- Extensible: registrable inspector tabs can plug in new workflows without touching the core renderer/store.

## Technical Stack

- **@react-three/fiber / three** - React-first Three.js pipeline already used elsewhere. Keeps material/shader utilities shared with runtime; avoids introducing Babylon just for this panel.
- **@react-three/drei** - Helpers: OrbitControls, useGLTF, useAnimations, Html overlays.
- **Existing panel system** - Dockview-based with split support.
- **Zustand** - Localized store for inspector UI state; interoperates with broader tool/scene stores.

## Architecture

### Files to Create

Organized so the shell + store are generic, while feature modules (tool zones, future modules) mount inside:

```
apps/main/src/
  components/panels/tools/
    ModelInspectorPanel.tsx       # Panel shell
  components/3d/
    Model3DViewport.tsx           # Generic R3F canvas with controls
    ModelLoader.tsx               # Drag/drop + pack loader bridge
    ZoneHighlighter.tsx           # Overlay for highlighting vertex groups
    AnimationTimeline.tsx         # Shared animation scrubber
  stores/
    model3DStore.ts               # Zustand store for inspector state
  lib/models/
    types.ts                      # Tool3DModel, ContactZone3D, Animation types
    zoneUtils.ts                  # Zone extraction helpers
  lib/modelInspector/
    modules.ts                    # Registry for inspector feature modules
    contextBridge.ts              # Read/write editor context (tools, packs)
```

### Data Types

```ts
interface Tool3DModel {
  url: string;                       // '/models/banana.glb'
  scale?: number;                    // Default 1
  defaultAnimation?: string;         // Animation clip name
  zones: Record<string, ZoneProperties>;
}

interface ZoneProperties {
  label?: string;                    // Display name (defaults to group name)
  sensitivity: number;               // 0-1
  ticklishness?: number;             // 0-1
  pleasure?: number;                 // 0-1
  statModifiers?: Record<string, number>;  // e.g., { pleasure: 1.5, tickle: 0.5 }
  highlightColor?: string;           // For editor visualization
}

interface ContactZone3D {
  id: string;                        // Vertex group or mesh prefix
  label: string;
  meshNames: string[];               // Meshes this zone applies to
  properties: ZoneProperties;
}
```

### Store State

```ts
interface Model3DState {
  // Model
  modelUrl: string | null;
  modelData: Tool3DModel | null;
  gltf: GLTF | null;
  isLoading: boolean;
  error: string | null;

  // Viewport
  mode: 'view' | 'zones' | 'animation';
  selectedZoneId: string | null;
  showWireframe: boolean;
  showZoneOverlay: boolean;
  cameraBookmark?: CameraPose;

  // Animation
  currentAnimation: string | null;
  isPlaying: boolean;
  playbackSpeed: number;
  currentTime: number;

  // Zones (extracted from model or overrides)
  availableZones: string[];
  zoneConfigs: Record<string, ZoneProperties>;

  // Context bridge
  sceneContext: EditorContextSnapshot | null;
  syncFromContext: () => Promise<void>;
  persistToContext: (options?: PersistOptions) => Promise<void>;

  // Actions
  loadModel: (source: ModelSource) => Promise<void>;
  setMode: (mode: Model3DState['mode']) => void;
  selectZone: (zoneId: string | null) => void;
  updateZoneProperty: (zoneId: string, key: string, value: any) => void;
  exportConfig: () => Tool3DModel;
}
```

The store is feature-agnostic. Modules (tool zones, animation preview) subscribe via selectors so future workflows reuse the same camera/model state.

## Panel Layout

```
+--------------------------------------------------------------+
| Model Inspector                                    [Refresh] |
+--------------------------------------------------------------+
| Tabs: [Tool Zones] [Animation] [Props]                       |
+-------------+-----------------------------------------------+
| Model Info  |                                               |
|-------------|                3D Viewport                    |
| File: [Import]  [Sync from Tool]                            |
| Scale: [1.0]                                                |
| View: [ ]Solid [ ]Wire [ ]Zones                             |
+-------------+-----------------------------------------------+
| Mode: [View] [Zones] [Animation]                            |
|                                                              |
| Zones                                                        |
| * tip (selected)  Sensitivity [0.80]  Ticklishness [0.30]    |
|   Pleasure [0.50]  Stat Modifiers: pleasure 1.5x             |
| * shaft                                                     |
| * base                                                      |
+--------------------------------------------------------------+
| Animation: Clip [idle]  [Play] [Pause]  Speed [1.0x] 0:02/0:05|
+--------------------------------------------------------------+
| [Save to Tool] [Export JSON] [Test in Playground]            |
+--------------------------------------------------------------+
```

The action buttons route through the context bridge so changes persist to the active tool config or open the existing playground with the updated model.

## Workflow

### Artist Workflow (Blender)

1. Create model in Blender.
2. In Edit Mode, select vertices for each contact zone.
3. Assign to vertex groups (e.g., `tip`, `shaft`, `base`) or name meshes with a `zone_` prefix.
4. Export as glTF with "Include > Vertex Groups" enabled.

### Developer Workflow (Panel)

1. Open the Model Inspector panel.
2. Sync from the currently selected tool (pulls model + config) or import a new glTF file.
3. Panel auto-detects vertex groups/mesh prefixes as available zones.
4. Switch to "Zones" mode.
5. Click on model regions to select zones.
6. Adjust properties for each zone; optional stat modifiers map to interaction stat IDs.
7. Save back to the active tool or export a JSON config for review/versioning.

## glTF Vertex Group Extraction

```ts
const { scene, nodes } = useGLTF('/models/tool.glb');

// Mesh userData path (preferred when exporting via Blender add-on)
function extractZonesFromUserData(mesh: THREE.Mesh) {
  return mesh.userData?.vertexGroups as string[] | undefined;
}

// Mesh name fallback
function extractZonesFromNames(node: THREE.Object3D) {
  if (node.name.startsWith('zone_')) {
    const zoneId = node.name.replace(/^zone_/, '');
    // collect geometry indices for highlighting
  }
}

// Skinned meshes can leverage bone influences as zones
if (mesh instanceof THREE.SkinnedMesh) {
  mesh.skeleton.bones.forEach((bone) => {
    if (bone.name.startsWith('zone_')) {
      // treat bone as zone anchor
    }
  });
}
```

`zoneUtils.ts` should expose composable extractors so future modules can register new strategies (e.g., metadata-based zones for props).

## Panel Registration

```ts
registerPanel({
  id: 'model-inspector',
  title: 'Model Inspector',
  component: ModelInspectorPanel,
  category: 'tools',
  tags: ['3d', 'model', 'gltf', 'zones', 'tools'],
  icon: 'mdi-cube-scan',
  supportsMultipleInstances: true,
});
```

Inspector feature modules register with the shell:

```ts
registerInspectorModule({
  id: 'tool-zones',
  title: 'Tool Zones',
  mount: () => <ToolZoneEditor />,  // default tab
});

registerInspectorModule({
  id: 'animation-preview',
  title: 'Animation',
  mount: () => <AnimationInspector />, // optional future module
});
```

## Console Integration

```ts
pixsim.ops.models.load('/models/banana.glb');
pixsim.ops.models.listZones();
pixsim.ops.models.setZoneProperty('tip', 'sensitivity', 0.9);
pixsim.ops.models.saveToTool('touch');
```

Ops read/write via the same store/context bridge so scripting matches UI edits.

## Integration with Tool System

```ts
const bananaTool: InteractiveTool = {
  id: 'banana',
  type: 'object',
  visual: {
    model: 'banana',
    model3D: {
      url: '/models/banana.glb',
      scale: 1,
      defaultAnimation: 'idle',
      zones: {
        tip: { sensitivity: 0.9, pleasure: 0.8, statModifiers: { pleasure: 1.5 } },
        shaft: { sensitivity: 0.6, pleasure: 0.5 },
        base: { sensitivity: 0.4 },
      },
    },
  },
};
```

Saving from the panel updates the same tool config so gizmos pick up the 3D data immediately.

## Implementation Phases

### Phase 0: Shell + Context
- [ ] Create `model3DStore` with generic camera/model state + context sync helpers.
- [ ] Build `ModelInspectorPanel` shell with module tabs + context hook (reads editor snapshot, selected tool).
- [ ] Register module registry (tool zones is the default module).

### Phase 1: Basic Viewer
- [ ] Create Model3DViewport with OrbitControls and gizmo helpers.
- [ ] Add glTF loader with drag-drop + pack loader fallback.
- [ ] Basic model display (solid/wireframe modes, reset camera).

### Phase 2: Zone System
- [ ] Extract zones from mesh names/vertex groups via `zoneUtils`.
- [ ] Highlight zones on hover/select.
- [ ] Zone property editor UI with validation + stat pickers.
- [ ] Export config + diff preview.

### Phase 3: Animation
- [ ] Detect animation clips, expose timeline controls.
- [ ] Play/pause/scrub, speed adjustment, loop modes.
- [ ] Surface clip metadata (duration, bones used) for future workflows.

### Phase 4: Integration
- [ ] Console ops (pixsim.ops.models.*).
- [ ] Save to tool definition + playground smoke test button.
- [ ] Undo/redo for zone changes (share with panel history infra).

## Notes

- **Format** - Prefer glTF/GLB over OBJ (better material/animation support).
- **Zone naming** - Encourage `zone_` prefixes or vertex groups for predictable extraction; allow custom extractors per module.
- **Performance** - Use BVH acceleration for raycasting on complex meshes; throttle highlight updates.
- **Fallback** - Keep 2D visuals as fallback when 3D not available.
- **Extensibility** - Staying on Three.js keeps parity with the existing gizmo runtime; if Babylon-specific workflows appear later, add them as alternative modules rather than replacing the core.
