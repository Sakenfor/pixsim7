# PixSim7 Plugin System - Complete Guide

Comprehensive documentation for the PixSim7 plugin architecture, including CLI tools, registries, type safety, and performance optimizations.

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Plugin Types](#plugin-types)
4. [CLI Tool](#cli-tool)
5. [Registries & Performance](#registries--performance)
6. [Type Safety & Validation](#type-safety--validation)
7. [Best Practices](#best-practices)
8. [API Reference](#api-reference)

---

## Overview

The PixSim7 plugin system allows developers to extend the game engine without modifying core code. All plugin types support:

- **Dynamic registration** - Add plugins at runtime
- **Type safety** - Full TypeScript autocomplete and validation
- **Performance optimizations** - LRU caching, lazy loading, bundle splitting
- **Developer tools** - CLI scaffolding, type generation, benchmarks

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Plugin System                            │
├─────────────────┬─────────────────┬──────────────────────────┤
│   Registries    │   Type System   │      CLI Tools           │
├─────────────────┼─────────────────┼──────────────────────────┤
│ • NodeType      │ • Auto-gen      │ • create-plugin          │
│ • Renderer      │ • Validation    │ • generateTypes          │
│ • Interaction   │ • Schemas       │ • Benchmarks             │
│ • Helper        │ • Autocomplete  │                          │
└─────────────────┴─────────────────┴──────────────────────────┘
```

---

## Quick Start

### 1. Create a New Plugin

```bash
# Interactive mode (recommended)
node scripts/create-plugin/index.js

# Or specify all options
node scripts/create-plugin/index.js \
  --type interaction \
  --name pickpocket \
  --description "Steal items from NPCs"
```

The CLI will create your plugin in the appropriate directory:
- Helper plugins → `apps/main/src/plugins/helpers/`
- Interaction plugins → `apps/main/src/plugins/interactions/`

### 2. Implement Your Plugin

Edit the generated file to add your logic:

```typescript
// plugins/pickpocket/pickpocket.ts

export const pickpocketPlugin: InteractionPlugin<PickpocketConfig> = {
  id: 'pickpocket',
  name: 'Pickpocket',
  description: 'Attempt to steal items from NPCs',
  icon: '🤏',

  defaultConfig: {
    enabled: true,
    baseSuccessChance: 0.3,
    detectionChance: 0.5,
  },

  configFields: [
    { key: 'enabled', label: 'Enabled', type: 'boolean' },
    { key: 'baseSuccessChance', label: 'Success Chance', type: 'number', min: 0, max: 1, step: 0.1 },
    { key: 'detectionChance', label: 'Detection Chance', type: 'number', min: 0, max: 1, step: 0.1 },
  ],

  async execute(config, context) {
    // Your implementation here
    const success = Math.random() < config.baseSuccessChance;

    if (success) {
      await context.session.addInventoryItem('stolen_gold', 10);
      context.onSuccess('Successfully pickpocketed!');
      return { success: true };
    } else {
      context.onError('Pickpocket failed!');
      return { success: false };
    }
  },
};
```

### 3. Plugin Auto-Registration

**That's it!** The plugin loader will automatically discover and register your plugin. No manual imports needed!

The plugin loader runs during app initialization and scans:
- `apps/main/src/plugins/helpers/**/*.{ts,tsx,js,jsx}` for helper plugins
- `apps/main/src/plugins/interactions/**/*.{ts,tsx,js,jsx}` for interaction plugins

Just refresh your browser and check the console:

```
🔌 Loading plugins...
   Loading 1 helper plugin(s)...
   ✓ pickpocket/pickpocket.ts
✅ Plugins loaded:
   Helpers: 1 loaded, 0 failed
```

For more details, see [Plugin Loader Documentation](docs/PLUGIN_LOADER.md).

### 4. Generate Types (Optional but Recommended)

```bash
npm run codegen:types
```

This generates TypeScript definitions for autocomplete and validation.

---

## Plugin Types

### 1. Interaction Plugins

Add custom NPC interactions (pickpocket, trade, romance, etc.)

**Example Use Cases:**
- Pickpocketing NPCs
- Trading items
- Custom dialogue options
- Mini-games

**Generated Files:**
- `plugins/my-interaction/my-interaction.ts` - Main implementation
- `plugins/my-interaction/README.md` - Documentation
- `plugins/my-interaction/example-config.json` - Config example

**Key Features:**
- Config interface with form fields for UI
- Full access to session state
- Optimistic updates with backend validation
- Availability checks (e.g., only show if player has certain item)

**Example:**
```typescript
export const tradePlugin: InteractionPlugin<TradeConfig> = {
  id: 'trade',
  name: 'Trade',
  description: 'Trade items with NPCs',
  icon: '💰',

  defaultConfig: {
    enabled: true,
    maxItems: 10,
  },

  configFields: [
    { key: 'enabled', label: 'Enabled', type: 'boolean' },
    { key: 'maxItems', label: 'Max Items', type: 'number', min: 1, max: 100 },
  ],

  async execute(config, context) {
    // Show trade UI
    // Handle item exchange
    // Update inventory
    return { success: true };
  },

  isAvailable(context) {
    // Only available if NPC is a merchant
    return context.state.assignment.npc?.tags?.includes('merchant');
  },
};
```

---

### 2. Node Type Plugins

Add custom node types to the scene builder graph.

**Example Use Cases:**
- Quiz nodes
- Custom dialogue types
- Mini-game nodes
- State machines

**Generated Files:**
- `plugins/my-node/my-node.ts` - Node type definition
- `plugins/my-node/README.md` - Documentation
- `plugins/my-node/example-config.json` - Config example

**Key Features:**
- Custom data structure
- JSON schema validation
- Category grouping
- Editor/renderer component references

**Example:**
```typescript
export interface QuizNodeData {
  questions: Array<{
    text: string;
    options: string[];
    correctIndex: number;
  }>;
  passingScore: number;
}

export const quizNodeType: NodeTypeDefinition<QuizNodeData> = {
  id: 'quiz',
  name: 'Quiz Node',
  description: 'Interactive quiz with multiple choice questions',
  icon: '❓',
  category: 'custom',

  defaultData: {
    questions: [],
    passingScore: 0.7,
  },

  schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', minLength: 1 },
            options: { type: 'array', items: { type: 'string' } },
            correctIndex: { type: 'number', minimum: 0 },
          },
          required: ['text', 'options', 'correctIndex'],
        },
      },
      passingScore: { type: 'number', minimum: 0, maximum: 1 },
    },
  },

  validate(data) {
    if (data.questions.length === 0) {
      return 'At least one question is required';
    }
    return null;
  },

  userCreatable: true,
  color: '#8b5cf6',
  bgColor: '#f3e8ff',
};
```

---

### 3. Renderer Plugins

Add custom visual renderers for nodes in the graph view.

**Example Use Cases:**
- Custom node visualizations
- Rich previews (video, audio, images)
- Interactive node content
- Specialized layouts

**Generated Files:**
- `plugins/my-renderer/my-renderer.tsx` - React component
- `plugins/my-renderer/README.md` - Documentation
- `plugins/my-renderer/example-config.json` - Config example

**Key Features:**
- React component with full TypeScript support
- Access to node data, selection state, validation errors
- Follows design system automatically
- Dark mode support

**Example:**
```typescript
export function QuizRenderer({ node, isSelected, hasErrors }: NodeRendererProps) {
  const data = node as unknown as QuizNodeData;

  return (
    <div className="px-3 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-2xl">❓</span>
        <div className="text-sm font-medium">Quiz Node</div>
      </div>

      <div className="text-xs text-neutral-600">
        {data.questions.length} question{data.questions.length !== 1 ? 's' : ''}
      </div>

      {data.questions.slice(0, 2).map((q, i) => (
        <div key={i} className="p-2 bg-purple-50 rounded text-xs truncate">
          {q.text}
        </div>
      ))}

      {data.questions.length > 2 && (
        <div className="text-xs text-neutral-500">
          +{data.questions.length - 2} more
        </div>
      )}

      {hasErrors && (
        <div className="text-xs text-red-600">Has validation errors</div>
      )}
    </div>
  );
}

export const quizRenderer: NodeRenderer = {
  nodeType: 'quiz',
  component: QuizRenderer,
  defaultSize: { width: 240, height: 180 },
  customHeader: false,
};
```

---

### 4. Helper Plugins

Add custom session state management helpers.

**Example Use Cases:**
- Reputation systems
- Custom inventory categories
- Achievement tracking
- Stat management

**Generated Files:**
- `plugins/my-helper/my-helper.ts` - Helper class
- `plugins/my-helper/README.md` - Documentation
- `plugins/my-helper/example-config.json` - Config example

**Key Features:**
- Type-safe state management
- Session flag integration
- CRUD operations
- Initialization and reset methods

**Example:**
```typescript
export interface ReputationState {
  factions: Record<string, number>; // faction ID -> reputation (-100 to 100)
  history: Array<{ faction: string; change: number; timestamp: number }>;
}

export class ReputationHelper {
  static getState(session: GameSessionDTO): ReputationState | null {
    return getFlag(session, 'reputation');
  }

  static initialize(session: GameSessionDTO): void {
    if (!this.getState(session)) {
      setFlag(session, 'reputation', {
        factions: {},
        history: [],
      });
    }
  }

  static getFactionReputation(session: GameSessionDTO, factionId: string): number {
    const state = this.getState(session);
    return state?.factions[factionId] ?? 0;
  }

  static adjustReputation(
    session: GameSessionDTO,
    factionId: string,
    change: number
  ): void {
    const state = this.getState(session);
    if (!state) return;

    const currentRep = state.factions[factionId] ?? 0;
    const newRep = Math.max(-100, Math.min(100, currentRep + change));

    state.factions[factionId] = newRep;
    state.history.push({
      faction: factionId,
      change,
      timestamp: Date.now(),
    });

    setFlag(session, 'reputation', state);
  }

  static getReputationLevel(reputation: number): string {
    if (reputation >= 75) return 'Revered';
    if (reputation >= 50) return 'Honored';
    if (reputation >= 25) return 'Friendly';
    if (reputation >= -25) return 'Neutral';
    if (reputation >= -50) return 'Unfriendly';
    if (reputation >= -75) return 'Hostile';
    return 'Hated';
  }
}
```

---

### 5. Session Helper Registry

The **Session Helper Registry** provides a dynamic, extensible system for managing session state helpers. Unlike static helper classes, registered helpers can be:

- **Dynamically discovered** - Query all helpers by name or category
- **Auto-generated** - Create helpers from simple schemas using `generateHelper()`
- **Self-documenting** - Automatically generate markdown documentation
- **Runtime accessible** - Execute helpers by name at runtime

**Key Components:**

1. `SessionHelperRegistry` - Central registry for all helpers
2. `generateHelper()` - Generate helpers from schemas
3. `generateHelperDocs()` - Auto-generate documentation
4. `registerBuiltinHelpers()` - Register core helpers
5. `registerCustomHelpers()` - Register game-specific helpers

**Example Use Cases:**
- Dynamic helper execution (for scripting, interactions)
- Auto-generated helpers from configuration
- Plugin-based helper extensions
- Documentation generation

#### Basic Usage

**Registering a Manual Helper:**
```typescript
import { sessionHelperRegistry } from '@pixsim7/game.engine';
import type { GameSessionDTO } from '@pixsim7/types';

sessionHelperRegistry.register({
  name: 'addSkillPoints',
  category: 'custom',
  description: 'Add skill points to a skill tree',
  fn: (session: GameSessionDTO, skillTree: string, points: number) => {
    if (!session.flags.skills) session.flags.skills = {};
    if (!session.flags.skills[skillTree]) {
      session.flags.skills[skillTree] = { points: 0, level: 1 };
    }
    session.flags.skills[skillTree].points += points;

    // Level up logic
    while (
      session.flags.skills[skillTree].points >=
      getPointsForNextLevel(session.flags.skills[skillTree].level)
    ) {
      session.flags.skills[skillTree].level++;
    }
  },
  params: [
    { name: 'session', type: 'GameSessionDTO' },
    { name: 'skillTree', type: 'string' },
    { name: 'points', type: 'number' },
  ],
});
```

**Auto-Generating Helpers:**
```typescript
import { generateHelper } from '@pixsim7/game.engine';

// Generate a helper for getting/setting guild reputation
generateHelper({
  name: 'setGuildReputation',
  category: 'custom',
  keyPattern: 'guilds.{guildId}.reputation',
  operation: 'set',
});

generateHelper({
  name: 'incrementGuildReputation',
  category: 'custom',
  keyPattern: 'guilds.{guildId}.reputation',
  operation: 'inc',
});

// Now you can use them:
// sessionHelperRegistry.execute('setGuildReputation', session, 'thieves-guild', 50);
// sessionHelperRegistry.execute('incrementGuildReputation', session, 'thieves-guild', 10);
```

**Supported Operations:**
- `get` - Get a flag value
- `set` - Set a flag value
- `inc` - Increment a numeric value
- `dec` - Decrement a numeric value
- `push` - Add to an array
- `toggle` - Toggle a boolean

**Executing Helpers at Runtime:**
```typescript
import { sessionHelperRegistry } from '@pixsim7/game.engine';

// Execute by name
const result = sessionHelperRegistry.execute('getCurrency', session, 'gold');

// Get all helpers for a category
const inventoryHelpers = sessionHelperRegistry.getByCategory('inventory');

// Build a helpers object (for convenience)
const helpers = sessionHelperRegistry.buildHelpersObject(session);
helpers.addCurrency('gold', 100);
```

#### Integration with App

Helpers should be registered once during app initialization:

```typescript
// apps/main/src/App.tsx
import { registerBuiltinHelpers } from '@pixsim7/game.engine';
import { registerCustomHelpers } from './lib/game/customHelpers';

useEffect(() => {
  // Register builtin helpers (arcs, quests, inventory, events, etc.)
  registerBuiltinHelpers();

  // Register game-specific custom helpers
  registerCustomHelpers();
}, []);
```

#### Generating Documentation

Generate a comprehensive markdown reference of all helpers:

```typescript
import { generateHelperDocs } from '@pixsim7/game.engine';
import fs from 'fs';

const docs = generateHelperDocs();
fs.writeFileSync('SESSION_HELPER_REFERENCE.md', docs);
```

Or use the provided script:
```bash
node scripts/generate-helper-docs.cjs
```

This generates documentation grouped by category with parameter types, descriptions, and return values.

**Example Output:**
```markdown
# Session Helpers Reference

## arcs

### getArcState

Get arc state from session

**Parameters:**
- `session`: `GameSessionDTO`
- `arcId`: `string`

**Returns:** `ArcState | null`

---

### updateArcStage

Update arc stage (mutates session)

**Parameters:**
- `session`: `GameSessionDTO`
- `arcId`: `string`
- `stage`: `number`

**Returns:** `void`
```

#### Creating Helper Plugins

Use the CLI to scaffold new helper plugins:

```bash
node scripts/create-plugin/index.js --type helper --name reputation
```

This generates:
- `plugins/reputation/reputation.ts` - Helper class with CRUD methods
- `plugins/reputation/README.md` - Usage documentation
- `plugins/reputation/example-config.json` - Config example

Then register your helper:

```typescript
import { ReputationHelper } from './plugins/reputation/reputation';
import { sessionHelperRegistry } from '@pixsim7/game.engine';

// Option 1: Register as a class (for static use)
// Use ReputationHelper.adjustReputation(session, 'thieves', 10);

// Option 2: Register individual methods
sessionHelperRegistry.register({
  name: 'adjustReputation',
  fn: ReputationHelper.adjustReputation,
  category: 'custom',
  description: 'Adjust faction reputation',
  params: [
    { name: 'session', type: 'GameSessionDTO' },
    { name: 'factionId', type: 'string' },
    { name: 'change', type: 'number' },
  ],
});
```

#### Best Practices

1. **Use nested flag paths** - `generateHelper` automatically uses `getFlag`/`setFlag` for nested paths like `guilds.{guildId}.reputation`
2. **Register at startup** - Register all helpers in `App.tsx` before creating sessions
3. **Document with metadata** - Provide `description`, `params`, and `returns` for auto-generated docs
4. **Categorize helpers** - Use categories (`arcs`, `quests`, `inventory`, `events`, `custom`) for organization
5. **Generate docs** - Run `generateHelperDocs()` to keep documentation in sync

#### Example: Complete Custom Helper System

```typescript
// apps/main/src/lib/game/customHelpers.ts
import { sessionHelperRegistry, generateHelper } from '@pixsim7/game.engine';

export function registerCustomHelpers() {
  // Manual helper with complex logic
  sessionHelperRegistry.register({
    name: 'addSkillPoints',
    category: 'custom',
    description: 'Add skill points with auto-leveling',
    fn: (session, skillTree, points) => {
      // Custom leveling logic...
    },
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'skillTree', type: 'string' },
      { name: 'points', type: 'number' },
    ],
  });

  // Auto-generated helpers for simple CRUD
  generateHelper({
    name: 'getCurrency',
    category: 'custom',
    keyPattern: 'currency.{currencyType}',
    operation: 'get',
  });

  generateHelper({
    name: 'addCurrency',
    category: 'custom',
    keyPattern: 'currency.{currencyType}',
    operation: 'inc',
  });

  generateHelper({
    name: 'unlockAchievement',
    category: 'custom',
    keyPattern: 'achievements.{achievementId}',
    operation: 'set',
  });
}
```

---

## CLI Tool

### create-pixsim-plugin

Scaffold new plugins in seconds.

#### Installation

Already included in the repository:

```bash
node scripts/create-plugin/index.js
```

#### Usage

**Interactive mode:**
```bash
node scripts/create-plugin/index.js
```

**Non-interactive mode:**
```bash
node scripts/create-plugin/index.js \
  --type interaction \
  --name my-plugin \
  --description "My awesome plugin" \
  --output ./plugins
