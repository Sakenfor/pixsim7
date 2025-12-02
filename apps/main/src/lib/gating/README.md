## Gating Plugin System

A flexible, extensible system for content and interaction gating based on relationship stats.

### Architecture

```
gating/
├── types.ts              - Plugin interfaces and types
├── registry.ts           - Plugin registration and lookup
├── plugins/
│   └── intimacyDefault.ts - Default intimacy-based gating
└── index.ts              - Main entry point with auto-registration
```

### Quick Start

```typescript
import { getWorldGatingPlugin } from '@/lib/gating';

// Get the configured plugin for this world
const plugin = getWorldGatingPlugin(world.meta);

// Check if content is allowed
const result = plugin.checkContentGate(
  {
    statDefinitionId: 'relationships',
    axes: { affinity: 60, chemistry: 50 },
    levelId: 'intimate'
  },
  'romantic',
  world.meta.gating_config
);

if (!result.allowed) {
  console.log(result.reason); // "Requires chemistry >= 70"
  console.log(result.suggestedMinimums); // { affinity: 60, chemistry: 50 }
}
```

### World Configuration

Worlds can specify which gating plugin to use and configure it:

```json
{
  "meta": {
    "gating_plugin": "intimacy.default",
    "gating_config": {
      "romantic": {
        "minimumBand": "light",
        "minimumChemistry": 25,
        "minimumAffinity": 40
      },
      "mature": {
        "minimumBand": "deep",
        "minimumChemistry": 50,
        "minimumAffinity": 60
      }
    }
  }
}
```

### Built-in Plugins

#### intimacy.default

Romance/intimacy-based gating using the relationships stat system.

**Supported Gate Types:**
- `sfw` - Safe for work content
- `romantic` - Light romantic content
- `mature` / `mature_implied` - Mature romantic content
- `restricted` - Explicit content
- `seduction` - Seduction interaction
- `sensual_touch` - Sensual touch interaction

**Required Stats:** `relationships` (with axes: affinity, chemistry, trust, tension)

### Creating Custom Plugins

```typescript
import { GatingPlugin, registerGatingPlugin } from '@/lib/gating';

const myCustomPlugin: GatingPlugin = {
  id: 'my-game.trust-system',
  name: 'Trust-Based Gating',
  version: '1.0.0',
  requiredStatDefinitions: ['trust'],
  supportedGateTypes: ['confidential', 'secret', 'classified'],

  checkContentGate(state, gateType, config) {
    const trustLevel = state.axes.trust || 0;

    switch (gateType) {
      case 'confidential':
        return {
          allowed: trustLevel >= 30,
          reason: trustLevel < 30 ? 'Insufficient trust' : undefined,
        };
      case 'secret':
        return {
          allowed: trustLevel >= 60,
          reason: trustLevel < 60 ? 'High trust required' : undefined,
        };
      case 'classified':
        return {
          allowed: trustLevel >= 90,
          reason: trustLevel < 90 ? 'Maximum trust required' : undefined,
        };
      default:
        return { allowed: false, reason: 'Unknown gate type' };
    }
  },

  getGateRequirements(gateType, config) {
    const thresholds = {
      confidential: 30,
      secret: 60,
      classified: 90,
    };

    return {
      axisThresholds: { trust: thresholds[gateType] || 0 },
      description: `Requires trust >= ${thresholds[gateType] || 0}`,
    };
  },
};

// Register the plugin
registerGatingPlugin(myCustomPlugin, {
  category: 'professional',
  tags: ['trust', 'corporate'],
});
```

Then in your world config:

```json
{
  "meta": {
    "gating_plugin": "my-game.trust-system",
    "gating_config": {
      "confidential": { "minTrust": 35 }
    }
  }
}
```

### Integration with Stat System

The gating plugin system works seamlessly with the stat system:

1. **Stat definitions** provide the axes (affinity, trust, etc.)
2. **StatEngine** normalizes values and computes tiers/levels
3. **Gating plugins** use normalized data to make gating decisions
4. **World config** specifies which plugin and thresholds to use

### Migration from Task 109

The existing `intimacyGating.ts` helper is still available and works as before.
The plugin system is a layer on top that provides:

- **Extensibility**: Easy to add new gating strategies
- **Per-world config**: Worlds choose which plugin to use
- **Consistency**: Same pattern as stat packages
- **Flexibility**: Plugins can implement any gating logic

Existing code continues to work. To use the plugin system, replace:

```typescript
// Old way
import { canAttemptSeduction } from '@/lib/intimacy/intimacyGating';
const check = canAttemptSeduction(state);
```

With:

```typescript
// New way (plugin-based)
import { getWorldGatingPlugin } from '@/lib/gating';
const plugin = getWorldGatingPlugin(world.meta);
const check = plugin.checkContentGate(state, 'seduction');
```

### Registry API

```typescript
// Register a plugin
registerGatingPlugin(plugin, { category: 'romance', tags: ['intimacy'] });

// Get a specific plugin
const plugin = getGatingPlugin('intimacy.default');

// List all plugins
const allPlugins = listGatingPlugins();
const romancePlugins = listGatingPlugins({ category: 'romance' });
const taggedPlugins = listGatingPlugins({ tag: 'intimacy' });

// Get plugin for a world (with fallback)
const worldPlugin = getWorldGatingPlugin(world.meta);

// Check if plugin exists
if (hasGatingPlugin('my-plugin')) {
  // ...
}

// Unregister a plugin
unregisterGatingPlugin('my-plugin');
```

### Best Practices

1. **Use the registry**: Always get plugins via `getWorldGatingPlugin()` to respect world config
2. **Provide feedback**: Return helpful `reason` messages for denied gates
3. **Suggest minimums**: Include `suggestedMinimums` to guide users
4. **Declare requirements**: Implement `getGateRequirements()` for UI/editor support
5. **Version your plugins**: Use semantic versioning for compatibility
6. **Document gate types**: List supported gates in `supportedGateTypes`
7. **Test boundaries**: Test edge cases around threshold values

### Future Enhancements

- **Backend support**: Mirror plugin system on Python backend for authoritative checks
- **UI tools**: Visual editor for gating configs
- **Plugin discovery**: Browse and install third-party plugins
- **Validation**: Schema validation for plugin configs
- **Analytics**: Track gate usage and denials
