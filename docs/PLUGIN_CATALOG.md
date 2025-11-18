# Plugin Catalog

A unified metadata layer for all plugin systems in PixSim7.

## Overview

The Plugin Catalog provides a thin, shared abstraction layer over the existing plugin registries. It does **not** replace or merge the individual registries—each registry remains authoritative for its plugin type. Instead, the catalog offers a normalized, read-only view that makes it easy to:

- Browse all plugins across all systems
- Search and filter plugins by kind, category, tags, etc.
- Display unified plugin metadata in UI components
- Track enablement state across different plugin types

## Design Principles

1. **Non-breaking**: Existing registries remain unchanged and authoritative
2. **Incremental**: Easy to add new plugin kinds without touching existing code
3. **Type-safe**: Uses TypeScript unions and generics, not `any`
4. **Composable**: Small mapping functions per plugin type
5. **Frontend-only**: No backend changes required

## Plugin Systems

The catalog unifies **6 plugin systems**:

| Plugin Kind | Registry | Type | Enablement |
|------------|----------|------|------------|
| `session-helper` | `sessionHelperRegistry` | `HelperDefinition` | `pluginConfigStore` |
| `interaction` | `interactionRegistry` | `InteractionPlugin<T>` | `pluginConfigStore` |
| `node-type` | `nodeTypeRegistry` | `NodeTypeDefinition<T>` | Always enabled |
| `gallery-tool` | `galleryToolRegistry` | `GalleryToolPlugin` | Always visible |
| `ui-plugin` | `pluginManager` | `PluginEntry` | `PluginEntry.state` |
| `generation-ui` | `generationUIPluginRegistry` | `GenerationUIPlugin` | Always enabled |

## Core Types

### PluginKind

Discriminator for plugin types:

```typescript
export type PluginKind =
  | 'session-helper'
  | 'interaction'
  | 'node-type'
  | 'gallery-tool'
  | 'ui-plugin'
  | 'generation-ui';
```

### PluginMeta

Unified plugin metadata shape:

```typescript
export interface PluginMeta {
  // Core identity
  kind: PluginKind;
  id: string;
  label: string;
  description?: string;

  // Organization
  category?: string;
  tags?: string[];
  version?: string;
  icon?: string;

  // Source info
  source: {
    registry: PluginRegistrySource;
    modulePath?: string;
  };

  // Capabilities (semantic hints)
  capabilities?: PluginCapabilities;

  // Status
  experimental?: boolean;
  configurable?: boolean;
  enabled?: boolean;

  // Type-specific fields
  author?: string;           // UI plugins
  scope?: 'scene' | 'arc' | 'world' | 'custom';  // Node types
  uiMode?: 'dialogue' | 'notification' | 'silent' | 'custom';  // Interactions
}
```

### PluginCapabilities

Boolean flags that describe what a plugin can do:

```typescript
export interface PluginCapabilities {
  modifiesSession?: boolean;
  modifiesInventory?: boolean;
  modifiesRelationships?: boolean;
  addsUIOverlay?: boolean;
  addsNodeTypes?: boolean;
  addsGalleryTools?: boolean;
  providerId?: string;        // For generation UI plugins
  triggersEvents?: boolean;
  hasRisk?: boolean;
  requiresItems?: boolean;
  consumesItems?: boolean;
  canBeDetected?: boolean;
  opensDialogue?: boolean;
}
```

## Usage

### Listing Plugins

```typescript
import {
  listAllPlugins,
  listHelperPlugins,
  listInteractionPlugins,
  listNodeTypePlugins,
  listGalleryToolPlugins,
  listUIPlugins,
  listGenerationUIPlugins,
} from '@/lib/plugins/catalog';

// Get all plugins across all systems
const allPlugins = listAllPlugins();

// Get plugins of a specific kind
const helpers = listHelperPlugins();
const interactions = listInteractionPlugins();
const nodeTypes = listNodeTypePlugins();
const galleryTools = listGalleryToolPlugins();
const uiPlugins = listUIPlugins();
const generationPlugins = listGenerationUIPlugins();
```

### Searching and Filtering

```typescript
import {
  searchPlugins,
  filterByKind,
  filterByCategory,
  filterByEnabled,
  getPluginById,
} from '@/lib/plugins/catalog';

// Search across name, description, tags, category
const results = searchPlugins('inventory');

// Filter by kind
const interactions = filterByKind('interaction');
const multipleKinds = filterByKind(['session-helper', 'interaction']);

// Filter by category
const inventoryPlugins = filterByCategory('inventory');

// Filter by enabled state
const enabledOnly = filterByEnabled(true);
const disabledOnly = filterByEnabled(false);

// Get specific plugin
const plugin = getPluginById('pickpocket', 'interaction');
```

