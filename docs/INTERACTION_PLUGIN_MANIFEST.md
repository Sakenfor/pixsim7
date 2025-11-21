# Interaction Plugin Manifest

## Overview

This document defines the **shared contract** between frontend and backend for NPC interaction plugins. While currently implemented only on the frontend, this manifest provides a foundation for future backend symmetry (see [BACKEND_INTERACTION_DISPATCHER.md](./BACKEND_INTERACTION_DISPATCHER.md)).

## Plugin Interface

All interaction plugins must implement the `InteractionPlugin<TConfig>` interface:

```typescript
interface InteractionPlugin<TConfig extends BaseInteractionConfig> {
  // Core identification
  id: string;                    // Unique plugin ID (e.g., 'talk', 'pickpocket')
  name: string;                  // Display name (e.g., 'Talk', 'Pickpocket')
  description: string;           // Short description for UI

  // Metadata
  icon?: string;                 // Emoji or icon character
  category?: string;             // Category for organization (e.g., 'social', 'stealth')
  version?: string;              // Semver version string
  tags?: string[];               // Tags for filtering/searching
  experimental?: boolean;        // Mark as experimental/beta

  // UI behavior metadata (NEW!)
  uiMode?: InteractionUIMode;    // How the 2D UI should respond
  capabilities?: InteractionCapabilities;  // What the interaction does

  // Configuration
  defaultConfig: TConfig;        // Default config when enabled
  configFields: FormField[];     // Auto-generates UI forms
  configSchema?: ConfigSchema;   // Optional schema for validation

  // Execution
  execute: (config: TConfig, context: InteractionContext) => Promise<InteractionResult>;
  validate?: (config: TConfig) => string | null;
  isAvailable?: (context: InteractionContext) => boolean;
}
```

## UI Metadata

### UI Modes

The `uiMode` field tells the 2D UI how to respond to this interaction:

```typescript
type InteractionUIMode =
  | 'dialogue'      // Opens dialogue UI (e.g., Talk)
  | 'notification'  // Shows notification only (e.g., Pickpocket)
  | 'silent'        // No UI feedback
  | 'custom';       // Plugin handles its own UI
```

**Example usage:**

```typescript
// Talk plugin - opens dialogue
uiMode: 'dialogue'

// Pickpocket plugin - shows notification
uiMode: 'notification'

// Give Item plugin - may open dialogue or show notification
uiMode: 'custom'
```

### Capabilities

The `capabilities` field provides hints to the UI about what this interaction does:

```typescript
interface InteractionCapabilities {
  opensDialogue?: boolean;       // Opens dialogue interface
  modifiesInventory?: boolean;   // Adds/removes items
  affectsRelationship?: boolean; // Changes affinity/trust/chemistry
  triggersEvents?: boolean;      // Triggers game events
  hasRisk?: boolean;             // Has success/failure states
  requiresItems?: boolean;       // Requires items in inventory
  consumesItems?: boolean;       // Consumes items from inventory
  canBeDetected?: boolean;       // Can be detected (stealth)
}
```

**Example:**

```typescript
// Pickpocket plugin
capabilities: {
  modifiesInventory: true,
  affectsRelationship: true,
  hasRisk: true,
  canBeDetected: true,
}

// Talk plugin
capabilities: {
  opensDialogue: true,
  affectsRelationship: true,
}

// Give Item plugin
capabilities: {
  opensDialogue: true,    // Can open reward/reject scenes
  modifiesInventory: true,
  affectsRelationship: true,
  requiresItems: true,
  consumesItems: true,
}
```

## Plugin Examples

### Talk Plugin

