# Unified Plugin System

This document describes the unified plugin system that provides consistent patterns for plugin discovery, registration, and lifecycle management across all plugin families.

## Table of Contents

1. [Overview](#overview)
2. [Key Improvements](#key-improvements)
3. [Plugin Families](#plugin-families)
4. [Registration Patterns](#registration-patterns)
5. [Plugin Metadata](#plugin-metadata)
6. [Discovery & Loading](#discovery--loading)
7. [Activation & Lifecycle](#activation--lifecycle)
8. [Migration Guide](#migration-guide)
9. [Examples](#examples)

## Overview

The unified plugin system addresses several issues with the previous approach:

1. **Mixed registration styles** - Now consistent across all plugin families
2. **Origin tracking** - Know where each plugin came from (builtin vs user)
3. **Unified activation** - Consistent enable/disable semantics
4. **Metadata-driven** - Registration derived from metadata, no duplication
5. **Generic discovery** - Shared discovery utilities, no repeated code

> Note: `registryBridge.ts` has been replaced by `pluginRuntime.ts` + `familyAdapters.ts`. Use `registerPluginDefinition(...)` for new registrations.

## Key Improvements

### Before

```typescript
// World tools: auto-register on import
import { builtInWorldTools } from './plugins/worldTools';
builtInWorldTools.forEach(tool => worldToolRegistry.register(tool));

// Helpers: use pluginLoader with import.meta.glob
const helperModules = import.meta.glob('/src/plugins/helpers/**/*.ts');
// ... custom discovery logic ...

// Node types: manual registration
registerBuiltinNodeTypes();
registerPluginRenderers(); // Separate from node type registration
```

### After

```typescript
// All plugins use unified discovery
await loadAllPlugins(); // Handles all families consistently

// Metadata tracking
pluginCatalog.getByOrigin('builtin'); // Get all built-in plugins
pluginCatalog.getByFamily('helper'); // Get all helpers

// Unified activation
await activatePlugin('my-plugin-id');
await deactivatePlugin('my-plugin-id');
```

## Plugin Families

The system supports these plugin families:

| Family | Description | Registration Pattern | Location |
|--------|-------------|---------------------|----------|
| `world-tool` | Tools in the world view | Auto-detect (id + render) | `/src/plugins/worldTools/` |
| `helper` | Session helpers | Named export (`register*Helper`) | `/src/plugins/helpers/` |
| `interaction` | NPC interactions | Auto-detect (id + execute) | `/src/plugins/interactions/` |
| `gallery-tool` | Gallery tools | Named export (`register*Tool`) | `/src/plugins/galleryTools/` |
| `node-type` | Scene/arc nodes | Named export (`register*Node`) | `/src/lib/plugins/` |
| `renderer` | Node renderers | Auto-registered from node type metadata | `/src/components/graph/` |
| `ui-plugin` | UI overlays/menus | PluginManager API | User-loaded bundles |
| `dev-tool` | Developer/debug tools | Registry API (`registerDevTool`) | `/src/lib/devtools/` |
| `graph-editor` | Graph editor surfaces | Registry API (`registerGraphEditor`) | `/src/lib/graph/` |

## Registration Patterns

### Pattern 1: Named Export (Helpers, Node Types, Gallery Tools)

**Convention:** Export a function named `register<Name><Type>`

```typescript
// plugins/helpers/reputation/reputation.ts
export function registerReputationHelper() {
  registerHelper({
    id: 'reputation-helper',
    name: 'Reputation Helper',
    category: 'social',
    fn: (session, params) => {
      // Implementation
      return session;
    },
    // ... other fields
  }, { origin: 'plugin-dir' });
}
```

**Discovery:**
- Pattern: `register*Helper`, `register*Node`, `register*Tool`
- System automatically finds and calls these functions

### Pattern 2: Auto-detect (Interactions, World Tools)

**Convention:** Export objects with required properties

```typescript
// plugins/interactions/trade/trade.ts
export const tradePlugin: InteractionPlugin = {
  id: 'trade-interaction',
  name: 'Trade',
  execute: async (config, context) => {
    // Implementation
  },
  // ... other fields
};
```

**Discovery:**
- Interactions: Must have `id` and `execute` properties
- World tools: Must have `id` and `render` properties
- System automatically finds and registers these objects

### Pattern 3: Metadata-driven (Renderers)

**Convention:** Specify `rendererComponent` in node type definition

```typescript
// Node type definition
registerSeductionNode() {
  registerNodeType({
    id: 'seduction',
    name: 'Seduction',
    // ...
    rendererComponent: 'SeductionNodeRenderer', // Links to renderer
  });
}

// Renderer file: /src/components/graph/SeductionNodeRenderer.tsx
export default function SeductionNodeRenderer(props: NodeRendererProps) {
  // Implementation
}
```

**Discovery:**
- System finds renderer files matching `*Renderer.{tsx,ts}` pattern
- Auto-registers based on `rendererComponent` field in node types
- No manual import needed!

## Plugin Metadata

All plugins have unified metadata:

```typescript
interface PluginMetadata {
  id: string;              // Unique identifier
  name: string;            // Human-readable name
  family: PluginFamily;    // 'helper' | 'interaction' | etc.
  origin: PluginOrigin;    // 'builtin' | 'plugin-dir' | 'ui-bundle' | 'dev-project'
  activationState: 'active' | 'inactive';
  canDisable: boolean;     // Some built-ins are always-on
  version?: string;
  description?: string;
  author?: string;
  tags?: string[];
}
```

**Family-specific extensions:**

```typescript
// Helpers
{ category?: string }

// Interactions
{ category?: string, icon?: string }

// Node types
{ category?: string, scope?: 'scene' | 'global', preloadPriority?: number }

// Renderers
{ nodeType: string, preloadPriority?: number }

// Dev tools
{ category?: string, icon?: string }

// Graph editors
{ storeId?: string, category?: string, supportsMultiScene?: boolean, supportsWorldContext?: boolean, supportsPlayback?: boolean }
```

## Discovery & Loading

### Automatic Discovery

All plugin families use consistent discovery configurations:

```typescript
// Discovery config for helpers
{
  family: 'helper',
  patterns: ['/src/plugins/helpers/**/*.{ts,tsx,js,jsx}'],
  origin: 'plugin-dir',
  extractionMode: 'named-export',
  exportPattern: 'register*Helper',
}
```

### Loading Process

```typescript
// In App.tsx or initialization code
await loadAllPlugins({ verbose: true });

// This will:
// 1. Discover all plugin files matching patterns
// 2. Extract plugins using appropriate extraction mode
// 3. Register with both legacy registries and unified catalog
// 4. Track origin and metadata
// 5. Print summary
```

### Manual Registration (Built-ins)

```typescript
import { registerBuiltinHelper } from './lib/plugins/registryBridge';

// Register with origin tracking
registerBuiltinHelper({
  id: 'my-builtin-helper',
  name: 'My Helper',
  // ... helper definition
});
// Automatically marked as origin: 'builtin', canDisable: false
```

## Activation & Lifecycle

### Checking Activation State

```typescript
import { isPluginActive } from './lib/plugins/activationIntegration';

if (isPluginActive('my-plugin-id')) {
  // Plugin is active
}
```

### Enable/Disable Plugins

```typescript
import { activatePlugin, deactivatePlugin } from './lib/plugins/activationIntegration';

// Activate
await activatePlugin('my-plugin-id');

// Deactivate (if canDisable is true)
await deactivatePlugin('my-plugin-id');

// Check if can disable
import { canDisablePlugin } from './lib/plugins/activationIntegration';
if (canDisablePlugin('my-plugin-id')) {
  await deactivatePlugin('my-plugin-id');
}
```

### Bulk Operations

```typescript
import {
  activateFamily,
  deactivateFamily,
  activateUserPlugins,
  deactivateUserPlugins,
} from './lib/plugins/activationIntegration';

// Activate/deactivate entire families
await activateFamily('helper');
await deactivateFamily('interaction');

// Activate/deactivate all user plugins
await activateUserPlugins();
await deactivateUserPlugins();
```

### Subscribing to Changes

```typescript
import { pluginActivationManager } from './lib/plugins/pluginSystem';

// Subscribe to activation changes
const unsubscribe = pluginActivationManager.subscribe(
  'my-plugin-id',
  (state) => {
    console.log(`Plugin is now ${state}`);
  }
);

// Unsubscribe when done
unsubscribe();
```

## Migration Guide

### For Plugin Developers

#### Old Way (Helpers)

```typescript
// plugins/helpers/myHelper.ts
import { sessionHelperRegistry } from '@pixsim7/game.engine';

sessionHelperRegistry.register({
  id: 'my-helper',
  // ...
});
```

#### New Way (Helpers)

```typescript
// plugins/helpers/myHelper.ts
import { registerHelper } from '../../lib/plugins/registryBridge';

export function registerMyHelper() {
  registerHelper({
    id: 'my-helper',
    // ...
  }); // Automatically gets origin: 'plugin-dir'
}
```

#### Old Way (Node Types)

```typescript
// lib/plugins/myNode.ts
import { nodeTypeRegistry } from '@pixsim7/types';

export function registerMyNode() {
  nodeTypeRegistry.register({
    id: 'my-node',
    // ...
  });
}

// Separately in pluginRenderers.ts
import { registerRendererFromNodeType } from './graph/rendererBootstrap';
import MyNodeRenderer from '../components/graph/MyNodeRenderer';

registerRendererFromNodeType({
  nodeType: 'my-node',
  component: MyNodeRenderer,
});
```

#### New Way (Node Types)

```typescript
// lib/plugins/myNode.ts
import { registerNodeType } from './plugins/registryBridge';

export function registerMyNode() {
  registerNodeType({
    id: 'my-node',
    name: 'My Node',
    rendererComponent: 'MyNodeRenderer', // Link to renderer
    // ...
  }); // Automatically gets origin: 'plugin-dir'
}

// components/graph/MyNodeRenderer.tsx
export default function MyNodeRenderer(props: NodeRendererProps) {
  // Implementation
}

// Renderer is auto-registered when calling registerRenderersFromNodeTypes()
```

### For App Initialization

#### Old Way

```typescript
// App.tsx
registerBuiltinNodeTypes();
registerArcNodeTypes();
registerBuiltinRenderers();
registerArcRenderers();
registerPluginRenderers(); // Manual list
await preloadHighPriorityRenderers();
registerBuiltinHelpers();
registerCustomHelpers();
await loadAllPlugins(); // Loads only some families
registerRenderersFromNodeTypes();
```

#### New Way

```typescript
// App.tsx
import { loadAllPlugins } from './lib/pluginLoader';
import { registerRenderersFromNodeTypes } from './lib/graph/autoRegisterRenderers';
import { syncCatalogFromRegistries } from './lib/plugins/registryBridge';
import { initializeActivationStates } from './lib/plugins/activationIntegration';

// Register built-ins (still manual, but using bridge functions)
registerBuiltinNodeTypes(); // These now use registerBuiltinNodeType internally
registerBuiltinHelpers();
registerBuiltinInteractions();

// Sync existing registrations to catalog
syncCatalogFromRegistries();

// Load all plugins (unified discovery)
await loadAllPlugins({ verbose: true });

// Auto-register renderers from node type metadata
registerRenderersFromNodeTypes({ verbose: true });

// Initialize activation states from user preferences
initializeActivationStates();

// Done! All plugins loaded and tracked.
```

## Examples

### Creating a New Helper Plugin

```typescript
// plugins/helpers/skills/skills.ts
import { registerHelper } from '../../../lib/plugins/registryBridge';
import type { HelperDefinition } from '@pixsim7/game.engine';

export function registerSkillsHelper() {
  registerHelper({
    id: 'skills-helper',
    name: 'Skills Helper',
    description: 'Manage character skills',
    category: 'character',
    version: '1.0.0',
    author: 'Your Name',
    fn: (session, params) => {
      // Add skill to character
      const { characterId, skill, level } = params;
      // ... implementation
      return session;
    },
    params: [
      { name: 'characterId', type: 'string', description: 'Character ID' },
      { name: 'skill', type: 'string', description: 'Skill name' },
      { name: 'level', type: 'number', description: 'Skill level' },
    ],
  });
}
```

**That's it!** The system will:
1. Auto-discover this file via `plugins/helpers/**/*.ts`
2. Find the `registerSkillsHelper` function (matches `register*Helper` pattern)
3. Call it to register the helper
4. Add metadata to the catalog with `origin: 'plugin-dir'`
5. Make it available in the session helpers

### Creating a New Node Type Plugin

```typescript
// lib/plugins/craftingNode.ts
import { registerNodeType } from './plugins/registryBridge';
import type { NodeTypeDefinition } from '@pixsim7/types';

export function registerCraftingNode() {
  registerNodeType({
    id: 'crafting',
    name: 'Crafting',
    description: 'Craft items from recipes',
    icon: '🔨',
    category: 'gameplay',
    scope: 'scene',
    userCreatable: true,
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    rendererComponent: 'CraftingNodeRenderer', // Links to renderer
    preloadPriority: 7,
    defaultData: {
      recipe: '',
      ingredients: [],
      result: '',
    },
    validate: (data) => {
      if (!data.recipe) return 'Recipe is required';
      return null;
    },
  });
}
```

```tsx
// components/graph/CraftingNodeRenderer.tsx
import type { NodeRendererProps } from '../../lib/graph/types';

export default function CraftingNodeRenderer({ node, data }: NodeRendererProps) {
  return (
    <div className="crafting-node">
      <h3>🔨 Crafting</h3>
      <p>Recipe: {data.recipe}</p>
      {/* ... render node ... */}
    </div>
  );
}
```

**Auto-registration:**
1. Node type discovered via `/src/lib/plugins/**/*Node.ts`
2. `registerCraftingNode` function called
3. Renderer discovered via `/src/components/graph/**/*Renderer.tsx`
4. Renderer auto-linked via `rendererComponent: 'CraftingNodeRenderer'`
5. Both added to catalog with proper metadata

### Creating a New Dev Tool Plugin

```typescript
// lib/devtools/customDevTool.ts
import { registerDevTool } from '../plugins/registryBridge';
import { MyDebugPanel } from '../../components/dev/MyDebugPanel';

export function registerMyDebugTool() {
  registerDevTool({
    id: 'my-debug-tool',
    label: 'My Debug Tool',
    description: 'Custom debugging panel for my feature',
    icon: '🔧',
    category: 'debug',
    panelComponent: MyDebugPanel,
    tags: ['debug', 'custom', 'diagnostics'],
  });
}
```

```tsx
// components/dev/MyDebugPanel.tsx
export function MyDebugPanel() {
  return (
    <div className="p-4">
      <h2 className="text-lg font-bold">My Debug Tool</h2>
      <p>Custom debug information here...</p>
    </div>
  );
}
```

**Auto-registration:**
1. Call `registerMyDebugTool()` during app initialization
2. Tool appears in DevToolsPanel and Plugin Browser
3. Can be opened as a panel in dev workspace presets
4. Metadata tracked in plugin catalog

### Querying the Plugin Catalog

```typescript
import { pluginCatalog } from './lib/plugins/pluginSystem';

// Get all plugins
const all = pluginCatalog.getAll();

// Get by family
const helpers = pluginCatalog.getByFamily('helper');
const interactions = pluginCatalog.getByFamily('interaction');

// Get by origin
const builtins = pluginCatalog.getByOrigin('builtin');
const userPlugins = pluginCatalog.getUserPlugins();

// Get active plugins
const active = pluginCatalog.getActive();

// Get specific plugin
const plugin = pluginCatalog.get('my-plugin-id');
if (plugin) {
  console.log(`Origin: ${plugin.origin}`);
  console.log(`State: ${plugin.activationState}`);
  console.log(`Can disable: ${plugin.canDisable}`);
}

// Print summary
pluginCatalog.printSummary();
// Output:
// === Plugin Catalog Summary ===
// Total plugins: 42
// Active: 38, Inactive: 4
//
// By Family:
//   helper: 12
//   interaction: 8
//   node-type: 15
//   renderer: 15
//   world-tool: 5
//
// By Origin:
//   builtin: 30
//   plugin-dir: 12
```

## Best Practices

1. **Always use bridge functions** for registration (e.g., `registerHelper`, not `sessionHelperRegistry.register`)
2. **Follow naming conventions** for auto-discovery (`register*Helper`, `*Renderer.tsx`)
3. **Set rendererComponent** in node types instead of manually registering renderers
4. **Use origin tracking** to distinguish built-ins from user plugins
5. **Check canDisable** before attempting to disable plugins
6. **Initialize activation states** from user preferences on app start
7. **Use the catalog** for querying instead of individual registries

## Troubleshooting

### Plugin not discovered

- Check file naming: `/src/plugins/<family>/**/*.{ts,tsx,js,jsx}`
- Check export naming: Must match pattern (e.g., `register*Helper`)
- Enable verbose logging: `loadAllPlugins({ verbose: true })`

### Renderer not found

- Check file location: `/src/components/graph/**/*Renderer.{tsx,ts}`
- Check naming: Must end with `Renderer.tsx` (e.g., `MyNodeRenderer.tsx`)
- Check rendererComponent field matches filename: `rendererComponent: 'MyNodeRenderer'`
- Use strict mode for errors: `registerRenderersFromNodeTypes({ strict: true })`

### Plugin always active/inactive

- Check `canDisable` field in catalog: `pluginCatalog.get('id')?.canDisable`
- Built-ins default to `canDisable: false`
- Use `registerHelper` instead of `registerBuiltinHelper` for user plugins

### Catalog out of sync

- Call `syncCatalogFromRegistries()` to sync from legacy registries
- Call `initializeActivationStates()` to sync from pluginConfigStore
- Use bridge functions for all new registrations

---

For more information, see:
- [Plugin Loader](../apps/main/src/lib/pluginLoader.ts)
- [Plugin System](../apps/main/src/lib/plugins/pluginSystem.ts)
- [Registry Bridge](../apps/main/src/lib/plugins/registryBridge.ts)
- [Activation Integration](../apps/main/src/lib/plugins/activationIntegration.ts)
