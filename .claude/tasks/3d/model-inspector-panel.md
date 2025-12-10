# Model Inspector Panel

A panel for viewing glTF 3D models, previewing animations, and configuring contact zones for interactive tools.

## Overview

The Model Inspector enables artists and developers to:
- Import and view glTF/GLB 3D models
- Preview model animations
- Configure contact zones using Blender vertex groups
- Assign interaction properties (sensitivity, stat modifiers) to zones

## Technical Stack

- **@react-three/fiber** - React renderer for Three.js (already installed)
- **@react-three/drei** - Helpers: OrbitControls, useGLTF, useAnimations
- **three** - Core 3D library (already installed)
- **Existing panel system** - Dockview-based with split support

## Architecture

### Files to Create

```
apps/main/src/
├── components/panels/tools/
│   └── ModelInspectorPanel.tsx      # Main panel component
├── components/3d/
│   ├── Model3DViewport.tsx          # R3F canvas with controls
│   ├── ModelLoader.tsx              # glTF loader component
│   ├── ZoneHighlighter.tsx          # Zone visualization overlay
│   └── AnimationTimeline.tsx        # Animation scrubber
├── stores/
│   └── model3DStore.ts              # Zustand store for panel state
└── lib/models/
    ├── types.ts                     # Tool3DModel, ContactZone3D types
    └── zoneUtils.ts                 # Zone extraction from glTF
```

### Data Types

```typescript
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
  id: string;                        // Vertex group name from glTF
  label: string;
  meshNames: string[];               // Meshes this zone applies to
  properties: ZoneProperties;
}
```

### Store State

```typescript
interface Model3DState {
  // Model
  modelUrl: string | null;
  modelData: Tool3DModel | null;
  isLoading: boolean;
  error: string | null;

  // Viewport
  mode: 'view' | 'zones' | 'animation';
  selectedZoneId: string | null;
  showWireframe: boolean;
  showZoneOverlay: boolean;

  // Animation
  currentAnimation: string | null;
  isPlaying: boolean;
  playbackSpeed: number;
  currentTime: number;

  // Zones (extracted from model)
  availableZones: string[];          // Vertex group names from glTF
  zoneConfigs: Record<string, ZoneProperties>;

  // Actions
  loadModel: (url: string) => Promise<void>;
  setMode: (mode: Model3DState['mode']) => void;
  selectZone: (zoneId: string | null) => void;
  updateZoneProperty: (zoneId: string, key: string, value: any) => void;
  exportConfig: () => Tool3DModel;
}
```

## Panel Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Model Inspector                                    [≡] [×]  │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │                                                         │ │
│ │                   [3D Viewport]                         │ │
│ │                 (orbit/zoom/pan)                        │ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  Mode: [View] [Zones] [Animation]                          │
│                                                             │
│ ┌─ Model ─────────────────────────────────────────────────┐ │
│ │ File: [Import glTF]  banana.glb                         │ │
│ │ Scale: [1.0]   View: ○Solid ●Wire ○Zones                │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Zones (from vertex groups) ────────────────────────────┐ │
│ │ Click zone in viewport or select below:                 │ │
│ │                                                         │ │
│ │ ▼ tip          [selected]                               │ │
│ │   Label:       [Tip____________]                        │ │
│ │   Sensitivity: ────────●────── 0.8                      │ │
│ │   Ticklishness:──●──────────── 0.3                      │ │
│ │   Pleasure:    ──────●──────── 0.5                      │ │
│ │   Stats: [+ Add Modifier]                               │ │
│ │     pleasure: 1.5x  [×]                                 │ │
│ │                                                         │ │
│ │ ▶ shaft                                                 │ │
│ │ ▶ base                                                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Animation ─────────────────────────────────────────────┐ │
│ │ Clip: [idle ▼]  [▶ Play] [⏸ Pause]  Speed: [1.0x]      │ │
│ │ ○────────────────●─────────────────○  0:02 / 0:05       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [Save to Tool] [Export JSON] [Test in Playground]          │
└─────────────────────────────────────────────────────────────┘
```

## Workflow

### Artist Workflow (Blender)

1. Create model in Blender
2. In Edit Mode, select vertices for each contact zone
3. Assign to vertex group (e.g., "tip", "shaft", "base")
4. Export as glTF with "Include > Vertex Groups" enabled

### Developer Workflow (Panel)

1. Open Model Inspector panel
2. Import glTF file
3. Panel auto-detects vertex groups as available zones
4. Switch to "Zones" mode
5. Click on model regions to select zones
6. Adjust properties for each zone
7. Export configuration to tool definition

## glTF Vertex Group Extraction

glTF stores vertex groups in mesh extras or as morph targets. Three.js can access them via:

```typescript
// Using useGLTF from drei
const { scene, nodes } = useGLTF('/models/tool.glb');

