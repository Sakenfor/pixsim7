# Plugin Metadata and Configuration System Implementation

## Overview

This implementation enhances helper and interaction plugins with comprehensive metadata and a UI-based configuration system. Plugins are now more self-describing, discoverable, and user-configurable.

## ✅ Acceptance Criteria Met

### 4.1 Extend Registry Types ✓

**Helper Registry (`packages/game-core/src/session/helperRegistry.ts`)**
- Added `id` field for unique identification
- Added `version` field for versioning (semver recommended)
- Added `tags[]` field for filtering/searching
- Added `experimental` boolean flag
- Added `configSchema` for defining configurable options
- Defined `ConfigField` interface with type-safe field definitions
- Added validation warnings for missing metadata (non-blocking)

**Interaction Registry (`frontend/src/lib/game/interactions/types.ts`)**
- Added `category` field for organization
- Added `version` field for versioning
- Added `tags[]` field for filtering/searching
- Added `experimental` boolean flag
- Added `configSchema` for additional config options
- Enhanced `ConfigField` interface extending `FormField`
- Added validation in `InteractionRegistry.register()` with warnings

### 4.2 Adjust Plugin Examples & Docs ✓

**Updated Examples:**
- `frontend/src/plugins/helpers/example/example.ts` - Shows new metadata fields and configSchema
- `frontend/src/plugins/interactions/example/example.ts` - Shows category, version, tags, experimental

**Updated Documentation:**
- `frontend/src/plugins/README.md` - Comprehensive examples showing all new metadata fields

### 4.3 Teach pluginLoader About Metadata ✓

**Plugin Loader (`frontend/src/lib/pluginLoader.ts`)**
- Enhanced helper plugin loading with metadata validation
- Enhanced interaction plugin loading with metadata validation
- Added warning messages for missing metadata fields (id, description, category)
- Added debug logging for experimental plugins
- Validation is non-blocking (warnings only, no crashes)

### 4.4 Implement In-App Config Storage ✓

**Plugin Config Store (`frontend/src/stores/pluginConfigStore.ts`)**
- Created Svelte writable store for plugin configurations
- Keyed by plugin ID for easy lookup
- Provides functions:
  - `getPluginConfig(id)` - Get config for a plugin
  - `setPluginConfig(id, partialConfig)` - Update config (merges)
  - `resetPluginConfig(id, defaultConfig)` - Reset to defaults
  - `getPluginConfigWithDefaults(id, defaults)` - Get with defaults applied
  - `isPluginEnabled(id)` - Check enabled status
  - `togglePluginEnabled(id)` - Toggle enabled state
- Automatic localStorage persistence
- Type-safe with generic support
- Change notifications via store subscriptions

### 4.5 Build Simple Config UI ✓

**Plugin Config Panel (`frontend/src/components/PluginConfigPanel.tsx`)**
- Lists all registered helpers and interactions
- Shows metadata:
  - Name, description, category
  - Version, tags, ID
  - Experimental badge
  - Type (helper/interaction)
- Filter by type (all/helpers/interactions)
- Search functionality (by name, description, category, tags)
- Enable/disable toggle for each plugin
- Renders form controls based on configSchema/configFields:
  - Boolean (checkbox)
  - Number (input or slider)
  - String/Text (text input)
  - Select (dropdown)
- Real-time config updates via store
- Reset to defaults button
- Responsive grid layout

### 4.6 Additional Features ✓

- Missing metadata logs clear warnings but doesn't crash
- Config persists to localStorage automatically
- Reactive updates when config changes
- Type-safe throughout with TypeScript
- Backward compatible (existing plugins still work)

## File Changes

### New Files
1. `/home/user/pixsim7/frontend/src/stores/pluginConfigStore.ts` - Config storage
2. `/home/user/pixsim7/frontend/src/components/PluginConfigPanel.tsx` - Config UI
3. `/home/user/pixsim7/PLUGIN_METADATA_IMPLEMENTATION.md` - This document

