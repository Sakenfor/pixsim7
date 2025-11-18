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

## Future Enhancements

### Plugin System
```typescript
// Future: Load plugins from external modules
async function loadNodeTypePlugins() {
  const plugins = await loadPluginsFromDirectory('./plugins/nodes');

  plugins.forEach(plugin => {
    plugin.registerNodeTypes(nodeTypeRegistry);
  });
}
```

### Runtime Registration
```typescript
// Future: Register types at runtime via API
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
