# Plugin Workspace

A unified development environment for browsing installed plugins and creating custom UI plugins.

## Overview

The Plugin Workspace is a two-phase system:

1. **Phase 1: Plugin Browser** - Read-only view of all installed plugins across all systems
2. **Phase 2: UI Plugin Projects** - Development environment for creating and testing sandboxed UI plugins

## Features

### Phase 1: Plugin Browser

Browse all installed plugins in one place:

- **Unified View**: See plugins from all 6 plugin systems (session helpers, interactions, node types, gallery tools, UI plugins, generation UI)
- **Search & Filter**: Full-text search and filter by kind/category
- **Plugin Metadata**: View ID, description, version, category, enabled state, and capabilities
- **Catalog Integration**: Powered by the unified plugin catalog layer

### Phase 2: UI Plugin Projects

Create and test custom UI plugins:

- **Project Management**: Create, edit, and delete plugin projects
- **Manifest Editor**: Edit plugin metadata (ID, name, version, description, permissions)
- **Code Editor**: Edit plugin code with syntax highlighting (monospace)
- **Live Preview**: Install and enable plugins to see them in action
- **Hot Reload**: Reinstall plugins to test changes immediately
- **Local Storage**: Projects are persisted in localStorage (no backend required)

## Usage

### Accessing the Workspace

Navigate to `/plugin-workspace` in the app.

### Phase 1: Browse Installed Plugins

1. Click the **Installed Plugins** tab
2. Use the search box to find specific plugins
3. Filter by plugin kind (Session Helper, Interaction, Node Type, etc.)
4. Filter by category if available
5. Click a plugin to see its details

### Phase 2: Create a UI Plugin

1. Click the **Projects** tab
2. Click **+ New UI Plugin**
3. Enter a name for your plugin
4. Edit the manifest fields:
   - **ID**: Unique identifier (auto-generated)
   - **Name**: Display name
   - **Version**: Semantic version (e.g., "1.0.0")
   - **Author**: Your name or "local-dev"
   - **Description**: What your plugin does
5. Edit the code in the code editor
6. Click **Install & Enable (Dev)** to test your plugin
7. Open other routes (e.g., Game2D) to see your plugin's UI overlays

### Example Plugin Code

The scaffold includes a simple example:

```javascript
/**
 * My Custom Plugin
 *
 * A custom UI plugin for PixSim7.
 */

async function onEnable(api) {
  const pluginId = api.getPluginId();

  // Add an overlay
  api.ui.addOverlay({
    id: pluginId + '-overlay',
    position: 'top-right',
    render: () => {
      const container = document.createElement('div');
      container.className = 'bg-white dark:bg-neutral-800 border rounded-lg shadow-lg p-4';

      const title = document.createElement('h3');
      title.textContent = 'My Plugin';
      container.appendChild(title);

      return container;
    }
  });

  // Show a notification
  api.ui.showNotification({
    message: 'Plugin enabled!',
    type: 'success',
    duration: 3000
  });
}

async function onDisable() {
  console.log('Plugin disabled');
}

export default {
  onEnable,
  onDisable
};
```

## Plugin API

UI plugins have access to a sandboxed API:

### Plugin Identity

```javascript
api.getPluginId()      // Get plugin ID
api.getManifest()      // Get plugin manifest
```

### State (Read-Only)

```javascript
api.state.getGameState()            // Get current game state
api.state.subscribe((state) => {})  // Subscribe to state changes
```

### UI Manipulation

```javascript
// Add an overlay
api.ui.addOverlay({
  id: 'my-overlay',
  position: 'top-right',  // or 'top-left', 'bottom-right', 'bottom-left', 'center'
  render: () => HTMLElement
});

// Remove an overlay
api.ui.removeOverlay('my-overlay');

// Show a notification
api.ui.showNotification({
  message: 'Hello!',
  type: 'success',  // or 'info', 'warning', 'error'
  duration: 3000    // milliseconds, 0 = persistent
});

// Add a menu item
api.ui.addMenuItem({
  id: 'my-menu-item',
  label: 'My Action',
  icon: '⚡',
  onClick: () => { /* ... */ }
});
```

### Storage (Plugin-Scoped)

```javascript
api.storage.get('key', defaultValue)
api.storage.set('key', value)
api.storage.remove('key')
api.storage.clear()
```

### Lifecycle

```javascript
api.onDisable(() => {
  // Cleanup code
});

api.onUninstall(() => {
  // Final cleanup
});
```

## Permissions

UI plugins must declare permissions in the manifest:

```javascript
{
  permissions: [
    'read:session',     // Read game session data
    'read:world',       // Read world state
    'read:npcs',        // Read NPC data
    'read:locations',   // Read location data
    'ui:overlay',       // Add UI overlays
    'ui:theme',         // Modify theme/CSS
    'storage',          // Local storage access
    'notifications'     // Show notifications
  ]
}
```

## Project Management

