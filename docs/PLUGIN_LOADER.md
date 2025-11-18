# Plugin Loader System

The plugin loader system provides automatic discovery and registration of helper and interaction plugins. Plugins are loaded from the `frontend/src/plugins/` directory and automatically registered with their respective registries during app initialization.

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [Directory Structure](#directory-structure)
5. [Plugin Types](#plugin-types)
6. [How It Works](#how-it-works)
7. [API Reference](#api-reference)
8. [Examples](#examples)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The plugin loader eliminates the need to manually import and register plugins. Simply drop your plugin file into the appropriate directory, and it will be automatically discovered and loaded during app initialization.

### Benefits

- **Zero Configuration**: No imports needed - just drop files in the right directory
- **Convention-based**: Follows naming conventions for automatic detection
- **Type-safe**: Full TypeScript support with autocomplete
- **Developer-friendly**: Clear error messages and verbose logging
- **Performance**: Lazy loading support for optimal startup time
- **Hot-reload friendly**: Works seamlessly with Vite's HMR

### Supported Plugin Types

1. **Helper Plugins**: Session state management helpers (registered with `sessionHelperRegistry`)
2. **Interaction Plugins**: NPC interaction plugins (registered with `interactionRegistry`)

---

## Quick Start

### 1. Create a Plugin

Using the CLI (recommended):

```bash
node scripts/create-plugin/index.js
```

Or manually create a file in the appropriate directory:

**Helper Plugin**: `frontend/src/plugins/helpers/my-helper/my-helper.ts`

```typescript
import { sessionHelperRegistry } from '@pixsim7/game-core';
import type { GameSessionDTO } from '@pixsim7/types';

export function registerMyHelper() {
  sessionHelperRegistry.register({
    name: 'myHelper',
    category: 'custom',
    description: 'My custom helper',
    fn: (session: GameSessionDTO, value: number) => {
      // Your logic here
    },
  });
}
```

**Interaction Plugin**: `frontend/src/plugins/interactions/my-interaction/my-interaction.ts`

```typescript
import type { InteractionPlugin } from '../../../lib/game/interactions/types';

interface MyConfig {
  enabled: boolean;
  value: number;
}

export const myInteractionPlugin: InteractionPlugin<MyConfig> = {
  id: 'my-interaction',
  name: 'My Interaction',
  description: 'My custom interaction',
  defaultConfig: { enabled: true, value: 50 },
  configFields: [
    { key: 'enabled', label: 'Enabled', type: 'boolean' },
    { key: 'value', label: 'Value', type: 'number', min: 0, max: 100 },
  ],
  async execute(config, context) {
    return { success: true };
  },
};
```

### 2. Reload the App

That's it! The plugin loader will automatically discover and register your plugin on the next page load.

Check the browser console to see plugin loading logs:

```
🔌 Loading plugins...
   Loading 1 helper plugin(s)...
   ✓ my-helper/my-helper.ts
   Loading 1 interaction plugin(s)...
   ✓ my-interaction/my-interaction.ts
✅ Plugins loaded:
   Helpers: 1 loaded, 0 failed
   Interactions: 1 loaded, 0 failed
```

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      App.tsx                             │
│  (calls loadAllPlugins() during initialization)         │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                  Plugin Loader                           │
│  (frontend/src/lib/pluginLoader.ts)                     │
│  • Uses import.meta.glob for discovery                  │
│  • Loads plugins asynchronously                         │
│  • Handles errors gracefully                            │
└─────────┬─────────────────────────┬─────────────────────┘
          │                         │
          ▼                         ▼
┌─────────────────────┐   ┌─────────────────────┐
│  Helper Plugins     │   │ Interaction Plugins │
│  plugins/helpers/   │   │ plugins/interactions│
└─────────┬───────────┘   └─────────┬───────────┘
          │                         │
          ▼                         ▼
┌─────────────────────┐   ┌─────────────────────┐
│ sessionHelperRegistry│   │ interactionRegistry │
└─────────────────────┘   └─────────────────────┘
```

### Flow

1. **App Initialization**: `App.tsx` calls `loadAllPlugins()` in its `useEffect` hook
2. **Discovery**: Plugin loader uses Vite's `import.meta.glob` to find all files in plugin directories
3. **Loading**: Each plugin file is dynamically imported (lazy loading for performance)
4. **Detection**: The loader checks each module's exports for recognized patterns
5. **Registration**: Plugins are registered with their appropriate registry
6. **Logging**: Success/failure is logged to the console

---

## Directory Structure

```
frontend/src/plugins/
├── README.md                    # Plugin system documentation
├── helpers/                     # Session helper plugins
│   ├── .gitkeep                 # Ensures directory is tracked
│   └── example/                 # Example helper plugin
│       └── example.ts
└── interactions/                # NPC interaction plugins
    ├── .gitkeep                 # Ensures directory is tracked
    └── example/                 # Example interaction plugin
        └── example.ts
```

### Naming Conventions

- **Directory names**: kebab-case (e.g., `my-plugin`)
- **File names**: Match directory name (e.g., `my-plugin.ts`)
- **Helper registration functions**: Start with `register` (e.g., `registerMyPlugin`)
- **Interaction exports**: End with `Plugin` (e.g., `myPlugin`)

---

## Plugin Types

### Helper Plugins

Helper plugins extend the session state management system. They can:

- Manipulate session flags
- Perform calculations on session data
- Provide utility functions for game logic

**Requirements**:
- Must export a function starting with `register` (e.g., `registerMyHelper`)
- OR export objects matching the `HelperDefinition` interface

**Example**:

```typescript
import { sessionHelperRegistry } from '@pixsim7/game-core';

export function registerReputationHelper() {
  sessionHelperRegistry.register({
    name: 'adjustReputation',
    category: 'custom',
    fn: (session, factionId, amount) => {
      // Implementation
    },
  });
}
```

### Interaction Plugins

Interaction plugins add new ways to interact with NPCs. They can:

- Display custom UI in the interaction panel
- Modify game state via session helpers
- Open scenes or trigger events

**Requirements**:
- Must export an object with `id` and `execute` properties
- Must implement the `InteractionPlugin<TConfig>` interface

**Example**:

```typescript
import type { InteractionPlugin } from '../../../lib/game/interactions/types';

export const tradePlugin: InteractionPlugin<TradeConfig> = {
  id: 'trade',
  name: 'Trade',
  // ...other properties
  async execute(config, context) {
    return { success: true };
  },
};
```

---

## How It Works

### 1. Discovery Phase

The plugin loader uses Vite's `import.meta.glob` to find all TypeScript/JavaScript files in the plugin directories:

```typescript
const helperModules = import.meta.glob<any>('/src/plugins/helpers/**/*.{ts,tsx,js,jsx}', {
  eager: false, // Lazy load
});

const interactionModules = import.meta.glob<any>('/src/plugins/interactions/**/*.{ts,tsx,js,jsx}', {
  eager: false,
});
```

**Note**: The pattern is static and checked at build time by Vite. Any files added/removed require a rebuild.

### 2. Loading Phase

Each plugin is dynamically imported:

```typescript
for (const path of helperPaths) {
  const module = await helperModules[path]();
  // Process module...
}
```

### 3. Detection Phase

The loader examines module exports to determine what kind of plugin it is:

**For helpers**:
1. Look for functions starting with `register`
2. If found, call the function
3. Otherwise, look for `HelperDefinition` objects and auto-register them

**For interactions**:
1. Look for objects with `id` and `execute` properties
2. Register each one with `interactionRegistry`

### 4. Registration Phase

Plugins are registered with their appropriate registry:

```typescript
// Helpers
sessionHelperRegistry.register(helperDefinition);

// Interactions
interactionRegistry.register(interactionPlugin);
```

### 5. Error Handling

By default, the loader is **non-strict**:
- Individual plugin failures are logged as warnings
- Other plugins continue to load
- Summary shows how many succeeded/failed

In **strict mode** (`strict: true`):
- First plugin failure throws an error
- Remaining plugins are not loaded
- Useful for development/testing

---

## API Reference

### `loadAllPlugins(config?: PluginLoaderConfig): Promise<PluginLoadResult>`

Main function to load all plugins.

**Parameters**:
- `config` (optional): Configuration object
  - `verbose` (boolean): Log loading progress (default: `true`)
  - `strict` (boolean): Throw on errors (default: `false`)

**Returns**: Promise resolving to `PluginLoadResult`

**Example**:

```typescript
import { loadAllPlugins } from './lib/pluginLoader';

const result = await loadAllPlugins({
  verbose: true,
  strict: false,
});

console.log(`Loaded ${result.helpers.loaded} helpers`);
console.log(`Loaded ${result.interactions.loaded} interactions`);
```

### `loadAllPluginsSync(config?: PluginLoaderConfig): void`

Synchronous version of `loadAllPlugins`. Uses eager loading.

**Note**: Not recommended as it blocks the main thread. Use async version when possible.

### `reloadAllPlugins(config?: PluginLoaderConfig): Promise<PluginLoadResult>`

Reload all plugins. Useful for hot reload during development.

**Note**: This doesn't clear existing registrations, only adds new ones.

### `PluginLoadResult`

Result object returned by `loadAllPlugins`:

```typescript
interface PluginLoadResult {
  helpers: { loaded: number; failed: number };
  interactions: { loaded: number; failed: number };
  errors: Array<{ plugin: string; error: string }>;
}
```

---

## Examples

### Example 1: Simple Helper Plugin

Create a helper for tracking achievements:

**File**: `plugins/helpers/achievements/achievements.ts`

```typescript
import { sessionHelperRegistry, generateHelper } from '@pixsim7/game-core';

export function registerAchievementsHelper() {
  generateHelper({
    name: 'unlockAchievement',
    category: 'custom',
    keyPattern: 'achievements.{achievementId}',
    operation: 'set',
  });

  generateHelper({
    name: 'hasAchievement',
    category: 'custom',
    keyPattern: 'achievements.{achievementId}',
    operation: 'get',
  });
}
```

Usage:

```typescript
sessionHelperRegistry.execute('unlockAchievement', session, 'first-kill', true);
const hasIt = sessionHelperRegistry.execute('hasAchievement', session, 'first-kill');
```

### Example 2: Complex Interaction Plugin

Create a bartering interaction:

**File**: `plugins/interactions/barter/barter.ts`

```typescript
import type { InteractionPlugin } from '../../../lib/game/interactions/types';

interface BarterConfig {
  enabled: boolean;
  minReputation: number;
  discountRate: number;
}

export const barterPlugin: InteractionPlugin<BarterConfig> = {
  id: 'barter',
  name: 'Barter',
  description: 'Negotiate prices with merchants',
  icon: '💰',

  defaultConfig: {
    enabled: true,
    minReputation: 25,
    discountRate: 0.1,
  },

  configFields: [
    { key: 'enabled', label: 'Enabled', type: 'boolean' },
    { key: 'minReputation', label: 'Min Reputation', type: 'number', min: 0, max: 100 },
    { key: 'discountRate', label: 'Discount %', type: 'number', min: 0, max: 1, step: 0.05 },
  ],

  async execute(config, context) {
    const { state, session, onSuccess, onError } = context;
    const npcId = state.assignment.npc_id;
    const relationship = state.relationships[npcId];

    // Check reputation requirement
    if ((relationship?.affinity || 0) < config.minReputation) {
      onError(`Need ${config.minReputation} reputation to barter`);
      return { success: false };
    }

    // Apply discount
    const discount = Math.floor(config.discountRate * 100);
    onSuccess(`Merchant offers ${discount}% discount!`);

    return {
      success: true,
      data: { discount: config.discountRate },
    };
  },

  isAvailable(context) {
    // Only available for merchants
    return context.state.assignment.npc?.tags?.includes('merchant') || false;
  },
};
```

### Example 3: Conditional Plugin Loading

Load plugins based on feature flags:

```typescript
import { loadAllPlugins } from './lib/pluginLoader';

// In App.tsx
useEffect(() => {
  const featureFlags = {
    enableBetaPlugins: localStorage.getItem('beta-plugins') === 'true',
  };

  if (featureFlags.enableBetaPlugins) {
    loadAllPlugins({ verbose: true });
  } else {
    loadAllPlugins({ verbose: false });
  }
}, []);
```

---

## Best Practices

### 1. Organization

- **One plugin per directory**: Keep related files together
- **Clear naming**: Use descriptive names that indicate purpose
- **Group by feature**: Related plugins in sibling directories

### 2. Code Quality

- **Type safety**: Always use TypeScript
- **Error handling**: Handle errors gracefully
- **Documentation**: Add JSDoc comments
- **Testing**: Write unit tests for complex logic

### 3. Performance

- **Lazy loading**: Use async imports for large plugins
- **Minimal dependencies**: Keep plugins lightweight
- **Efficient logic**: Avoid expensive operations in execute methods

### 4. User Experience

- **Clear config UI**: Use descriptive labels and help text
- **Validation**: Validate config before execution
- **Feedback**: Use onSuccess/onError for user feedback
- **Availability checks**: Hide unavailable interactions

### 5. Maintainability

- **Version control**: Commit plugin files to git
- **Changelog**: Document changes to plugin behavior
- **Backwards compatibility**: Avoid breaking changes to config
- **Migration**: Provide migration paths for major changes

---

## Troubleshooting

### Plugin not loading

**Symptoms**: Plugin doesn't appear in console logs

**Solutions**:
1. Check file is in correct directory (`plugins/helpers/` or `plugins/interactions/`)
2. Ensure file extension is `.ts`, `.tsx`, `.js`, or `.jsx`
3. Verify export follows naming conventions
4. Check browser console for errors
5. Try rebuilding: `npm run build`

### Plugin fails to register

**Symptoms**: Plugin appears in logs with ✗ or ⚠️

**Solutions**:
1. Check export matches expected interface
2. For helpers: Ensure function name starts with `register`
3. For interactions: Ensure object has `id` and `execute` properties
4. Check TypeScript errors: `npx tsc --noEmit`
5. Enable strict mode to see full error: `loadAllPlugins({ strict: true })`

### Type errors

**Symptoms**: TypeScript errors in plugin code

**Solutions**:
1. Import types from correct packages:
   - Helpers: `import { sessionHelperRegistry } from '@pixsim7/game-core'`
   - Interactions: `import type { InteractionPlugin } from '../../../lib/game/interactions/types'`
2. Ensure config interface extends `BaseInteractionConfig` (for interactions)
3. Run `npm run build` to check for type errors
4. Restart IDE/language server

### Plugin not appearing in UI

**Symptoms**: Plugin loads but doesn't show in game

**Solutions**:

For interactions:
1. Check `enabled: true` in defaultConfig
2. Verify `isAvailable()` returns true
3. Check NPC has required tags/properties
4. Look in interaction config panel to enable it

For helpers:
- Helpers don't have UI - they're used in code via registry

### Hot reload issues

**Symptoms**: Changes not reflecting after save

**Solutions**:
1. Do a full page refresh (Ctrl+R / Cmd+R)
2. Restart dev server: `npm run dev`
3. Clear browser cache
4. Check Vite console for rebuild errors

### Import.meta.glob not working

**Symptoms**: Glob pattern returns empty object

**Solutions**:
1. Ensure you're using Vite (not webpack)
2. Check pattern is static (no variables)
3. Verify path is relative to project root
4. Try absolute path: `/src/plugins/...`
5. Check Vite version: `npx vite --version`

---

## Advanced Topics

### Custom Plugin Directories

To add additional plugin directories, modify the loader:

```typescript
// In pluginLoader.ts
const customModules = import.meta.glob<any>('/src/custom-plugins/**/*.ts', {
  eager: false,
});
```

### Plugin Dependencies

If a plugin depends on another, use naming to control load order (alphabetical):

```
plugins/
├── helpers/
│   ├── 01-core/        # Loads first
│   ├── 02-utils/       # Loads second
│   └── 03-advanced/    # Loads third
```

### Dynamic Plugin Configuration

Store plugin config in localStorage or backend:

```typescript
const pluginConfig = JSON.parse(localStorage.getItem('plugin-config') || '{}');

loadAllPlugins({
  verbose: pluginConfig.verbose !== false,
  strict: pluginConfig.strict === true,
});
```

### Build-time Plugin Generation

Generate plugins during build using Vite plugins:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'generate-plugins',
      buildStart() {
        // Generate plugin files
      },
    },
  ],
});
```

---

## Related Documentation

- [PLUGIN_SYSTEM.md](../PLUGIN_SYSTEM.md) - Complete plugin system guide
- [frontend/src/plugins/README.md](../frontend/src/plugins/README.md) - Plugin directory guide
- [Session Helper Reference](./SESSION_HELPER_REFERENCE.md) - Helper API docs
- [Interaction System](./BACKEND_INTERACTION_DISPATCHER.md) - Interaction architecture

---

## Contributing

To improve the plugin loader:

1. Discuss changes in GitHub issues
2. Add tests for new features
3. Update documentation
4. Submit pull request

## License

Same as parent project (MIT)
