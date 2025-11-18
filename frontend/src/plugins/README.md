# Plugin Directory

This directory contains custom plugins for the game engine. Plugins are automatically discovered and loaded by the plugin loader system.

## Directory Structure

```
plugins/
├── helpers/          # Session helper plugins
│   └── example/
│       └── example.ts
└── interactions/     # NPC interaction plugins
    └── example/
        └── example.ts
```

## Adding a New Plugin

### 1. Using the CLI (Recommended)

The easiest way to create a plugin is using the built-in CLI tool:

```bash
node scripts/create-plugin/index.js
```

This will:
- Prompt you for plugin type, name, and description
- Generate all necessary files with proper structure
- Create example code and documentation

### 2. Manual Creation

If you prefer to create plugins manually:

#### Helper Plugin

Create a file in `plugins/helpers/<plugin-name>/<plugin-name>.ts`:

```typescript
import { sessionHelperRegistry } from '@pixsim7/game-core';
import type { GameSessionDTO } from '@pixsim7/types';

export function registerMyHelper() {
  sessionHelperRegistry.register({
    name: 'myCustomHelper',
    category: 'custom',
    description: 'Does something useful',
    fn: (session: GameSessionDTO, ...args: any[]) => {
      // Your implementation here
    },
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'arg1', type: 'string' },
    ],
  });
}
```

#### Interaction Plugin

Create a file in `plugins/interactions/<plugin-name>/<plugin-name>.ts`:

```typescript
import type { InteractionPlugin } from '../../lib/game/interactions/types';

interface MyConfig {
  enabled: boolean;
  someOption: number;
}

export const myInteractionPlugin: InteractionPlugin<MyConfig> = {
  id: 'my-interaction',
  name: 'My Interaction',
  description: 'A custom interaction',
  icon: '⚡',

  defaultConfig: {
    enabled: true,
    someOption: 50,
  },

  configFields: [
    { key: 'enabled', label: 'Enabled', type: 'boolean' },
    { key: 'someOption', label: 'Some Option', type: 'number', min: 0, max: 100 },
  ],

  async execute(config, context) {
    // Your implementation here
    return { success: true, message: 'Done!' };
  },
};
```

## How It Works

### Automatic Discovery

The plugin loader (`frontend/src/lib/pluginLoader.ts`) uses Vite's `import.meta.glob` to automatically discover and load plugins:

1. **Helper Plugins**: Searches for files in `plugins/helpers/**/*.{ts,tsx,js,jsx}`
   - Looks for functions starting with `register` (e.g., `registerMyHelper`)
   - Or auto-registers objects matching the `HelperDefinition` interface

2. **Interaction Plugins**: Searches for files in `plugins/interactions/**/*.{ts,tsx,js,jsx}`
   - Looks for objects with `id` and `execute` properties (InteractionPlugin interface)
   - Automatically registers them with the interaction registry

### Registration

Plugins are loaded and registered during app initialization in `App.tsx`:

```typescript
import { loadAllPlugins } from './lib/pluginLoader';

useEffect(() => {
  // ... other initialization
  loadAllPlugins(); // Automatically loads all plugins
}, []);
```

### Naming Conventions

- **Helper registration functions**: Should start with `register` (e.g., `registerReputationHelper`)
- **Interaction exports**: Should end with `Plugin` (e.g., `tradePlugin`)
- **File names**: Should match the plugin name in kebab-case

## Examples

See the [PixSim7 Plugin System documentation](../../PLUGIN_SYSTEM.md) for comprehensive examples and best practices.

Also check:
- `frontend/src/lib/game/customHelpers.ts` - Example helper registration
- `frontend/src/lib/game/interactions/` - Built-in interaction plugins
- `frontend/src/lib/plugins/seductionNode.ts` - Example custom node type

## Best Practices

1. **One plugin per directory** - Keep related files organized
2. **Type safety** - Always use TypeScript and provide proper types
3. **Documentation** - Add comments and README files for complex plugins
4. **Error handling** - Handle errors gracefully in your plugins
5. **Testing** - Write unit tests for your plugin logic
6. **Performance** - Keep plugins lightweight and avoid blocking operations

## Troubleshooting

### Plugin not loading

1. Check the browser console for errors
2. Ensure your file is in the correct directory (`plugins/helpers/` or `plugins/interactions/`)
3. Verify your export matches the expected interface
4. Check that the plugin loader is called in App.tsx

### Type errors

1. Ensure you're importing types from the correct packages
2. Run `npm run build` to check for TypeScript errors
3. Make sure your plugin matches the interface (HelperDefinition or InteractionPlugin)

### Plugin not appearing in UI

- For interactions: Check that the interaction is registered and has proper config
- For helpers: Helpers don't have UI - they're available in code via the registry

## Advanced Topics

### Plugin Dependencies

If your plugin depends on other plugins, ensure they're loaded first by naming them appropriately (plugins are loaded alphabetically by path).

### Dynamic Plugin Loading

The plugin loader supports async loading for better performance. Plugins are loaded lazily by default to avoid blocking the initial page load.

### Hot Reload

During development, the plugin loader supports hot reload. Changes to plugin files will be reflected after a page refresh.

## Contributing

When creating new plugins:

1. Follow the existing code style
2. Add proper TypeScript types
3. Include documentation
4. Test thoroughly
5. Submit a pull request with a clear description

For questions or issues, check the main [PLUGIN_SYSTEM.md](../../PLUGIN_SYSTEM.md) documentation.
