/**
 * Editable UI Core - Unified Configuration Types
 *
 * Serializable configuration model shared by editable UI systems:
 * - Overlay editor (media cards, video players, etc.)
 * - HUD editor (game HUD layouts)
 * - Future editors that need configurable widgets
 *
 * This file intentionally avoids React-specific concepts so that configs can
 * be safely persisted, migrated, and shared across frontends or backends.
 */

/**
 * Positioning modes supported across editors.
 *
 * - 'anchor': overlay-style 9-point anchors + offset
 * - 'region': HUD-style regions (top/bottom/left/right/overlay)
 * - 'absolute': explicit coordinates in the container
 */
export type PositionMode = 'anchor' | 'region' | 'absolute';

/**
 * Anchor positions using a 9-point grid system.
 * Mirrors OverlayAnchor but kept local to avoid tight coupling.
 */
export type UnifiedAnchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

/**
 * HUD-style regions for coarse positioning.
 */
export type UnifiedRegion = 'top' | 'bottom' | 'left' | 'right' | 'overlay';

export interface UnifiedOffset {
  x: number;
  y: number;
}

export interface UnifiedPosition {
  mode: PositionMode;
  anchor?: UnifiedAnchor;
  region?: UnifiedRegion;
  offset?: UnifiedOffset;
  /**
   * Order within a region or anchor stack.
   * Lower numbers typically render first.
   */
  order?: number;
}

/**
 * Simple, editor-agnostic visibility triggers.
 */
export type SimpleVisibilityTrigger =
  | 'always'
  | 'hover'
  | 'focus';

/**
 * Advanced, domain-specific visibility conditions.
 * For example: quest/location/time-of-day in HUD, or session flags.
 */
export interface AdvancedVisibilityCondition {
  id: string;
  /** Free-form condition type; interpreted by the consumer. */
  type: string;
  /** Condition parameters, e.g. quest/location/time-of-day. */
  params?: Record<string, unknown>;
}

export interface UnifiedVisibility {
  simple?: SimpleVisibilityTrigger;
  advanced?: AdvancedVisibilityCondition[];
}

/**
 * Styling information that is safe to serialize.
 * Mirrors core concepts from overlay/hud styling without React.
 */
export interface UnifiedStyle {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  opacity?: number;
  padding?: number | string;
  zIndex?: number;
  className?: string;
  maxWidth?: number | string;
  maxHeight?: number | string;
}

/**
 * Minimal data binding configuration.
 * Full DataBinding<T> lives in dataBinding.ts; this is the serializable subset.
 */
export interface UnifiedDataBinding {
  kind: 'static' | 'path' | 'fn';
  /**
   * Logical target within a widget configuration, e.g. "value", "label", "icon".
   */
  target: string;
  /**
   * Property path for kind === "path", e.g. "uploadProgress" or "hud.health".
   */
  path?: string;
  /**
   * Static value for kind === "static".
   */
  staticValue?: unknown;
}

/**
 * Serializable widget configuration that can be used by any editable UI
 * system. This is the format that should be persisted to storage or passed
 * over network boundaries.
 */
export interface UnifiedWidgetConfig {
  id: string;
  type: string;           // 'badge', 'button', 'hud-tool', etc.

  /**
   * Component or surface this widget belongs to, e.g. "mediaCard", "hud".
   * This is used for routing configs to the right renderer/editor.
   */
  componentType: string;

  position: UnifiedPosition;
  visibility?: UnifiedVisibility;
  style?: UnifiedStyle;

  /**
   * Widget-specific configuration. This should be JSON-serializable.
   */
  props?: Record<string, unknown>;

  /**
   * Optional data bindings (e.g. value, label, icon) expressed in a
   * serializable way. Concrete systems can extend this with richer metadata.
   */
  bindings?: UnifiedDataBinding[];

  /**
   * Schema version for migration.
   */
  version: number;
}

/**
 * A serializable configuration for an entire editable surface (card, HUD, etc)
 * composed of widgets.
 */
export interface UnifiedSurfaceConfig {
  id: string;
  componentType: string;
  name: string;
  description?: string;
  widgets: UnifiedWidgetConfig[];
  version: number;
}

