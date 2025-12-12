# Gallery Surfaces

Gallery surfaces provide different views and interaction modes for the asset gallery. Each surface is a self-contained UI optimized for specific workflows.

## Overview

The gallery surface system allows the `/assets` route to support multiple view modes without modifying core gallery code. Surfaces are registered at application startup and can be switched via a dropdown selector.

## Built-in Surfaces

### Assets – Default (`assets-default`)

**Category:** Default
**Icon:** 🖼️
**Route:** `/assets` or `/assets?surface=assets-default`

The standard asset gallery with full features:
- Masonry grid layout
- Comprehensive filters (provider, media type, status, search)
- All gallery tools available
- Multi-asset selection support
- Scope tabs (All, Favorites, Mine, Recent)

**Use when:** Browsing, searching, and managing assets with full control.

### Assets – Review (`assets-review`)

**Category:** Review
**Icon:** ✓
**Route:** `/assets?surface=assets-review`

Simplified view optimized for asset review and curation:
- Larger card grid layout (3 columns)
- Accept/Reject/Skip actions per asset
- Review progress tracking with persistent state
- **Keyboard shortcuts:** A (accept), R (reject), S (skip), ← → (navigate), ? (help)
- Minimal filters (search and sort only)
- Auto-saves review session to localStorage

**Use when:** Reviewing newly imported assets, curating collections, or performing quality control.

### Assets – Curator (`assets-curator`)

**Category:** Curation
**Icon:** ⭐
**Route:** `/assets?surface=assets-curator`

Advanced curation interface for power users:
- Multiple view modes (Grid, List, Compact)
- Collection building and management
- Bulk selection with Select All
- Advanced filtering (media type, tags, provider, sort)
- Gallery tools integration (bulk tag tool available)

**Use when:** Organizing large asset libraries, building collections, or performing advanced curation workflows.

### Assets – Debug (`assets-debug`)

**Category:** Debug
**Icon:** 🐛
**Route:** `/assets?surface=assets-debug`

Developer-focused diagnostic view:
- Surface registry inspection (view all registered surfaces)
- Gallery tools registry inspection
- Asset statistics and detailed metadata
- System health metrics
- Tabbed interface (Surfaces / Tools / Assets)

**Use when:** Debugging gallery issues, inspecting system state, or developing new surfaces and tools.

## Switching Surfaces

### Via UI

Use the dropdown selector in the Assets page header to switch between surfaces. The selection persists via URL parameters across page reloads.

### Via URL

Navigate directly to a surface by adding the `surface` parameter:
```
/assets?surface=assets-review
```

## Architecture

### Core Components

#### `GallerySurfaceRegistry`
Central registry for all gallery surfaces. Provides methods to:
- Register/unregister surfaces
- Query surfaces by ID, category, or media type
- Get the default surface

#### `GallerySurfaceDefinition`
Interface defining a surface:
```typescript
{
  id: GallerySurfaceId;
  label: string;
  description?: string;
  icon?: string;
  category?: 'default' | 'review' | 'curation' | 'debug' | 'custom';
  component: ComponentType<any>;
  supportsMediaTypes?: MediaType[];
  supportsSelection?: boolean;
  routePath?: string;
  defaultTools?: string[];
  badgeConfig?: {
    showPrimaryIcon?: boolean;      // default true
    showStatusIcon?: boolean;       // default true
    showStatusTextOnHover?: boolean; // default true
    showTagsInOverlay?: boolean;    // default true
    showFooterProvider?: boolean;   // default true
    showFooterDate?: boolean;       // default true
  };
  onEnter?: () => void | Promise<void>;  // Lifecycle hook
  onExit?: () => void | Promise<void>;   // Lifecycle hook
  onSelectionChange?: (selectedIds: string[]) => void;  // Lifecycle hook
}
```

**Badge Configuration:**
The `badgeConfig` object allows surfaces to customize media card badge visibility:
- `showPrimaryIcon`: Display media type icon in top-left (🎬, 🖼️, 🎧, 📦)
- `showStatusIcon`: Show colored ring around primary icon for status (green=OK, yellow=local, red=flagged)
- `showStatusTextOnHover`: Display status text badge in top-right on hover ("OK", "Local only", etc.)
- `showTagsInOverlay`: Include asset tags in bottom overlay on hover
- `showFooterProvider`: Show provider ID and media type in card footer
- `showFooterDate`: Show creation date in card footer

