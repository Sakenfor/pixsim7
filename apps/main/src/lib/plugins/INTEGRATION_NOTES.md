# Plugin System Architecture

## Overview

The plugin system provides unified discovery, registration, and lifecycle management
for all plugin families in PixSim7. The architecture consists of three core layers:

1. **Plugin Catalog** (`pluginSystem.ts`) - Single source of truth for plugin metadata
2. **Plugin Runtime** (`pluginRuntime.ts`) - Unified registration entry point
3. **Family Adapters** (`familyAdapters.ts`) - Family-specific registration logic

## Core Components

### 1. Plugin Catalog (`pluginCatalog`)

The `PluginCatalog` class in `pluginSystem.ts` is the single source of truth:

```typescript
import { pluginCatalog } from '@lib/plugins/pluginSystem';

// Get all plugins
const allPlugins = pluginCatalog.getAll();

// Get by family
const panels = pluginCatalog.getByFamily('workspace-panel');
const interactions = pluginCatalog.getByFamily('interaction');

// Get by origin
const builtins = pluginCatalog.getByOrigin('builtin');
const userPlugins = pluginCatalog.getUserPlugins();

// Get specific plugin
const panel = pluginCatalog.get('gallery');

// Get plugin object (runtime instance)
const panelDef = pluginCatalog.getPlugin<PanelDefinition>('gallery');
```

### 2. Plugin Runtime (`registerPluginDefinition`)

All plugins should be registered through `registerPluginDefinition`:

```typescript
import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';

await registerPluginDefinition({
  id: 'my-plugin',
  family: 'workspace-panel',
  origin: 'plugin-dir',
  source: 'source',
  plugin: myPanelDefinition,
  canDisable: true,
});
```

### 3. Family Adapters

Each plugin family has an adapter in `familyAdapters.ts` that:
- Builds metadata from the plugin object
- Routes to the appropriate underlying registry (if any)

## Plugin Families

Currently supported families (17 total):

| Family | Has Registry | Description |
|--------|--------------|-------------|
| `helper` | ✓ sessionHelperRegistry | Session state mutation helpers |
| `interaction` | ✓ interactionRegistry | NPC/target action plugins |
| `node-type` | ✓ nodeTypeRegistry | Graph node definitions |
| `renderer` | ✓ nodeRendererRegistry | Node rendering components |
| `dev-tool` | ✓ devToolRegistry | Developer tools |
| `scene-view` | ✓ sceneViewRegistry | Scene rendering modes |
| `control-center` | ✓ controlCenterRegistry | Control center UI modes |
| `ui-plugin` | Custom | UI overlay plugins |
| `world-tool` | Catalog only | World editing tools |
| `gallery-tool` | Catalog only | Gallery utilities |
| `brain-tool` | Catalog only | NPC brain tools |
| `gallery-surface` | Catalog only | Gallery display surfaces |
| `generation-ui` | Catalog only | Generation UI plugins |
| `graph-editor` | Catalog only | Graph editor definitions |
| `workspace-panel` | Catalog only | Workspace panels |
| `dock-widget` | Catalog only | Dock widgets |
| `gizmo-surface` | Catalog only | Gizmo surfaces |

## Usage Examples

### Registering a Plugin

```typescript
import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';

// Built-in plugin (cannot be disabled)
await registerPluginDefinition({
  id: 'my-builtin-panel',
  family: 'workspace-panel',
  origin: 'builtin',
  source: 'source',
  plugin: myPanelDefinition,
  canDisable: false,
});

// User plugin (can be disabled)
await registerPluginDefinition({
  id: 'my-custom-panel',
  family: 'workspace-panel',
  origin: 'plugin-dir',
  source: 'source',
  plugin: myPanelDefinition,
  canDisable: true,
  metadata: {
    version: '1.0.0',
    author: 'My Name',
  },
});
```

### Querying Plugins

```typescript
import { pluginCatalog, pluginActivationManager } from '@lib/plugins/pluginSystem';

// Get all workspace panels
const panels = pluginCatalog.getByFamily('workspace-panel');

// Check activation state
const isActive = pluginActivationManager.isActive('my-panel');

// Toggle activation
await pluginActivationManager.toggle('my-panel');

// Subscribe to changes
const unsubscribe = pluginCatalog.subscribe(() => {
  console.log('Catalog changed!');
});
```

### Using Catalog Selectors

For catalog-only families, use the selectors:

```typescript
import { generationUiSelectors, panelSelectors } from '@lib/plugins/catalogSelectors';

// Get all generation UI plugins
const genPlugins = generationUiSelectors.getAll();

// Search panels
const results = panelSelectors.search('gallery');
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Plugin Registration                       │
│                                                              │
│  registerPluginDefinition()  ←── Single entry point         │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────┐                                        │
│  │ Family Adapters │ ←── buildMetadata() + register()       │
│  └────────┬────────┘                                        │
│           │                                                  │
│     ┌─────┴─────┐                                           │
│     ▼           ▼                                           │
│ ┌────────┐ ┌────────────────┐                               │
│ │Catalog │ │Underlying      │                               │
│ │        │ │Registries      │                               │
│ │metadata│ │(if any)        │                               │
│ │+plugin │ │                │                               │
│ └────────┘ └────────────────┘                               │
└─────────────────────────────────────────────────────────────┘
```

## Best Practices

1. **Always use `registerPluginDefinition()`** - Never register directly to underlying registries
2. **Set appropriate metadata** - Provide version, author, description, tags
3. **Use correct origin** - `builtin` for core, `plugin-dir` for user plugins
4. **Respect `canDisable`** - Core functionality should not be disableable
5. **Query via catalog** - Use `pluginCatalog.getByFamily()` instead of underlying registries
