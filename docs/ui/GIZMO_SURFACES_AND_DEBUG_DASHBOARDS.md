# Gizmo Surfaces & Debug Dashboards

**Last Updated:** 2025-11-23

## Overview

The **Gizmo Surface System** provides a unified way to manage interactive gizmo overlays and debug dashboards across different contexts in the application. It allows users to dynamically enable/disable UI components, and enables plugins to contribute custom surfaces.

## What are Gizmo Surfaces?

A **Gizmo Surface** is a UI component that can be:
- Displayed as an **overlay** (in-scene gizmos like rings, orbs)
- Shown as a **panel** (debug dashboards, relationship viewers)
- Rendered in the **HUD** (heads-up display elements)

Surfaces can be enabled/disabled per **context** (scene-editor, game-2d, game-3d, playground, workspace, HUD).

## Available Gizmo Surfaces

### Scene Gizmos (Overlays)

#### Rings Gizmo
- **ID:** `rings-gizmo`
- **Icon:** ⭕
- **Description:** Multi-layered orbital ring control for scene navigation
- **Contexts:** scene-editor, game-2d, playground
- **Type:** Interactive scene control

#### Orb Gizmo
- **ID:** `orb-gizmo`
- **Icon:** 🔮
- **Description:** Crystalline sphere controller for scene navigation
- **Contexts:** scene-editor, game-2d, game-3d, playground
- **Type:** Interactive scene control

#### Constellation Gizmo
- **ID:** `constellation-gizmo`
- **Icon:** ✨
- **Description:** Star field navigation controller for segment selection
- **Contexts:** scene-editor, game-2d, game-3d, playground
- **Type:** Interactive scene control

#### Body Map Gizmo
- **ID:** `body-map-gizmo`
- **Icon:** 🫱
- **Description:** Interactive body zones for romance/sensual interactions
- **Contexts:** scene-editor, game-2d, playground
- **Type:** Interactive scene control
- **Requires:** `intimacy-scenes` feature

### Debug Dashboards (Panels)

#### Relationship Dashboard
- **ID:** `relationship-debug`
- **Icon:** 💕
- **Description:** View and debug NPC relationships, affinity, and intimacy levels
- **Contexts:** workspace, game-2d, playground
- **Type:** NPC debugging

#### World Tools Panel
- **ID:** `world-tools-panel`
- **Icon:** 🌍
- **Description:** Container for world tool plugins (quests, inventory, mood, etc.)
- **Contexts:** workspace, game-2d, playground
- **Type:** World debugging

## User Guide

### Enabling/Disabling Surfaces

1. **Open Dev Tools**
   - Navigate to the Dev Tools panel in your workspace

2. **Find Gizmo Surfaces**
   - Look for the "Gizmo Surfaces" tool (🎮 icon)
   - Click to open the panel

3. **Browse Surfaces**
   - Filter by Category: scene, world, npc, debug, custom
   - Filter by Context: scene-editor, game-2d, game-3d, playground, workspace

4. **Enable a Surface**
   - Expand a surface card
   - In the "Enable/Disable per Context" section
   - Click the button next to your desired context
   - Button will show "✓ Enabled" when active

5. **View Active Gizmos**
   - Look for the gizmo indicator in the corner (🎮 icon)
   - Click to see which gizmos are currently active
   - Indicator only appears when at least one gizmo is enabled

### Tips

- **Start Simple**: Try enabling one gizmo at a time to understand how it works
- **Context Matters**: A gizmo must support a context to be enabled in it
- **Performance**: Multiple complex gizmos may impact performance
- **Persistence**: Your settings are saved and will persist across sessions

## Developer Guide

### Registering a New Gizmo Surface

To add a new gizmo surface to the registry:

