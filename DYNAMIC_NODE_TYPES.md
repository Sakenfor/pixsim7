# Dynamic Node Type System

## Overview

The node type system has been transformed from hardcoded enums and switch statements into a dynamic plugin-based registry system. This allows new node types to be added without modifying core code.

## Architecture

### Core Components

1. **NodeTypeRegistry** (`packages/types/src/nodeTypeRegistry.ts`)
   - Central registry for all node types
   - Singleton pattern with `nodeTypeRegistry` instance
   - Methods: `register()`, `get()`, `getAll()`, `getByCategory()`, `getUserCreatable()`

2. **Built-in Node Types** (`packages/types/src/builtinNodeTypes.ts`)
   - Registers all standard node types (video, choice, condition, etc.)
   - Called on app initialization

3. **Dynamic Type System** (`packages/types/src/index.ts`)
   - `SceneNodeType = BaseSceneNodeType | string`
   - Supports both built-in and custom types

## Usage

### Registering a Custom Node Type

```typescript
import { nodeTypeRegistry } from '@pixsim7/types';

// Register a custom node type
nodeTypeRegistry.register({
  id: 'my_custom_node',
  name: 'My Custom Node',
  description: 'Does something custom',
  icon: '✨',
  category: 'custom',
  userCreatable: true,
  color: 'text-pink-700 dark:text-pink-300',
  bgColor: 'bg-pink-100 dark:bg-pink-900/30',
  defaultData: {
    customField: 'default value',
  },
  editorComponent: 'MyCustomNodeEditor',
  validate: (data) => {
    if (!data.customField) return 'Custom field is required';
    return null;
  },
});
```

### Creating a Custom Editor Component

```typescript
// frontend/src/components/inspector/MyCustomNodeEditor.tsx
export function MyCustomNodeEditor({ node, onUpdate }) {
  return (
    <div>
      <h3>Custom Node Editor</h3>
      <input
        value={node.customField || ''}
        onChange={(e) => onUpdate({ customField: e.target.value })}
      />
    </div>
  );
}

// Register in InspectorPanel.tsx EDITOR_COMPONENTS map
const EDITOR_COMPONENTS = {
  // ... existing editors
  MyCustomNodeEditor: lazy(() => import('./MyCustomNodeEditor').then(m => ({ default: m.MyCustomNodeEditor }))),
};
```

## Built-in Node Types

All built-in node types are now registered via the registry:

- **video** (🎬) - Media playback
- **choice** (🔀) - Player choices
- **condition** (❓) - Conditional branching
- **end** (🏁) - Scene termination
- **scene_call** (📞) - Call another scene
- **return** (🔙) - Return from scene call
- **generation** (🤖) - AI content generation (experimental)
- **action** (⚡) - Trigger effects/actions
- **miniGame** (🎮) - Interactive mini-game
- **node_group** (📦) - Visual organization

## Categories

Node types are organized by category in the UI:
- `media` - Video, audio, mini-games
- `flow` - Choice, scene call, return, end
- `logic` - Conditions, branches
- `action` - Effects, triggers
- `custom` - User-defined types

## Scopes (Multi-Level Organization)

Node types can be scoped to different organizational levels:
- `scene` - Scene-level nodes (video, choice, etc.)
- `arc` - Arc-level nodes (quest triggers, story branches)
- `world` - World-level nodes (global state changes, world events)
- `custom` - Custom scoping for specialized use cases

```typescript
// Register an arc-level quest trigger
nodeTypeRegistry.register({
  id: 'quest-trigger',
  name: 'Quest Trigger',
  scope: 'arc', // Arc-level organization
  category: 'action',
  // ... other properties
});

// Filter nodes by scope
const arcNodes = nodeTypeRegistry.getByScope('arc');
const sceneAndArcNodes = nodeTypeRegistry.getByScopes(['scene', 'arc']);
```

## Components Updated

### 1. InspectorPanel
- Now uses registry lookup instead of switch statements
- Dynamically loads editor components
- Shows fallback UI for types without editors
- Displays node icon and description from registry

### 2. NodePalette
- Auto-generates palette from registered types
- Groups by category
- Only shows user-creatable types
- Fully dynamic - no hardcoded list

### 3. GraphPanel
- Uses registry for node creation
- Applies default data from registry
- Supports custom node types

### 4. App.tsx
- Calls `registerBuiltinNodeTypes()` on startup
- Ready for plugin loading system