// Extract vertex groups from mesh userData
const mesh = nodes['ToolMesh'] as THREE.Mesh;
const vertexGroups = mesh.userData?.vertexGroups || [];

// Or from skinned mesh bone influences
if (mesh instanceof THREE.SkinnedMesh) {
  const skeleton = mesh.skeleton;
  // Bones often correspond to zones
}
```

Alternative: Use mesh names as zones (simpler):
```
In Blender: Name meshes as "zone_tip", "zone_shaft", "zone_base"
In Panel: Extract zones from mesh names starting with "zone_"
```

## Panel Registration

```typescript
// In panel registration
{
  id: 'model-inspector',
  title: 'Model Inspector',
  component: ModelInspectorPanel,
  category: 'tools',
  tags: ['3d', 'model', 'gltf', 'zones', 'tools'],
  icon: '📦',
  description: 'View 3D models, animations, and configure contact zones',
  supportsMultipleInstances: true,
}
```

## Console Integration

```typescript
// Register ops under pixsim.ops.models.*
pixsim.ops.models.load('/models/banana.glb')
pixsim.ops.models.listZones()
pixsim.ops.models.setZoneProperty('tip', 'sensitivity', 0.9)
pixsim.ops.models.exportConfig()
```

## Integration with Tool System

The exported `Tool3DModel` config integrates with the existing tool system:

```typescript
// In tool registry
const bananaTool: InteractiveTool = {
  id: 'banana',
  type: 'object',
  visual: {
    model: 'banana',        // 2D fallback
    model3D: {              // 3D config from Model Inspector
      url: '/models/banana.glb',
      scale: 1,
      zones: {
        tip: { sensitivity: 0.9, pleasure: 0.8, statModifiers: { pleasure: 1.5 } },
        shaft: { sensitivity: 0.6, pleasure: 0.5 },
        base: { sensitivity: 0.4 }
      }
    }
  },
  // ... rest of tool config
};
```

## Implementation Phases

### Phase 1: Basic Viewer
- [ ] Create Model3DViewport with OrbitControls
- [ ] glTF loader with drag-drop support
- [ ] Basic model display (solid/wireframe)
- [ ] Panel registration

### Phase 2: Zone System
- [ ] Extract zones from mesh names/vertex groups
- [ ] Zone highlighting on hover/select
- [ ] Zone property editor UI
- [ ] Export config functionality

### Phase 3: Animation
- [ ] Animation clip detection
- [ ] Play/pause/scrub controls
- [ ] Speed adjustment
- [ ] Loop modes

### Phase 4: Integration
- [ ] Console ops (pixsim.ops.models.*)
- [ ] Save to tool definition
- [ ] Test in playground mode
- [ ] Undo/redo for zone changes

## Notes

- **Format**: Prefer glTF/GLB over OBJ (better material/animation support)
- **Zone naming**: Use consistent prefix like `zone_` for auto-detection
- **Performance**: Use BVH acceleration for raycasting on complex meshes
- **Fallback**: Keep 2D visuals as fallback when 3D not available
