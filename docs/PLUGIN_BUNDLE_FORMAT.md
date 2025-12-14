# Plugin Bundle Format

This document describes the bundle/manifest-driven plugin system for PixSim7. It covers the manifest schema, expected build output, and how bundles register with registries.

## Overview

Plugin bundles are self-contained packages that can be:
1. Built separately from the main application
2. Discovered at runtime via manifest files
3. Loaded dynamically via ES module imports
4. Registered with the appropriate plugin registry

This enables:
- **Drop-in plugins**: Place a bundle in the plugins directory and it's automatically loaded
- **Independent builds**: Each plugin can be built and versioned separately
- **Third-party plugins**: External developers can create plugins without modifying the main codebase
- **Hot reloading**: Plugins can be updated without rebuilding the entire application

## Bundle Structure

A plugin bundle consists of two main files:

```
dist/plugins/{family}/{plugin-id}/
├── manifest.json    # Plugin metadata (JSON)
└── plugin.js        # Bundled ES module
```

### Example: Scene View Plugin

```
dist/plugins/scene/comic-panel-view/
├── manifest.json
└── plugin.js
```

## Manifest Schema

The manifest file (`manifest.json`) contains all metadata needed to load and register the plugin.

### Base Manifest Fields

```typescript
interface PluginManifest {
  // Required - Identity
  id: string;              // Unique identifier (kebab-case with family prefix)
  name: string;            // Human-readable display name
  version: string;         // Semantic version (e.g., "1.0.0")

  // Required - Plugin metadata
  type: PluginType;        // Plugin type identifier
  main: string;            // Entry point file (e.g., "plugin.js")

  // Optional - Additional metadata
  author?: string;         // Plugin author
  description?: string;    // Short description
  icon?: string;           // Emoji or icon URL

  // Optional - Compatibility
  minGameVersion?: string; // Minimum app version required
  maxGameVersion?: string; // Maximum app version supported

  // Optional - Runtime
  permissions?: PluginPermission[];     // Required permissions
  dependencies?: Record<string, string>; // Plugin dependencies
}
```

### Plugin Types

```typescript
type PluginType =
  | 'ui-overlay'      // Overlay/HUD plugins
  | 'scene-view'      // Scene rendering plugins
  | 'control-center'  // Control center plugins
  | 'tool'            // Tool plugins
  | 'enhancement';    // General enhancements
```

### Permissions

```typescript
type PluginPermission =
  | 'read:session'     // Read game session data
  | 'read:world'       // Read world state
  | 'read:npcs'        // Read NPC data
  | 'read:locations'   // Read location data
  | 'ui:overlay'       // Add UI overlays
  | 'ui:theme'         // Modify theme/CSS
  | 'storage'          // Local storage access
  | 'notifications';   // Show notifications
```

### Scene View Manifest Extension

Scene view plugins extend the base manifest with a `sceneView` descriptor:

```typescript
interface SceneViewPluginManifest extends PluginManifest {
  type: 'ui-overlay';
  sceneView: {
    id: string;              // Scene view identifier
    displayName: string;     // Display name in UI
    description?: string;    // Detailed description
    surfaces?: Array<'overlay' | 'hud' | 'panel' | 'workspace'>;
    default?: boolean;       // Is this the default scene view?
  };
}
```

### Example Manifest

```json
{
  "id": "scene-view:comic-panels",
  "name": "Comic Panel View",
  "version": "1.0.0",
  "author": "PixSim7 Team",
  "description": "Displays scene beats as sequential comic frames with optional captions",
  "type": "ui-overlay",
  "icon": "📚",
  "permissions": ["ui:overlay", "read:session", "read:world"],
  "main": "plugin.js",
  "sceneView": {
    "id": "scene-view:comic-panels",
    "displayName": "Comic Panels",
    "description": "Sequential comic-style frames for scene playback",
    "surfaces": ["overlay", "hud", "panel"],
    "default": true
  }
}
```

## Plugin Entry Point

The plugin's JavaScript bundle (`plugin.js`) must export specific items.

### Scene View Plugin Exports

```typescript
// Required exports for scene-view plugins
export const manifest: SceneViewPluginManifest;
export const plugin: SceneViewPlugin;

// Optional: Auto-register function
export function register(): void;
```

### Plugin Interface

```typescript
interface SceneViewPlugin {
  render: (props: SceneViewRenderProps) => React.ReactElement | null;
}

interface SceneViewRenderProps {
  panels: SceneMetaComicPanel[];
  session?: ComicPanelSession;
  sceneMeta?: ComicPanelSceneMeta;
  layout?: ComicPanelLayout;
  showCaption?: boolean;
  className?: string;
  requestContext?: ComicPanelRequestContext;
  onPanelClick?: (panel: SceneMetaComicPanel) => void;
}
```

## Allowed SDK Imports

Plugin bundles should only import from these stable SDK modules:

### Feature Modules
- `@features/scene` - Scene types and helpers
  - `SceneMetaComicPanel`, `ComicPanelRequestContext`, `ComicPanelLayout`
  - `getActiveComicPanels`, `getComicPanelById`, `getComicPanelsByTags`
  - `ensureAssetRef`, `extractNumericAssetId`