```ts
// In src/lib/gizmos/registerGizmoSurfaces.ts

import { MyNewGizmo } from '../../components/gizmos/MyNewGizmo';

gizmoSurfaceRegistry.register({
  id: 'my-new-gizmo',
  label: 'My New Gizmo',
  description: 'What this gizmo does',
  icon: '🎯',
  category: 'scene', // or 'world', 'npc', 'debug', 'custom'

  // Provide the component(s)
  overlayComponent: MyNewGizmo,  // For in-scene overlays
  // panelComponent: MyNewPanel,  // For sidebar panels
  // hudComponent: MyHudElement,  // For HUD elements

  // Specify supported contexts
  supportsContexts: ['game-2d', 'playground'],

  // Optional metadata
  tags: ['interactive', 'visual'],
  priority: 5,
  defaultEnabled: false,

  // Optional requirements
  requires: {
    features: ['some-feature'],
    permissions: ['some-permission'],
  },
});
```

### Creating a Gizmo Component

Gizmo components should implement the `GizmoComponentProps` interface:

```tsx
import type { GizmoComponentProps } from '@pixsim7/scene.gizmos';

export function MyNewGizmo({
  config,
  state,
  onStateChange,
  onAction,
  isActive,
}: GizmoComponentProps) {
  return (
    <div className="my-gizmo">
      {/* Your gizmo UI */}
      {config.zones.map(zone => (
        <button
          key={zone.id}
          onClick={() => onAction({
            type: 'segment',
            value: zone.segmentId || '',
            transition: 'smooth',
          })}
        >
          {zone.label}
        </button>
      ))}
    </div>
  );
}
```

### Integrating with a Context

To render active gizmo surfaces in your component:

```tsx
import { GizmoSurfaceRenderer, ActiveGizmosIndicator } from './components/gizmos';

export function MyContext() {
  return (
    <div className="relative w-full h-full">
      {/* Your main content */}
      <MainContent />

      {/* Render active gizmo overlays */}
      <GizmoSurfaceRenderer
        context="game-2d"
        componentType="overlay"
        componentProps={{
          // Props passed to each gizmo
          onResult: handleGizmoResult,
          videoElement: videoRef.current,
        }}
      />

      {/* Show indicator */}
      <ActiveGizmosIndicator
        context="game-2d"
        position="top-right"
      />
    </div>
  );
}
```

## Plugin Author Guide

Plugins can contribute custom gizmo surfaces to the system.

### Creating a Gizmo Surface Plugin

```ts
// my-plugin/src/registerMyGizmo.ts

import { registerGizmoSurface } from '@pixsim7/main/lib/plugins/registryBridge';
import { MyCustomGizmo } from './MyCustomGizmo';

export function registerMyCustomGizmoSurface() {
  registerGizmoSurface({
    id: 'plugin-my-custom-gizmo',
    label: 'My Custom Gizmo',
    description: 'A custom gizmo from my plugin',
    icon: '🎯',
    category: 'custom',
    overlayComponent: MyCustomGizmo,
    supportsContexts: ['game-2d', 'playground'],
    tags: ['plugin', 'custom'],
  }, {
    origin: 'plugin-dir',  // or 'ui-bundle'
    activationState: 'active',
    canDisable: true,
    metadata: {
      author: 'Your Name',
      version: '1.0.0',
      description: 'My awesome gizmo plugin',
    },
  });
}
```

### Plugin Discovery

For auto-discovery, add your pattern to `src/lib/plugins/discoveryConfigs.ts`:

```ts
{
  family: 'gizmo-surface',
  patterns: ['plugins/gizmos/register*.ts'],
  origin: 'plugin-dir',
  extractionMode: 'named-export',
  exportPattern: 'register*GizmoSurface',
  eager: true,
}
```

Then your `registerMyCustomGizmoSurface` function will be auto-discovered and called!

## Architecture

```
┌─────────────────────────────────────────────┐
│  User                                       │
└─────────────┬───────────────────────────────┘
              │
              │ enables/disables
              ▼
┌─────────────────────────────────────────────┐
│  GizmoSurfacesPanel (Dev Tools)             │
│  - Filter by category/context               │
│  - Enable/disable toggles                   │
└─────────────┬───────────────────────────────┘
              │
              │ updates
              ▼
┌─────────────────────────────────────────────┐
│  GizmoSurfaceStore (Zustand)                │
│  - Enabled surfaces per context             │
│  - Persisted to localStorage                │
└─────────────┬───────────────────────────────┘
              │
              │ reads
              ▼
┌─────────────────────────────────────────────┐
│  GizmoSurfaceRenderer                       │
│  - Reads enabled surfaces for context       │
│  - Renders active components                │
└─────────────┬───────────────────────────────┘
              │
              │ renders
              ▼
┌─────────────────────────────────────────────┐
│  Gizmo Component (Overlay/Panel/HUD)        │
│  - RingsGizmo, OrbGizmo, etc.               │
│  - Custom plugin gizmos                     │
└─────────────────────────────────────────────┘
```