```

#### Options

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `--type` | Plugin type (`interaction`, `node`, `renderer`, `helper`) | Yes* | - |
| `--name` | Plugin name (kebab-case) | Yes* | - |
| `--description` | Short description | No | Auto-generated |
| `--output` | Output directory | No | `./plugins` |
| `--no-interactive` | Skip prompts | No | `false` |

\* Required in non-interactive mode

#### Generated Structure

```
plugins/
└── my-plugin/
    ├── my-plugin.ts        # Main implementation
    ├── README.md           # Documentation
    └── example-config.json # Configuration example
```

---

## Registries & Performance

All registries are optimized for handling 100+ plugins efficiently.

### Performance Features

1. **LRU Cache** - Frequently accessed plugins cached (max 50 entries)
2. **Lazy Loading** - Plugins loaded on first use
3. **Category Indexing** - Fast category-based lookups
4. **Bundle Splitting** - Each plugin can be a separate chunk
5. **Preloading** - High-priority plugins loaded early

### NodeTypeRegistry

```typescript
import { nodeTypeRegistry } from '@pixsim7/types';

// Register a node type
nodeTypeRegistry.register(myNodeType);

// Get a node type (async if lazy-loaded)
const nodeType = await nodeTypeRegistry.get('my-node');

// Get synchronously (use only if loaded)
const nodeType = nodeTypeRegistry.getSync('my-node');

