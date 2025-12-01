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
interface SceneMetaComicPanel {
  id: string;              // Unique panel ID within this scene
  assetId: string;         // Gallery asset ID or provider asset ID
  caption?: string;        // Optional text displayed under the image
  tags?: string[];         // Optional tags (mood, location, etc.)
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
- [x] `ComicPanelWidget` component with layout variants
- [x] Registry integration for `comic-panel` widget type
- [x] Overlay editor support (widget list + properties)
- [x] Gameplay helper functions in `gameplay-ui-core`
- [x] Documentation (this file)
- [ ] HUD editor integration (pending Task 97)
- [ ] Example scene with comic panels
- [ ] Transition orchestration integration

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
