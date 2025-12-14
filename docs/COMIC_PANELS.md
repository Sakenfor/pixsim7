# Comic Panels System

## Overview

The Comic Panels system provides a simple way to present story beats as sequential images (comic panels) without creating a full comic authoring system. Panels are treated as a **presentation mode** for existing scenes and arcs, reusing the current narrative and editable UI infrastructure.

## Key Concepts

- **Comic panels are NOT a separate narrative system** - they're visual overlays for existing scenes
- **No speech bubbles or complex layouts** - just sequential images with optional captions
- **Data lives in existing JSON structures** - no schema changes required
- **Works with existing widget/overlay systems** - integrated with HUD and overlay editors

## Data Conventions

### Scene-Level Comic Panels

Scenes can declare comic panels in their metadata. Each panel references a gallery asset and can include optional captions and tags.

```typescript
// Uses canonical AssetRef identifiers (asset:{id}) from @pixsim7/shared.types
interface SceneMetaComicPanel {
  id: string;                     // Unique panel ID within this scene
  assetId: AssetRef | string;     // Prefer canonical AssetRef identifiers
  caption?: string;               // Optional text displayed under the image
  tags?: string[];                // Optional tags (mood, location, etc.)
  characters?: NpcRef[];          // Canonical NPCs depicted in the panel
  location?: LocationRef | string;// Canonical or legacy location reference
  mood?: string;                  // Free-form descriptor ("tense", "romantic", etc.)
  metadata?: Record<string, any>; // Feature-specific metadata (e.g., scripted captions)
  allowDynamicGeneration?: boolean; // Defaults to true; disable if panel must never auto-generate
}

// On DraftScene or SceneMetadata
interface Scene {
  // ... existing fields ...
  comicPanels?: SceneMetaComicPanel[];
}
```

#### Example

```json
{
  "id": "scene_battle_intro",
  "title": "Battle Introduction",
  "comicPanels": [
    {
      "id": "panel_1",
      "assetId": "asset_12345",
      "caption": "The heroes approach the ancient ruins...",
      "tags": ["dramatic", "outdoor"]
    },
    {
      "id": "panel_2",
      "assetId": "asset_12346",
      "caption": "A shadow moves in the darkness.",
      "tags": ["suspense", "indoor"]
    }
  ]
}
```

### Session-Level State (Runtime)

Session flags can be used to track which panel is currently displayed, enabling dynamic panel selection during gameplay.

```typescript
interface ComicSessionFlags {
  current_panel?: string;  // ID of the currently displayed panel
  chapter?: string;        // Optional chapter/issue identifier
}

// On GameSession
interface GameSession {
  flags: {
    comic?: ComicSessionFlags;
    // ... other flags ...
  };
}
```

#### Example

```json
{
  "session_id": "abc123",
  "flags": {
    "comic": {
      "current_panel": "panel_2",
      "chapter": "issue_01"
    }
  }
}
```

## Widget Integration

### Comic Panel Widget

The `comic-panel` widget displays one or more comic frames. It can be used in both overlay and HUD systems.

```typescript
interface ComicPanelWidgetConfig {
  id: string;
  position: WidgetPosition;
  visibility: VisibilityConfig;

  // Data inputs (via bindings or static props)
  panelIds?: string[];           // IDs within Scene.meta.comicPanels
  assetIds?: string[];           // Direct gallery asset IDs (fallback)
  panels?: SceneMetaComicPanel[]; // Full panel data

  // Layout options
  layout?: 'single' | 'strip' | 'grid2';
  showCaption?: boolean;

  // Optional asset request context (defaults inferred from scene/session)
  requestContextBinding?: DataBinding<ComicPanelRequestContext>;

  className?: string;
  priority?: number;
}
```

### Usage in Overlay Editor

1. Add a `comic-panel` widget from the widget palette
2. Configure layout and caption visibility in type-specific properties
3. Bind panel data using:
   - Static `panelIds` to reference scene panels
   - Static `assetIds` for direct asset references
   - Data bindings for dynamic panel selection

### Usage in HUD

Once HUD is integrated with unified configs (Task 97), `comic-panel` widgets can be added to HUD regions with the same configuration options.

## Gameplay Integration

### Helper Functions

The `gameplay-ui-core/comicPanels` module provides utilities for connecting panels to gameplay:

```typescript
import {
  getActiveComicPanels,
  getComicPanelById,
  getComicPanelsByTags,
  setCurrentComicPanel,
  clearCurrentComicPanel,
  getComicPanelAssetIds,
} from '@/lib/gameplay-ui-core';

// Get panels to display based on session state
const panels = getActiveComicPanels(session, sceneMeta);

// Get a specific panel
const panel = getComicPanelById(sceneMeta, 'panel_1');

// Filter by tags (e.g., mood or location)
const dramaticPanels = getComicPanelsByTags(sceneMeta, ['dramatic', 'suspense']);

// Set current panel in session
const updatedSession = setCurrentComicPanel(session, 'panel_2');

// Clear panel state
const clearedSession = clearCurrentComicPanel(session);

// Get asset IDs for preloading
const assetIds = getComicPanelAssetIds(panels);
```

### Transition Workflow

1. **Before Scene Entry**: Display panel sequence as intro
   ```typescript
   // In scene transition logic
   const introPanels = sceneMeta.comicPanels || [];
   // Show panels via overlay/HUD widget
   ```

2. **During Gameplay**: Change panels based on player actions
   ```typescript
   // On story choice or event
   session = setCurrentComicPanel(session, 'panel_victory');
   // Widget automatically updates via data binding
   ```

3. **Scene Exit**: Clear panel state
   ```typescript
   session = clearCurrentComicPanel(session);
   ```

