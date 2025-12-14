# Comic Panel View Plugin

A scene view plugin that renders story beats as sequential comic frames.

## Overview

This plugin provides a comic-style presentation mode for scenes, displaying panels with:

- Multiple layout modes (single, strip, grid)
- Optional captions under each panel
- Automatic asset URL resolution via AssetProvider
- Dynamic generation fallback for missing assets
- Click interaction support

## Installation

The plugin is automatically loaded during application bootstrap via `bootstrapSceneViewPlugins()`.

### Option 1: Hardcoded Import (Default)

The plugin is loaded via direct import in the bootstrap module. No additional configuration needed.

### Option 2: Bundle-Driven Loading

Build the plugin as a standalone bundle:

```bash
# From workspace root
pnpm build:plugin scene/comic-panel-view
```

This outputs:
```
dist/plugins/scene/comic-panel-view/
├── manifest.json
└── plugin.js
```

The plugin bootstrap will automatically discover and load the bundle.

### Option 3: Manual Registration

```typescript
import { manifest, plugin } from '@plugins/scene/comic-panel-view';
import { sceneViewRegistry } from '@lib/plugins/sceneViewPlugin';

sceneViewRegistry.register(manifest, plugin);
```

## Usage

The plugin is used via the `SceneViewHost` overlay widget:

```typescript
import { createSceneViewHost } from '@lib/ui/overlay/widgets/SceneViewHost';

const widget = createSceneViewHost({
  id: 'my-comic-view',
  position: { anchor: 'center' },
  visibility: { trigger: 'always' },
  sceneViewId: 'scene-view:comic-panels', // Optional, this is the default
  layout: 'strip',
  showCaption: true,
});
```

## SDK Dependencies

This plugin only imports from stable SDK modules:

- `@features/scene` - Types and helpers for comic panel data
- `@lib/assetProvider` - Asset resolution and dynamic generation
- `@lib/plugins/sceneViewPlugin` - Plugin registration types
- `@pixsim7/shared.types` - Canonical reference types

## File Structure

```
comic-panel-view/
├── manifest.ts        # Plugin metadata and configuration
├── PluginSceneView.tsx # Main render component
├── index.ts           # Entry point and registration
└── README.md          # This file
```

## Configuration

### Layout Modes

- `single` - One panel at a time, centered
- `strip` - Horizontal strip with scroll
- `grid2` - 2-column grid layout

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `panels` | `SceneMetaComicPanel[]` | Required | Panel data to display |
| `layout` | `'single' \| 'strip' \| 'grid2'` | `'single'` | Layout mode |
| `showCaption` | `boolean` | `true` | Show captions under panels |
| `className` | `string` | `''` | Additional CSS classes |
| `onPanelClick` | `(panel) => void` | - | Click handler |
| `requestContext` | `ComicPanelRequestContext` | - | Context for dynamic generation |

## Related Documentation

- [Plugin Architecture](../../../../docs/PLUGIN_ARCHITECTURE.md)
- [Plugin Bundle Format](../../../../docs/PLUGIN_BUNDLE_FORMAT.md)
- [Comic Panels System](../../../../docs/COMIC_PANELS.md)
- [Scene View Plugin Types](../../../lib/plugins/sceneViewPlugin.ts)
