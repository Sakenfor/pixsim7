# PixSim7 Semantic Shapes Integration Guide

## Overview

The Semantic Shapes system provides a unified visual language for PixSim7's UI, transforming abstract data into meaningful 3D visualizations. This guide shows how to integrate the NPC Brain Shape and extend the system with new semantic shapes.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Semantic Shapes System                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Core Types           Shapes              Components   │
│  ┌──────────┐      ┌──────────┐      ┌──────────────┐│
│  │          │      │  Brain   │      │ BrainShape   ││
│  │ PixSim7  │─────>│  Portal  │─────>│ PortalShape  ││
│  │  Core    │      │  Prism   │      │ PrismShape   ││
│  │          │      │  Matrix  │      │ MatrixShape  ││
│  └──────────┘      └──────────┘      └──────────────┘│
│       ↑                  ↑                    ↑        │
│       │                  │                    │        │
│  Headless Data      Shape Registry       React/3D/CLI  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Basic Brain Shape Usage

```tsx
import { BrainShape } from './components/shapes/BrainShape';
import { mockCore } from './lib/core/mockCore';

function NPCEditor() {
  const [npcId] = useState(1);
  const [brainState, setBrainState] = useState(null);
  const [activeFace, setActiveFace] = useState('cortex');

  useEffect(() => {
    // Load initial state
    mockCore.loadSession(1).then(() => {
      setBrainState(mockCore.getNpcBrainState(npcId));
    });

    // Subscribe to updates
    const unsubscribe = mockCore.on('npcBrainChanged', (payload) => {
      if (payload.npcId === npcId) {
        setBrainState(payload.brain);
      }
    });

    return unsubscribe;
  }, [npcId]);

  return (
    <BrainShape
      npcId={npcId}
      brainState={brainState}
      onFaceClick={setActiveFace}
      activeFace={activeFace}
      style="holographic"
    />
  );
}
```

### 2. Using the Shape Registry

```typescript
import { ShapeRegistry } from '@pixsim7/semantic-shapes';

// Get a shape definition
const brainShape = ShapeRegistry.get('brain');
const portalShape = ShapeRegistry.get('portal');

// Get all NPC-related shapes
const npcShapes = ShapeRegistry.getByCategory('npc');

// Create a shape instance with data
const brainInstance = ShapeRegistry.instantiate('brain', brainState);
const faces = brainInstance.getFaces();
const pulseRate = brainInstance.getBehavior('pulseRate');
```

### 3. Applying Sci-Fi Theme

```tsx
import { sciFiTheme } from './lib/theme/scifi-tokens';

// Use design tokens
const PanelComponent = styled.div`
  ${sciFiTheme.components.panel.base}

  &:hover {
    ${sciFiTheme.components.panel.hover}
  }
`;

// Apply colors
const glowColor = sciFiTheme.colors.glow.cyan;
const semanticColor = sciFiTheme.colors.semantic.personality;

// Use animations
const animationDuration = sciFiTheme.animations.durations.normal;
const easing = sciFiTheme.animations.easings.spring;

// Generate effects
const neonGlow = sciFiTheme.utils.neonGlow('#00D9FF', 1.5);
```

## Creating a New Semantic Shape

### Step 1: Define the Shape

```typescript
// lib/shapes/customShape.ts
import { SemanticShape } from '@pixsim7/semantic-shapes';

export const customShape: SemanticShape = {
  id: 'custom',
  name: 'Custom Shape',
  type: 'semantic',
  category: 'system',

  faces: {
    face1: {
      id: 'face1',
      label: 'Face 1',
      color: 'blue',
      icon: 'icon-name',
      interactions: ['action1', 'action2'],
    },
    // ... more faces
  },

  connections: [
    { from: 'face1', to: 'face2', label: 'Data flow' },
  ],

  behaviors: {
    pulseRate: (data) => 60 + data.activity * 10,
    glowIntensity: (data) => data.importance / 100,
  },

  visual: {
    baseGeometry: 'cube',
    defaultStyle: 'holographic',
    size: { min: 200, default: 300, max: 500 },
    complexity: 'moderate',
  },
};
```

### Step 2: Register the Shape

```typescript
import { ShapeRegistry } from '@pixsim7/semantic-shapes';
import { customShape } from './lib/shapes/customShape';

// Register on app initialization
ShapeRegistry.register(customShape);
```

### Step 3: Create React Component

