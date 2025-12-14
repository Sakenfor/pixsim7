# Node Type Plugin Auto-Loading

## Overview

Node type plugins (like `seductionNode` and `questTriggerNode`) are now automatically discovered and registered at app startup, following the same pattern as helper and interaction plugins.

## Implementation Summary

### Changes Made

1. **Extended `pluginLoader.ts`** (apps/main/src/lib/pluginLoader.ts)
   - Added `loadNodeTypePlugins()` function
   - Updated `PluginLoadResult` interface to include `nodes` field
   - Integrated node plugin loading into `loadAllPlugins()`
   - Node plugins are loaded **first** (before helpers/interactions) to ensure availability when scenes load

2. **Updated `App.tsx`** (apps/main/src/App.tsx)
   - Removed manual imports: `registerSeductionNode` and `registerQuestTriggerNode`
   - Removed manual registration calls
   - Updated comments to reflect automatic plugin discovery

3. **Plugin Convention**
   - **Location**: `apps/main/src/lib/plugins/**/*Node.{ts,tsx}`
   - **Export Convention**: Functions matching pattern `register*Node`
   - **Examples**:
     - `registerSeductionNode()` in `seductionNode.ts`
     - `registerQuestTriggerNode()` in `questTriggerNode.ts`

## How It Works

### Discovery Pattern

The plugin loader uses Vite's `import.meta.glob` to discover all files matching:
```
/src/lib/plugins/**/*Node.{ts,tsx,js,jsx}
```

### Registration Pattern

For each discovered file:
1. Load the module dynamically
2. Find all exported functions matching `register*Node`
3. Call each registration function
4. Track success/failure counts
5. Log results to console

### Console Output

When the app starts, you'll see:
```
🔌 Loading plugins...
   Loading 2 node type plugin(s)...
   ✓ seductionNode.ts (1 node type(s))
   ✓ questTriggerNode.ts (1 node type(s))
   Loading X helper plugin(s)...
   ...
✅ Plugins loaded:
   Node Types: 2 loaded, 0 failed
   Helpers: X loaded, Y failed
   Interactions: X loaded, Y failed
```

## Creating New Node Type Plugins

### Step 1: Create the Plugin File

Create a file in `apps/main/src/lib/plugins/` with a name ending in `Node.ts`:

```typescript
// apps/main/src/lib/plugins/myCustomNode.ts
import { nodeTypeRegistry } from '@pixsim7/types';

export interface MyCustomNodeData {
  // Your node data structure
  someField: string;
  anotherField: number;
}

/**
 * Register the custom node type
 * This function will be auto-discovered and called at app startup
 */
export function registerMyCustomNode() {
  nodeTypeRegistry.register<MyCustomNodeData>({
    id: 'my-custom',
    name: 'My Custom Node',
    description: 'Description of what this node does',
    icon: '🎯',
    category: 'custom',
    scope: 'scene', // or 'arc' or 'world'
    userCreatable: true,

    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',

    defaultData: {
      someField: 'default value',
      anotherField: 42,
    },

    editorComponent: 'MyCustomNodeEditor',

    validate: (data: MyCustomNodeData) => {
      if (!data.someField) {
        return 'someField is required';
      }
      return null; // Valid
    },
  });

  console.log('✓ Registered my-custom node type');
}
```

### Step 2: That's It!

No need to:
- Import the file anywhere
- Call the registration function manually
- Update any configuration

The plugin will be automatically discovered and loaded when the app starts.

## Naming Convention Rules

✅ **Valid function names** (will be auto-discovered):
- `registerSeductionNode`
- `registerQuestTriggerNode`
- `registerMyCustomNode`
- `registerVideoNode` (though builtin nodes shouldn't use this pattern)

❌ **Invalid function names** (will NOT be auto-discovered):
- `registerSeduction` (doesn't end with "Node")
- `registerNodeType` (doesn't start with "register")
- `seductionNodeRegister` (wrong order)
- `register_seduction_node` (snake_case not supported)

## Testing

To verify node plugins are loading correctly:

1. **Check browser console on app startup** - You should see:
   ```
   🔌 Loading plugins...
   Loading X node type plugin(s)...
   ✓ pluginName.ts (Y node type(s))
   ```

2. **Open Node Palette** in Scene Builder or Arc Graph
   - Your custom nodes should appear automatically
   - No manual registration needed

3. **Check for errors** - If a plugin fails to load:
   ```
   ⚠️  pluginName.ts: No register*Node function exports found
   ✗ pluginName.ts: Error message here
   ```

## Benefits

1. **Automatic Discovery**: No need to manually import/register plugins
2. **Consistent Pattern**: Same approach as helpers and interactions
3. **Easy to Add**: Just drop a file in the right location
4. **Clear Logging**: See exactly what plugins loaded successfully
5. **Error Handling**: Failed plugins don't crash the app
6. **Performance**: Lazy loading keeps initial bundle small

## Migration Notes

Existing plugins (`seductionNode.ts` and `questTriggerNode.ts`) required no changes:
- They already used the correct naming convention
- They already exported `register*Node` functions
- They already called `nodeTypeRegistry.register()`

Only the manual registration in `App.tsx` needed to be removed.

## Troubleshooting

### Plugin not loading?

1. **Check file location**: Must be in `apps/main/src/lib/plugins/` or subdirectories
2. **Check filename**: Must end with `Node.ts` or `Node.tsx`
3. **Check export**: Must export a function named `register*Node`
4. **Check console**: Look for error messages in browser console

### Plugin loading but not appearing in palette?

1. **Check `userCreatable`**: Must be set to `true`
2. **Check `scope`**: Must match the graph you're viewing (scene/arc/world)
3. **Check registration**: Ensure `nodeTypeRegistry.register()` is being called

### Build errors?

Run TypeScript check:
```bash
cd frontend && npx tsc --noEmit
```

## Architecture

```
App.tsx (useEffect)
  └─> loadAllPlugins()
      ├─> loadNodeTypePlugins()  ← Loads first
      │   ├─ Discovers: /src/lib/plugins/**/*Node.{ts,tsx}
      │   ├─ Filters: exports matching register*Node
      │   └─ Calls: each registration function
      ├─> loadHelperPlugins()
      └─> loadInteractionPlugins()
```

## Related Files

- `apps/main/src/lib/pluginLoader.ts` - Plugin loading logic
- `apps/main/src/App.tsx` - Calls `loadAllPlugins()` on startup
- `apps/main/src/lib/plugins/seductionNode.ts` - Example node plugin
- `apps/main/src/lib/plugins/questTriggerNode.ts` - Example node plugin
- `apps/main/src/components/nodes/NodePalette.tsx` - Uses `nodeTypeRegistry.getUserCreatable()`