// Get by category (optimized with index)
const mediaNodes = nodeTypeRegistry.getByCategory('media');

// Preload high-priority types
await nodeTypeRegistry.preload(['video', 'choice', 'quiz']);

// Cache stats
const stats = nodeTypeRegistry.getCacheStats();
console.log(`Cache size: ${stats.size}/${stats.maxSize}`);
```

### NodeRendererRegistry

```typescript
import { nodeRendererRegistry } from '@/lib/graph/nodeRendererRegistry';

// Register a renderer
nodeRendererRegistry.register(myRenderer);

// Get renderer (async if lazy-loaded)
const renderer = await nodeRendererRegistry.getAsync('my-node');

// Get synchronously
const renderer = nodeRendererRegistry.get('my-node');

// Get with fallback
const renderer = nodeRendererRegistry.getOrDefault('my-node');

// Preload renderers
await nodeRendererRegistry.preload(['video', 'choice']);
```

### InteractionRegistry

```typescript
import { interactionRegistry } from '@pixsim7/types';

// Register an interaction
interactionRegistry.register(myInteraction);

// Get interaction
const interaction = interactionRegistry.get('pickpocket');

// Get all interactions
const all = interactionRegistry.getAll();

// Cache stats
const stats = interactionRegistry.getCacheStats();
```

### Performance Benchmarks

Run benchmarks to verify performance:

```bash
npx ts-node packages/types/src/__tests__/registry-performance.bench.ts
```

**Success criteria (100 plugins):**
- ✓ Load time: <500ms
- ✓ Memory usage: <50MB
- ✓ Cache hit rate: >80%

---

## Type Safety & Validation

### Auto-Generated Types

Generate TypeScript types for all registered plugins:

```bash
npm run codegen:types
```

This scans your codebase and generates:
- `packages/types/src/generated/plugin-types.d.ts` - Type definitions
- `packages/types/src/generated/helper-extensions.d.ts` - SessionHelpers extensions
- `packages/types/src/generated/validation-schemas.ts` - Runtime validation

**Benefits:**
- ✅ IDE autocomplete for all plugin IDs
- ✅ Type-safe plugin access
- ✅ Compile-time error checking
- ✅ Runtime validation schemas

### Runtime Validation

Validate plugin configurations at runtime:

```typescript
import { validateInteractionConfig, formatValidationErrors } from '@pixsim7/game.engine';

