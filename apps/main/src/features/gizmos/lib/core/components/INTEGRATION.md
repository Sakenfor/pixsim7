# Scene Gizmo Mini-Game Integration Guide

## Overview

The Scene Gizmo system provides interactive 3D controls for scene progression, particularly useful for erotic/intimate scenes where player agency enhances immersion.

The system uses a **canonical registry** architecture where:
- All gizmo/tool definitions live in `@pixsim7/scene-gizmos` (pure TypeScript, no React)
- Frontend "packs" register content by importing
- Editor UIs and playgrounds query the registry dynamically

## Registry & Pack System

### Loading Packs

To use gizmos and tools, import the pack loader:

```typescript
import { getAllGizmos, getAllTools } from '../../lib/gizmos/loadDefaultPacks';

// Now all default packs are registered:
// - Base pack: orb, constellation, touch, temperature, energy
// - Enhanced pack: feather
// - Water & Banana pack: water, banana

const gizmos = getAllGizmos();  // Returns all registered gizmos
const tools = getAllTools();    // Returns all registered tools
```

### Pack Structure

Packs are organized in dependency layers:

1. **Base Pack** (`apps/main/src/lib/gizmos/registry.ts`)
   - Core gizmos: orb, constellation
   - Basic tools: touch, temperature, energy

2. **Enhanced Pack** (`apps/main/src/lib/gizmos/registry-enhanced.ts`)
   - Extends base pack
   - Adds: feather tool

3. **Water & Banana Pack** (`apps/main/src/lib/gizmos/registry-water-banana.ts`)
   - Extends enhanced pack
   - Adds: water tool (liquid type), banana tool (object type)

4. **Romance Pack** (`apps/main/src/lib/gizmos/registry-romance.ts`)
   - Extends enhanced pack
   - Adds: body-map gizmo, caress/feather/silk/pleasure tools

Each pack:
- Imports `registerGizmo`/`registerTool` from `@pixsim7/scene-gizmos`
- Defines gizmos/tools as pure data objects
- Auto-registers them at import time
- Re-exports for direct access if needed

### Querying the Registry

```typescript
import {
  getAllGizmos,
  getGizmo,
  getAllTools,
  getTool,
  getGizmosByCategory,
  getToolsByType,
} from '@pixsim7/scene-gizmos';

// Get all gizmos
const allGizmos = getAllGizmos();

// Get specific gizmo
const orb = getGizmo('orb');

// Get gizmos by category
const controlGizmos = getGizmosByCategory('control');

// Get all tools
const allTools = getAllTools();

// Get specific tool
const water = getTool('water');

// Get tools by type
const touchTools = getToolsByType('touch');
const liquidTools = getToolsByType('liquid');
```

## Quick Start

### 1. Configure in Scene Graph Editor

1. Add a scene node
2. Open the Inspector panel
3. Select "Mini-Game" node type
4. Choose **"Scene Gizmo Controller"** from Game Type dropdown
5. Select your gizmo type:
   - **Crystal Orb**: Rotate to select segments
   - **Star Field**: Navigate through space
   - **Orbital Rings**: Ring-based selection
6. Set number of control zones (3-12)
7. Click "Apply Changes"

### 2. Scene Player Integration

The SceneGizmoMiniGame will automatically render when the scene reaches a node with:

```typescript
{
  miniGame: {
    id: 'sceneGizmo',
    config: {
      gameType: 'sceneGizmo',
      gizmoConfig: {
        type: 'orb',        // or 'constellation', 'rings'
        zoneCount: 6
      }
    }
  }
}
```

### 3. Using Results

The gizmo emits results as the player interacts:

```typescript
import type { GizmoResult } from '@pixsim7/scene-gizmos';

interface GizmoResult {
  segmentId?: string;      // Next segment to play
  intensity?: number;      // 0-1, player-controlled intensity
  speed?: number;          // Playback speed modifier
  transition?: 'cut' | 'fade' | 'smooth';
  tags?: string[];         // Additional segment tags
}
```

## Example Workflow

### Scenario: Intimate Scene with Intensity Control

```
Scene Graph:
1. [Start] → Initial dialogue
2. [MiniGame: SceneGizmo] → Interactive control
   - Orb with 6 zones representing different intensity levels
   - Player rotates to select, scrolls to adjust intensity
3. Zones map to segments:
   - Zone 1 → "gentle_touch.mp4"
   - Zone 2 → "caress.mp4"
   - Zone 3 → "kiss.mp4"
   - Zone 4 → "intimate.mp4"
   - Zone 5 → "intense.mp4"
   - Zone 6 → "climax.mp4"
4. [End] → Resolution based on player choices
```

### Configuration