## Implementation Checklist

- [x] TypeScript types for `SceneMetaComicPanel` and `ComicSessionFlags`
- [x] `ComicPanelWidget` component with layout variants (now via `SceneViewHost`)
- [x] Registry integration for `comic-panel` widget type
- [x] Overlay editor support (widget list + properties)
- [x] Gameplay helper functions in `gameplay-ui-core`
- [x] Documentation (this file)
- [x] Plugin architecture - comic panel view as self-contained plugin
- [ ] HUD editor integration (pending Task 97)
- [ ] Example scene with comic panels
- [ ] Transition orchestration integration

## Plugin Architecture

The comic panel rendering is now implemented as a self-contained scene view plugin:

```
plugins/scene/comic-panel-view/
├── manifest.ts          # Plugin metadata
├── PluginSceneView.tsx  # Render component
├── index.ts             # Entry point + registration
└── README.md            # Plugin docs
```

The plugin:
- Imports only from stable SDK modules (`@features/scene`, `@lib/assetProvider`, `@pixsim7/shared.types`)
- Self-registers with `sceneViewRegistry` on import
- Can be bundled/distributed independently

The overlay widget system uses `SceneViewHost` which delegates to registered scene view plugins.
The `comic-panel` widget type is an alias for backward compatibility.

See [Plugin Architecture](./PLUGIN_ARCHITECTURE.md#scene-view-plugins) for details on creating custom scene view plugins.

## Examples

### Example 1: Static Panel Sequence

Display all panels from a scene sequentially:

```typescript
// In overlay config
const comicWidget = {
  type: 'comic-panel',
  id: 'story-intro',
  position: { mode: 'anchor', anchor: 'center' },
  visibility: { simple: 'always' },
  props: {
    layout: 'strip',
    showCaption: true,
  },
  bindings: [
    {
      kind: 'path',
      target: 'panels',
      path: 'scene.comicPanels',
    },
  ],
};
```

### Example 2: Dynamic Panel Selection

Show only the current panel based on session state:

```typescript
// In overlay config
const comicWidget = {
  type: 'comic-panel',
  id: 'current-panel',
  position: { mode: 'anchor', anchor: 'center' },
  visibility: { simple: 'always' },
  props: {
    layout: 'single',
    showCaption: true,
  },
  bindings: [
    {
      kind: 'path',
      target: 'panelIds',
      path: 'session.flags.comic.current_panel',
    },
  ],
};

// In gameplay code
session = setCurrentComicPanel(session, 'panel_2');
// Widget automatically updates to show panel_2
```

### Example 3: Mood-Based Panels

Filter panels by tags:

```typescript
// In scene metadata
const sceneMeta = {
  comicPanels: [
    { id: 'p1', assetId: 'a1', tags: ['happy'] },
    { id: 'p2', assetId: 'a2', tags: ['sad'] },
    { id: 'p3', assetId: 'a3', tags: ['happy'] },
  ],
};

// In gameplay code
const happyPanels = getComicPanelsByTags(sceneMeta, ['happy']);
// Returns p1 and p3
```

## Best Practices

1. **Asset Management**: Store panel images in the gallery system for proper versioning and access control
2. **Performance**: Preload panel assets before displaying them using `getComicPanelAssetIds()`

## Dynamic Asset Resolution & Generation

When a panel references a canonical `AssetRef`, the UI resolves it via the shared `AssetProvider`. If the referenced asset is missing (or a legacy scene still points at a numeric ID), the system can optionally fall back to **dynamic generation**:

- Each `SceneMetaComicPanel` can declare `allowDynamicGeneration?: boolean` (defaults to `true`).
- Additional context (`characters`, `location`, `mood`, `tags`, captions) is used to build a generation prompt.
- The overlay widget may supply extra context through `requestContextBinding` (scene ID, choice ID, etc.).
- When no asset is found (or generation fails), the widget falls back to the older `/api/assets/{id}` path or a placeholder image.

This keeps legacy content functional while enabling new scenes to rely entirely on canonical IDs and on-demand generation.
3. **Captions**: Keep captions short (1-2 sentences) for better readability
4. **Tags**: Use consistent tag naming (lowercase, descriptive) for easier filtering
5. **Layout Selection**:
   - Use `single` for dramatic moments or cutscenes
   - Use `strip` for sequential storytelling
   - Use `grid2` for side-by-side comparisons
6. **Visibility**: Use overlay visibility conditions to show/hide panels at appropriate times

## Non-Goals

The following are explicitly **out of scope** for this system:

- Full comic authoring UI with panel grids and balloon placement
- Speech bubbles or complex text layouts
- Backend schema changes or new database tables
- Complex comic-specific scripting or branching logic
- Comic export/publishing features

For these advanced features, consider building a separate comic authoring tool that can reference scenes but maintains its own data structures.

## Future Enhancements

Potential improvements that maintain the current architecture:

- **Panel transitions**: Fade/slide animations between panels
- **Multi-page support**: Group panels into "pages" for longer sequences
- **Sound integration**: Optional audio cues per panel
- **Choice overlays**: Combine comic panels with choice widgets for interactive comics
- **Template presets**: Pre-built panel layouts (manga style, western style, etc.)

## Related Documentation

- [Editable UI Architecture](./EDITABLE_UI_ARCHITECTURE.md) - Widget system overview
- [Overlay Data Binding](./OVERLAY_DATA_BINDING.md) - Data binding patterns
- [Scene Builder](../apps/main/src/modules/scene-builder/README.md) - Scene structure
- Task 98 - Comic Panel Widget & Scene Integration (implementation spec)
