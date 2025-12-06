# Plugin System Architecture

## Overview

PixSim7's plugin system enables **safe, user-installable UI extensions** without compromising game integrity. Plugins are sandboxed, permission-based, and client-side only.

---

## Design Principles

1. **Safety First**: Plugins cannot modify game state or access sensitive APIs
2. **UI-Only**: Plugins enhance the interface, not game logic
3. **Permission-Based**: Explicit permissions for all capabilities
4. **Sandboxed**: Isolated execution environment
5. **Developer-Friendly**: Simple API, good DX

---

## Architecture Layers

```
┌─────────────────────────────────────────────┐
│          User-Installed Plugins              │
│  (relationship-tracker, birthday-reminder)   │
└─────────────────────────────────────────────┘
                    ↓ uses
┌─────────────────────────────────────────────┐
│            PluginAPI (Safe Interface)        │
│  - state (read-only)                         │
│  - ui.addOverlay()                           │
│  - storage.set/get()                         │
│  - notifications                             │
└─────────────────────────────────────────────┘
                    ↓ enforced by
┌─────────────────────────────────────────────┐
│           PluginManager (Sandbox)            │
│  - Permission checks                         │
│  - Lifecycle management                      │
│  - State injection                           │
│  - Error isolation                           │
└─────────────────────────────────────────────┘
                    ↓ reads from
┌─────────────────────────────────────────────┐
│              Game State (React)              │
│  - session, relationships, world, NPCs       │
│  - Read by plugins, modified by game only    │
└─────────────────────────────────────────────┘
```

---

## File Structure

```
apps/main/src/
  ├── lib/
  │   ├── plugins/
  │   │   ├── types.ts                    # Core types & interfaces
  │   │   ├── PluginManager.ts            # Plugin lifecycle & sandbox
  │   │   └── examples/
  │   │       └── RelationshipTracker.plugin.ts  # Example plugin
  │   └── game/
  │       └── interactions/               # Game-specific (separate from plugins)
  │           └── ...
  ├── components/
  │   ├── PluginManager.tsx               # Plugin management UI
  │   └── PluginOverlays.tsx              # Renders plugin overlays
  └── docs/
      ├── PLUGIN_DEVELOPER_GUIDE.md       # For plugin devs
      └── PLUGIN_SYSTEM_ARCHITECTURE.md   # This file
```

---

## Core Components

### 1. PluginManifest

Every plugin declares metadata and permissions:

```typescript
interface PluginManifest {
  id: string;                     // Unique identifier
  name: string;                   // Display name
  version: string;                // Semver
  author: string;
  description: string;
  icon?: string;
  type: 'ui-overlay' | 'theme' | 'tool' | 'enhancement';
  permissions: PluginPermission[];
  main: string;                   // Entry point
  dependencies?: Record<string, string>;
}
```

### 2. PluginAPI

Safe interface exposed to plugins:

```typescript
interface PluginAPI {
  // Identity
  getPluginId(): string;
  getManifest(): PluginManifest;

  // State (read-only)
  state: {
    getGameState(): PluginGameState;
    subscribe(callback: (state) => void): () => void;
  };

  // UI
  ui: {
    addOverlay(overlay: PluginOverlay): void;
    removeOverlay(id: string): void;
    addMenuItem(item: PluginMenuItem): void;
    showNotification(notification: PluginNotification): void;
    updateTheme(css: string): void;
  };

  // Storage (scoped to plugin)
  storage: {
    get<T>(key: string, defaultValue?: T): T | undefined;
    set(key: string, value: unknown): void;
    remove(key: string): void;
    clear(): void;
  };

  // Lifecycle
  onDisable(callback: () => void): void;
  onUninstall(callback: () => void): void;
}
```

### 3. PluginManager

Manages plugin lifecycle and enforces sandbox:

```typescript
class PluginManager {
  // Plugin management
  installPlugin(manifest, code): Promise<void>;
  enablePlugin(id): Promise<void>;
  disablePlugin(id): Promise<void>;
  uninstallPlugin(id): Promise<void>;

  // State
  updateGameState(state: PluginGameState): void;

  // UI
  getOverlays(): PluginOverlay[];
  getMenuItems(): PluginMenuItem[];

  // Internal
  private createPluginAPI(id): PluginAPI;  // Creates sandboxed API
  private validateManifest(manifest): void;  // Security checks
  private cleanupPluginUI(id): void;  // Remove all UI elements
}
```

---

## Security Model

### Permission System

Plugins declare permissions, enforced at runtime:

```typescript
// In manifest.json
{
  "permissions": ["read:session", "ui:overlay"]
}

// At runtime
api.ui.addOverlay({...});  // ✓ Allowed (has ui:overlay)
api.state.getGameState();  // ✓ Allowed (has read:session)
api.ui.updateTheme('...');  // ✗ Denied (no ui:theme permission)
```

### Sandboxing Strategy

**Current (Phase 1):**
- Permission checks on PluginAPI methods
- Scoped storage (localStorage prefixed with plugin ID)
- No direct access to game state (read-only snapshots)

**Future (Phase 2):**
- Iframe sandbox for code execution
- Content Security Policy
- Web Workers for CPU-intensive plugins

### What Plugins CANNOT Do

❌ Modify game state (session, flags, relationships)
❌ Call backend APIs directly
❌ Access other plugins' storage
❌ Make network requests
❌ Access DOM outside their overlays
❌ Execute arbitrary global code
❌ Read cookies or sensitive data