```json
{
  "zones": [
    {
      "id": "zone1",
      "segmentId": "gentle_touch",
      "intensity": 0.2,
      "label": "Gentle",
      "color": "#00D9FF"
    },
    {
      "id": "zone2",
      "segmentId": "caress",
      "intensity": 0.4,
      "label": "Tender",
      "color": "#9333EA"
    },
    // ... more zones
  ],
  "style": "orb",
  "visual": {
    "particleType": "hearts",
    "glowIntensity": 0.7
  }
}
```

## Advanced Usage

### Custom Zone Mapping

Map zones to segments programmatically:

```typescript
const zones = generateZones({
  segments: [
    { id: 'intro', intensity: 0.1 },
    { id: 'buildup', intensity: 0.5 },
    { id: 'peak', intensity: 1.0 },
  ],
  gizmoType: 'orb',
});
```

### Gesture Detection

Use gestures to trigger special segments:

```typescript
{
  gestures: {
    swipeUp: { type: 'segment', value: 'increase_intensity' },
    swipeDown: { type: 'segment', value: 'decrease_intensity' },
    rotateClockwise: { type: 'speed', value: 1.2 },
    hold: { type: 'flag', value: 'player_paused' },
  }
}
```

### Interactive Tools

For diegetic interaction (player's touch in the scene):

```typescript
import type { InteractiveTool as ToolType, TouchPattern } from '@pixsim7/scene-gizmos';
import { InteractiveTool } from '../gizmos/InteractiveTool';

<InteractiveTool
  tool={{
    id: 'touch',
    type: 'touch',
    visual: { model: 'hand', ... },
  }}
  onPatternDetected={(pattern: TouchPattern) => {
    // 'circular', 'linear', 'tap', etc.
    triggerSegmentByPattern(pattern);
  }}
  onPressureChange={(pressure) => {
    // Adjust intensity based on pressure
    setIntensity(pressure);
  }}
/>
```

## Integration with Scene Progression

### Current Architecture

```
ScenePlayer
  ├─ Video playback
  ├─ Mini-game detection
  └─ SceneGizmoMiniGame (if miniGame.id === 'sceneGizmo')
       ├─ Renders appropriate gizmo
       ├─ Handles state changes
       └─ Emits GizmoResult
```

### Adding to Your Scene Player

```tsx
// In your ScenePlayer component
import { SceneGizmoMiniGame } from '@pixsim7/game-ui';

if (currentNode.miniGame?.id === 'sceneGizmo') {
  return (
    <>
      <video ref={videoRef} src={currentSegment.url} />
      <SceneGizmoMiniGame
        config={currentNode.miniGame.config}
        onResult={(result) => {
          // Transition to selected segment
          if (result.segmentId) {
            playSegment(result.segmentId, {
              intensity: result.intensity,
              transition: result.transition,
            });
          }
        }}
        videoElement={videoRef.current}
      />
    </>
  );
}
```

## Best Practices

1. **Zone Count**:
   - 3-6 zones for simple choices
   - 6-8 zones for nuanced control
   - 8-12 zones for expert/complex scenes

2. **Gizmo Selection**:
   - **Orb**: Best for intensity/variation control
   - **Constellation**: Good for exploration/discovery
   - **Rings**: Ideal for layered parameters

3. **Visual Feedback**:
   - Use colors to indicate intensity (cool → warm)
   - Add particles for atmosphere
   - Match glow intensity to scene mood

4. **Accessibility**:
   - Provide keyboard controls
   - Add labels to zones
   - Include visual hints for first-time users

## Extending the System

### Architecture Overview

The gizmo system uses a **canonical registry** in `@pixsim7/scene-gizmos` that serves as the single source of truth for all gizmos and tools. The system is organized into "packs" that register content at import time:

- **Base Pack** (`registry.ts`): Core gizmos (orb, constellation) and basic tools (touch, temperature, energy)
- **Enhanced Pack** (`registry-enhanced.ts`): Additional tools like feather
- **Water & Banana Pack** (`registry-water-banana.ts`): Liquid and object tools

### Adding Custom Gizmos

Create a new gizmo definition and register it using the canonical registry:

```typescript
import { registerGizmo, type GizmoDefinition } from '@pixsim7/scene-gizmos';
import { ColorWheelGizmo } from './ColorWheelGizmo';

export const colorWheelGizmo: GizmoDefinition = {
  id: 'color-wheel',
  name: 'Color Wheel',
  category: 'control',
  component: ColorWheelGizmo,
  description: 'Color-based zone selection with smooth transitions',
  tags: ['color', 'selection', 'visual'],

  defaultConfig: {
    style: 'custom',
    zones: generateColorWheel(8),
    visual: {
      baseColor: '#FFFFFF',
      activeColor: '#FF00FF',
      particleType: 'sparks',
    },
  },
};

// Auto-register on import
registerGizmo(colorWheelGizmo);

// Export for direct use if needed
export { colorWheelGizmo };
```

**To use the gizmo**: Simply import the pack file anywhere in your app to register it:

```typescript
// In your app initialization or component
import './lib/gizmos/custom-gizmos-pack';
```

### Adding Custom Tools

Define interactive tool metadata and register it at import time:

```typescript
import { registerTool, type InteractiveTool } from '@pixsim7/scene-gizmos';

export const silkTool: InteractiveTool = {
  id: 'silk',
  type: 'caress',

  visual: {
    model: 'silk',
    baseColor: 'rgba(255, 200, 255, 0.5)',
    activeColor: 'rgba(255, 150, 255, 0.8)',
    glow: true,
    trail: true,
    particles: {
      type: 'petals',
      density: 0.6,
      color: '#FFC0FF',
      lifetime: 2000,
    },
  },

  physics: {
    pressure: 0.3,
    speed: 0.6,
    pattern: 'wave',
  },

  feedback: {
    haptic: {
      type: 'wave',
      intensity: 0.4,
      duration: 150,
    },
    npcReaction: {
      expression: 'pleasure',
      vocalization: 'sigh',
      intensity: 0.6,
    },
  },
};

// Auto-register on import
registerTool(silkTool);
```

**The `InteractiveTool` component** automatically renders any tool based on its metadata - no per-tool components needed! The component reads `tool.visual.model` and renders the appropriate visual (hand, feather, water, banana, etc.).

To add a new tool visual, add it to `InteractiveTool.tsx`:

```typescript
// In InteractiveTool.tsx
function renderToolVisual() {
  switch (tool.visual.model) {
    case 'hand': return <HandVisual pressure={pressure} />;
    case 'feather': return <FeatherVisual />;
    case 'silk': return <SilkVisual />; // Add your new visual
    // ...
  }
}
```

### Creating a Gizmo Pack

Organize multiple gizmos/tools into a single pack file:

```typescript
// lib/gizmos/my-custom-pack.ts
import {
  registerGizmo,
  registerTool,
  type GizmoDefinition,
  type InteractiveTool,
} from '@pixsim7/scene-gizmos';

// Define your gizmos
export const customGizmo: GizmoDefinition = { /* ... */ };

// Define your tools
export const customTool: InteractiveTool = { /* ... */ };

// Auto-register everything
registerGizmo(customGizmo);
registerTool(customTool);

// Export collections for convenience
export const customGizmos = [customGizmo];
export const customTools = [customTool];
```

Then import the pack to activate it:

```typescript
import './lib/gizmos/my-custom-pack';
```

## Troubleshooting

### Gizmo Not Rendering

- Check that `gameType === 'sceneGizmo'` in node config
- Verify gizmo component is imported correctly
- Check browser console for errors

### No Segment Transitions

- Ensure `segmentId` is set in zone configuration
- Verify `onResult` callback is properly wired
- Check that segments exist in your media library

### Performance Issues

- Reduce particle count
- Use simpler gizmo types (orb < constellation)
- Disable physics/magnetism if not needed

## Gizmo Lab

The **Gizmo Lab** (`/gizmo-lab`) is an interactive playground for exploring all registered gizmos and tools.

### Features

- **Browse Registry**: View all registered gizmos and tools with filters by category/type
- **Gizmo Playground**: Test any gizmo with a live preview
- **Tool Playground**: Interact with tools on a test canvas
- **Real-time Info**: See pressure, patterns, and other tool metrics

### Usage

1. Navigate to `/gizmo-lab` in your browser
2. Select a gizmo or tool from the sidebar
3. Interact with it in the playground area
4. Check console for detailed output

The Lab automatically loads all packs using `loadDefaultPacks()` and queries the registry dynamically. It's perfect for:
- Testing new gizmos/tools before integrating them
- Understanding tool behaviors and visual properties
- Debugging interaction patterns
- Exploring what's available in the registry

### For Developers

The Gizmo Lab demonstrates best practices:
- Loading packs via `import { getAllGizmos, getAllTools } from '../../lib/gizmos/loadDefaultPacks'`
- Using registry queries to populate UI dynamically
- Rendering gizmos via `SceneGizmoMiniGame` component
- Rendering tools via generic `InteractiveTool` component

Check the source at `apps/main/src/routes/GizmoLab.tsx` for implementation details.

## Next Steps

- Implement additional gizmo types (Rings, Helix)
- Add sound effects for interactions
- Create preset configurations
- Build analytics for player interaction patterns
- Explore gizmos in the Gizmo Lab: `/gizmo-lab`