## API Reference

### GizmoSurfaceDefinition

```ts
interface GizmoSurfaceDefinition {
  id: GizmoSurfaceId;
  label: string;
  description?: string;
  icon?: string;
  category?: 'scene' | 'world' | 'npc' | 'debug' | 'custom';

  // Components
  panelComponent?: React.ComponentType<any>;
  overlayComponent?: React.ComponentType<any>;
  hudComponent?: React.ComponentType<any>;

  // Context support
  supportsContexts?: GizmoSurfaceContext[];

  // Metadata
  tags?: string[];
  defaultEnabled?: boolean;
  priority?: number;
  requires?: {
    features?: string[];
    permissions?: string[];
  };
}
```

### Hooks

**`useGizmoSurfaceStore`**
```ts
const store = useGizmoSurfaceStore();

store.enableSurface(context, surfaceId);
store.disableSurface(context, surfaceId);
store.toggleSurface(context, surfaceId);
store.isSurfaceEnabled(context, surfaceId);
store.getEnabledSurfaces(context);
```

**`useEnabledGizmoSurfaces(context)`**
```ts
const enabled = useEnabledGizmoSurfaces('game-2d');
// Returns: GizmoSurfaceDefinition[]
```

**`useIsSurfaceEnabled(context, surfaceId)`**
```ts
const isEnabled = useIsSurfaceEnabled('game-2d', 'rings-gizmo');
// Returns: boolean
```

## Best Practices

### For Gizmo Developers

1. **Single Responsibility**: Each gizmo should have one clear purpose
2. **Performance**: Avoid expensive operations in render loops
3. **Cleanup**: Clean up event listeners and timers on unmount
4. **Context Awareness**: Only support contexts where your gizmo makes sense
5. **Defaults**: Provide sensible default configurations

### For Plugin Authors

1. **Unique IDs**: Use prefixes to avoid conflicts (e.g., `my-plugin-gizmo-name`)
2. **Metadata**: Provide clear descriptions and icons
3. **Graceful Degradation**: Handle missing features/permissions gracefully
4. **Testing**: Test your gizmo in all supported contexts
5. **Documentation**: Document what your gizmo does and how to use it

### For Users

1. **Start Small**: Enable one gizmo at a time
2. **Context Appropriate**: Use scene gizmos in scene contexts, debug panels in workspace
3. **Performance**: Disable unused gizmos to maintain performance
4. **Experiment**: Try different combinations to find what works for you

## Troubleshooting

### Gizmo not appearing

1. Check if the surface is enabled for the current context
2. Verify the surface supports the current context
3. Check browser console for errors
4. Ensure required features/permissions are available

### Performance issues

1. Disable complex gizmos you're not using
2. Check for console warnings about performance
3. Reduce number of active gizmos
4. Report performance issues with specific gizmo/context combinations

### State not persisting

1. Check browser localStorage is not disabled
2. Verify localStorage key `gizmo-surface-state` exists
3. Try clearing the state and re-enabling surfaces
4. Check browser console for persistence errors

## Related Documentation

- [ADR: Gizmo Architecture](./ADR-GIZMO-ARCHITECTURE.md)
- [Gizmo Component Usage](../apps/main/src/components/gizmos/README.md)
- [Plugin System Guide](./systems/plugins/PLUGIN_SYSTEM.md)
- [Dev Tools Guide](./DEV_TOOLS.md)

## Future Enhancements

Potential future improvements:

- [ ] Gizmo presets (save/load combinations of enabled gizmos)
- [ ] Per-scene gizmo configurations
- [ ] Gizmo performance metrics
- [ ] Gizmo keyboard shortcuts
- [ ] Visual gizmo editor
- [ ] Gizmo marketplace/sharing