## Performance Optimization

### Lazy Loading

For heavy plugins with large dependencies, use lazy loading to improve initial load time:

```typescript
// Stub definition registered immediately (small bundle)
nodeTypeRegistry.register({
  id: 'heavy-plugin',
  name: 'Heavy Plugin',
  category: 'custom',
  defaultData: {},

  // Lazy load full definition when needed
  loader: async () => {
    const module = await import('./heavy-plugin.full');
    return module.heavyPluginNodeTypeFull;
  },

  // Optional: Priority for preloading (0-10, higher = sooner)
  preloadPriority: 5,
});

// Access with async get (loads if needed)
const nodeType = await nodeTypeRegistry.get('heavy-plugin');
```

**When to use lazy loading:**
- Large validation libraries
- Heavy computation or parsing logic
- Conditional logic that depends on runtime state
- Plugins with large dependencies

**When NOT to use lazy loading:**
- Simple, lightweight nodes (overhead not worth it)
- Frequently used core nodes (better to load upfront)

### Preloading

Improve UX by preloading important types before the user needs them:

```typescript
// Preload specific types
await nodeTypeRegistry.preload(['quest-trigger', 'npc-interaction']);

// Preload by priority (loads top 10 highest priority)
await nodeTypeRegistry.preload();

// In app initialization
async function initializeNodeTypes() {
  // Register all types (lightweight stubs)
  registerBuiltinNodeTypes();
  registerPluginNodeTypes();

  // Preload high-priority types in background
  nodeTypeRegistry.preload(); // Non-blocking
}
```

### Caching

The registry uses an LRU cache (max 50 entries) for frequently accessed types:

```typescript
// First access - cache miss
const type1 = await nodeTypeRegistry.get('video'); // Loads from registry

// Second access - cache hit (faster)
const type2 = await nodeTypeRegistry.get('video'); // Returns from cache

// Get cache statistics
const stats = nodeTypeRegistry.getCacheStats();
console.log(stats); // { size: 15, maxSize: 50 }

// Clear cache if needed (e.g., during hot reload)
nodeTypeRegistry.clearCache();
```

## Plugin System

### Using create-plugin CLI

Generate new node type plugins quickly:

```bash
# Interactive mode
node scripts/create-plugin/index.js

# Non-interactive mode
node scripts/create-plugin/index.js \
  --type node \
  --name my-quest \
  --description "Custom quest node type"
```

**Generated structure:**
```
plugins/my-quest/
├── my-quest.ts          # Node type definition
├── README.md            # Documentation
└── example-config.json  # Configuration example
```

### Example: Quest Trigger Plugin

See `examples/plugins/quest-trigger/` for a comprehensive plugin example demonstrating:
- Rich data structure with validation
- Scope-based organization (`arc` level)
- Lazy loading patterns
- Renderer integration
- Preload priority

```typescript
import { questTriggerNodeType } from './examples/plugins/quest-trigger/quest-trigger';
import { nodeTypeRegistry } from '@pixsim7/types';

// Register the plugin
nodeTypeRegistry.register(questTriggerNodeType);
```

### Loading Plugins from Directory

```typescript
async function loadNodeTypePlugins() {
  const plugins = await loadPluginsFromDirectory('./plugins/nodes');

  plugins.forEach(plugin => {
    plugin.registerNodeTypes(nodeTypeRegistry);
  });
}
```

### Runtime Registration

```typescript
// Register types dynamically via API
fetch('/api/node-types/custom-mod')
  .then(res => res.json())
  .then(typeDef => nodeTypeRegistry.register(typeDef));
```

## Benefits

1. **Extensibility** - Add new node types without touching core code
2. **Modularity** - Node types are self-contained definitions
3. **Type Safety** - Full TypeScript support
4. **Dynamic UI** - Palette and inspector auto-update
5. **Plugin Ready** - Foundation for future plugin system

## Testing

All existing node types work identically through the registry system. The transformation is backward-compatible.

To verify:
1. ✅ Types package builds without errors
2. ✅ Frontend TypeScript compilation passes
3. ✅ All node editors render correctly
4. ✅ Node palette shows all types
5. ✅ Node creation uses default data from registry

## Migration Notes

- `SceneNodeType` is now `BaseSceneNodeType | string` for extensibility
- All hardcoded node type checks still work (backward compatible)
- Custom types should use namespaced IDs (e.g., `'mymod:special_node'`)