All flags default to `true` if not specified, maintaining current behavior.

**Lifecycle Hooks:**
- `onEnter`: Called when the surface is mounted/entered
- `onExit`: Called when the surface is unmounted/exited
- `onSelectionChange`: Called when asset selection changes (optional)

#### `GallerySurfaceHost`
Component that dynamically renders the active surface based on URL parameters.

#### `GallerySurfaceSwitcher`
UI component for switching between surfaces (dropdown or tabs mode).

### File Structure

```
src/lib/gallery/
├── surfaceRegistry.ts          # Registry and types
├── registerGallerySurfaces.ts  # Surface registration
└── types.ts                     # Gallery tool types

src/features/gallery/
├── components/
│   ├── GallerySurfaceHost.tsx      # Dynamic surface renderer
│   ├── GallerySurfaceSwitcher.tsx  # Surface switcher UI
│   ├── GalleryLayoutControls.tsx   # Layout controls (masonry/grid)
│   └── panels/
│       └── GalleryToolsPanel.tsx   # Gallery tools panel
└── index.ts                        # Barrel export

src/components/assets/
├── DefaultGallerySurface.tsx   # Default surface wrapper
└── ReviewGallerySurface.tsx    # Review surface implementation
```

## Creating a New Surface

### 1. Create the Surface Component

```tsx
// src/components/assets/MyCuratorSurface.tsx
export function MyCuratorSurface() {
  // Your custom gallery UI
  return (
    <div className="p-6">
      {/* Custom layout, filters, and tools */}
    </div>
  );
}
```

### 2. Register the Surface

```typescript
// src/lib/gallery/registerGallerySurfaces.ts
import { MyCuratorSurface } from '../../components/assets/MyCuratorSurface';

export function registerGallerySurfaces() {
  // ... existing surfaces ...

  gallerySurfaceRegistry.register({
    id: 'assets-curator',
    label: 'Assets – Curator',
    description: 'Advanced curation tools',
    icon: '⭐',
    category: 'curation',
    component: MyCuratorSurface,
    supportsMediaTypes: ['image', 'video'],
    supportsSelection: true,
    routePath: '/assets/curator',
    defaultTools: ['tag-assistant', 'bulk-operations'],
  });
}
```

### 3. Access Your Surface

Navigate to `/assets?surface=assets-curator` or select it from the dropdown.

## Gallery Tools Integration

Gallery tools can specify which surfaces they support:

```typescript
galleryToolRegistry.register({
  id: 'my-tool',
  name: 'My Tool',
  supportedSurfaces: ['assets-default', 'assets-curator'],
  // ... other properties
});
```

Tools without `supportedSurfaces` default to `['assets-default']` for backwards compatibility.

When a surface is active, only tools that support it will appear in the tools panel.

## Media Card Badge Layout

Media cards use a consistent badge layout to convey asset information at a glance:

### Badge Placement

- **Top-left (always visible):** Primary media type icon badge (🎬 video, 🖼️ image, 🎧 audio, 📦 3D model)
  - Icon badge includes a colored ring to indicate provider status:
    - Green ring: Provider OK (asset successfully uploaded)
    - Yellow ring: Local only (saved locally, provider upload failed)
    - Red ring: Flagged (rejected by provider)
    - Gray ring: Unknown status

- **Top-right (contextual hover):** Status badge appears only on hover
  - Shows icon + text: "✓ OK", "↓ Local only", "! Flagged", "? Unknown"
  - Provides clear status feedback without overwhelming default view

- **Bottom overlay (hover):** Detailed information
  - Description (clamped to 2 lines)
  - Up to 3 tags (with +N indicator if more exist)
  - Metadata row: date, dimensions, duration

- **Footer (always visible):** Compact info bar
  - Provider ID and media type
  - Creation date

### More Actions Menu

Each card has a three-dots menu (⋮) in the bottom-right of the hover overlay. This menu provides access to secondary actions:
- **Open details:** Navigate to asset detail page
- **Show metadata:** View full asset metadata
- **Upload to provider:** Upload/retry provider upload (if applicable)

Actions can be passed to `MediaCard` via the `actions` prop.

