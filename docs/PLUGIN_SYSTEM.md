# UI Plugin System

A comprehensive sandboxed plugin system for PixSim7 that allows users to safely install and run third-party UI extensions.

## Features

- **Iframe-based Sandboxing**: Plugins run in isolated iframes with restricted permissions
- **PostMessage RPC API**: Secure communication between plugin sandbox and host
- **Bundle Management**: Upload, install, enable, disable, and uninstall plugins
- **Persistent Storage**: Plugin bundles and settings stored in localStorage
- **Permission System**: Fine-grained permissions for data access and UI manipulation
- **Game State Streaming**: Real-time game state updates to enabled plugins
- **UI Elements**: Plugins can add overlays, menu items, and notifications
- **Auto-restore**: Previously enabled plugins are automatically re-enabled on app startup

## Architecture

### Components

1. **PluginManager** (`apps/main/src/lib/plugins/PluginManager.ts`)
   - Singleton service managing plugin lifecycle
   - Handles installation, enabling, disabling, and uninstalling
   - Manages plugin registry and storage
   - Creates sandboxed plugin API for each plugin

2. **SandboxedPlugin** (`apps/main/src/lib/plugins/sandbox.ts`)
   - Iframe-based sandbox implementation
   - PostMessage RPC bridge for API calls
   - Isolates plugin code from parent window

3. **PluginOverlays** (`apps/main/src/components/PluginOverlays.tsx`)
   - Renders plugin overlays, menu items, and notifications
   - Mounted at app root level
   - Subscribes to plugin manager for UI updates

4. **PluginManagerUI** (`apps/main/src/components/PluginManager.tsx`)
   - User interface for managing plugins
   - Upload, install, enable, disable, and uninstall plugins
   - View plugin details and permissions

### Data Flow

```
User Action (Game) → Game State Update → PluginManager.updateGameState()
                                              ↓
                                    Active Plugins Notified
                                              ↓
                                    Plugin Updates UI (overlay, etc.)
                                              ↓
                                    PluginManager fires callback
                                              ↓
                                    PluginOverlays re-renders
```

## Plugin Bundle Format

A plugin bundle is a JSON file with the following structure:

```json
{
  "manifest": {
    "id": "my-plugin",
    "name": "My Plugin",
    "version": "1.0.0",
    "author": "Your Name",
    "description": "What the plugin does",
    "icon": "🎮",
    "type": "ui-overlay",
    "permissions": ["read:session", "ui:overlay", "storage"],
    "main": "index.js"
  },
  "code": "/* Plugin JavaScript code */"
}
```

### Manifest Fields

- **id**: Unique identifier (lowercase alphanumeric with hyphens)
- **name**: Display name
- **version**: Semantic version (e.g., "1.0.0")
- **author**: Plugin author
- **description**: Short description
- **icon**: Icon emoji or URL
- **type**: Plugin type (`ui-overlay`, `theme`, `tool`, `enhancement`)
- **permissions**: Array of required permissions
- **main**: Entry point file (currently unused, code is in bundle)

### Available Permissions

- `read:session` - Read game session data
- `read:world` - Read world state
- `read:npcs` - Read NPC data
- `read:locations` - Read location data
- `ui:overlay` - Add UI overlays
- `ui:theme` - Modify theme/CSS
- `storage` - Local storage for plugin settings
- `notifications` - Show notifications

## Plugin API

Plugins receive a `PluginAPI` object in their `onEnable` method:

```javascript
const plugin = {
  async onEnable(api) {
    // Plugin identity
    const id = api.getPluginId();
    const manifest = api.getManifest();

    // Read game state
    const state = api.state.getGameState();

    // Subscribe to state updates
    const unsubscribe = api.state.subscribe((newState) => {
      console.log('State updated:', newState);
    });

    // Add UI overlay
    api.ui.addOverlay({
      id: 'my-overlay',
      position: 'top-right', // top-left, top-right, bottom-left, bottom-right, center
      render: () => {
        const div = document.createElement('div');
        div.innerHTML = '<p>Hello from plugin!</p>';
        return div.firstChild;
      },
    });

    // Remove overlay
    api.ui.removeOverlay('my-overlay');

    // Add menu item
    api.ui.addMenuItem({
      id: 'my-menu-item',
      label: 'My Plugin',
      icon: '🎮',
      onClick: () => console.log('Menu item clicked'),
    });

    // Show notification
    api.ui.showNotification({
      message: 'Plugin loaded!',
      type: 'success', // info, success, warning, error
      duration: 3000, // milliseconds, 0 = persistent
    });

    // Update theme (requires ui:theme permission)
    api.ui.updateTheme(`
      .my-custom-class {
        color: red;
      }
    `);

    // Storage (requires storage permission)
    api.storage.set('myKey', { foo: 'bar' });
    const value = api.storage.get('myKey');
    api.storage.remove('myKey');
    api.storage.clear();

    // Lifecycle hooks
    api.onDisable(() => {
      console.log('Plugin disabled');
    });

    api.onUninstall(() => {
      console.log('Plugin uninstalled');
    });
  },

  async onDisable() {
    // Cleanup when disabled
  },

  async onUninstall() {
    // Cleanup when uninstalled
  },
};
```

