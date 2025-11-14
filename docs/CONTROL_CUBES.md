# Control Cubes - 3D Interactive Control System

## Overview

Control Cubes are a 3D CSS-based interface system that provides an innovative way to interact with the application. Each cube can be dragged around, rotated, expanded, combined with other cubes, and docked to panels for contextual controls.

## Features

### 🎲 Multiple Cube Types

- **Control Cube** (Blue) - Quick actions and main controls
- **Provider Cube** (Green) - Provider management and configuration
- **Preset Cube** (Orange) - Preset management
- **Panel Cube** (Cyan) - Panel layout controls
- **Settings Cube** (Gray) - Settings and configuration

### ✨ Cube Modes

- **Idle** - Default state, draggable and interactive
- **Rotating** - Auto-rotating animation
- **Expanded** - Larger size with glow effects
- **Combined** - Multiple cubes merged together
- **Docked** - Attached to a panel with contextual controls

### 🎮 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Space` | Summon/dismiss all cubes |
| `Ctrl+Shift+C` | Add a new control cube |
| `Ctrl+Shift+P` | Add a new provider cube |
| `Arrow Keys` | Rotate active cube to different faces |
| `R` | Toggle auto-rotation mode |
| `E` | Toggle expanded mode |

### 🔧 Interactive Features

#### 1. Dragging
- Click and drag any cube to move it around
- Cubes maintain their z-index (layer order)
- Active cube comes to front

#### 2. Face Rotation
- Each cube has 6 faces with different content
- Click a face to rotate the cube to that face
- Use arrow keys for keyboard navigation

#### 3. Combining Cubes
- Drag cubes close together (within 120px)
- They automatically combine into one unit
- Pull them apart to separate

#### 4. Panel Docking
- Drag a cube near any panel edge
- Cube snaps and docks to that panel
- Face content changes to show panel-specific controls
- Docked cubes show a 📌 indicator

### 🎨 Contextual Controls

When docked to specific panels, cubes adapt their face content:

#### Gallery Panel
- 🖼️ Gallery view
- 🎨 Filter assets
- 📁 Folder navigation
- 🗑️ Delete items
- ⬆️ Upload
- ⬇️ Download

#### Scene Builder
- 🎬 Scene controls
- 🎭 Layer management
- 🎨 Paint tools
- 🔧 Tool selection
- ➕ Add elements
- 🎯 Select mode

#### Graph Panel
- 📊 Graph view
- 🔗 Connection tools
- ➕ Add nodes
- ✂️ Cut/disconnect
- 📋 Copy nodes
- 🗑️ Delete nodes

## Architecture

### Components

```
frontend/src/
├── components/control/
│   ├── ControlCube.tsx           # Base 3D cube component
│   ├── DraggableCube.tsx         # Draggable wrapper
│   ├── ControlCubeManager.tsx    # Multi-cube manager
│   └── CubeFaceContent.tsx       # Contextual face content
├── stores/
│   └── controlCubeStore.ts       # Zustand state management
└── hooks/
    └── useCubeDocking.ts         # Panel docking logic
```

### State Management

Uses Zustand with localStorage persistence:

```typescript
interface CubeState {
  id: string;
  type: CubeType;
  position: { x: number; y: number };
  rotation: { x: number; y: number; z: number };
  scale: number;
  mode: CubeMode;
  visible: boolean;
  activeFace: CubeFace;
  dockedToPanelId?: string;
  zIndex: number;
}
```

### CSS 3D Transforms

Cubes use pure CSS 3D transforms with `preserve-3d`:

```css
.cube {
  transform-style: preserve-3d;
  transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg);
  transition: transform 500ms;
}

.cube-face {
  position: absolute;
  transform: translateZ(50px) /* or rotate + translate */;
}
```

### Animations

Custom Tailwind animations defined in `tailwind.config.ts`:

- `spin-slow` - 8s infinite rotation
- `pulse-glow` - Pulsing opacity/scale effect
- `float` - Gentle up/down motion

## Usage

### Basic Usage

The cube system is automatically initialized when authenticated. Click the 🎲 button in the bottom-right or press `Ctrl+Space` to summon cubes.

### Adding Cubes Programmatically

```typescript
import { useControlCubeStore } from '@/stores/controlCubeStore';

function MyComponent() {
  const addCube = useControlCubeStore((s) => s.addCube);

  const handleAddCube = () => {
    const cubeId = addCube('control', { x: 100, y: 100 });
    console.log('Created cube:', cubeId);
  };

  return <button onClick={handleAddCube}>Add Cube</button>;
}
```

### Customizing Face Content

```typescript
import { getCubeFaceContent } from '@/components/control/CubeFaceContent';

const faceContent = getCubeFaceContent('control', 'gallery');
// Returns contextual content for control cube docked to gallery panel
```

### Docking to Panels

Panels need a `data-panel-id` attribute for docking to work:

```tsx
<div data-panel-id="my-panel" className="...">
  {/* Panel content */}
</div>
```

## Future Enhancements

### Planned Features

- [ ] **3D Carousel View** - Rotating gallery of images/presets
- [ ] **WebGL Upgrade** - Migrate to React Three Fiber for advanced effects
- [ ] **Cube Morphing** - Animate between different shapes
- [ ] **Multi-cube Formations** - Complex arrangements of combined cubes
- [ ] **Voice Commands** - Control cubes with voice
- [ ] **Haptic Feedback** - Vibration on interactions (mobile)
- [ ] **Gesture Controls** - Touch gestures for rotation/scaling
- [ ] **Cube Themes** - Different visual styles per user preference

### Library Migration Path

Current: CSS 3D Transforms + react-draggable
Future: React Three Fiber + @pmndrs/uikit for full 3D/VR/AR support

## Performance

- **Lightweight**: Pure CSS transforms (GPU accelerated)
- **No WebGL overhead**: Uses browser's native 3D CSS
- **Efficient rendering**: Only visible cubes are rendered
- **Smooth animations**: CSS transitions at 60fps

## Browser Support

- ✅ Chrome/Edge (88+)
- ✅ Firefox (91+)
- ✅ Safari (14+)
- ⚠️ Requires `transform-style: preserve-3d` support

## Troubleshooting

### Cubes not appearing
- Press `Ctrl+Space` to summon them
- Check browser console for errors
- Verify authentication state

### Docking not working
- Ensure panels have `data-panel-id` attribute
- Check DOCK_SNAP_DISTANCE in useCubeDocking.ts
- Verify panel rectangles are calculated correctly

### Performance issues
- Reduce number of active cubes
- Disable auto-rotate mode
- Check for conflicting z-index styles

## Credits

Built with:
- React 19
- TypeScript
- Tailwind CSS
- react-draggable
- Zustand

Inspired by:
- CSS 3D Transforms (David DeSandro)
- react-mosaic-component
- Modern spatial computing interfaces
