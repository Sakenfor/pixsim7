# Control Cubes - 3D Interactive Control System

## Overview

Control Cubes (3D Cube Widgets) are a spatial interface system that provides an innovative way to interact with the application. Each cube can be dragged around, rotated, expanded, combined with other cubes, and docked to panels for contextual controls.

**Key Innovation:** Cubes dynamically adapt to show panel-specific actions. When a cube docks to a panel, its faces automatically expose the actions that panel has registered, creating a truly contextual interface.

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

### 🎨 Dynamic Contextual Controls

**How it works:**
1. Panels register their available actions using `useRegisterPanelActions()`
2. When a cube docks to a panel, it queries the panel action registry
3. Cube faces automatically populate with the panel's actions
4. Each face becomes clickable and executes the associated action

**Example:** Gallery Panel Actions
- 🖼️ Grid View (front face)
- 🎨 Filter (left face)
- 📁 Organize (back face)
- 🗑️ Delete (right face)
- ⬆️ Upload (top face)
- ⬇️ Download (bottom face)

**Actions can:**
- Have keyboard shortcuts
- Be dynamically enabled/disabled
- Show tooltips with descriptions
- Execute sync or async operations
- Access panel state and methods

## Architecture

### Components

```
apps/main/src/
├── components/control/
│   ├── ControlCube.tsx                  # Base 3D cube component
│   ├── DraggableCube.tsx                # Draggable wrapper
│   ├── ControlCubeManager.tsx           # Multi-cube manager
│   └── CubeFaceContent.tsx              # Dynamic face content generator
├── stores/
│   └── controlCubeStore.ts              # Zustand state management
├── hooks/
│   ├── useCubeDocking.ts                # Panel docking logic
│   └── useRegisterPanelActions.ts       # Hook for panels to register actions
├── lib/
│   └── panelActions.ts                  # Panel action registry system
└── examples/
    └── GalleryPanelActionsExample.tsx   # Example integrations
```

### Dynamic Action System

The cube system uses a **Panel Action Registry** that enables true dynamic behavior:

1. **Panels register actions** at mount time
2. **Cubes query the registry** when docked
3. **Faces auto-generate** from registered actions
4. **Actions execute** when face is clicked

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

### Registering Panel Actions (For Panel Developers)

To make your panel's actions available to cubes:

```tsx
import { useRegisterPanelActions } from '@/hooks/useRegisterPanelActions';

function MyPanel() {
  // Register panel actions
  useRegisterPanelActions({
    panelId: 'my-panel',  // Must match data-panel-id attribute
    panelName: 'My Panel',
    actions: [
      {
        id: 'create',
        label: 'Create',
        icon: '➕',
        description: 'Create new item',
        face: 'front',  // Preferred face placement
        shortcut: 'Ctrl+N',
        execute: () => handleCreate(),
        enabled: () => canCreate(), // Optional: dynamic enable/disable
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: '🗑️',
        description: 'Delete selected items',
        face: 'right',
        execute: async () => {
          await handleDelete();
        },
      },
      // ... more actions (up to 6 faces)
    ],
    defaultFaces: {
      front: 'create',
      right: 'delete',
      // ... map actions to specific faces
    },
  });

  return (
    <div data-panel-id="my-panel">
      {/* Panel content */}
    </div>
  );
}
```

### Action Priority System

When a cube is docked, face content is determined by:
1. **Dynamic actions** from panel registry (highest priority)
2. **Static panel faces** (hardcoded for specific panels)
3. **Generic cube faces** (fallback based on cube type)

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

### Panel Integration Checklist

For a panel to work with cube widgets:

1. ✅ Add `data-panel-id` attribute to panel container
2. ✅ Call `useRegisterPanelActions()` hook
3. ✅ Define 1-6 actions with icons, labels, and execute functions
4. ✅ (Optional) Specify preferred face placement
5. ✅ (Optional) Add keyboard shortcuts
6. ✅ (Optional) Add dynamic enable/disable logic

**Minimal Example:**

```tsx
function SimplePanel() {
  useRegisterPanelActions({
    panelId: 'simple',
    panelName: 'Simple Panel',
    actions: [
      {
        id: 'action1',
        label: 'Action',
        icon: '⚡',
        execute: () => console.log('Action executed'),
      },
    ],
  });

  return <div data-panel-id="simple">Content</div>;
}
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
