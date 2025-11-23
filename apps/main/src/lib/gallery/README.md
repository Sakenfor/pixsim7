# Gallery Library

Extensible system for asset gallery views and tools.

## Features

- **Gallery Surfaces:** Multiple view modes for different workflows (default, review, curation, debug)
- **Gallery Tools:** Pluggable tools that extend gallery functionality
- **Surface-aware Tools:** Tools can declare which surfaces they support
- **Dynamic Registration:** Surfaces and tools are registered at runtime

## Quick Start

### Using Gallery Surfaces

```typescript
import { gallerySurfaceRegistry } from '@/lib/gallery';

// Get all registered surfaces
const surfaces = gallerySurfaceRegistry.getAll();

// Get default surface
const defaultSurface = gallerySurfaceRegistry.getDefault();
```

### Switching Surfaces

In the UI, use the surface switcher dropdown in the Assets page header, or navigate to:
- `/assets?surface=assets-default` - Default view
- `/assets?surface=assets-review` - Review mode

### Creating a Gallery Tool

```typescript
import { galleryToolRegistry } from '@/lib/gallery';

galleryToolRegistry.register({
  id: 'my-tool',
  name: 'My Tool',
  description: 'Does something useful',
  icon: '🔧',
  supportedSurfaces: ['assets-default', 'assets-review'],
  whenVisible: (context) => context.selectedAssets.length > 0,
  render: (context) => <MyToolUI context={context} />,
});
```

## Documentation

- **[Gallery Surfaces Guide](./GALLERY_SURFACES.md)** - Complete guide to gallery surfaces
- **[Types](./types.ts)** - Gallery tool types and registry
- **[Surface Registry](./surfaceRegistry.ts)** - Surface types and registry

## Architecture

```
lib/gallery/
├── types.ts                    # Gallery tool plugin system
├── surfaceRegistry.ts          # Gallery surface registry
├── registerGallerySurfaces.ts  # Surface registration
└── index.ts                    # Public exports
```

## Key Concepts

- **Surface:** A complete gallery view/mode (e.g., default grid, review mode)
- **Tool:** An extension that adds functionality to the gallery (e.g., bulk operations)
- **Context:** Current gallery state (assets, filters, selection) passed to tools
- **Registry:** Central registration system for surfaces and tools
