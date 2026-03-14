# Panel Definitions

This directory contains self-contained panel definitions that are automatically discovered and registered at startup.

## Quick Start

To add a new panel:

1. Create a folder: `domain/definitions/my-panel/`
2. Add the definition: `domain/definitions/my-panel/index.ts` (or `index.tsx` if you want the component inline)
3. Optional: add your component in a separate file (ex: `domain/definitions/my-panel/MyPanel.tsx`)

```typescript
// domain/definitions/my-panel/index.ts
import { definePanel } from '../../../lib/definePanel';
import { MyPanel } from './MyPanel';

export default definePanel({
  id: 'my-panel',
  title: 'My Panel',
  category: 'tools',
  component: MyPanel,

  // Where this panel can appear (omit for everywhere)
  availableIn: ['asset-viewer', 'workspace'],

  // Optional: Only show when condition is met
  showWhen: (ctx) => !!ctx.currentAsset,
});
```

That's it! The panel will be automatically discovered and registered.

## `definePanel` Options

```typescript
definePanel({
  // Required
  id: string;           // Unique panel ID
  title: string;        // Display title
  component: Component; // React component

  // Categorization (defaults shown)
  category?: 'tools';   // 'workspace' | 'tools' | 'scene' | 'game' | 'dev' | 'utilities'
  tags?: [];            // Searchable tags
  icon?: string;        // Icon name
  description?: string; // Tooltip/search description

  // Dock scoping
  availableIn?: [];     // Which docks: ['asset-viewer', 'workspace', ...] (omit = everywhere)

  // Visibility
  showWhen?: (ctx) => boolean;  // Conditional visibility
  requiresContext?: false;      // Whether panel needs context to render

  // Capabilities
  supportsCompactMode?: false;
  supportsMultipleInstances?: false;

  // Settings
  defaultSettings?: {};
  settingsVersion?: number;

  // Internal (hidden from user lists)
  internal?: false;
});
```

## Navigation Open Preference

Panels can define how ActivityBar generated sub-navigation opens them:

```typescript
export default definePanel({
  id: 'my-panel',
  title: 'My Panel',
  component: MyPanel,
  navigation: {
    openPreference: 'dock-preferred', // default
    // openPreference: 'float-preferred',
    // openPreference: 'route-preferred',
    // openRoute: '/workspace?openPanel=my-panel',
  },
});
```

- `dock-preferred`: open in workspace dock when available; fallback to floating.
- `float-preferred`: always open as floating panel.
- `route-preferred`: navigate to `openRoute` (or panel route fallback).

`Ctrl/Cmd+Click` on sub-navigation still forces route navigation.

## Dock Scoping (`availableIn`)

The `availableIn` array determines which dockview containers a panel can appear in.
This is the single source of truth for panel discovery — each container uses `dockId`
on `PanelHostDockview`, which filters panels by their `availableIn` values.

```typescript
// Only in asset viewer
availableIn: ['asset-viewer']

// In asset viewer AND workspace
availableIn: ['asset-viewer', 'workspace']

// Available everywhere (default when omitted)
// availableIn: undefined
```

Current dockview containers: `workspace`, `control-center`, `asset-viewer`, `gizmo-lab`, `prompt-authoring`.

### Sub-panels for a dockview container

When creating sub-panels that belong to a specific container (e.g. a panel with
`orchestration.type: 'dockview-container'`), set `availableIn` and `internal: true`:

```typescript
export default definePanel({
  id: 'my-sub-panel',
  title: 'My Sub Panel',
  component: MySubPanel,
  availableIn: ['my-container'],
  internal: true,
  supportsMultipleInstances: false,
});
```

## Directory Structure

```
domain/definitions/
????????? README.md                          # This file
????????? interactive-surface/               # Example panel
???   ????????? index.ts                       # Panel definition (exports default)
???   ????????? index.tsx                      # Alternative: definition + component inline (use one)
???   ????????? InteractiveSurfacePanel.tsx    # Panel component (optional if using index.tsx)
????????? my-other-panel/
???   ????????? index.ts
???   ????????? MyOtherPanel.tsx
???   ????????? components/                    # Panel-specific components
???       ????????? Toolbar.tsx
```

## How Auto-Discovery Works

At startup, `initializePanels()` calls `autoRegisterPanels()` which:

1. Uses Vite's `import.meta.glob` to find all `domain/definitions/*/index.ts` and `domain/definitions/*/index.tsx` files
2. Imports each module's default export (the `PanelDefinition`)
3. Registers each panel in the plugin catalog via `registerPluginDefinition()`
4. Logs the discovery process for debugging

## Backward Compatibility

Existing panels registered via legacy plugins continue to work. The auto-discovery system runs after plugin loading, so manually registered panels take precedence.

## Best Practices

1. **One panel per folder** - Keep each panel self-contained
2. **Co-locate components** - Put panel-specific components in the same folder
3. **Use contexts** - Specify where your panel should appear
4. **Export types** - Export your panel's props/context types for consumers

```typescript
// index.ts
export default definePanel({ ... });

// Re-export for direct imports
export { MyPanel } from './MyPanel';
export type { MyPanelProps, MyPanelContext } from './MyPanel';
```

## Migration from Legacy Patterns

If you have a panel in `components/helpers/` or registered in a plugin:

1. Create the folder in `domain/definitions/`
2. Move the component file
3. Create `index.ts` with `definePanel()`
4. Remove from the plugin's `panels` array
5. Update imports to use the new location (or keep re-exports for compatibility)