const result = validateInteractionConfig(pickpocketPlugin, config);

if (!result.valid) {
  console.error('Validation failed:');
  console.error(formatValidationErrors(result));
}
```

### Schema Validation

Validate against JSON schemas:

```typescript
import { validateSchema, assertValid } from '@pixsim7/game.engine';

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    age: { type: 'number', minimum: 0 },
  },
  required: ['name'],
};

const result = validateSchema(data, schema);
assertValid(result, 'User data'); // Throws if invalid
```

---

## Best Practices

### Plugin Development

1. **Keep plugins focused** - One responsibility per plugin
2. **Use TypeScript** - Full type safety prevents bugs
3. **Validate inputs** - Check all user-provided data
4. **Handle errors gracefully** - Show helpful error messages
5. **Document your plugin** - Update the generated README
6. **Test thoroughly** - Unit tests + integration tests

### Performance

1. **Use lazy loading** for large plugins
2. **Set preload priority** for critical plugins
3. **Keep default data minimal** - Load details on demand
4. **Cache expensive computations**
5. **Avoid blocking operations** in execute methods

### Type Safety

1. **Run type generation** after adding plugins
2. **Use generated types** in your code
3. **Enable strict TypeScript** checks
4. **Validate at runtime** in production
5. **Provide clear validation errors**

### Code Organization

```
plugins/
├── pickpocket/
│   ├── pickpocket.ts          # Main plugin
│   ├── README.md              # Documentation
│   ├── example-config.json    # Config example
│   └── __tests__/             # Tests
│       └── pickpocket.test.ts
├── trade/
│   ├── trade.ts
│   ├── README.md
│   └── ...
└── index.ts                   # Export all plugins
```

---

## API Reference

### NodeTypeDefinition

```typescript
interface NodeTypeDefinition<TData = any> {
  id: string;                           // Unique ID
  name: string;                         // Display name
  description?: string;                 // Short description
  icon?: string;                        // Icon/emoji
  category?: string;                    // Category for grouping
  defaultData: Partial<TData>;          // Default values
  schema?: Record<string, any>;         // JSON schema
  editorComponent?: string;             // Editor component name
  rendererComponent?: string;           // Renderer component name
  validate?: (data: TData) => string | null;
  userCreatable?: boolean;              // Can be added via UI
  color?: string;                       // Border/text color
  bgColor?: string;                     // Background color
  loader?: () => Promise<NodeTypeDefinition<TData>>; // Lazy loader
  preloadPriority?: number;             // Preload order
}
```

### InteractionPlugin

```typescript
interface InteractionPlugin<TConfig extends BaseInteractionConfig> {
  id: string;                           // Unique ID
  name: string;                         // Display name
  description: string;                  // Short description
  icon?: string;                        // Icon/emoji
  defaultConfig: TConfig;               // Default config
  configFields: FormField[];            // UI form fields
  execute: (config: TConfig, context: InteractionContext) => Promise<InteractionResult>;
  validate?: (config: TConfig) => string | null;
  isAvailable?: (context: InteractionContext) => boolean;
}
```

### NodeRenderer

```typescript
interface NodeRenderer {
  nodeType: string;                     // Node type ID
  component: ComponentType<NodeRendererProps>; // React component
  defaultSize?: { width: number; height: number };
  customHeader?: boolean;               // Full control over appearance
  loader?: () => Promise<ComponentType<NodeRendererProps>>; // Lazy loader
  preloadPriority?: number;             // Preload order
}
```

### Registry Methods

```typescript
class NodeTypeRegistry {
  register(def: NodeTypeDefinition): void;
  get(id: string): Promise<NodeTypeDefinition | undefined>;
  getSync(id: string): NodeTypeDefinition | undefined;
  getAll(): NodeTypeDefinition[];
  getByCategory(category: string): NodeTypeDefinition[];
  getUserCreatable(): NodeTypeDefinition[];
  has(id: string): boolean;
  preload(ids?: string[]): Promise<void>;
  clearCache(): void;
  getCacheStats(): { size: number; maxSize: number };
}
```

---

## Examples

See generated plugin files for complete examples, or check:
- `apps/main/src/lib/game/interactions/` - Builtin interaction plugins
- `packages/types/src/nodeTypeRegistry.ts` - Node type registry
- `apps/main/src/lib/graph/` - Renderer registry and builtin renderers

## Troubleshooting

### Plugin not found

- Check registration in `apps/main/src/lib/plugins/index.ts`
- Verify plugin ID matches registration
- Run type generation: `npm run codegen:types`

### Type errors

- Ensure data structures match interfaces
- Extend `BaseInteractionConfig` for interactions
- Run `npm run codegen:types` and restart IDE

### Plugin not in UI

- Set `userCreatable: true` for node types
- Set `enabled: true` in configuration
- Check `isAvailable()` returns `true`

### Performance issues

- Run benchmarks to identify bottlenecks
- Use lazy loading for large plugins
- Clear cache if stale data

---

## Contributing

To add new plugin types or features:

1. Update registry interfaces
2. Create new templates in `scripts/create-plugin/templates/`
3. Update CLI in `scripts/create-plugin/index.js`
4. Add type generation support in `packages/game/engine/src/codegen/`
5. Update this documentation

---

## License

Same as parent project (MIT)
