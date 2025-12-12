/**
 * Gameplay UI Core - HUD Configuration
 *
 * HUD-specific configuration layer built on top of editing-core.
 * Wraps UnifiedWidgetConfig/UnifiedSurfaceConfig with HUD metadata.
 *
 * Part of the "Editable UI Core" architecture:
 * - editing-core: Generic config/binding/preset layer
 * - gameplay-ui-core: HUD/gameplay-specific layer (this file)
 * - features/hud: UI for editing HUD (HudEditor, HudLayoutBuilder)
 */

import type {
  UnifiedWidgetConfig,
  UnifiedSurfaceConfig,
  UnifiedPosition,
  UnifiedVisibility,
} from '../editing-core';
import type { HudVisibilityCondition } from './hudVisibility';
import type {
  HudRegion,
  HudToolSize,
  HudToolPlacement,
} from '@features/worldTools';

/**
 * HUD-specific metadata that extends the base widget config
 */
export interface HudWidgetMeta {
  /** Tool size variant (compact, normal, expanded) */
  size?: HudToolSize;

  /** Start collapsed/minimized */
  defaultCollapsed?: boolean;

  /** Group ID for visually grouping related tools */
  groupId?: string;

  /** Custom CSS class name for advanced styling */
  customClassName?: string;

  /** View mode this widget applies to (if not 'all') */
  viewMode?: 'all' | 'cinematic' | 'hud-heavy' | 'debug';

  /** Profile ID this widget applies to (if not default) */
  profileId?: string;

  /** Profile tags for filtering */
  profileTags?: string[];
}

/**
 * HUD Widget Config - wraps UnifiedWidgetConfig with HUD-specific metadata
 *
 * This is the canonical HUD widget configuration type that should be used
 * throughout the HUD system. It embeds a UnifiedWidgetConfig for
 * interoperability with other editable UI systems.
 */
export interface HudWidgetConfig extends UnifiedWidgetConfig {
  /** World tool plugin ID */
  toolId: string;

  /** HUD-specific metadata */
  hudMeta?: HudWidgetMeta;
}

/**
 * HUD-specific surface metadata
 */
export interface HudSurfaceMeta {
  /** Profile ID this layout belongs to (e.g., 'default', 'minimal', 'streamer') */
  profileId?: string;

  /** View mode this layout applies to (e.g., 'all', 'cinematic', 'hud-heavy', 'debug') */
  viewMode?: 'all' | 'cinematic' | 'hud-heavy' | 'debug';

  /** World ID this layout belongs to */
  worldId?: number;

  /** Whether this is a world-scoped preset */
  isWorldPreset?: boolean;

  /** Preset ID to inherit base layout from */
  inheritFrom?: string;
}

/**
 * HUD Surface Config - wraps UnifiedSurfaceConfig with HUD-specific info
 *
 * This represents an entire HUD layout (collection of widgets) with
 * profile/view mode/world context.
 */
export interface HudSurfaceConfig extends UnifiedSurfaceConfig {
  /** Override component type to be 'hud' */
  componentType: 'hud';

  /** Cast widgets to HudWidgetConfig */
  widgets: HudWidgetConfig[];

  /** HUD-specific surface metadata */
  hudMeta?: HudSurfaceMeta;
}

/**
 * Convert HudToolPlacement (legacy) to HudWidgetConfig (unified)
 *
 * This bridges the gap between the old worldTools types and the new
 * unified architecture.
 */
export function fromHudToolPlacement(placement: HudToolPlacement): HudWidgetConfig {
  // Map region to unified position
  const position: UnifiedPosition = {
    mode: 'region',
    region: placement.region,
    order: placement.order || 0,
    offset: { x: 0, y: 0 },
  };

  // Map visibility condition to unified visibility
  const visibility: UnifiedVisibility = placement.visibleWhen
    ? {
        advanced: [
          {
            id: placement.visibleWhen.id || 'hud-condition',
            type: placement.visibleWhen.kind,
            params: {
              dayOfWeek: placement.visibleWhen.dayOfWeek,
              hourRange: placement.visibleWhen.hourRange,
              minRelationship: placement.visibleWhen.minRelationship,
              operator: placement.visibleWhen.operator,
              conditions: placement.visibleWhen.conditions,
            },
          },
        ],
      }
    : { simple: 'always' };

  return {
    id: `hud-${placement.toolId}`,
    type: 'world-tool',
    componentType: 'hud',
    toolId: placement.toolId,
    position,
    visibility,
    style: {
      zIndex: placement.zIndex,
      className: placement.customClassName,
    },
    version: 1,
    hudMeta: {
      size: placement.size,
      defaultCollapsed: placement.defaultCollapsed,
      groupId: placement.groupId,
      customClassName: placement.customClassName,
    },
  };
}

