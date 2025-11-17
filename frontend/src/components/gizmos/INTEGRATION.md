# Scene Gizmo Mini-Game Integration Guide

## Overview

The Scene Gizmo system provides interactive 3D controls for scene progression, particularly useful for erotic/intimate scenes where player agency enhances immersion.

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
import { InteractiveTool } from '../gizmos/InteractiveTool';

<InteractiveTool
  tool={{
    id: 'touch',
    type: 'touch',
    visual: { model: 'hand', ... },
  }}
  onPatternDetected={(pattern) => {
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

### Adding Custom Gizmos

```typescript
import { registerCustomGizmo } from '../../lib/gizmos/registry';

registerCustomGizmo({
  id: 'custom-wheel',
  name: 'Color Wheel',
  component: ColorWheelGizmo,
  category: 'control',
  defaultConfig: {
    zones: generateColorWheel(8),
    style: 'custom',
  },
});
```

### Adding Custom Tools

```typescript
import { registerCustomTool } from '../../lib/gizmos/registry';

registerCustomTool({
  id: 'silk',
  type: 'caress',
  visual: {
    model: 'silk',
    baseColor: 'rgba(255, 200, 255, 0.5)',
    particles: { type: 'petals', density: 0.6 },
  },
  // ... physics, feedback
});
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

## Next Steps

- Implement additional gizmo types (Rings, Helix)
- Add sound effects for interactions
- Create preset configurations
- Build analytics for player interaction patterns

For more examples, see `/components/examples/BrainShapeExample.tsx`