---

## Data Flow

### State Updates

```
Game Component
    ↓ (game logic modifies state)
Game State (React)
    ↓ (pluginManager.updateGameState())
PluginManager
    ↓ (calls subscribers)
Plugin.onStateChange()
    ↓ (re-renders overlays)
UI Update
```

### Plugin Actions

```
User clicks plugin overlay
    ↓
Plugin Event Handler
    ↓ (can only use PluginAPI)
api.ui.showNotification()
    ↓ (permission check)
PluginManager
    ↓ (calls UI callback)
Game Component.onNotification()
    ↓
Toast/Notification UI
```

---

## Integration Points

### In Game2D.tsx

```typescript
import { pluginManager } from '@/lib/plugins/PluginManager';
import { PluginOverlays } from '@/components/PluginOverlays';

export function Game2D() {
  // ... game state

  useEffect(() => {
    // Update plugin state when game state changes
    pluginManager.updateGameState({
      session: gameSession,
      flags: gameSession?.flags || {},
      relationships: gameSession?.relationships || {},
      world: worldDetail,
      worldTime,
      currentLocation: locationDetail,
      locationNpcs,
    });
  }, [gameSession, worldDetail, worldTime, locationDetail, locationNpcs]);

  return (
    <div>
      {/* Game UI */}
      <PluginOverlays />  {/* Renders plugin overlays */}
    </div>
  );
}
```

### In Plugin Settings Page

```typescript
import { PluginManagerUI } from '@/components/PluginManager';

export function PluginsPage() {
  return <PluginManagerUI />;
}
```

---

## Plugin Lifecycle

```
┌─────────┐
│ Install │ ─── manifest validated, stored in registry
└─────────┘
     ↓
┌─────────┐
│ Enable  │ ─── code loaded, onEnable() called, API injected
└─────────┘
     ↓
┌─────────┐
│ Running │ ─── overlays rendered, subscriptions active
└─────────┘
     ↓
┌─────────┐
│ Disable │ ─── onDisable() called, UI cleaned up
└─────────┘
     ↓
┌─────────┐
│Uninstall│ ─── onUninstall() called, storage cleared
└─────────┘
```

---

## Extension Points (Future)

### Phase 2: Interaction Plugins

Allow plugins to register new interaction types (with server validation):

```typescript
interface InteractionPlugin extends Plugin {
  registerInteraction(): InteractionDefinition;
}

// Plugin defines client behavior
api.interactions.register({
  id: 'give-gift',
  render: () => <GiftUI />,

  // Server validates
  async execute(config) {
    return api.server.call('interactions/execute', {
      type: 'give-gift',
      config,
    });
  },
});
```

### Phase 3: Theme Plugins

Full theming with CSS variables:

```typescript
api.theme.register({
  name: 'Cyberpunk',
  variables: {
    '--primary-color': '#ff00ff',
    '--bg-color': '#0a0a0a',
  },
});
```

### Phase 4: Integration Plugins

External integrations (Discord, Twitch):

```typescript
// Plugin runs externally, calls public APIs
const api = new PixSim7API(apiKey);
const session = await api.getSession();

// Do something with data (analytics, bot commands)
```

---

## Performance Considerations

### State Updates

- Use `subscribe()` with debouncing
- Only update overlays when relevant state changes
- Memoize overlay render functions

### Memory

- Plugins are cleaned up on disable
- Storage is scoped and limited
- Unsubscribe when disabled

### Render Performance

- Overlays use React.memo
- Avoid heavy computations in render
- Use requestAnimationFrame for animations

---

## Testing Strategy

### Unit Tests

```typescript
describe('PluginManager', () => {
  it('should enforce permissions', async () => {
    const manifest = { permissions: ['read:session'] };
    await pluginManager.installPlugin(manifest, code);

    // Should throw without permission
    expect(() => api.ui.updateTheme('...')).toThrow();
  });
});
```

### Integration Tests

```typescript
it('should render overlays', () => {
  const { container } = render(<PluginOverlays />);

  // Enable plugin
  await pluginManager.enablePlugin('test-plugin');

  // Check overlay is rendered
  expect(container.querySelector('[data-overlay="test"]')).toBeInTheDocument();
});
```

---

## Comparison with Other Systems

| Feature | PixSim7 | VS Code | Minecraft | Discord |
|---------|---------|---------|-----------|---------|
| Client-only | ✅ | ❌ (Node.js) | ❌ (Java) | ❌ (Bots) |
| Sandboxed | ✅ | ✅ | ❌ | ✅ |
| Permission-based | ✅ | ✅ | ❌ | ✅ |
| UI-only | ✅ | ❌ | ❌ | ❌ |
| Safe for web | ✅ | ❌ | ❌ | ✅ |

---

## Summary

**What we built:**
- ✅ Type-safe plugin system
- ✅ Permission-based security
- ✅ Read-only state access
- ✅ UI overlay system
- ✅ Plugin lifecycle management
- ✅ Example plugins
- ✅ Developer documentation

**What's next:**
- [ ] Code loading & sandboxing (iframe/worker)
- [ ] Plugin marketplace
- [ ] Review process
- [ ] Analytics & monitoring
- [ ] Advanced permissions
- [ ] Theme system

**Foundation is solid.** Can extend without breaking existing plugins.
