# Gizmo Surface Renderer - Usage Guide

## Overview

The Gizmo Surface Renderer system allows you to dynamically enable/disable gizmo overlays and debug dashboards in different contexts (Game2D, scene editor, playground, etc.).

## Quick Start

### 1. Using GizmoSurfaceRenderer in a Component

```tsx
import { GizmoSurfaceRenderer } from '@/gizmos/components/GizmoSurfaceRenderer';

function Game2D() {
  return (
    <div className="game-container">
      {/* Your game content */}
      <canvas ref={canvasRef} />

      {/* Render active gizmo overlays for Game2D context */}
      <GizmoSurfaceRenderer
        context="game-2d"
        componentType="overlay"
        className="absolute inset-0 pointer-events-none"
      />
    </div>
  );
}
```

### 2. Managing Surfaces in Dev Tools

Users can enable/disable surfaces via the **Gizmo Surfaces** panel in Dev Tools:

1. Open Dev Tools panel
2. Find "Gizmo Surfaces" (🎮 icon)
3. Expand a surface card
4. Toggle enable/disable for each context

### 3. Programmatically Controlling Surfaces

```tsx
import { useGizmoSurfaceStore } from '../../lib/gizmos';

function MyComponent() {
  const toggleSurface = useGizmoSurfaceStore((state) => state.toggleSurface);
  const isEnabled = useGizmoSurfaceStore((state) =>
    state.isSurfaceEnabled('game-2d', 'rings-gizmo')
  );

  return (
    <button onClick={() => toggleSurface('game-2d', 'rings-gizmo')}>
      {isEnabled ? 'Disable' : 'Enable'} Rings Gizmo
    </button>
  );
}
```

## Integration Examples

### Game2D Context

```tsx
// In Game2D.tsx or similar component

import { GizmoSurfaceRenderer } from '@/gizmos/components/GizmoSurfaceRenderer';

export function Game2D() {
  return (
    <div className="relative w-full h-full">
      {/* Game content */}
      <ScenePlayer />

      {/* Gizmo overlays (rings, orbs, constellations, etc.) */}
      <GizmoSurfaceRenderer
        context="game-2d"
        componentType="overlay"
        className="absolute inset-0 pointer-events-auto"
        componentProps={{
          // Props to pass to each gizmo component
          onResult: handleGizmoResult,
          videoElement: videoRef.current,
        }}
      />
    </div>
  );
}
```

### Scene Editor Context

```tsx
// In SceneEditor.tsx

import { GizmoSurfaceRenderer } from '@/gizmos/components/GizmoSurfaceRenderer';

export function SceneEditor() {
  return (
    <div className="editor-container">
      {/* Editor UI */}
      <EditorCanvas />

      {/* Scene gizmo overlays */}
      <GizmoSurfaceRenderer
        context="scene-editor"
        componentType="overlay"
        className="absolute top-0 left-0 w-full h-full pointer-events-auto"
      />

      {/* Debug panels (if needed) */}
      <div className="sidebar">
        <GizmoSurfaceRenderer
          context="scene-editor"
          componentType="panel"
        />
      </div>
    </div>
  );
}
```

### Playground/Sandbox Context

```tsx
// In SimulationPlayground.tsx

import { GizmoSurfaceRenderer } from '@/gizmos/components/GizmoSurfaceRenderer';

export function SimulationPlayground() {
  return (
    <div className="playground">
      {/* Main simulation view */}
      <SimulationView />

      {/* All types of surfaces can be active in playground */}
      <GizmoSurfaceRenderer
        context="playground"
        componentType="overlay"
        className="gizmo-overlays"
      />

      <aside className="debug-panels">
        <GizmoSurfaceRenderer
          context="playground"
          componentType="panel"
        />
      </aside>
    </div>
  );
}
```

## Available Surfaces

### Scene Gizmos (Overlays)

| Surface ID | Description | Contexts |
|------------|-------------|----------|
| `rings-gizmo` | Multi-layered orbital ring control | scene-editor, game-2d, playground |
| `orb-gizmo` | Crystalline sphere controller | scene-editor, game-2d, game-3d, playground |
| `constellation-gizmo` | Star field navigation | scene-editor, game-2d, game-3d, playground |
| `body-map-gizmo` | Interactive body zones | scene-editor, game-2d, playground |

### Debug Dashboards (Panels)

| Surface ID | Description | Contexts |
|------------|-------------|----------|
| `relationship-debug` | NPC relationship viewer | workspace, game-2d, playground |
| `world-tools-panel` | World tools container | workspace, game-2d, playground |

## Hooks

### `useGizmoSurfaceStore`

Access the gizmo surface state store directly:

```tsx
const store = useGizmoSurfaceStore();

// Enable a surface
store.enableSurface('game-2d', 'rings-gizmo');

// Disable a surface
store.disableSurface('game-2d', 'rings-gizmo');

// Toggle a surface
store.toggleSurface('game-2d', 'rings-gizmo');

// Check if enabled
const isEnabled = store.isSurfaceEnabled('game-2d', 'rings-gizmo');

// Get all enabled for a context
const enabled = store.getEnabledSurfaces('game-2d');

// Clear all for a context
store.clearContext('game-2d');
```

### `useEnabledGizmoSurfaces`

Get enabled surface definitions for a context:

```tsx
import { useEnabledGizmoSurfaces } from '@/gizmos/components/GizmoSurfaceRenderer';

const enabledSurfaces = useEnabledGizmoSurfaces('game-2d');
// Returns: GizmoSurfaceDefinition[]
```

### `useIsSurfaceEnabled`

Check if a specific surface is enabled:

```tsx
import { useIsSurfaceEnabled } from '@/gizmos/components/GizmoSurfaceRenderer';

const isRingsEnabled = useIsSurfaceEnabled('game-2d', 'rings-gizmo');
```

### `useToggleSurface`

Get the toggle function:

```tsx
import { useToggleSurface } from '@/gizmos/components/GizmoSurfaceRenderer';

const toggleSurface = useToggleSurface();

toggleSurface('game-2d', 'rings-gizmo');
```

## Adding New Surfaces

To add a new gizmo surface:

1. Create your gizmo component (e.g., `MyGizmo.tsx`)
2. Register it in `lib/gizmos/registerGizmoSurfaces.ts`:

```tsx
gizmoSurfaceRegistry.register({
  id: 'my-gizmo',
  label: 'My Gizmo',
  description: 'A custom gizmo',
  icon: '🎯',
  category: 'scene',
  overlayComponent: MyGizmo,
  supportsContexts: ['game-2d', 'playground'],
  tags: ['custom'],
  priority: 5,
});
```

3. Users can now enable it via the Gizmo Surfaces dev tool panel!

## State Persistence

The enabled/disabled state is automatically persisted to localStorage via Zustand's persist middleware. State persists across browser sessions.

**Storage key:** `gizmo-surface-state`
