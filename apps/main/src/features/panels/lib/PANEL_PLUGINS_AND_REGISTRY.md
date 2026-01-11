# Panel Plugins & Registry System

## Overview

Workspace panels in PixSim7 are now first-class plugins integrated with the unified plugin system. This allows panels to be discovered, enabled/disabled, and extended via the plugin architecture.

**Key Features:**
- Catalog-backed panel selectors for runtime panel management
- Unified plugin catalog integration
- Built-in and custom panel support
- Plugin Browser UI for panel management
- Metadata-driven architecture

**Note:** The plugin catalog is now the source of truth. `panelRegistry` and
`registryBridge` are legacy compatibility layers and should not be used for new
code. Prefer `registerPluginDefinition()` and `panelSelectors`.

---

## Architecture

### Components

1. **Panel Catalog Selectors** (`catalogSelectors.ts`)
   - Catalog-backed selectors for all workspace panels
   - Provides search and category filtering
   - `panelRegistry` is legacy-only (avoid for new work)

2. **Unified Plugin System** (`pluginSystem.ts`)
   - New `workspace-panel` plugin family
   - Tracks panel metadata (origin, activation state)
   - Consistent enable/disable semantics

3. **Plugin Runtime** (`pluginRuntime.ts` + `familyAdapters.ts`)
   - Registers panel definitions through `registerPluginDefinition`
   - Populates `pluginCatalog` as the source of truth

4. **Panel Definitions** (`domain/definitions/*/index.ts`)
   - Auto-discovered built-in workspace panels
   - Registered via `registerPluginDefinition` during auto-discovery

5. **Plugin Browser UI** (`PluginBrowser.tsx`)
   - Workspace Panels tab for browsing panels
   - Enable/disable controls for custom panels
   - Filter by category and origin

---

## Panel Plugin Family

### Type Definition

```typescript
export type PluginFamily =
  | 'world-tool'
  | 'helper'
  | 'interaction'
  | 'gallery-tool'
  | 'node-type'
  | 'renderer'
  | 'ui-plugin'
  | 'graph-editor'
  | 'workspace-panel';  // New family
```

### Metadata Extension

```typescript
'workspace-panel': {
  panelId: string;
  category?: 'core' | 'development' | 'game' | 'tools' | 'custom';
  supportsCompactMode?: boolean;
  supportsMultipleInstances?: boolean;
};
```

---

## How to Define a Panel Plugin

### 1. Create Panel Definition

```typescript
import type { PanelDefinition } from '@/lib/panels/panelRegistry';
import { MyPanelComponent } from './MyPanelComponent';

export const myCustomPanel: PanelDefinition = {
  id: 'my-custom-panel',
  title: 'My Custom Panel',
  component: MyPanelComponent,
  category: 'custom',
  tags: ['custom', 'utility'],
  icon: '????',
  description: 'A custom panel for special functionality',
  supportsCompactMode: true,
  supportsMultipleInstances: false,
};
```

### 2. Register as Plugin

```typescript
import { registerPluginDefinition } from '@/lib/plugins/pluginRuntime';

// Register with default options (user plugin)
await registerPluginDefinition({
  id: myCustomPanel.id,
  family: 'workspace-panel',
  origin: 'plugin-dir',
  source: 'source',
  plugin: myCustomPanel,
  canDisable: true,
});
```

### 3. For Built-in Panels

```typescript
import { registerPluginDefinition } from '@/lib/plugins/pluginRuntime';

// Built-in panels cannot be disabled
await registerPluginDefinition({
  id: myCustomPanel.id,
  family: 'workspace-panel',
  origin: 'builtin',
  source: 'source',
  plugin: myCustomPanel,
  canDisable: false,
});
```

---

## Registry Bridge Functions

### (Deprecated) `registerPanelWithPlugin()`

Legacy helper that registered a panel in both `panelRegistry` and `pluginCatalog`.

```typescript
registerPanelWithPlugin(
  panel: PanelDefinition,
  options?: RegisterWithMetadataOptions
): void
```

**Options:**
- `origin`: Where the panel came from (`'builtin'`, `'plugin-dir'`, `'ui-bundle'`)
- `activationState`: Initial state (`'active'` or `'inactive'`)
- `canDisable`: Whether users can disable this panel
- `metadata`: Additional plugin metadata

### (Deprecated) `registerBuiltinPanel()`

Convenience function for registering built-in panels.

```typescript
registerBuiltinPanel(panel: PanelDefinition): void
```

Equivalent to:
```typescript
registerPanelWithPlugin(panel, {
  origin: 'builtin',
  canDisable: false
});
```

---

## Plugin Browser UI

### Accessing Panel Plugins

1. Open the Plugin Browser panel
2. Click the **Workspace Panels** tab
3. View all registered panels with metadata

### Features

- **Search**: Find panels by name, ID, description, or tags
- **Filter by Category**: core, development, game, tools, custom
- **Filter by Origin**: built-in, plugin-dir, ui-bundle
- **Enable/Disable**: Toggle non-core panels
- **Metadata Display**: View panel capabilities and info