### Game State Structure

The `PluginGameState` object contains:

```typescript
{
  session: GameSessionDTO | null;
  flags: Record<string, unknown>;
  relationships: Record<string, unknown>;
  world: GameWorldDetail | null;
  worldTime: { day: number; hour: number };
  currentLocation: GameLocationDetail | null;
  locationNpcs: NpcPresenceDTO[];
}
```

## Creating a Plugin

### 1. Write Plugin Code

Create a JavaScript file with the plugin implementation:

```javascript
// my-plugin.js
const plugin = {
  async onEnable(api) {
    // Add overlay showing current world time
    api.ui.addOverlay({
      id: 'time-display',
      position: 'top-left',
      render: () => {
        const state = api.state.getGameState();
        const { day, hour } = state.worldTime;

        const div = document.createElement('div');
        div.innerHTML = `
          <div style="background: rgba(0,0,0,0.8); color: white; padding: 8px; border-radius: 4px;">
            <strong>Day ${day}</strong> - ${hour}:00
          </div>
        `;
        return div.firstChild;
      },
    });

    // Subscribe to state updates to refresh overlay
    api.state.subscribe(() => {
      // Overlay will re-render automatically
    });
  },
};
```

### 2. Create Bundle JSON

Create a JSON file with the manifest and code:

```json
{
  "manifest": {
    "id": "time-display",
    "name": "Time Display",
    "version": "1.0.0",
    "author": "Me",
    "description": "Shows current world time",
    "icon": "⏰",
    "type": "ui-overlay",
    "permissions": ["read:session", "ui:overlay"],
    "main": "my-plugin.js"
  },
  "code": "const plugin = { async onEnable(api) { /* code here */ } };"
}
```

### 3. Install Plugin

1. Navigate to `/plugins` in the app
2. Click "📁 Upload Bundle"
3. Select your JSON bundle file
4. Click "Enable" to activate the plugin

## Security

### Sandbox Isolation

Plugins run in iframes with `sandbox="allow-scripts"` attribute, which:
- Prevents access to `parent` window
- Prevents access to cookies
- Prevents form submission
- Prevents navigation
- Prevents opening popups

### RPC Communication

All plugin API calls go through postMessage RPC:
- Plugin sends request with method and arguments
- Host validates permissions and executes
- Host sends response back to plugin
- Timeout after 30 seconds

### Permission Enforcement

Each API method checks permissions before execution:
```javascript
if (!hasPermission('read:session')) {
  throw new Error('Plugin does not have permission to read session');
}
```

## Storage

### Plugin Bundles
- Key: `plugin-bundle:<plugin-id>`
- Value: JSON-serialized `PluginBundle`

### Plugin Registry
- Key: `plugin-registry`
- Value: Array of `PluginEntry` objects

### Plugin Settings
- Key: `plugin:<plugin-id>:<key>`
- Value: JSON-serialized value

## Troubleshooting

### Plugin fails to enable

1. Check browser console for errors
2. Verify manifest is valid
3. Ensure all required permissions are declared
4. Check plugin code syntax

### Overlay not rendering

1. Verify `ui:overlay` permission is granted
2. Check that `render()` function returns a DOM element
3. Look for JavaScript errors in iframe console

### State updates not received

1. Ensure `read:session` permission is granted
2. Verify plugin is subscribed to state updates
3. Check that game state is being updated in Game2D route

## Future Enhancements

- **Remote Plugin Registry**: Download plugins from central repository
- **Plugin Marketplace**: Browse and install community plugins
- **Hot Reload**: Update plugins without page refresh
- **Developer Tools**: Plugin debugging and testing utilities
- **Typed API**: TypeScript definitions for plugin API
- **React Support**: Allow plugins to use React components
- **Web Workers**: More powerful sandboxing with workers
- **Plugin Dependencies**: Plugins can depend on other plugins
- **Versioning**: Plugin update and compatibility checking
