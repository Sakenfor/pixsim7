# Capability Registry & Plugin Catalog Integration

This document describes the integration between the **Capability Registry** and **Plugin Catalog** systems in PixSim7.

## Table of Contents

1. [Overview](#overview)
2. [Separation of Concerns](#separation-of-concerns)
3. [Linking Capabilities to Plugins](#linking-capabilities-to-plugins)
4. [Plugin Adapter API](#plugin-adapter-api)
5. [Security & Trust Boundaries](#security--trust-boundaries)
6. [Route Constants](#route-constants)
7. [Hooks & UI Integration](#hooks--ui-integration)
8. [Examples](#examples)

## Overview

The capability registry and plugin catalog serve different but complementary purposes:

- **Capability Registry** = "What the app can do" (features, routes, actions, state)
- **Plugin Catalog** = "What plugins exist" (kinds, manifests, origins)

They are kept **distinct and separate** to maintain clean boundaries. Plugins **bridge** them by referencing capabilities, not duplicating them.

## Separation of Concerns

### Capability Registry (`apps/main/src/lib/capabilities/`)

The capability registry is the **single source of truth** for:

- **Features**: High-level app capabilities (e.g., "assets", "workspace", "generation")
- **Routes**: App pages and navigation paths
- **Actions**: Executable commands with keyboard shortcuts
- **State**: Reactive state accessors that plugins can read

**Responsibilities:**
- Expose what the app can do
- Provide a discoverable API for features
- Track feature relationships and dependencies
- Enable command palette, shortcuts, and dynamic UI

### Plugin Catalog (`apps/main/src/lib/plugins/catalog.ts`)

The plugin catalog is a **unified metadata layer** over all plugin systems:

- **Plugin Kinds**: session-helper, interaction, node-type, gallery-tool, ui-plugin, generation-ui
- **Metadata**: id, name, version, author, description, icon, tags, category
- **Source Tracking**: Which registry each plugin comes from
- **Capability Hints**: Boolean flags describing what a plugin can do

**Responsibilities:**
- Provide unified view of all plugins
- Enable search, filtering, and discovery
- Track plugin state (enabled/disabled)
- Support Plugin Workspace UI

## Linking Capabilities to Plugins

Plugins reference capabilities through **optional fields** in `PluginMeta`:

```typescript
interface PluginMeta {
  // ... existing fields ...

  // Capability references
  providesFeatures?: string[];    // Feature IDs this plugin adds
  consumesFeatures?: string[];    // Feature IDs this plugin depends on
  consumesActions?: string[];     // Action IDs this plugin uses
  consumesState?: string[];       // State IDs this plugin reads
}
```

### Example: CubeV2 UI Plugin

```typescript
{
  kind: 'ui-plugin',
  id: 'cube-system-v2',
  label: 'Cube Control Center V2',

  // What it consumes from the app
  consumesFeatures: ['assets', 'workspace', 'generation'],
  consumesActions: ['workspace.open-panel', 'generation.quick-generate'],
  consumesState: ['workspace.panels', 'generation.active'],
}
```

### Why Not Embed Full Definitions?

❌ **Don't do this:**
```typescript
// BAD: Duplicating feature definitions in plugin metadata
providedFeatures: [
  { id: 'debug-overlay', name: 'Debug Overlay', routes: [...] }
]
```

✅ **Do this instead:**
```typescript
// GOOD: Just reference IDs, let capability registry handle definitions
providesFeatures: ['plugin.debug-tools.debug-overlay']
consumesActions: ['workspace.open-panel']
```

**Reasons:**
- Avoids data duplication
- Single source of truth remains in capability registry
- Changes to capabilities don't require updating plugin metadata
- Cleaner separation of concerns

## Plugin Adapter API

Plugins should **not** write directly to the capability store. Instead, use the **Plugin Adapter API** for controlled registration.

### Creating an Adapter

```typescript
import { createPluginCapabilityAdapter } from '@/lib/capabilities';

const adapter = createPluginCapabilityAdapter(
  'my-plugin',
  ['ui:overlay', 'storage']
);
```

### Registering Capabilities

```typescript
// Register a feature
adapter.registerFeature({
  id: 'debug-overlay',  // Will be prefixed to 'plugin.my-plugin.debug-overlay'
  name: 'Debug Overlay',
  description: 'Shows debug information',
  icon: '🐛',
  category: 'utility',
  priority: 30,
});

// Register a route (requires 'ui:overlay' permission)
adapter.registerRoute({
  path: '/debug',
  name: 'Debug Panel',
  icon: '🐛',
  showInNav: true,
}, 'debug-overlay');  // Optional: link to feature

// Register an action
adapter.registerAction({
  id: 'debug-overlay.toggle',  // Will be prefixed to 'plugin.my-plugin.debug-overlay.toggle'
  featureId: 'debug-overlay',
  title: 'Toggle Debug Overlay',
  icon: '🐛',
  shortcut: 'Ctrl+Shift+D',
  execute: () => {
    // Your code here
  },
});

// Register state (always read-only for plugins)
adapter.registerState({
  id: 'debug-enabled',
  name: 'Debug Enabled',
  getValue: () => localStorage.getItem('debug-enabled') === 'true',
});
```

### Cleanup

When the plugin is disabled, clean up all registrations:

```typescript
// In onDisable lifecycle
async onDisable() {
  adapter.cleanup();  // Removes all registered capabilities
}
```

### Benefits

- ✅ **Permission enforcement**: Routes require `ui:overlay` permission
- ✅ **Automatic prefixing**: IDs are prefixed with `plugin.<pluginId>` to avoid conflicts
- ✅ **Bulk cleanup**: Single call removes all plugin's registrations
- ✅ **Type safety**: TypeScript ensures correct API usage
- ✅ **Security**: No direct access to capability store

## Security & Trust Boundaries

Untrusted UI plugins should **not** get raw access to all actions and state. The **Security Filter** provides permission-based access control.

### Capability Scopes

Capabilities can be annotated with scopes:

```typescript
import { withScope } from '@/lib/capabilities';

// Mark an action as internal-only
registerAction(withScope({
  id: 'internal.reset-database',
  name: 'Reset Database',
  execute: () => { /* dangerous operation */ }
}, 'internal'));

// Mark state as requiring session permission
registerState(withScope({
  id: 'session.current-user',
  name: 'Current User',
  getValue: () => getCurrentUser(),
}, 'read-session'));
```

### Available Scopes

- `public` - Available to all plugins (default)
- `read-session` - Requires `read:session` permission
- `read-world` - Requires `read:world` permission
- `read-npcs` - Requires `read:npcs` permission
- `read-locations` - Requires `read:locations` permission
- `internal` - **Never** available to plugins
- `core-only` - Only available to core modules

### Using Security Filter

```typescript
import { createSecurityFilter } from '@/lib/capabilities';

// Create filter based on plugin permissions
const filter = createSecurityFilter(['ui:overlay', 'read:session']);

// Get filtered capabilities
const allowedActions = filter.filterActions(allActions);
const allowedState = filter.filterStates(allStates);

// Check specific access
const canExecute = filter.canExecuteAction('workspace.save', allActions);
const canRead = filter.canAccessState('session.flags', allStates);
```

### Integration with PluginManager

The PluginManager should expose filtered views based on plugin permissions:

```typescript
// In PluginAPI creation
const filter = createSecurityFilter(manifest.permissions);

const api: PluginAPI = {
  // ... other methods ...

  capabilities: {
    getActions: () => filter.filterActions(getAllActions()),
    getStates: () => filter.filterStates(getAllStates()),
    executeAction: (id, ...args) => {
      if (!filter.canExecuteAction(id, getAllActions())) {
        throw new Error('Permission denied');
      }
      return executeAction(id, ...args);
    },
  },
};
```

## Route Constants

All route paths are centralized in `routeConstants.ts` to avoid hardcoding:

```typescript
import { ROUTES, buildRoute, navigateTo } from '@/lib/capabilities';

// Use constants instead of strings
navigateTo(ROUTES.WORKSPACE);
navigateTo(ROUTES.ASSETS);

// Build dynamic routes
const assetUrl = buildRoute(ROUTES.ASSET_DETAIL, { id: '123' });
// Result: '/assets/123'
```

### Available Routes

- `ROUTES.ASSETS` - `/assets`
- `ROUTES.ASSET_DETAIL` - `/assets/:id`
- `ROUTES.WORKSPACE` - `/workspace`
- `ROUTES.GENERATE` - `/generate`
- `ROUTES.GAME_WORLD` - `/game-world`
- `ROUTES.GAME_2D` - `/game-2d`
- `ROUTES.NPC_PORTRAITS` - `/npc-portraits`
- `ROUTES.NPC_BRAIN_LAB` - `/npc-brain-lab`
- `ROUTES.AUTOMATION` - `/automation`
- `ROUTES.PLUGINS` - `/plugins`

### Why Centralize?

- ✅ Single source of truth for routes
- ✅ Easy refactoring (change route in one place)
- ✅ Type-safe route references
- ✅ Autocomplete support in IDE
- ✅ No magic strings scattered in codebase

## Hooks & UI Integration

The capability registry provides React hooks for UI integration:

### Basic Hooks

```typescript
import {
  useFeatures,
  useFeature,
  useFeaturesByCategory,
  useRoutes,
  useFeatureRoutes,
  useNavRoutes,
  useActions,
  useAction,
  useFeatureActions,
  useStates,
  useState,
} from '@/lib/capabilities';

// Get all features
const features = useFeatures();

// Get specific feature
const assetsFeature = useFeature('assets');

// Get features by category
const editingFeatures = useFeaturesByCategory('editing');

// Get navigation routes (showInNav = true)
const navRoutes = useNavRoutes();

// Get routes for a specific feature
const workspaceRoutes = useFeatureRoutes('workspace');

// Get all actions
const actions = useActions();

// Get actions for a specific feature
const workspaceActions = useFeatureActions('workspace');
```

### Use Cases

#### 1. Dynamic Navigation Menu

```typescript
function NavigationMenu() {
  const navRoutes = useNavRoutes();

  return (
    <nav>
      {navRoutes.map(route => (
        <a key={route.path} href={route.path}>
          {route.icon} {route.name}
        </a>
      ))}
    </nav>
  );
}
```

#### 2. Command Palette

```typescript
function CommandPalette() {
  const actions = useActions();

  return (
    <div>
      {actions.map(action => (
        <button
          key={action.id}
          onClick={() => action.execute()}
          disabled={action.enabled && !action.enabled()}
        >
          {action.icon} {action.name}
          {action.shortcut && <kbd>{action.shortcut}</kbd>}
        </button>
      ))}
    </div>
  );
}
```

#### 3. Plugin Workspace - Show Dependencies

```typescript
function PluginDependencies({ pluginId }: { pluginId: string }) {
  const plugin = getPluginById(pluginId);
  const features = useFeatures();

  const consumedFeatures = features.filter(f =>
    plugin.consumesFeatures?.includes(f.id)
  );

  return (
    <div>
      <h3>This plugin depends on:</h3>
      <ul>
        {consumedFeatures.map(feature => (
          <li key={feature.id}>
            {feature.icon} {feature.name} - {feature.description}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

#### 4. Feature Discovery

```typescript
function FeatureExplorer() {
  const features = useFeatures();

  return (
    <div>
      {features.map(feature => {
        const routes = useFeatureRoutes(feature.id);
        const actions = useFeatureActions(feature.id);

        return (
          <div key={feature.id}>
            <h2>{feature.icon} {feature.name}</h2>
            <p>{feature.description}</p>

            {routes.length > 0 && (
              <div>
                <h3>Routes:</h3>
                <ul>
                  {routes.map(r => <li key={r.path}>{r.name}</li>)}
                </ul>
              </div>
            )}

            {actions.length > 0 && (
              <div>
                <h3>Actions:</h3>
                <ul>
                  {actions.map(a => <li key={a.id}>{a.name}</li>)}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

## Examples

### Example 1: Core Module Registering Features

```typescript
// In registerCoreFeatures.ts
import { registerCompleteFeature } from '@/lib/capabilities';
import { ROUTES, navigateTo } from '@/lib/capabilities';

registerCompleteFeature({
  feature: {
    id: 'assets',
    name: 'Assets',
    description: 'Asset library and media management',
    icon: '📦',
    category: 'management',
    priority: 90,
  },
  routes: [
    {
      path: ROUTES.ASSETS,
      name: 'Asset Gallery',
      icon: '📦',
      protected: true,
      showInNav: true,
    },
  ],
  actions: [
    {
      id: 'assets.open-gallery',
      name: 'Open Gallery',
      icon: '📦',
      shortcut: 'Ctrl+Shift+A',
      execute: () => navigateTo(ROUTES.ASSETS),
    },
  ],
});
```

### Example 2: UI Plugin Using Capabilities

```typescript
import type { Plugin, PluginAPI } from '@/lib/plugins/types';

export const plugin: Plugin = {
  async onEnable(api: PluginAPI) {
    // Access filtered capabilities based on permissions
    const actions = api.capabilities.getActions();

    // Find workspace panel action
    const openPanelAction = actions.find(a => a.id === 'workspace.open-panel');

    if (openPanelAction) {
      // Use the action
      await openPanelAction.execute('debug-panel');
    }
  },
};
```

### Example 3: Plugin Registering Its Own Features

```typescript
import { createPluginCapabilityAdapter } from '@/lib/capabilities';

let adapter;

export const plugin: Plugin = {
  async onEnable(api: PluginAPI) {
    // Create adapter
    adapter = createPluginCapabilityAdapter(
      api.getPluginId(),
      api.getManifest().permissions
    );

    // Register feature
    adapter.registerFeature({
      id: 'relationship-tracker',
      name: 'Relationship Tracker',
      description: 'Track NPC relationships',
      icon: '💕',
      category: 'game',
    });

    // Register action
    adapter.registerAction({
      id: 'relationship-tracker.show-relationships',
      featureId: 'relationship-tracker',
      title: 'Show Relationships',
      icon: '💕',
      shortcut: 'Ctrl+R',
      execute: () => {
        // Show relationship UI
      },
    });
  },

  async onDisable() {
    // Clean up all registrations
    adapter?.cleanup();
  },
};
```

## Summary

### Key Principles

1. **Keep registries separate** - Capability registry and plugin catalog have different concerns
2. **Link by reference, not duplication** - Use IDs, not embedded objects
3. **Use adapter for registration** - Don't write to capability store directly
4. **Enforce security boundaries** - Filter capabilities based on permissions
5. **Centralize routes** - Use constants, not magic strings
6. **Provide hooks** - Make capabilities easy to consume in UI

### What Goes Where?

| Concern | System |
|---------|--------|
| "What can the app do?" | Capability Registry |
| "What plugins exist?" | Plugin Catalog |
| "What does this plugin provide?" | PluginMeta.providesFeatures |
| "What does this plugin need?" | PluginMeta.consumesFeatures/Actions/State |
| "Can this plugin access X?" | Security Filter |
| Plugin registration | Plugin Adapter API |
| Route paths | Route Constants |
| UI integration | Capability Hooks |

### Future Enhancements

- [ ] Capability validation on plugin install
- [ ] Dependency resolution (plugin A requires plugin B's features)
- [ ] Capability versioning (breaking changes)
- [ ] Hot reload of capability registrations
- [ ] Capability usage analytics
- [ ] Visual capability graph in Plugin Workspace