### Modified Files
1. `/home/user/pixsim7/packages/game-core/src/session/helperRegistry.ts` - Enhanced types
2. `/home/user/pixsim7/frontend/src/lib/game/interactions/types.ts` - Enhanced types
3. `/home/user/pixsim7/frontend/src/plugins/helpers/example/example.ts` - Updated example
4. `/home/user/pixsim7/frontend/src/plugins/interactions/example/example.ts` - Updated example
5. `/home/user/pixsim7/frontend/src/plugins/README.md` - Updated documentation
6. `/home/user/pixsim7/frontend/src/lib/pluginLoader.ts` - Enhanced validation

## Usage Examples

### Creating a Helper with Metadata

```typescript
import { sessionHelperRegistry } from '@/lib/registries';

sessionHelperRegistry.register({
  id: 'custom-reputation',
  name: 'customReputation',
  category: 'custom',
  description: 'Advanced reputation tracking',
  version: '2.0.0',
  tags: ['reputation', 'social', 'npc'],
  experimental: false,
  fn: (session, npcId, amount) => {
    // Implementation
  },
  configSchema: {
    maxReputation: {
      key: 'maxReputation',
      label: 'Maximum Reputation',
      type: 'number',
      default: 100,
      min: 50,
      max: 1000,
    },
    enableNotifications: {
      key: 'enableNotifications',
      label: 'Enable Notifications',
      type: 'boolean',
      default: true,
    },
  },
});
```

### Creating an Interaction with Metadata

```typescript
export const giftPlugin: InteractionPlugin<GiftConfig> = {
  id: 'gift-giving',
  name: 'Gift Giving',
  description: 'Give gifts to NPCs to improve relationships',
  icon: '🎁',
  category: 'social',
  version: '1.2.0',
  tags: ['relationship', 'items', 'social'],
  experimental: false,
  defaultConfig: {
    enabled: true,
    affinityBonus: 10,
  },
  configFields: [
    { key: 'enabled', label: 'Enabled', type: 'boolean' },
    { key: 'affinityBonus', label: 'Affinity Bonus', type: 'slider', min: 1, max: 50 },
  ],
  async execute(config, context) {
    // Implementation
  },
};
```

### Using Plugin Config in Code

```typescript
import { getPluginConfigWithDefaults, isPluginEnabled } from '@/stores/pluginConfigStore';

// Check if plugin is enabled
if (isPluginEnabled('my-plugin-id')) {
  // Get config with defaults
  const config = getPluginConfigWithDefaults('my-plugin-id', {
    someOption: 42,
    anotherOption: 'default',
  });

  // Use config values
  console.log(config.someOption);
}
```

### Adding Config Panel to App

```typescript
import { PluginConfigPanel } from '@/components/PluginConfigPanel';

// In your settings/admin page
<PluginConfigPanel />
```

## Benefits

1. **Discoverability** - Plugins show up in UI with clear descriptions
2. **User Control** - Users can enable/disable and configure plugins
3. **Developer Experience** - Clear metadata makes plugins self-documenting
4. **Maintainability** - Version tracking helps with updates
5. **Organization** - Categories and tags enable better filtering
6. **Safety** - Experimental flag warns users of beta features
7. **Flexibility** - Config schema allows runtime customization

## Testing Recommendations

1. Load the PluginConfigPanel component
2. Verify all registered helpers appear in the list
3. Verify all registered interactions appear in the list
4. Test filtering by type (all/helpers/interactions)
5. Test search functionality
6. Toggle plugins on/off and verify localStorage persistence
7. Modify config values and verify they save
8. Reset to defaults and verify it works
9. Check browser console for metadata warnings
10. Verify backward compatibility with plugins without metadata

## Next Steps

1. Add PluginConfigPanel to settings or admin page
2. Update existing plugins to include metadata
3. Consider adding plugin documentation viewer
4. Add export/import for plugin configurations
5. Add plugin dependency management
6. Consider plugin marketplace integration