### Create Project

```typescript
import { createUiPluginProject } from '@/lib/plugins/projects';

const project = createUiPluginProject('My Plugin');
```

### Update Project

```typescript
import { updateProject } from '@/lib/plugins/projects';

project.code = '// Updated code';
updateProject(project);
```

### Install & Enable

```typescript
import { installUiPluginProject } from '@/lib/plugins/projects';

await installUiPluginProject(project);
// Plugin is now installed and enabled
```

### Disable

```typescript
import { disableUiPluginProject } from '@/lib/plugins/projects';

await disableUiPluginProject(project);
```

### Enable (Already Installed)

```typescript
import { enableUiPluginProject } from '@/lib/plugins/projects';

await enableUiPluginProject(project);
```

### Uninstall

```typescript
import { uninstallUiPluginProject } from '@/lib/plugins/projects';

await uninstallUiPluginProject(project);
```

### Delete Project

```typescript
import { deleteProject } from '@/lib/plugins/projects';

deleteProject(project.id);
```

## File Structure

```
apps/main/src/
├── lib/
│   └── plugins/
│       ├── catalog.ts              # Unified plugin catalog (Phase 1)
│       ├── projects.ts             # Plugin project management (Phase 2)
│       ├── PluginManager.ts        # Core plugin manager
│       ├── types.ts                # Plugin types
│       └── sandbox.ts              # Plugin sandbox
├── components/
│   └── plugins/
│       └── PluginBrowser.tsx       # Plugin browser component
└── routes/
    └── PluginWorkspace.tsx         # Main workspace route
```

## Storage

Plugin projects are stored in localStorage:

- **Key**: `pixsim7_plugin_projects`
- **Format**: JSON array of `PluginProject` objects
- **Persistence**: Survives page reloads
- **Scope**: Per-domain (localhost vs production)

## Limitations

1. **UI Plugins Only**: Phase 2 only supports UI plugins. Other plugin kinds (helpers, interactions, node types) are read-only in the browser.

2. **No Syntax Highlighting**: The code editor is a simple textarea. For advanced editing, use an external editor and paste the code.

3. **No Hot Module Reload**: To update a plugin, you must reinstall it. Disable and enable is not enough for code changes.

4. **Local Storage Only**: Projects are not synced to the backend. Export/import functionality may be added in future phases.

5. **Sandbox Restrictions**: UI plugins run in a sandbox and cannot:
   - Access the global window object
   - Import external libraries (must be bundled)
   - Modify game state directly (read-only)
   - Make arbitrary HTTP requests

## Security

UI plugins are sandboxed for safety:

- **Isolated Execution**: Plugins run in an iframe sandbox
- **Permission System**: Plugins must declare what they need
- **Read-Only State**: Plugins cannot modify game state
- **No DOM Access**: Plugins cannot access the parent document
- **Scoped Storage**: Each plugin has its own storage namespace

## Best Practices

1. **Start Small**: Begin with a simple overlay to test the API
2. **Use Descriptive IDs**: Make plugin IDs unique and descriptive
3. **Handle Errors**: Wrap plugin code in try/catch
4. **Clean Up**: Remove overlays/menu items in `onDisable`
5. **Test Thoroughly**: Install, disable, enable, and uninstall to ensure proper cleanup
6. **Version Carefully**: Use semantic versioning for plugin versions

## Troubleshooting

### Plugin Won't Install

- Check for syntax errors in the code
- Ensure the manifest is valid
- Check browser console for errors
- Try a fresh project with the default scaffold

### Plugin Not Showing UI

- Check if the plugin is enabled (green "Enabled" badge)
- Open a different route (e.g., Game2D) to see global overlays
- Check the `position` parameter in `addOverlay`
- Look for errors in the browser console

### Plugin State is "Error"

- Check the error message in the status panel
- Review the plugin code for exceptions
- Ensure all required permissions are declared
- Try reinstalling the plugin

### Changes Not Appearing

- Click **Reinstall (Update)** after editing code
- Disable and re-enable is not enough for code changes
- Clear browser cache if issues persist

## Future Enhancements

- **Syntax Highlighting**: Monaco editor or CodeMirror integration
- **TypeScript Support**: Compile TypeScript to JavaScript
- **Import/Export**: Share plugin projects as JSON files
- **Template Library**: Pre-built plugin templates
- **Debugger**: Integrated debugging tools
- **Hot Reload**: Live code updates without reinstall
- **Multi-Plugin Projects**: Bundle multiple plugins together
- **Backend Sync**: Store projects in the database
- **Marketplace**: Share and discover community plugins

## See Also

- [Plugin System Overview](./PLUGIN_SYSTEM.md)
- [Plugin Catalog](./PLUGIN_CATALOG.md)
- [Session Helper Reference](./SESSION_HELPER_REFERENCE.md)
- [Interaction Plugin Manifest](./INTERACTION_PLUGIN_MANIFEST.md)
