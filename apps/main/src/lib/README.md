# Frontend Lib Overview (Registries & Plugins)

This directory contains shared frontend infrastructure for PixSim7: registries, plugin bridges, layout helpers, and feature‑scoped libs (graph, gizmos, gallery, game, etc.).

This section is specifically for **registries and plugin integration**.

## Registry Conventions

- Most UI systems expose a small, in‑memory registry:
  - Panels: `apps/main/src/lib/panels/panelRegistry.ts`
  - Dev tools: `apps/main/src/lib/devtools/devToolRegistry.ts`
  - Graph editors: `apps/main/src/lib/graph/editorRegistry.ts`
  - Gizmo surfaces: `apps/main/src/lib/gizmos/surfaceRegistry.ts`
  - Widgets: `apps/main/src/lib/widgets/widgetRegistry.ts`
  - Control center modules: `apps/main/src/lib/control/controlCenterModuleRegistry.ts`
  - Data binding: `apps/main/src/lib/dataBinding/dataSourceRegistry.ts`

Core rules:

- **Prefer a shared base**: new registries should extend the generic base once Task 91 is implemented:
  - `apps/main/src/lib/core/BaseRegistry.ts` (see `claude-tasks/91-ui-registry-base-and-normalization.md`)
- **Expose a singleton**:
  - e.g. `export const panelRegistry = new PanelRegistry();`
- **Keep domain logic in the concrete registry**:
  - Category helpers (`getByCategory`), visibility helpers (`getVisible`), stats (`getStats`), etc.

If you add a new registry:

- Put it under the closest feature directory (e.g. `lib/hud`, `lib/game`, `lib/gallery`).
- Use the same pattern: `class XxxRegistry extends BaseRegistry<Definition> { … }` + `export const xxxRegistry = new XxxRegistry();`.

## Plugin Catalog Bridge

The unified plugin catalog lives in:

- `apps/main/src/lib/plugins/pluginSystem.ts`
- `apps/main/src/lib/plugins/registryBridge.ts`

Patterns:

- “Legacy” registries (helpers, interactions, node types, panels, dev tools, graph editors, gizmo surfaces, world tools) are kept as the source of truth.
- `registryBridge.ts` provides helpers like:
  - `registerPanelWithPlugin(panel, options?)`
  - `registerBuiltinPanel(panel)`
  - `registerWorldTool(tool, options?)`
  - `registerBuiltinWorldTool(tool)`
  - …and similar for other families.
- These helpers:
  1. Register your item in the appropriate registry.
  2. Register metadata in the plugin catalog (family, origin, activation state, tags).

When adding new plugin‑style extensions:

- **Do not** call `pluginCatalog.register` directly from feature code.
- **Do** add a small helper in `registryBridge.ts` that:
  - Registers in the registry (`xxxRegistry.register(...)`).
  - Builds `ExtendedPluginMetadata<'your-family'>` and calls `pluginCatalog.register(...)`.

See `claude-tasks/92-registry-bridge-simplification.md` for the planned shared helper pattern and catalog family inventory.

## Quick Pointers

- Centralized exports for core registries:
  - `apps/main/src/lib/registries.ts`
- Panel plugin docs:
  - `apps/main/src/lib/panels/PANEL_PLUGINS_AND_REGISTRY.md`
- Gizmo/gizmo‑surface docs:
  - `apps/main/src/lib/gizmos/*`
- Gallery tools and surfaces:
  - `apps/main/src/lib/gallery/README.md`

# Frontend Library (`/src/lib`)

This directory contains shared frontend libraries and utilities for the Pixsim7 application.

## UI Registries

The application uses a registry pattern for managing pluggable UI components. All UI registries extend from a common `BaseRegistry<T>` base class.

### BaseRegistry

**Location:** `lib/core/BaseRegistry.ts`

The `BaseRegistry<T>` class provides common functionality for all UI registries:

