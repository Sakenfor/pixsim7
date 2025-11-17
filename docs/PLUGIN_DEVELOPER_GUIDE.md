

# Plugin Developer Guide

## Introduction

PixSim7 supports **UI-only plugins** that can enhance the game experience without modifying core game logic. Plugins are sandboxed and can only:

- Read game state (session, NPCs, relationships)
- Add UI overlays and menu items
- Store settings locally
- Show notifications

Plugins **cannot**:
- Modify game state directly
- Access backend APIs (except through approved hooks)
- Access other plugins' data
- Execute arbitrary code outside the sandbox

---

## Quick Start

### 1. Create Plugin Manifest

Every plugin needs a `manifest.json`:

```json
{
  "id": "my-awesome-plugin",
  "name": "My Awesome Plugin",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "Does awesome things",
  "icon": "🚀",
  "type": "ui-overlay",
  "permissions": [
    "read:session",
    "ui:overlay",
    "storage"
  ],
  "main": "index.js"
}
```

### 2. Implement Plugin Class

```typescript
import type { Plugin, PluginAPI } from '@pixsim7/plugins';

export class MyPlugin implements Plugin {
  async onEnable(api: PluginAPI): Promise<void> {
    // Add UI overlay
    api.ui.addOverlay({
      id: 'my-overlay',
      position: 'top-right',
      render: () => (
        <div className="bg-white p-4 rounded shadow">
          <h3>Hello from my plugin!</h3>
        </div>
      ),
    });

    // Subscribe to state changes
    api.state.subscribe((state) => {
      console.log('Game state updated:', state);
    });
  }

  async onDisable(): Promise<void> {
    // Cleanup (optional)
  }
}
```

### 3. Test Locally

```typescript
import { pluginManager } from '@pixsim7/plugins';
import manifest from './manifest.json';
import { MyPlugin } from './MyPlugin';

// Install and enable
await pluginManager.installPlugin(manifest, code);
await pluginManager.enablePlugin('my-awesome-plugin');
```

---

## API Reference

### PluginAPI

The main API exposed to plugins.

#### Identity

```typescript
api.getPluginId(): string        // Your plugin ID
api.getManifest(): PluginManifest  // Your manifest
```

#### State (Read-Only)

```typescript
// Get current game state
const state = api.state.getGameState();

// Subscribe to state changes
const unsubscribe = api.state.subscribe((newState) => {
  console.log('State changed:', newState);
});

// Cleanup
unsubscribe();
```

**Game State Structure:**

```typescript
interface PluginGameState {
  session: GameSessionDTO | null;
  flags: Record<string, unknown>;
  relationships: Record<string, unknown>;
  world: GameWorldDetail | null;
  worldTime: { day: number; hour: number };
  currentLocation: GameLocationDetail | null;
  locationNpcs: NpcPresenceDTO[];
}
```

#### UI Manipulation

```typescript
// Add overlay
api.ui.addOverlay({
  id: 'my-overlay',
  position: 'top-right',  // top-left | top-right | bottom-left | bottom-right | center
  render: () => <YourComponent />,
  zIndex: 1000,  // optional
});

// Remove overlay
api.ui.removeOverlay('my-overlay');

// Add menu item
api.ui.addMenuItem({
  id: 'my-action',
  label: 'Do Something',
  icon: '⚡',
  onClick: () => {
    console.log('Menu item clicked');
  },
});

// Show notification
api.ui.showNotification({
  message: 'Hello!',
  type: 'info',  // info | success | warning | error
  duration: 3000,  // ms, 0 = persistent
});

// Update theme (requires 'ui:theme' permission)
api.ui.updateTheme(`
  .my-custom-class {
    color: red;
  }
`);
```

#### Storage (Scoped to Plugin)

```typescript
// Save data
api.storage.set('myKey', { some: 'data' });

// Read data
const data = api.storage.get('myKey', defaultValue);

// Remove data
api.storage.remove('myKey');

// Clear all
api.storage.clear();
```

#### Lifecycle Hooks

```typescript
// Called when plugin is disabled
api.onDisable(() => {
  console.log('Plugin is being disabled');
});

// Called when plugin is uninstalled
api.onUninstall(() => {
  console.log('Plugin is being uninstalled');
});
```

---

## Permissions

Declare permissions in your manifest:

| Permission | Description |
|------------|-------------|
| `read:session` | Read game session data (flags, relationships) |
| `read:world` | Read world state |
| `read:npcs` | Read NPC data |
| `read:locations` | Read location data |
| `ui:overlay` | Add UI overlays and menu items |
| `ui:theme` | Modify CSS/theme |
| `storage` | Use localStorage for settings |
| `notifications` | Show notifications |

**Example:**

```json
{
  "permissions": [
    "read:session",
    "read:npcs",
    "ui:overlay",
    "storage"
  ]
}
```

---

## Plugin Types

### ui-overlay

Adds visual elements to the game UI.

**Example: Relationship Tracker**

```typescript
api.ui.addOverlay({
  id: 'relationships',
  position: 'top-right',
  render: () => {
    const { relationships } = api.state.getGameState();

    return (
      <div className="bg-white p-3 rounded shadow">
        <h3 className="text-sm font-bold mb-2">Relationships</h3>
        {Object.entries(relationships).map(([npc, data]) => (
          <div key={npc}>
            {npc}: {data.score}
          </div>
        ))}
      </div>
    );
  },
});
```

### theme

Customizes the visual appearance.

**Example: Dark Mode Theme**

```typescript
api.ui.updateTheme(`
  :root {
    --bg-color: #1a1a1a;
    --text-color: #ffffff;
  }

  body {
    background: var(--bg-color);
    color: var(--text-color);
  }
