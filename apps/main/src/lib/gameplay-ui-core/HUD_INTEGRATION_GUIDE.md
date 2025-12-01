# HUD & Unified Configuration Integration Guide

**Part of Task 97: HUD Editor & Overlay Unified Integration**

This guide documents how the HUD system integrates with the unified configuration model from `editing-core`, enabling HUD layouts to share widget types and presets with the overlay system.

---

## Overview

The HUD system now operates on top of the **Unified Configuration** model, bridging gameplay-specific HUD features with the shared editable UI architecture:

```
┌─────────────────────────────────────────────────────┐
│            HUD Editor (Component Layer)              │
│  - HudEditor.tsx                                     │
│  - Manages HudToolPlacement[] internally             │
│  - Export/Import using HudSurfaceConfig              │
└─────────────────────────────────────────────────────┘
                        ↕
┌─────────────────────────────────────────────────────┐
│         Gameplay UI Core (HUD-Specific Layer)        │
│  - HudSurfaceConfig / HudWidgetConfig                │
│  - HUD-specific metadata (profiles, view modes)      │
│  - Gameplay visibility conditions                    │
│  - Converters: HudToolPlacement ↔ HudWidgetConfig    │
└─────────────────────────────────────────────────────┘
                        ↕
┌─────────────────────────────────────────────────────┐
│          Editing Core (Generic UI Layer)             │
│  - UnifiedSurfaceConfig / UnifiedWidgetConfig        │
│  - UnifiedPosition, UnifiedVisibility                │
│  - DataBinding system                                │
│  - Widget Registry                                   │
└─────────────────────────────────────────────────────┘
```

---

## Component Types

### HUD Component Type

HUD surfaces use the `componentType: 'hud'` identifier:

```typescript
interface HudSurfaceConfig extends UnifiedSurfaceConfig {
  componentType: 'hud';  // Always 'hud' for HUD layouts
  widgets: HudWidgetConfig[];
  hudMeta?: HudSurfaceMeta;
}
```

### Surface IDs

HUD surfaces are identified using structured IDs:

- **Default layout**: `hud-main-{worldId}`
- **Profile-specific**: `hud-{profileId}-{worldId}`
- **View mode specific**: `hud-{profileId}-{viewMode}-{worldId}`
- **Presets**: `hud-preset-{presetId}`

---

## Configuration Mapping

### Position Mapping

HUD uses **region-based positioning** that maps to `UnifiedPosition.mode === 'region'`:

| HUD Region | UnifiedPosition |
|-----------|----------------|
| `'top'` | `{ mode: 'region', region: 'top', order: 0 }` |
| `'bottom'` | `{ mode: 'region', region: 'bottom', order: 0 }` |
| `'left'` | `{ mode: 'region', region: 'left', order: 0 }` |
| `'right'` | `{ mode: 'region', region: 'right', order: 0 }` |
| `'overlay'` | `{ mode: 'region', region: 'overlay', order: 0 }` |
| `'center'` | `{ mode: 'region', region: 'center', order: 0 }` |

The `order` field determines stacking within a region (lower = rendered first).

### Visibility Mapping

HUD's **gameplay-specific visibility conditions** map to `UnifiedVisibility.advanced`:

**Simple visibility:**
```typescript
// HUD: Always visible
{ visibleWhen: undefined }

// Unified:
{ simple: 'always' }
```

**Gameplay conditions:**
```typescript
// HUD: Quest-based visibility
{
  visibleWhen: {
    kind: 'quest',
    id: 'main-quest-1'
  }
}

// Unified:
{
  advanced: [{
    id: 'main-quest-1',
    type: 'quest',
    params: {}
  }]
}
```