### Library Modules
- `@lib/assetProvider` - Asset resolution
  - `useAssetProvider`, `AssetProvider`
- `@lib/plugins/sceneViewPlugin` - Plugin registry and types
  - `sceneViewRegistry`, `SceneViewPluginManifest`, `SceneViewRenderProps`

### Shared Types
- `@pixsim7/shared.types` - Canonical reference types
  - `AssetRequest`, `AssetRef`, etc.

### React
- `react` - React core (provided by host application)

## Build Output Requirements

### Bundle Format
- **Format**: ES Module (ESM)
- **Target**: ES2022
- **External dependencies**: React must be marked as external
- **Code splitting**: Not required for small plugins

### Manifest Generation
- The build process must generate `manifest.json` from the TypeScript manifest
- JSON must be valid and match the schema exactly
- The `main` field must point to the actual bundle filename

### File Naming
- Bundle: `plugin.js` (or configurable)
- Manifest: `manifest.json`
- Source maps: `plugin.js.map` (optional, for debugging)

## Registration Flow

When a plugin bundle is loaded:

1. **Discovery**: Manifest loader scans `dist/plugins/**/manifest.json`
2. **Validation**: Manifest is validated against the schema
3. **Loading**: Plugin bundle is loaded via dynamic `import()`
4. **Registration**: Plugin is registered with the appropriate registry

```typescript
// Example registration flow
async function loadPluginBundle(manifestPath: string) {
  // 1. Load manifest
  const manifest = await loadManifest(manifestPath);

  // 2. Validate manifest
  validateManifest(manifest);

  // 3. Load plugin bundle
  const bundlePath = manifestPath.replace('manifest.json', manifest.main);
  const module = await import(bundlePath);

  // 4. Register with appropriate registry
  if (manifest.sceneView) {
    sceneViewRegistry.register(manifest, module.plugin);
  }
}
```

## Building a Plugin Bundle

### Prerequisites
- Node.js 18+
- pnpm (workspace package manager)

### Build Command

```bash
# Build a specific plugin
pnpm build:plugin scene/comic-panel-view

# Build all plugins
pnpm build:plugins
```

### Build Configuration

Each plugin requires a build configuration. Example using tsup:

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/plugins/scene/comic-panel-view/index.tsx'],
  format: ['esm'],
  target: 'es2022',
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
  outDir: 'dist/plugins/scene/comic-panel-view',
  esbuildOptions(options) {
    // Configure path aliases
    options.alias = {
      '@features/scene': './src/features/scene/index.ts',
      '@lib/assetProvider': './src/lib/assetProvider/index.ts',
      '@lib/plugins': './src/lib/plugins/index.ts',
    };
  },
});
```

### Manifest Generation

The build script generates `manifest.json` from the TypeScript manifest:

```typescript
// scripts/build-plugin.ts
import { manifest } from '../src/plugins/scene/comic-panel-view/manifest';
import fs from 'fs/promises';

// Convert TypeScript manifest to JSON
await fs.writeFile(
  'dist/plugins/scene/comic-panel-view/manifest.json',
  JSON.stringify(manifest, null, 2)
);
```

## Drop-in Installation

### For Development

1. Build the plugin:
   ```bash
   pnpm build:plugin scene/comic-panel-view
   ```

2. The bundle is automatically discovered from `dist/plugins/`

### For Production/Distribution

1. Package the plugin bundle:
   ```
   comic-panel-view-1.0.0.zip
   ├── manifest.json
   └── plugin.js
   ```

2. Extract to the plugins directory:
   ```
   dist/plugins/scene/comic-panel-view/
   ├── manifest.json
   └── plugin.js
   ```

3. Restart the application or trigger plugin reload

## Best Practices

### Plugin Development

1. **Keep plugins focused**: Each plugin should do one thing well
2. **Use stable SDK imports**: Only import from documented SDK modules
3. **Handle errors gracefully**: Don't crash the host application
4. **Test in isolation**: Plugins should work independently

### Manifest Guidelines

1. **Use semantic versioning**: `major.minor.patch`
2. **Document permissions**: Only request what you need
3. **Provide good descriptions**: Help users understand what the plugin does
4. **Include author info**: Make it easy to report issues

### Bundle Optimization

1. **Mark React as external**: Don't bundle React, use the host's version
2. **Minimize dependencies**: Keep bundle size small
3. **Use tree shaking**: Only include what you use
4. **Generate source maps**: Helpful for debugging

## Backward Compatibility

The bundle system is additive:
- Existing hardcoded plugin imports continue to work
- Manifest-loaded plugins are loaded in addition to hardcoded ones
- No breaking changes to existing plugin APIs

This allows gradual migration from hardcoded imports to bundle-driven loading.

## Related Documentation

- [Plugin Architecture](./PLUGIN_ARCHITECTURE.md) - Overall plugin system design
- [Comic Panels](./COMIC_PANELS.md) - Comic panel system documentation
- [Control Center Plugin Migration](./CONTROL_CENTER_PLUGIN_MIGRATION.md) - Control center plugins