### Badge Configuration

Surfaces can customize badge visibility by passing `badgeConfig` to media cards. This allows different surfaces to emphasize different information:

```typescript
// Example: Review surface might hide tags in overlay to reduce clutter
badgeConfig: {
  showPrimaryIcon: true,
  showStatusIcon: true,
  showStatusTextOnHover: true,
  showTagsInOverlay: false,  // Hide tags for cleaner review view
  showFooterProvider: true,
  showFooterDate: true,
}
```

## Best Practices

1. **Focus on workflow:** Design surfaces around specific tasks (reviewing, curating, debugging)
2. **Minimize complexity:** Each surface should have a clear, focused purpose
3. **Reuse components:** Build on existing gallery components (MediaCard, filters, etc.)
4. **Declare tool support:** Explicitly list supported surfaces in tool definitions
5. **Provide clear labels:** Use descriptive names and icons for easy identification
6. **Consider media types:** Specify supported media types if your surface is specialized
7. **Configure badges appropriately:** Use `badgeConfig` to show only relevant information for your surface's workflow

## Examples

### Switching Surfaces Programmatically

```typescript
import { gallerySurfaceRegistry } from '@/lib/gallery';

// Get all surfaces
const surfaces = gallerySurfaceRegistry.getAll();

// Get surfaces by category
const reviewSurfaces = gallerySurfaceRegistry.getByCategory('review');

// Get surfaces supporting video
const videoSurfaces = gallerySurfaceRegistry.getByMediaType('video');

// Get the default surface
const defaultSurface = gallerySurfaceRegistry.getDefault();
```

### Using the Surface Host

```tsx
import { GallerySurfaceHost } from '@features/gallery';

// Render a specific surface
<GallerySurfaceHost surfaceId="assets-review" />

// Render based on URL parameter (default behavior)
<GallerySurfaceHost />
```

## Future Enhancements

Potential future improvements:
- User-defined custom surfaces via plugins
- Surface-specific keyboard shortcuts
- Per-surface filter presets
- Surface templates for common workflows
- Analytics per surface usage

---

## Panel Integration (Task 62)

Gallery badge configuration can be controlled at multiple levels:

### Configuration Priority

Badge settings merge with the following priority (highest to lowest):
1. **Widget-level** - `GalleryGridWidget` badgeConfig prop
2. **Panel-level** - Gallery panel settings in `panelConfigStore`
3. **Surface-level** - `badgeConfig` in `GallerySurfaceDefinition`

### Panel Configuration

The gallery panel can be configured via **Panel Configuration** (Settings panel):
- Navigate to Settings → Panel Configuration → Gallery panel
- Choose from **Quick Presets**:
  - ⚖️ **Default** - Balanced view with all badges visible
  - ✨ **Minimal** - Clean view with minimal badges
  - 📦 **Compact** - Good for small cards and dense grids
  - 📋 **Detailed** - Show all available information
  - ⭐ **Curator** - Emphasis on tags and metadata
  - ✓ **Review** - Emphasis on status and quality control
  - 🎨 **Presentation** - Clean view for client presentations
- Or customize individual toggles:
  - Media type icon
  - Status icon
  - Status text on hover
  - Tags in overlay
  - Footer provider
  - Footer date

These settings override surface defaults for the gallery panel.

### Gallery Grid Widget

The `GalleryGridWidget` allows embedding gallery views in composed panels:

```tsx
// In panel builder, add a Gallery Grid widget with custom badge config
{
  widgetType: 'gallery-grid',
  config: {
    title: 'Recent Videos',
    limit: 12,
    layout: 'masonry', // or 'grid'
    filters: {
      media_type: 'video',
      provider_status: 'ok',
    },
    badgeConfig: {
      showPrimaryIcon: true,
      showStatusIcon: false, // Hide status icons for cleaner view
      showTagsInOverlay: true,
      showFooterProvider: false,
    },
  },
}
```

Widget-level config overrides both panel and surface settings for maximum flexibility.

---

**Related Documentation:**
- [Gallery Tools System](./types.ts)
- [Asset Management](../../routes/Assets.tsx)
- [Panel Configuration](../../stores/panelConfigStore.ts)
- [Panel Builder Widgets](../widgets/widgetRegistry.ts)