```typescript
export const talkPlugin: InteractionPlugin<TalkConfig> = {
  id: 'talk',
  name: 'Talk',
  description: 'Start a conversation with the NPC',
  icon: '💬',
  category: 'social',
  version: '1.0.0',
  tags: ['dialogue', 'conversation', 'social'],

  uiMode: 'dialogue',
  capabilities: {
    opensDialogue: true,
    affectsRelationship: true,
  },

  defaultConfig: {
    enabled: true,
    npcId: null,
    preferredSceneId: null,
  },

  configFields: [
    {
      key: 'npcId',
      label: 'NPC ID Override',
      type: 'number',
      description: 'Optional: Override which NPC to talk to',
    },
    {
      key: 'preferredSceneId',
      label: 'Preferred Scene ID',
      type: 'number',
      description: 'The scene to play when talking to this NPC',
    },
  ],

  async execute(config, context) {
    // Implementation...
  },

  validate(config) {
    if (!config.preferredSceneId) {
      return 'Preferred scene ID is required';
    }
    return null;
  },
};
```

### Pickpocket Plugin

```typescript
export const pickpocketPlugin: InteractionPlugin<PickpocketConfig> = {
  id: 'pickpocket',
  name: 'Pickpocket',
  description: 'Attempt to steal from the NPC',
  icon: '🤏',
  category: 'stealth',
  version: '1.0.0',
  tags: ['stealth', 'theft', 'risky'],

  uiMode: 'notification',
  capabilities: {
    modifiesInventory: true,
    affectsRelationship: true,
    hasRisk: true,
    canBeDetected: true,
  },

  defaultConfig: {
    enabled: true,
    baseSuccessChance: 0.4,
    detectionChance: 0.3,
  },

  configFields: [
    {
      key: 'baseSuccessChance',
      label: 'Success Chance (0-1)',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.1,
    },
    {
      key: 'detectionChance',
      label: 'Detection Chance (0-1)',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.1,
    },
  ],

  async execute(config, context) {
    // Implementation...
  },

  validate(config) {
    if (config.baseSuccessChance < 0 || config.baseSuccessChance > 1) {
      return 'Success chance must be between 0 and 1';
    }
    return null;
  },
};
```

## Configuration Format

### Storage Format (NPC Slot)

Interactions are stored on `NpcSlot2d.interactions`:

```typescript
interface NpcSlot2d {
  id: string;
  x: number;
  y: number;
  roles?: string[];
  fixedNpcId?: number | null;
  interactions?: {
    [pluginId: string]: BaseInteractionConfig & any;
  };
}
```

**Example:**

```typescript
{
  id: 'bench_left',
  x: 0.3,
  y: 0.5,
  roles: ['citizen', 'guard'],
  interactions: {
    talk: {
      enabled: true,
      preferredSceneId: 123,
    },
    pickpocket: {
      enabled: true,
      baseSuccessChance: 0.4,
      detectionChance: 0.3,
    },
    give_item: {
      enabled: true,
      itemId: 'flower',
      requiredRelationship: 30,
      rewardSceneId: 456,
    },
  },
}
```

### Legacy Format (Deprecated)

**DO NOT USE** in new code. Supported for backward compatibility only:

```typescript
{
  interactions: {
    canTalk: true,
    npcTalk: { preferredSceneId: 123 },
    canPickpocket: true,
    pickpocket: { baseSuccessChance: 0.4, detectionChance: 0.3 },
  }
}
```

Use the plugin-based format instead:

```typescript
{
  interactions: {
    talk: { enabled: true, preferredSceneId: 123 },
    pickpocket: { enabled: true, baseSuccessChance: 0.4, detectionChance: 0.3 },
  }
}
```

## Execution Flow

### Frontend (Current)

1. **User clicks NPC** → `executeSlotInteractions()` in `executor.ts`
2. **Normalize interactions** → Handle legacy format (deprecated)
3. **For each enabled interaction:**
   - Get plugin from registry
   - Check `uiMode`:
     - `dialogue` → Execute plugin + trigger dialogue handler
     - Other modes → Execute plugin + show notification
4. **Plugin executes** → Returns `InteractionResult`
5. **UI responds** based on `uiMode` and `capabilities`

### Backend (Future)

When backend symmetry is added (see [BACKEND_INTERACTION_DISPATCHER.md](./BACKEND_INTERACTION_DISPATCHER.md)):

1. **Frontend calls** → `POST /interactions/execute`
2. **Backend dispatcher** → Validates config against stored slot config
3. **Backend plugin executes** → Same logic as frontend
4. **Result returned** → Frontend applies optimistic update or rollback

