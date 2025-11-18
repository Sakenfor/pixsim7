# PixSim7 Plugin Generator CLI

Scaffold new PixSim7 plugins in seconds with boilerplate code, configuration, and documentation.

## Quick Start

```bash
# Interactive mode (recommended)
node scripts/create-plugin/index.js

# Non-interactive mode
node scripts/create-plugin/index.js --type interaction --name pickpocket

# With all options
node scripts/create-plugin/index.js \
  --type node \
  --name custom-quiz \
  --description "Custom quiz node type" \
  --output ./plugins
```

## Usage

### Interactive Mode

Simply run the CLI and follow the prompts:

```bash
node scripts/create-plugin/index.js
```

You'll be asked:
1. **Plugin type?** Choose from: `interaction`, `node`, `renderer`, `helper`
2. **Plugin name?** Enter a name in kebab-case (e.g., `my-plugin`)
3. **Description?** Optional short description
4. **Output directory?** Default: `./plugins`

### Non-Interactive Mode

Provide all options via flags:

```bash
node scripts/create-plugin/index.js \
  --type <type> \
  --name <name> \
  [--description <desc>] \
  [--output <dir>] \
  --no-interactive
```

## Plugin Types

### 1. Interaction Plugin

Creates a plugin for custom NPC interactions (pickpocket, trade, etc.)

**Generated files:**
- `my-plugin.ts` - Main plugin implementation
- `README.md` - Documentation
- `example-config.json` - Configuration example

**Features:**
- Config interface with form fields
- Execute method with full context
- Validation and availability checks
- Session helper integration

**Example:**
```bash
node scripts/create-plugin/index.js --type interaction --name pickpocket
```

### 2. Node Type Plugin

Creates a custom node type for the scene builder graph.

**Generated files:**
- `my-node.ts` - Node type definition
- `README.md` - Documentation
- `example-config.json` - Configuration example

**Features:**
- Custom data structure
- JSON schema validation
- Editor/renderer component references
- Default data and styling

**Example:**
```bash
node scripts/create-plugin/index.js --type node --name quiz-node
```

### 3. Renderer Plugin

Creates a custom React renderer for displaying nodes in the graph.

**Generated files:**
- `my-renderer.tsx` - React component
- `README.md` - Documentation
- `example-config.json` - Configuration example

**Features:**
- React component with TypeScript
- Access to node data, selection state, errors
- Styling guidelines
- Default size configuration

**Example:**
```bash
node scripts/create-plugin/index.js --type renderer --name video-preview
```

### 4. Helper Plugin

Creates session state helper functions for managing custom game state.

**Generated files:**
- `my-helper.ts` - Helper class
- `README.md` - Documentation
- `example-config.json` - Configuration example

**Features:**
- Type-safe state management
- Session flag integration
- CRUD operations
- Initialization and reset methods

**Example:**
```bash
node scripts/create-plugin/index.js --type helper --name reputation
```

## Command-Line Options

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `--type` | Plugin type (`interaction`, `node`, `renderer`, `helper`) | Yes* | - |
| `--name` | Plugin name in kebab-case | Yes* | - |
| `--description` | Short description of the plugin | No | Auto-generated |
| `--output` | Output directory for generated files | No | `./plugins` |
| `--no-interactive` | Skip interactive prompts | No | `false` |

\* Required in non-interactive mode, prompted in interactive mode

## Generated Structure

```
plugins/
└── my-plugin/
    ├── my-plugin.ts     # Main implementation
    ├── README.md        # Documentation
    └── example-config.json  # Config example
```

## Registration

After generating a plugin, register it with the appropriate registry:

### Interaction Plugin
```typescript
import { myPlugin } from './plugins/my-plugin/my-plugin';
import { interactionRegistry } from '@pixsim7/types';

interactionRegistry.register(myPlugin);
```

### Node Type Plugin
```typescript
import { myNodeType } from './plugins/my-node/my-node';
import { nodeTypeRegistry } from '@pixsim7/types';

nodeTypeRegistry.register(myNodeType);
```

### Renderer Plugin
```typescript
import { myRenderer } from './plugins/my-renderer/my-renderer';
import { nodeRendererRegistry } from '@/lib/graph/nodeRendererRegistry';

nodeRendererRegistry.register(myRenderer);
```

### Helper Plugin
```typescript
import { MyHelper } from './plugins/my-helper/my-helper';

// Use directly in your code
MyHelper.initialize(session);
const state = MyHelper.getState(session);
```

## Examples

### Create a Pickpocket Interaction

```bash
node scripts/create-plugin/index.js \
  --type interaction \
  --name pickpocket \
  --description "Steal items from NPCs"
```

Generates a fully functional interaction plugin with:
- Success/detection chance configuration
- Relationship impact handling
- Inventory integration
- Form fields for UI

### Create a Quiz Node Type

```bash
node scripts/create-plugin/index.js \
  --type node \
  --name quiz \
  --description "Interactive quiz node with questions"
```

Generates a node type with:
- Custom data structure for questions/answers
- Validation schema
- Category and styling
- Editor component reference

### Create a Custom Renderer

```bash
node scripts/create-plugin/index.js \
  --type renderer \
  --name timeline-view \
  --description "Timeline visualization for event nodes"
```

Generates a React component that:
- Renders node data visually
- Handles selection/error states
- Follows design system
- Supports dark mode

## Development Workflow

1. **Generate plugin**
   ```bash
   node scripts/create-plugin/index.js
   ```

2. **Implement logic**
   - Edit the generated `.ts`/`.tsx` file
   - Add your custom fields and methods
   - Update validation and config

3. **Register plugin**
   - Import and register in your app initialization
   - See registration examples above

4. **Test**
   - Write unit tests
   - Test in the UI
   - Verify edge cases

5. **Document**
   - Update the generated README
   - Add usage examples
   - Document configuration options

## Tips

- Use **kebab-case** for plugin names (`my-plugin`, not `MyPlugin`)
- Keep plugins **focused** on a single responsibility
- Follow the **existing patterns** in builtin plugins
- Add **validation** to catch errors early
- Write **tests** for your plugin logic
- Document **configuration options** clearly

## Troubleshooting

### "Plugin not found" error

Make sure you:
1. Registered the plugin at app startup
2. Used the correct plugin ID when accessing
3. Imported from the correct path

### Type errors

Check that:
1. Your data structures match the expected interfaces
2. You're extending `BaseInteractionConfig` for interaction plugins
3. TypeScript definitions are properly exported

### Plugin not appearing in UI

Verify:
1. `userCreatable: true` for node types
2. `enabled: true` in configuration
3. `isAvailable()` returns `true` (if implemented)
4. Plugin is registered before UI initialization

## Advanced Usage

### Programmatic Generation

You can use the generator in your own scripts:

```javascript
const { generatePlugin } = require('./scripts/create-plugin/index.js');

const files = generatePlugin(
  'interaction',
  'my-plugin',
  './custom-output',
  'My custom plugin'
);

console.log('Generated:', files);
```

### Custom Templates

Modify templates in `scripts/create-plugin/templates/` to match your project's conventions.

## Contributing

To add a new plugin type template:

1. Create `templates/newtype.template.ts`
2. Add template variables using `{{VARIABLE_NAME}}`
3. Update `getTemplatePath()` in `index.js`
4. Add to `validTypes` array
5. Update documentation

## License

Same as parent project (MIT)