### Panel Information Shown

- Panel name and ID
- Activation state (Active/Inactive)
- Origin (Built-in badge for core panels)
- Category
- Capabilities (Compact Mode, Multiple Instances)
- Tags

---

## Built-in Panels

All core workspace panels are registered as built-in plugins:

| Panel ID | Title | Category | Description |
|----------|-------|----------|-------------|
| `gallery` | Gallery | core | Browse and manage project assets |
| `scene` | Scene Builder | core | Build and edit individual scenes |
| `graph` | Graph | core | Visual node-based editor |
| `inspector` | Inspector | core | Inspect and edit node properties |
| `health` | Health | development | System health and validation |
| `game` | Game | game | Game preview and testing |
| `providers` | Provider Settings | development | API provider configuration |
| `settings` | Settings | core | Application settings |
| `gizmo-lab` | Gizmo Lab | tools | Gizmo testing laboratory |
| `npc-brain-lab` | NPC Brain Lab | tools | NPC behavior testing |
| `game-theming` | Game Theming | game | Theme customization |
| `scene-management` | Scene Management | core | Unified scene workflow |
| `dev-tools` | Dev Tools | development | Developer tools and diagnostics |

---

## Panel Configuration UI Integration

### Plugin Origin Badges

The Panel Configuration Panel now shows the plugin origin for non-builtin panels:

```typescript
// Example badge display
{pluginMeta && pluginMeta.origin !== 'builtin' && (
  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100">
    from: {pluginMeta.origin}
  </span>
)}
```

This helps users identify custom panels and understand their source.

### Gallery Panel Badge Configuration (Task 62)

The `gallery` panel now supports badge configuration for media cards:

**Location:** Settings ??? Panel Configuration ??? Gallery panel ??? Card Badges section

**Configurable Options:**
- Media type icon - Show/hide primary media type icons (video, image, audio, 3D model)
- Status icon - Show/hide colored rings around primary icon indicating provider status
- Status text on hover - Show/hide contextual status badges on hover
- Tags in overlay - Show/hide asset tags in the bottom overlay
- Footer provider - Show/hide provider ID and media type in footer
- Footer date - Show/hide creation date in footer

**Configuration Priority:**
Panel-level badge settings override surface-level defaults and are overridden by widget-level settings when using the Gallery Grid widget in composed panels.