/**
 * Convert HudWidgetConfig (unified) to HudToolPlacement (legacy)
 *
 * For backwards compatibility with existing HUD code.
 */
export function toHudToolPlacement(widget: HudWidgetConfig): HudToolPlacement {
  // Extract region from unified position
  const region: HudRegion =
    widget.position.mode === 'region' && widget.position.region
      ? (widget.position.region as HudRegion)
      : 'overlay';

  // Extract visibility condition
  let visibleWhen: HudVisibilityCondition | undefined;
  if (widget.visibility?.advanced && widget.visibility.advanced.length > 0) {
    const condition = widget.visibility.advanced[0];
    visibleWhen = {
      kind: condition.type as HudVisibilityCondition['kind'],
      id: condition.id,
      dayOfWeek: condition.params?.dayOfWeek as number | 'any' | undefined,
      hourRange: condition.params?.hourRange as [number, number] | undefined,
      minRelationship: condition.params?.minRelationship as number | undefined,
      operator: condition.params?.operator as 'AND' | 'OR' | undefined,
      conditions: condition.params?.conditions as HudVisibilityCondition[] | undefined,
    };
  }

  return {
    toolId: widget.toolId,
    region,
    order: widget.position.order,
    visibleWhen,
    size: widget.hudMeta?.size,
    defaultCollapsed: widget.hudMeta?.defaultCollapsed,
    zIndex: widget.style?.zIndex,
    groupId: widget.hudMeta?.groupId,
    customClassName: widget.hudMeta?.customClassName,
  };
}

/**
 * Convert array of HudToolPlacements to HudSurfaceConfig
 */
export function fromHudToolPlacements(
  placements: HudToolPlacement[],
  meta?: {
    id?: string;
    name?: string;
    description?: string;
    profileId?: string;
    viewMode?: 'all' | 'cinematic' | 'hud-heavy' | 'debug';
    worldId?: number;
  }
): HudSurfaceConfig {
  return {
    id: meta?.id || `hud-layout-${Date.now()}`,
    componentType: 'hud',
    name: meta?.name || 'HUD Layout',
    description: meta?.description,
    widgets: placements.map(fromHudToolPlacement),
    version: 1,
    hudMeta: {
      profileId: meta?.profileId,
      viewMode: meta?.viewMode,
      worldId: meta?.worldId,
    },
  };
}

/**
 * Convert HudSurfaceConfig to array of HudToolPlacements
 */
export function toHudToolPlacements(surface: HudSurfaceConfig): HudToolPlacement[] {
  return surface.widgets.map(toHudToolPlacement);
}

/**
 * Convert HudSurfaceConfig to UnifiedSurfaceConfig
 *
 * Strips HUD-specific metadata to get a generic surface config
 * that can be used with other editable UI systems.
 */
export function toUnifiedSurfaceConfig(hud: HudSurfaceConfig): UnifiedSurfaceConfig {
  const { hudMeta, ...unified } = hud;
  return {
    ...unified,
    // Cast widgets back to base type (HudWidgetConfig extends UnifiedWidgetConfig)
    widgets: hud.widgets.map((w) => {
      const { hudMeta: _hudMeta, toolId: _toolId, ...base } = w;
      return base;
    }),
  };
}

/**
 * Convert UnifiedSurfaceConfig to HudSurfaceConfig
 *
 * Enriches a generic surface config with HUD metadata.
 * Note: This may lose some HUD-specific info if the source wasn't originally HUD.
 */
export function fromUnifiedSurfaceConfig(
  unified: UnifiedSurfaceConfig,
  meta?: HudSurfaceMeta
): HudSurfaceConfig {
  return {
    ...unified,
    componentType: 'hud',
    widgets: unified.widgets.map((w) => ({
      ...w,
      toolId: w.id, // Use widget ID as toolId by default
      componentType: 'hud',
    })) as HudWidgetConfig[],
    hudMeta: meta,
  };
}