## Adding a New Interaction

### 1. Create Plugin File

Create `apps/main/src/lib/game/interactions/myPlugin.ts`:

```typescript
import type {
  InteractionPlugin,
  BaseInteractionConfig,
  InteractionContext,
  InteractionResult,
} from './types';

export interface MyPluginConfig extends BaseInteractionConfig {
  myParam: number;
}

export const myPlugin: InteractionPlugin<MyPluginConfig> = {
  id: 'my_plugin',
  name: 'My Plugin',
  description: 'Does something cool',
  icon: '✨',
  category: 'misc',
  version: '1.0.0',
  tags: ['custom'],

  uiMode: 'notification',
  capabilities: {
    affectsRelationship: true,
  },

  defaultConfig: {
    enabled: true,
    myParam: 50,
  },

  configFields: [
    {
      key: 'myParam',
      label: 'My Parameter',
      type: 'number',
      min: 0,
      max: 100,
    },
  ],

  async execute(config, context) {
    // Your logic here
    return {
      success: true,
      message: 'Plugin executed successfully!',
    };
  },

  validate(config) {
    if (config.myParam < 0 || config.myParam > 100) {
      return 'Parameter must be between 0 and 100';
    }
    return null;
  },
};
```

### 2. Register Plugin

Add to `apps/main/src/lib/game/interactions/index.ts`:

```typescript
import { myPlugin } from './myPlugin';

interactionRegistry.register(myPlugin);

export type { MyPluginConfig } from './myPlugin';
```

### 3. Done!

- UI forms auto-generate from `configFields`
- NpcSlotEditor automatically shows your plugin
- Executor handles it based on `uiMode`

## Migration Guide

### From Legacy Format to Plugin Format

**Old (deprecated):**

```typescript
{
  interactions: {
    canTalk: true,
    npcTalk: { preferredSceneId: 123 },
  }
}
```

**New (recommended):**

```typescript
{
  interactions: {
    talk: { enabled: true, preferredSceneId: 123 },
  }
}
```

### From Special-Cased to Plugin

**Old approach:**

```typescript
// executor.ts
if (interactionId === 'talk') {
  // Special handling
}
```

**New approach:**

```typescript
// Plugin metadata
uiMode: 'dialogue'

// executor.ts
if (plugin.uiMode === 'dialogue') {
  // Generic handling based on metadata
}
```

## Future Enhancements

### Backend Symmetry

See [BACKEND_INTERACTION_DISPATCHER.md](./BACKEND_INTERACTION_DISPATCHER.md) for plans to mirror this plugin system on the backend.

### JSON Schema Validation

Future: Define `configSchema` as JSON Schema for better validation:

```typescript
configSchema: {
  baseSuccessChance: {
    type: 'number',
    minimum: 0,
    maximum: 1,
  },
}
```

### Conditional Config Fields

Future: Show/hide config fields based on other field values:

```typescript
configFields: [
  {
    key: 'mode',
    type: 'select',
    options: ['easy', 'hard'],
  },
  {
    key: 'hardModeBonus',
    type: 'number',
    visibleWhen: { mode: 'hard' },  // Only show when mode=hard
  },
]
```

## Best Practices

1. **Always set `uiMode` and `capabilities`** for proper UI behavior
2. **Use semantic versioning** for `version` field
3. **Provide helpful `description` and field labels** for content creators
4. **Validate config** in `validate()` method
5. **Use `isAvailable()`** to gate interactions based on game state
6. **Follow naming conventions**: `pluginId`, `PluginConfig`, `pluginPlugin`
7. **Add tags** for better searchability
8. **Document config fields** with clear descriptions

## See Also

- [BACKEND_INTERACTION_DISPATCHER.md](./BACKEND_INTERACTION_DISPATCHER.md) - Future backend symmetry
- [apps/main/src/lib/game/interactions/README.md](../apps/main/src/lib/game/interactions/README.md) - Implementation details
- [apps/main/src/lib/game/interactions/types.ts](../apps/main/src/lib/game/interactions/types.ts) - TypeScript interfaces