- **CRUD operations**: `register()`, `unregister()`, `get()`, `getAll()`, `has()`, `clear()`
- **Change notifications**: `subscribe()` and `notifyListeners()` for reactive updates
- **Type safety**: Generic `<T extends Identifiable>` ensures all registered items have an `id` property
- **Error handling**: Duplicate registrations trigger warnings, listener errors are caught and logged

**Example:**

```typescript
import { BaseRegistry, Identifiable } from './core/BaseRegistry';

interface MyItem extends Identifiable {
  id: string;
  name: string;
}

class MyRegistry extends BaseRegistry<MyItem> {
  // Add domain-specific methods here
  getByName(name: string): MyItem | undefined {
    return this.getAll().find(item => item.name === name);
  }
}

const myRegistry = new MyRegistry();
myRegistry.register({ id: 'item-1', name: 'First Item' });

// Subscribe to changes
const unsubscribe = myRegistry.subscribe(() => {
  console.log('Registry changed!');
});
```

### Registries Using BaseRegistry

The following UI registries extend `BaseRegistry`:

| Registry | Location | Purpose | Features |
|----------|----------|---------|----------|
| **PanelRegistry** | `lib/panels/panelRegistry.ts` | Workspace panels | Listeners, Search, Stats, Lifecycle hooks |
| **DevToolRegistry** | `lib/devtools/devToolRegistry.ts` | Developer tools | Listeners, Search, Category filtering |
| **GraphEditorRegistry** | `lib/graph/editorRegistry.ts` | Graph editor surfaces | Listeners, Search, Stats, Category filtering |
| **GizmoSurfaceRegistry** | `lib/gizmos/surfaceRegistry.ts` | Gizmo UI surfaces | Listeners, Search, Context/tag filtering |
| **WidgetRegistry** | `lib/widgets/widgetRegistry.ts` | Composable widgets | Listeners, Search, Stats, Type/category filtering |
| **ControlCenterModuleRegistry** | `lib/control/controlCenterModuleRegistry.ts` | Control center modules | Listeners, Search, Sorted retrieval |
| **DataSourceRegistry** | `lib/dataBinding/dataSourceRegistry.ts` | Data sources & transforms | Listeners, Search, Stats, Validation |

### Common Patterns

#### Change Notifications

All registries support reactive updates via the `subscribe()` method:

```typescript
const unsubscribe = panelRegistry.subscribe(() => {
  // React to registry changes
  updateUI();
});

// Later, to stop listening:
unsubscribe();
```

Registries automatically notify listeners when items are added, removed, or the registry is cleared.

#### Search Functionality

Most registries provide a `search(query: string)` method that searches across relevant fields (id, label, description, tags):

```typescript
// Search across all fields
const results = panelRegistry.search('debug');

// Returns panels matching 'debug' in id, title, description, or tags
```

#### Category/Type Filtering

Registries typically provide helper methods for filtering by category or type:

```typescript
const corePanels = panelRegistry.getByCategory('core');
const textWidgets = widgetRegistry.getByType('text');
```

### Adding New Registries

When creating a new UI registry:

1. **Extend BaseRegistry**: Define your item type extending `Identifiable` and extend `BaseRegistry<YourType>`:

   ```typescript
   interface MyDefinition extends Identifiable {
     id: string;
     label: string;
     // ... other fields
   }

   class MyRegistry extends BaseRegistry<MyDefinition> {
     // Add domain-specific methods
   }
   ```

2. **Add domain-specific features**: Implement methods like `getByCategory()`, `search()`, `getStats()` as needed

3. **Export a singleton**: Create and export a global instance:

   ```typescript
   export const myRegistry = new MyRegistry();
   ```

4. **Document it**: Add an entry to the table above

### Testing

All registries should have unit tests. The `BaseRegistry` tests in `lib/core/__tests__/BaseRegistry.test.ts` provide a reference for testing common functionality.

When testing registry subclasses:

- Test base functionality (register, unregister, get, etc.)
- Test listener notifications
- Test domain-specific methods (search, filtering, stats, etc.)
- Test error handling (duplicate registration, invalid data, etc.)

---

## Other Libraries

(Additional documentation for other lib modules can be added here)