### Grouping

```typescript
import {
  groupByKind,
  groupByCategory,
  getPluginCounts,
  getUniqueCategories,
} from '@/lib/plugins/catalog';

// Group plugins by kind
const byKind = groupByKind();
// Returns: { 'session-helper': [...], 'interaction': [...], ... }

// Group by category
const byCategory = groupByCategory();
// Returns: { 'inventory': [...], 'relationship': [...], ... }

// Get plugin counts
const counts = getPluginCounts();
// Returns: { 'session-helper': 10, 'interaction': 5, ... }

// Get all unique categories
const categories = getUniqueCategories();
// Returns: ['inventory', 'relationship', 'event', ...]
```

## Mapping Functions

Each plugin system has a dedicated mapping function that converts its native type to `PluginMeta`:

### Session Helpers

```typescript
function mapHelperToMeta(helper: HelperDefinition): PluginMeta {
  return {
    kind: 'session-helper',
    id: helper.id || helper.name,
    label: helper.name,
    description: helper.description,
    category: helper.category,
    // ... infer capabilities from category
    enabled: isPluginEnabled(helper.id || helper.name, true),
  };
}
```

**Capability inference:**
- `category === 'inventory'` → `modifiesInventory: true`
- `category === 'relationship'` → `modifiesRelationships: true`
- `category === 'event'` → `triggersEvents: true`

### Interactions

```typescript
function mapInteractionToMeta(interaction: InteractionPlugin): PluginMeta {
  return {
    kind: 'interaction',
    id: interaction.id,
    label: interaction.name,
    // ... map interaction.capabilities to catalog capabilities
    uiMode: interaction.uiMode,
    enabled: isPluginEnabled(interaction.id, true),
  };
}
```

**Direct capability mapping** from `interaction.capabilities`:
- `opensDialogue`, `modifiesInventory`, `affectsRelationship`, `triggersEvents`, etc.

### Node Types

```typescript
function mapNodeTypeToMeta(nodeType: NodeTypeDefinition): PluginMeta | null {
  // Filter: only user-creatable or custom scope
  if (nodeType.userCreatable === false && nodeType.scope !== 'custom') {
    return null;
  }

  return {
    kind: 'node-type',
    id: nodeType.id,
    scope: nodeType.scope,
    // Node types are always enabled
    enabled: true,
  };
}
```

### Gallery Tools

```typescript
function mapGalleryToolToMeta(tool: GalleryToolPlugin): PluginMeta {
  return {
    kind: 'gallery-tool',
    id: tool.id,
    category: tool.category, // visualization | automation | analysis | utility
    // Gallery tools are always visible (use whenVisible predicate)
    enabled: true,
  };
}
```

### UI Plugins

```typescript
function mapUIPluginToMeta(pluginEntry: PluginEntry): PluginMeta {
  return {
    kind: 'ui-plugin',
    id: pluginEntry.manifest.id,
    author: pluginEntry.manifest.author,
    // Map permissions to capabilities
    capabilities: {
      addsUIOverlay: manifest.permissions?.includes('ui:overlay'),
    },
    enabled: pluginEntry.state === 'enabled',
  };
}
```

### Generation UI Plugins

```typescript
function mapGenerationUIToMeta(plugin: GenerationUIPlugin): PluginMeta {
  return {
    kind: 'generation-ui',
    id: plugin.id,
    tags: plugin.operations, // Use operations as tags
    capabilities: {
      providerId: plugin.providerId,
    },
    enabled: true,
  };
}
```

## UI Components

### PluginCatalogPanel

A full-featured UI component for browsing the plugin catalog:

```typescript
import { PluginCatalogPanel } from '@/components/PluginCatalogPanel';

<PluginCatalogPanel />
```

**Features:**
- **Search**: Full-text search across plugin metadata
- **Filters**: By kind, category, enabled state
- **View modes**: List, Grid, or Grouped by kind
- **Detail panel**: Shows full plugin metadata and capabilities
- **Actions**: Links to configuration UIs for configurable plugins

### Integration Points

The catalog does **not** replace existing configuration UIs:

- **Helpers & Interactions**: Use `PluginConfigPanel` for configuration
- **UI Plugins**: Use `PluginManager` component for management
- **Node Types**: Link to graph editor / scene builder
- **Gallery Tools**: Visible in `GalleryToolsPanel`
- **Generation UI**: Rendered in `QuickGenerateModule`