See also:
- [Gallery Surfaces](../gallery/GALLERY_SURFACES.md#panel-integration-task-62)
- [Gallery Grid Widget](../widgets/builtInWidgets.ts)

---

## Activation and Disable Behavior

### For Built-in Panels

- Marked as `origin: 'builtin'`
- `canDisable: false` - always enabled
- Cannot be toggled in Plugin Browser
- Essential workspace functionality

### For Custom Panels

- Marked as `origin: 'plugin-dir'` or `'ui-bundle'`
- `canDisable: true` - can be toggled
- Enable/disable via Plugin Browser
- Disabled panels hidden from panel creation UI

### Programmatic Control

```typescript
import { pluginActivationManager } from '@/lib/plugins/pluginSystem';

// Activate a panel
await pluginActivationManager.activate('my-custom-panel');

// Deactivate a panel (if canDisable: true)
await pluginActivationManager.deactivate('my-custom-panel');

// Toggle activation
await pluginActivationManager.toggle('my-custom-panel');

// Check if active
const isActive = pluginActivationManager.isActive('my-custom-panel');
```

---

## How Activation Interacts with `panelConfigStore`

When a panel is disabled via the plugin system:
1. Its `activationState` is set to `'inactive'` in the plugin catalog
2. The panel remains registered in the plugin catalog
3. The panel configuration UI should check activation state
4. Disabled panels won't appear in panel creation menus

**Future Integration**: The `panelConfigStore` and workspace layout system should respect the plugin activation state to prevent disabled panels from being opened.

---

## Example: Creating a Custom Panel Plugin

```typescript
// myPanel.ts
import { registerPluginDefinition } from '@/lib/plugins/pluginRuntime';
import type { PanelDefinition } from '@/lib/panels/panelRegistry';

function MyCustomPanelComponent() {
  return (
    <div className="p-4">
      <h1>My Custom Panel</h1>
      <p>This is a custom workspace panel!</p>
    </div>
  );
}

const myPanel: PanelDefinition = {
  id: 'my-panel',
  title: 'My Panel',
  component: MyCustomPanelComponent,
  category: 'custom',
  tags: ['utility', 'custom'],
  description: 'Custom utility panel',
  supportsCompactMode: false,
  supportsMultipleInstances: true,
};

// Register the panel as a plugin
await registerPluginDefinition({
  id: myPanel.id,
  family: 'workspace-panel',
  origin: 'plugin-dir',
  source: 'source',
  plugin: myPanel,
  canDisable: true,
  metadata: {
    version: '1.0.0',
    author: 'My Name',
  },
});

export default myPanel;
```

---

## Discovery and Querying

### Get All Workspace Panel Plugins

```typescript
import { pluginCatalog } from '@/lib/plugins/pluginSystem';

const allPanels = pluginCatalog.getByFamily('workspace-panel');
console.log(`${allPanels.length} workspace panels registered`);
```

### Get Specific Panel Metadata

```typescript
const panelMeta = pluginCatalog.get('gallery');
if (panelMeta) {
  console.log('Panel:', panelMeta.name);
  console.log('Origin:', panelMeta.origin);
  console.log('Can disable:', panelMeta.canDisable);
  console.log('Active:', panelMeta.activationState);
}
```

### Filter by Category

```typescript
const corePanels = allPanels.filter(p => p.category === 'core');
const devPanels = allPanels.filter(p => p.category === 'development');
```

---

## Bulk Sync and Debugging

### Sync All Panels to Catalog

```typescript
import { syncCatalogFromRegistries } from '@/lib/plugins/registryBridge';

// Sync all registries including panels
syncCatalogFromRegistries();
```

### Print Registry Comparison

```typescript
import { printRegistryComparison } from '@/lib/plugins/registryBridge';

// Shows counts in registry vs catalog
printRegistryComparison();
// Output includes:
// Workspace Panels: 13 in registry, 13 in catalog
```

### Print Catalog Summary

```typescript
import { pluginCatalog } from '@/lib/plugins/pluginSystem';

pluginCatalog.printSummary();
// Shows total plugins, counts by family, origin, and activation state
```

---

## Best Practices

### 1. Use Registry Bridge Functions

Always use `registerPluginDefinition()` instead of directly calling `panelRegistry.register()`. This ensures catalog metadata tracking.

### 2. Set Appropriate Metadata

Provide descriptive metadata for better discoverability:
- Clear `title` and `description`
- Relevant `tags` for search
- Appropriate `category`
- Accurate capability flags (`supportsCompactMode`, etc.)

### 3. Respect `canDisable`

Core functionality panels should use `registerPluginDefinition()` with `origin: 'builtin'`. Optional utility panels should allow disabling.

### 4. Handle Activation State

Check if a panel is active before allowing users to open it:
```typescript
const isActive = pluginActivationManager.isActive(panelId);
if (!isActive) {
  // Show message or hide from UI
}
```

### 5. Use Consistent IDs

Panel IDs should be unique, lowercase, and kebab-case (e.g., `'my-custom-panel'`).

---

## Files Modified/Created

### Created
- None (all functionality added to existing files)

### Modified
1. `apps/main/src/lib/plugins/pluginSystem.ts`
   - Added `'workspace-panel'` to `PluginFamily`
   - Added metadata extension for workspace panels

2. `apps/main/src/lib/plugins/registryBridge.ts`
   - Added `registerPanelWithPlugin()` function
   - Added `registerBuiltinPanel()` function
   - Added panel sync to `syncCatalogFromRegistries()`
   - Added panels to `printRegistryComparison()`

3. `apps/main/src/features/panels/domain/definitions/*/index.ts`
   - Built-in panels defined for auto-discovery (registered via bridge)

4. `apps/main/src/components/plugins/PluginBrowser.tsx`
   - Added **Workspace Panels** tab
   - Added `WorkspacePanelsBrowser` component
   - Added `WorkspacePanelListItem` component

5. `apps/main/src/components/settings/PanelConfigurationPanel.tsx`
   - Added plugin origin badges to panel cards
   - Shows "from: {origin}" for non-builtin panels

---

## Future Enhancements

1. **Panel Dependencies**: Track which panels depend on others
2. **Panel Permissions**: Role-based access control for panels
3. **Hot Reload**: Dynamically load/unload panel plugins at runtime
4. **Panel Marketplace**: Browse and install community panels
5. **Panel Presets**: Save/restore panel layout configurations
6. **Panel Analytics**: Track panel usage and performance

---

## FAQ

### Q: Can I disable a built-in panel?
**A:** No. Built-in panels are marked as `canDisable: false` and are essential to the workspace.

### Q: How do I add a new custom panel?
**A:** Create a `PanelDefinition`, then call `registerPluginDefinition()` during your plugin's initialization.

### Q: Where do disabled panels go?
**A:** They remain in the registry but have `activationState: 'inactive'` in the catalog. They won't appear in panel creation UIs.

### Q: Can I have multiple instances of a panel?
**A:** Only if the panel has `supportsMultipleInstances: true`.

### Q: How do I check if a panel is from a plugin?
**A:** Query the plugin catalog: `pluginCatalog.get(panelId)?.origin` will show the source.

---

## Summary

The panel plugin system provides:
- ??? Unified discovery via plugin catalog
- ??? Enable/disable controls for custom panels
- ??? Clear origin tracking (built-in vs custom)
- ??? Consistent metadata-driven architecture
- ??? No breaking changes to existing code
- ??? Plugin Browser UI for management

Workspace panels are now first-class plugins!