**Supported condition types:**
- `'session'` - Only when session exists
- `'flag'` - When session flag is set (e.g., `world.mode`)
- `'capability'` - When capability is enabled (e.g., `game`)
- `'location'` - At specific locations (comma-separated IDs)
- `'time'` - During specific time (hour range, day of week)
- `'quest'` - When quest is active
- `'relationship'` - Based on NPC relationship level
- `'composite'` - Combine multiple conditions with AND/OR

### Style Mapping

HUD-specific styling maps to `UnifiedWidgetConfig.style`:

| HUD Property | Unified Property |
|-------------|------------------|
| `zIndex` | `style.zIndex` |
| `customClassName` | `style.className` |
| `size` | `hudMeta.size` (HUD-specific) |
| `defaultCollapsed` | `hudMeta.defaultCollapsed` |

---

## HUD-Specific Metadata

### HudWidgetMeta

Extra metadata for HUD widgets that doesn't exist in base overlay system:

```typescript
interface HudWidgetMeta {
  /** Tool size variant (compact, normal, expanded) */
  size?: 'compact' | 'normal' | 'expanded';

  /** Start collapsed/minimized */
  defaultCollapsed?: boolean;

  /** Group ID for visually grouping related tools */
  groupId?: string;

  /** Custom CSS class name for advanced styling */
  customClassName?: string;

  /** View mode this widget applies to */
  viewMode?: 'all' | 'cinematic' | 'hud-heavy' | 'debug';

  /** Profile ID this widget applies to */
  profileId?: string;

  /** Profile tags for filtering */
  profileTags?: string[];
}
```

### HudSurfaceMeta

Surface-level metadata for HUD layouts:

```typescript
interface HudSurfaceMeta {
  /** Profile ID (e.g., 'default', 'minimal', 'streamer') */
  profileId?: string;

  /** View mode (e.g., 'all', 'cinematic', 'hud-heavy', 'debug') */
  viewMode?: 'all' | 'cinematic' | 'hud-heavy' | 'debug';

  /** World ID this layout belongs to */
  worldId?: number;

  /** Whether this is a world-scoped preset */
  isWorldPreset?: boolean;

  /** Preset ID to inherit base layout from */
  inheritFrom?: string;
}
```

---

## Converter Functions

The `gameplay-ui-core/hudConfig.ts` module provides bidirectional converters:

### Legacy ↔ Unified

```typescript
import {
  fromHudToolPlacement,
  toHudToolPlacement,
  fromHudToolPlacements,
  toHudToolPlacements,
} from '@/lib/gameplay-ui-core';

// Convert single placement
const hudWidget: HudWidgetConfig = fromHudToolPlacement({
  toolId: 'time-display',
  region: 'top',
  order: 0,
  visibleWhen: {
    kind: 'session',
  },
});

// Convert back to legacy
const placement: HudToolPlacement = toHudToolPlacement(hudWidget);

// Convert entire layout
const surface: HudSurfaceConfig = fromHudToolPlacements(
  placements,
  {
    id: 'hud-default-123',
    name: 'Default HUD',
    profileId: 'default',
    viewMode: 'all',
    worldId: 123,
  }
);

// Convert back to legacy array
const placements: HudToolPlacement[] = toHudToolPlacements(surface);
```

### HUD ↔ Pure Unified

```typescript
import {
  toUnifiedSurfaceConfig,
  fromUnifiedSurfaceConfig,
} from '@/lib/gameplay-ui-core';

// Strip HUD-specific metadata to get generic surface
const unified: UnifiedSurfaceConfig = toUnifiedSurfaceConfig(hudSurface);

// Enrich generic surface with HUD metadata
const hudSurface: HudSurfaceConfig = fromUnifiedSurfaceConfig(
  unified,
  {
    profileId: 'minimal',
    viewMode: 'cinematic',
    worldId: 456,
  }
);
```

---

## Shared Widgets Between HUD and Overlay

Widgets registered in the widget registry can be used in both HUD and overlay contexts. The factory function receives `componentType` in the config to adapt behavior:

```typescript
import { registerWidget } from '@/lib/editing-core/registry/widgetRegistry';
import type { UnifiedWidgetConfig } from '@/lib/editing-core';

// Example: Badge widget that works in both contexts
registerWidget({
  type: 'badge',
  displayName: 'Badge',
  icon: 'tag',
  factory: (config: UnifiedWidgetConfig, runtimeOptions) => {
    // Check component type
    const isHud = config.componentType === 'hud';
    const isOverlay = config.componentType === 'overlay';

    // Adapt behavior based on context
    if (isHud) {
      // HUD-specific rendering (simpler, performance-focused)
      return createHudBadge(config);
    } else if (isOverlay) {
      // Overlay-specific rendering (richer interactions)
      return createOverlayBadge(config);
    }

    // Fallback
    return createGenericBadge(config);
  },
  defaultConfig: {
    type: 'badge',
    position: { mode: 'anchor', anchor: 'top-left', offset: { x: 8, y: 8 } },
    visibility: { simple: 'always' },
    version: 1,
  },
});
```

**Currently Shared Widget Types:**
- `badge` - Status indicators, notifications
- `panel` - Information panels
- `progress` - Progress bars and indicators
- `button` - Action buttons

---

## Usage in HudEditor

The HudEditor component uses these converters for import/export:

### Exporting HUD Layout

```typescript
// In HudEditor.tsx
const handleExportUnified = () => {
  // Convert current placements to HudSurfaceConfig
  const surfaceConfig = fromHudToolPlacements(
    placements.map(p => {
      const { name, description, icon, ...placement } = p;
      return placement;
    }),
    {
      id: `hud-export-${Date.now()}`,
      name: `${worldDetail.name} HUD Layout`,
      description: `Profile: ${selectedProfile}, View: ${selectedViewMode}`,
      profileId: selectedProfile,
      viewMode: selectedViewMode,
      worldId: worldDetail.id,
    }
  );

  // Export as JSON
  const json = JSON.stringify(surfaceConfig, null, 2);
  downloadFile(json, `hud-layout-${worldDetail.name}.json`);
};
```

### Importing HUD Layout

```typescript
// In HudEditor.tsx
const handleImportUnified = async (file: File) => {
  const text = await file.text();
  const config: HudSurfaceConfig = JSON.parse(text);

  // Validate it's a HUD config
  if (config.componentType !== 'hud') {
    throw new Error('Invalid format: Not a HUD layout configuration');
  }

  // Convert back to HudToolPlacement[]
  const importedPlacements = toHudToolPlacements(config);

  // Apply to editor state
  setPlacements(enrichWithToolMetadata(importedPlacements));
};
```

---

## Interoperability Between HUD and Overlay

While HUD and overlay systems have different use cases, they can share configurations:

### Overlay → HUD

```typescript
import { fromUnifiedSurfaceConfig } from '@/lib/gameplay-ui-core';
import type { UnifiedSurfaceConfig } from '@/lib/editing-core';

// Load overlay config
const overlayConfig: UnifiedSurfaceConfig = loadOverlayPreset('media-card-badges');

// Convert to HUD (widgets will need adaptation)
const hudConfig = fromUnifiedSurfaceConfig(overlayConfig, {
  profileId: 'streamer',
  viewMode: 'hud-heavy',
  worldId: 123,
});

// Note: May need manual adjustment of positions and visibility
```

### HUD → Overlay

```typescript
import { toUnifiedSurfaceConfig } from '@/lib/gameplay-ui-core';

// Load HUD config
const hudConfig: HudSurfaceConfig = loadHudLayout('default');

// Strip HUD metadata to get generic config
const unified = toUnifiedSurfaceConfig(hudConfig);

// Use in overlay system (may need position adjustments)
// HUD regions will be preserved in position.region
```

---

## Lossy Mappings & Limitations

Some HUD features don't map perfectly to the unified model:

### 1. Gameplay Visibility Conditions