The catalog provides a **discovery** and **metadata** layer; actual plugin management happens in the existing UIs.

## Extending the Catalog

To add a new plugin kind:

1. **Add to `PluginKind` union:**
   ```typescript
   export type PluginKind =
     | 'session-helper'
     | ...
     | 'my-new-kind';  // ← Add here
   ```

2. **Update `PluginRegistrySource`:**
   ```typescript
   export type PluginRegistrySource =
     | 'sessionHelperRegistry'
     | ...
     | 'myNewRegistry';  // ← Add here
   ```

3. **Create a mapping function:**
   ```typescript
   function mapMyPluginToMeta(plugin: MyPluginType): PluginMeta {
     return {
       kind: 'my-new-kind',
       id: plugin.id,
       label: plugin.name,
       // ... map other fields
     };
   }
   ```

4. **Add a list function:**
   ```typescript
   export function listMyPlugins(): PluginMeta[] {
     const plugins = myRegistry.getAll();
     return plugins.map(mapMyPluginToMeta);
   }
   ```

5. **Update `listAllPlugins()`:**
   ```typescript
   export function listAllPlugins(): PluginMeta[] {
     return [
       ...listHelperPlugins(),
       ...listInteractionPlugins(),
       ...listMyPlugins(),  // ← Add here
     ];
   }
   ```

6. **Update `getPluginCounts()`:**
   ```typescript
   export function getPluginCounts(): Record<PluginKind, number> {
     return {
       'session-helper': listHelperPlugins().length,
       // ...
       'my-new-kind': listMyPlugins().length,  // ← Add here
     };
   }
   ```

That's it! The rest of the catalog (search, filter, UI) works automatically.

## Implementation Notes

### Why Filter Node Types?

The catalog only includes `userCreatable` or `scope === 'custom'` node types to avoid flooding the catalog with internal/built-in types. Built-in node types like `scene`, `arc`, `world`, `media-image`, etc. are not "plugins" in the user-facing sense.

### Enablement State

Different plugin systems track enablement differently:

| Kind | Enablement Source | Notes |
|------|------------------|-------|
| `session-helper` | `pluginConfigStore` | `enabled` field, defaults to `true` |
| `interaction` | `pluginConfigStore` | `enabled` field, defaults to `true` |
| `node-type` | Always enabled | No disable mechanism |
| `gallery-tool` | Always visible | Uses `whenVisible` predicate instead |
| `ui-plugin` | `PluginEntry.state` | `'enabled'` \| `'disabled'` \| `'error'` |
| `generation-ui` | Always enabled | No disable mechanism |

### Performance

The catalog functions are lightweight:
- No caching layer (call `listAllPlugins()` on demand)
- Mapping is synchronous and fast
- UI components use React `useMemo` for filtered results

If needed in the future, a reactive store (Svelte or React) could be added for real-time updates when plugins are registered/unregistered.

## FAQ

**Q: Can I modify plugins through the catalog?**
A: No. The catalog is read-only. Use the existing configuration UIs (`PluginConfigPanel`, `PluginManager`, etc.) for modifications.

**Q: Will this break existing code?**
A: No. The catalog is a new layer on top of existing registries. Existing plugin loaders, registries, and UIs are unchanged.

**Q: Do I have to use the catalog?**
A: No. It's optional. Existing code continues to work as-is. The catalog is useful for new UIs that need a unified view.

**Q: Can I add custom metadata to plugins?**
A: The catalog uses metadata already present in each plugin type. To add new metadata:
1. Add it to the source plugin type (e.g., `HelperDefinition`)
2. Update the mapping function to include it in `PluginMeta`

**Q: How do I handle plugins with missing metadata?**
A: The catalog falls back gracefully:
- `label` = `name || id`
- `description` = `undefined` if not present
- `category` = `undefined` if not present
- `enabled` = defaults vary by kind

**Q: Can I filter plugins by capabilities?**
A: Not directly via a built-in function, but you can easily add one:
```typescript
export function filterByCapability(
  capability: keyof PluginCapabilities,
  plugins: PluginMeta[] = listAllPlugins()
): PluginMeta[] {
  return plugins.filter(p => p.capabilities?.[capability]);
}
```

## See Also

- [Plugin System Overview](./PLUGIN_SYSTEM.md)
- [Session Helper Reference](./SESSION_HELPER_REFERENCE.md)
- [Interaction Plugin Manifest](./INTERACTION_PLUGIN_MANIFEST.md)
- [Gallery Tools Plugin](./GALLERY_TOOLS_PLUGIN.md)
- [Provider Capability Registry](./PROVIDER_CAPABILITY_REGISTRY.md)
