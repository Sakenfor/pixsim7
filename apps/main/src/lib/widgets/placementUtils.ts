/**
 * Placement Utilities
 *
 * Convert between the unified WidgetPlacement envelope and
 * surface-specific formats (overlay position, editing-core config, etc.)
 *
 * This allows a single placement model to drive all surface renderers.
 */

import type { UnifiedWidgetConfig, UnifiedPosition } from '@lib/editing-core';

import type { WidgetPlacement, WidgetSurface, WidgetDefinition } from './types';

// ============================================================================
// Overlay/HUD Conversions
// ============================================================================

/**
 * Convert WidgetPlacement to UnifiedPosition (editing-core format).
 * Used by overlay/hud surfaces.
 */
export function placementToOverlayPosition(placement: WidgetPlacement): UnifiedPosition {
  // Anchor-based positioning (overlay)
  if (placement.anchor) {
    return {
      mode: 'anchor',
      anchor: placement.anchor,
      offset: placement.offset,
      order: placement.order,
    };
  }

  // Region-based positioning (HUD)
  if (placement.region) {
    return {
      mode: 'region',
      region: placement.region,
      offset: placement.offset,
      order: placement.order,
    };
  }

  // Fallback to default anchor
  return {
    mode: 'anchor',
    anchor: 'top-left',
    offset: placement.offset ?? { x: 8, y: 8 },
    order: placement.order,
  };
}

/**
 * Convert WidgetPlacement to full UnifiedWidgetConfig.
 * Used when rendering overlay/hud widgets via editing-core factories.
 *
 * Settings are merged in order (later overrides earlier):
 * 1. widgetDef.defaultSettings - base widget defaults
 * 2. widgetDef.defaultConfig.props - overlay-specific defaults
 * 3. instanceSettings - per-instance overrides
 */
export function placementToUnifiedConfig(
  instanceId: string,
  widgetDef: WidgetDefinition,
  placement: WidgetPlacement,
  surface: 'overlay' | 'hud',
  instanceSettings?: Record<string, unknown>
): UnifiedWidgetConfig {
  const position = placementToOverlayPosition(placement);

  // Extract defaultConfig without props to avoid double-spreading
  const { props: defaultConfigProps, ...restDefaultConfig } = widgetDef.defaultConfig ?? {};

  return {
    id: instanceId,
    type: widgetDef.id,
    componentType: surface,
    position,
    style: placement.zIndex ? { zIndex: placement.zIndex } : undefined,
    version: 1,
    ...restDefaultConfig,
    // Merge props: defaultSettings (base) + defaultConfig.props (overlay-specific) + instanceSettings (overrides)
    props: {
      ...(widgetDef.defaultSettings as Record<string, unknown>),
      ...(defaultConfigProps as Record<string, unknown>),
      ...(instanceSettings ?? {}),
    },
  };
}

/**
 * Convert UnifiedPosition back to WidgetPlacement.
 * Used when importing editing-core configs into the unified store.
 */
export function overlayPositionToPlacement(position: UnifiedPosition): WidgetPlacement {
  const placement: WidgetPlacement = {
    order: position.order,
    offset: position.offset,
  };

  if (position.mode === 'anchor' && position.anchor) {
    placement.anchor = position.anchor;
  }

  if (position.mode === 'region' && position.region) {
    placement.region = position.region;
  }

  return placement;
}

// ============================================================================
// Default Placement Factory
// ============================================================================

/**
 * Create default placement for a widget on a given surface.
 * Uses widget's surfaceConfig to determine initial placement.
 */
export function createDefaultPlacement(
  widgetDef: WidgetDefinition,
  surface: WidgetSurface
): WidgetPlacement {
  const config = widgetDef.surfaceConfig;

  switch (surface) {
    case 'header':
    case 'toolbar': {
      const headerConfig = surface === 'header' ? config?.header : config?.toolbar;
      return {
        area: headerConfig?.area ?? 'right',
        order: headerConfig?.priority ?? 50,
      };
    }

    case 'statusbar': {
      const statusConfig = config?.statusbar;
      return {
        area: statusConfig?.area ?? 'right',
        order: statusConfig?.priority ?? 50,
      };
    }

    case 'overlay': {
      const overlayConfig = config?.overlay;
      return {
        anchor: overlayConfig?.defaultAnchor ?? 'top-right',
        offset: overlayConfig?.defaultOffset ?? { x: 8, y: 8 },
        zIndex: overlayConfig?.zIndex,
      };
    }

    case 'hud': {
      const hudConfig = config?.hud;
      return {
        region: hudConfig?.defaultRegion ?? 'top',
      };
    }

    case 'panel-composer': {
      const composerConfig = config?.panelComposer;
      return {
        grid: {
          x: 0,
          y: 0,
          w: composerConfig?.defaultWidth ?? 2,
          h: composerConfig?.defaultHeight ?? 1,
        },
      };
    }

    default:
      return { area: 'right', order: 50 };
  }
}

// ============================================================================
// Placement Validation
// ============================================================================

/**
 * Check if placement is valid for a given surface.
 */
export function isPlacementValidForSurface(
  placement: WidgetPlacement,
  surface: WidgetSurface
): boolean {
  switch (surface) {
    case 'header':
    case 'statusbar':
    case 'toolbar':
      // Flow surfaces need area
      return typeof placement.area === 'string';

    case 'overlay':
      // Overlay needs anchor
      return typeof placement.anchor === 'string';

    case 'hud':
      // HUD needs region or anchor
      return typeof placement.region === 'string' || typeof placement.anchor === 'string';

    case 'panel-composer':
      // Composer needs grid
      return placement.grid !== undefined;

    default:
      return true;
  }
}

/**
 * Ensure placement has required fields for a surface.
 * Returns a complete placement with defaults filled in.
 */
export function ensurePlacementComplete(
  placement: WidgetPlacement,
  widgetDef: WidgetDefinition,
  surface: WidgetSurface
): WidgetPlacement {
  if (isPlacementValidForSurface(placement, surface)) {
    return placement;
  }

  // Merge with defaults
  const defaults = createDefaultPlacement(widgetDef, surface);
  return { ...defaults, ...placement };
}