**Complex composite conditions** with nested AND/OR logic:
- ✅ Supported: Single conditions and simple composites
- ⚠️ Limited: Deep nesting may not round-trip perfectly
- 📝 Documented in `UnifiedVisibility.advanced`

### 2. Region-Based Positioning

**HUD regions** are semantically different from overlay anchors:
- ✅ Mapped: Uses `position.mode === 'region'`
- ⚠️ Note: Overlay systems may not understand all region types
- 📝 `'overlay'` region is HUD-specific

### 3. Profile & View Mode System

**Multi-profile layouts** are HUD-specific:
- ✅ Preserved: In `HudSurfaceMeta`
- ⚠️ Overlay systems ignore these fields
- 📝 Converting to overlay loses profile context

### 4. World Tool Integration

**HudWidgetConfig.toolId** references world tools:
- ✅ Preserved: In HUD configs
- ⚠️ Overlay configs use generic widget IDs
- 📝 Manual mapping needed when sharing

---

## Best Practices

### 1. Always Validate After Conversion

```typescript
import { validateHudLayout } from '@/lib/hud/types';

const surface = fromHudToolPlacements(placements, meta);
const validation = validateHudLayout(surface);

if (!validation.valid) {
  console.error('Conversion errors:', validation.errors);
}
```

### 2. Use Converters at System Boundaries

Keep internal representation stable:
- HudEditor → Store as `HudToolPlacement[]` internally
- Export/Import → Use `HudSurfaceConfig` at boundaries
- Registry/Factories → Use `UnifiedWidgetConfig`

### 3. Document HUD-Specific Features

When creating shared widgets, document which features are HUD-only:

```typescript
/**
 * Badge Widget
 *
 * Shared widget type usable in both HUD and overlay contexts.
 *
 * HUD-specific features:
 * - Supports view mode filtering (hudMeta.viewMode)
 * - Can be grouped with groupId
 * - Respects gameplay visibility conditions
 *
 * Overlay-specific features:
 * - Supports anchor-based positioning
 * - Rich tooltip interactions
 * - Hover/click animations
 */
```

### 4. Test Round-Trip Conversions

Ensure configurations survive conversion cycles:

```typescript
// Test: HudToolPlacement → HudWidgetConfig → HudToolPlacement
const original: HudToolPlacement = { /*...*/ };
const widget = fromHudToolPlacement(original);
const roundTrip = toHudToolPlacement(widget);

expect(roundTrip).toEqual(original);
```

---

## Future Enhancements

1. **Visual editor for HUD visibility conditions** - UI for building complex gameplay conditions
2. **Profile inheritance** - Profiles can extend/override base layouts
3. **Cross-world presets** - Export HUD layouts that work across multiple worlds
4. **Widget library browser** - See all available widgets with HUD/overlay compatibility
5. **Migration tools** - Automated scripts to upgrade legacy HUD configs

---

## Summary

The HUD system now operates on the **unified configuration model** while preserving all HUD-specific features:

✅ **Componentype**: `'hud'` identifies HUD surfaces
✅ **Converters**: Bidirectional mapping between legacy and unified
✅ **Shared Widgets**: Registry supports both HUD and overlay contexts
✅ **Metadata**: HUD-specific data preserved in `hudMeta` fields
✅ **Interoperable**: Can share configs between HUD and overlay (with caveats)
✅ **Backwards Compatible**: Existing HUD code continues to work

This integration enables:
- Reusable widget types across HUD and overlay
- Portable presets via unified JSON format
- Consistent editing architecture
- Future cross-system features

For more information:
- Overlay integration: `/apps/main/src/lib/overlay/INTEGRATION_GUIDE.md`
- Editing core: `/apps/main/src/lib/editing-core/README.md`
- HUD types: `/apps/main/src/lib/hud/types.ts`
- Gameplay UI core: `/apps/main/src/lib/gameplay-ui-core/`