```tsx
// components/shapes/CustomShape.tsx
import { SemanticShapeInstance } from '@pixsim7/semantic-shapes';

interface CustomShapeProps {
  data: any;
  onFaceClick: (face: string) => void;
  style?: 'holographic' | 'organic' | 'circuit';
}

export const CustomShape: React.FC<CustomShapeProps> = ({
  data,
  onFaceClick,
  style = 'holographic',
}) => {
  const instance = new SemanticShapeInstance(customShape, data);
  const faces = instance.getFaces();
  const pulseRate = instance.getBehavior('pulseRate');

  return (
    <div className={`custom-shape shape-style-${style}`}>
      {Object.entries(faces).map(([id, face]) => (
        <div
          key={id}
          className={`shape-face face-${id}`}
          onClick={() => onFaceClick(id)}
          style={{ color: face.color }}
        >
          {face.label}
        </div>
      ))}
    </div>
  );
};
```

## Integration with PixCubes

The semantic shapes can be integrated with PixCubes for spatial UI:

```typescript
// Extend PixCubes with semantic shapes
import { createExtendedCubeStore } from 'pixcubes';

const useSemanticCubeStore = create((set, get) => {
  const baseStore = createExtendedCubeStore(set, get);

  return {
    ...baseStore,

    // Add semantic shape support
    addSemanticCube: (shapeId: string, data: any, position: {x: number, y: number}) => {
      const shape = ShapeRegistry.get(shapeId);
      if (!shape) return;

      // Create cube with semantic metadata
      baseStore.addCube({
        position,
        mode: shape.category,
        metadata: {
          shapeId,
          shapeData: data,
        },
      });
    },
  };
});
```

## Connecting to Headless Core

When the real `@pixsim7/game.engine` is ready:

```typescript
// Replace mock with real core
import { PixSim7Core } from '@pixsim7/game.engine';

const core = new PixSim7Core({
  api: apiClient,
  storage: storageProvider,
  auth: authProvider,
});

// Use same interface
core.loadSession(sessionId);
core.on('npcBrainChanged', handleBrainChange);
core.applyNpcBrainEdit(npcId, edits);
```

## Styling Guidelines

### Visual Styles

1. **Holographic** - Default sci-fi look
   - Translucent panels with glow
   - Scan lines and particle effects
   - Neon color accents

2. **Organic** - Natural, flowing
   - Morphing shapes
   - Gradient transitions
   - Soft edges

3. **Circuit** - Technical, precise
   - Grid patterns
   - Sharp angles
   - Data flow visualization

### Color Semantics

```typescript
// Use consistent colors for meaning
const colorMeanings = {
  // States
  active: sciFiTheme.colors.sim.active,     // Cyan
  error: sciFiTheme.colors.sim.error,       // Pink
  success: sciFiTheme.colors.sim.success,   // Green

  // NPC Aspects
  personality: '#9333EA',  // Purple
  memory: '#3B82F6',       // Blue
  emotion: '#EF4444',      // Red
  logic: '#22C55E',        // Green
  social: '#06B6D4',       // Cyan
};
```

## Performance Considerations

1. **Use CSS transforms** for 3D positioning (GPU accelerated)
2. **Limit particle effects** to active shapes
3. **Implement LOD** for complex shapes based on zoom level
4. **Debounce rapid state updates** from the core
5. **Use React.memo** for shape components

## Example Routes

Add to your router to see the examples:

```tsx
// App.tsx or routes config
import { BrainShapeExample } from './components/examples/BrainShapeExample';

<Route path="/brain-example" element={<BrainShapeExample />} />
```

## Next Steps

1. **Switch to Sonnet** to implement:
   - NPC Brain Editor with face panels
   - Individual face editor components
   - Core event integration

2. **Extend the system** with:
   - Portal shape for mode switching
   - Matrix shape for inventory
   - Constellation shape for relationships

3. **Polish the experience**:
   - Add sound effects for interactions
   - Implement keyboard navigation
   - Add accessibility features

## Resources

- Core Types: `@pixsim7/game.engine`
- Shape Registry: `@pixsim7/semantic-shapes`
- Sci-Fi Theme: `/lib/theme/scifi-tokens.ts`
- Brain Shape Component: `/components/shapes/BrainShape.tsx`
- Example Implementation: `/components/examples/BrainShapeExample.tsx`

## Support

For questions about:
- **Visual Design**: Use Opus for creative decisions
- **Implementation**: Use Sonnet for coding tasks
- **Architecture**: Discuss with the team for major changes

---

*Remember: Shapes should be semantic - they represent meaning, not just geometry!*