`);
```

### tool

Provides utility features.

**Example: Time Calculator**

```typescript
api.ui.addOverlay({
  id: 'time-calc',
  position: 'bottom-right',
  render: () => {
    const { worldTime } = api.state.getGameState();
    const totalHours = (worldTime.day - 1) * 24 + worldTime.hour;

    return (
      <div className="bg-blue-50 p-3 rounded">
        <strong>Total hours:</strong> {totalHours}
      </div>
    );
  },
});
```

---

## Example Plugins

### 1. NPC Birthday Reminder

```typescript
export class BirthdayReminderPlugin implements Plugin {
  async onEnable(api: PluginAPI) {
    api.state.subscribe((state) => {
      const { locationNpcs, worldTime } = state;

      for (const npc of locationNpcs) {
        if (npc.birthday?.day === worldTime.day) {
          api.ui.showNotification({
            message: `🎂 It's NPC #${npc.npc_id}'s birthday!`,
            type: 'info',
            duration: 5000,
          });
        }
      }
    });
  }
}
```

### 2. Session Statistics

```typescript
export class StatsPlugin implements Plugin {
  async onEnable(api: PluginAPI) {
    api.ui.addOverlay({
      id: 'stats',
      position: 'top-left',
      render: () => {
        const { session } = api.state.getGameState();
        if (!session) return null;

        const flagCount = Object.keys(session.flags).length;
        const relationshipCount = Object.keys(session.relationships).length;

        return (
          <div className="bg-gray-800 text-white p-3 rounded text-xs">
            <div>Flags: {flagCount}</div>
            <div>NPCs: {relationshipCount}</div>
          </div>
        );
      },
    });
  }
}
```

### 3. Custom Keybindings

```typescript
export class KeybindingsPlugin implements Plugin {
  private listener?: (e: KeyboardEvent) => void;

  async onEnable(api: PluginAPI) {
    this.listener = (e) => {
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        const { relationships } = api.state.getGameState();
        console.log('Relationships:', relationships);
      }
    };

    window.addEventListener('keydown', this.listener);
  }

  async onDisable() {
    if (this.listener) {
      window.removeEventListener('keydown', this.listener);
    }
  }
}
```

---

## Best Practices

### 1. Performance

- **Minimize re-renders**: Use React.memo for overlay components
- **Debounce state subscriptions**: Don't update on every state change
- **Clean up**: Remove event listeners in `onDisable()`

```typescript
import { debounce } from 'lodash';

const debouncedUpdate = debounce((state) => {
  // Update UI
}, 300);

api.state.subscribe(debouncedUpdate);
```

### 2. Error Handling

- **Wrap API calls**: Always handle errors
- **Graceful degradation**: Work even if some data is missing

```typescript
try {
  const state = api.state.getGameState();
  // Use state
} catch (e) {
  console.error('Failed to get state:', e);
  // Show fallback UI
}
```

### 3. User Settings

- **Persist preferences**: Use `api.storage`
- **Provide config UI**: Implement `renderSettings()`

```typescript
export class ConfigurablePlugin implements Plugin {
  async onEnable(api: PluginAPI) {
    const showOverlay = api.storage.get('showOverlay', true);

    if (showOverlay) {
      api.ui.addOverlay({...});
    }
  }

  renderSettings(api: PluginAPI) {
    const showOverlay = api.storage.get('showOverlay', true);

    return (
      <div>
        <label>
          <input
            type="checkbox"
            checked={showOverlay}
            onChange={(e) => {
              api.storage.set('showOverlay', e.target.checked);
            }}
          />
          Show overlay
        </label>
      </div>
    );
  }
}
```

---

## Security

### Sandboxing

Plugins run in a restricted environment:

- ✅ Can access PluginAPI
- ✅ Can render React components
- ❌ Cannot access global `window` APIs (except what's allowed)
- ❌ Cannot make network requests
- ❌ Cannot access file system

### Permission Model

Plugins must declare all permissions in manifest. Accessing APIs without permission throws an error:

```typescript
// Without 'storage' permission:
api.storage.set('key', 'value');  // ❌ Throws error

// Without 'ui:overlay' permission:
api.ui.addOverlay({...});  // ❌ Throws error
```

### Code Review

All plugins submitted to the official plugin store are manually reviewed for:

- Security vulnerabilities
- API misuse
- Performance issues
- User privacy concerns

---

## Publishing

### 1. Bundle Your Plugin

```bash
# Build for production
npm run build

# Creates: dist/my-plugin.bundle.js
```

### 2. Create Release Package

```json
{
  "manifest": { /* your manifest.json */ },
  "code": "/* bundled code */",
  "assets": {
    "icon.png": "https://..."
  }
}
```

### 3. Submit to Plugin Store

(Coming soon - submission process TBD)

---

## FAQ

### Can I modify game state?

No. Plugins are UI-only and read-only. You can read state but cannot modify it directly.

### Can I call backend APIs?

Not directly. You can only use APIs exposed through `PluginAPI`. If you need a new API, submit a feature request.

### Can my plugin communicate with external servers?

No. Network requests are blocked for security.

### Can I access other plugins?

No. Plugins are isolated from each other.

### What React version should I use?

Use the same version as the game (check package.json). Your plugin will use the game's React instance.

---

## Support

- Documentation: https://pixsim7.dev/plugins
- Examples: https://github.com/pixsim7/plugin-examples
- Discord: https://discord.gg/pixsim7
- Issues: https://github.com/pixsim7/plugins/issues
