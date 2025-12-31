/**
 * Unified Widget System Types
 *
 * Single source of truth for widget definitions across all surfaces:
 * - header/statusbar/toolbar (chrome widgets)
 * - panel-composer (grid layout blocks)
 * - overlay/hud (editing-core surfaces)
 *
 * Adapters map legacy systems (editing-core, blocks) into this unified model.
 */

import type { ComponentType } from 'react';
import type { CapabilityDeclaration } from '@features/contextHub/types';

// Re-export editing-core types for surfaces that need them
export type {
  UnifiedPosition,
  UnifiedVisibility,
  UnifiedStyle,
  UnifiedDataBinding,
  UnifiedWidgetConfig,
  UnifiedAnchor,
  UnifiedRegion,
  PositionMode,
} from '@lib/editing-core/unifiedConfig';

// ============================================================================
// Surface Types
// ============================================================================

/**
 * All surfaces where widgets can be rendered.
 *
 * Chrome surfaces (app UI):
 * - 'header' - Top header bar
 * - 'statusbar' - Bottom status bar
 * - 'toolbar' - Toolbar areas
 *
 * Composed surfaces (grid layouts):
 * - 'panel-composer' - Panel builder blocks
 *
 * Editing-core surfaces (media/game overlays):
 * - 'overlay' - Media card overlays
 * - 'hud' - Game HUD elements
 */
export type WidgetSurface =
  | 'header'
  | 'statusbar'
  | 'toolbar'
  | 'panel-composer'
  | 'overlay'
  | 'hud';

// ============================================================================
// Surface-Specific Configuration
// ============================================================================

/** Size tokens for chrome widgets */
export type WidgetSize = 'tiny' | 'small' | 'medium';

/** Header/toolbar area placement */
export type HeaderArea = 'left' | 'center' | 'right';

/** Header surface config */
export interface HeaderSurfaceConfig {
  area: HeaderArea;
  size: WidgetSize;
  priority?: number; // Lower = renders first
}

/** Statusbar surface config */
export interface StatusbarSurfaceConfig {
  area: 'left' | 'center' | 'right';
  priority?: number;
}

/** Panel composer (blocks) surface config */
export interface PanelComposerSurfaceConfig {
  minWidth?: number;
  minHeight?: number;
  defaultWidth?: number;
  defaultHeight?: number;
  resizable?: boolean;
}

/** Overlay surface config (editing-core) */
export interface OverlaySurfaceConfig {
  /** Default anchor position */
  defaultAnchor?: 'top-left' | 'top-center' | 'top-right'
    | 'center-left' | 'center' | 'center-right'
    | 'bottom-left' | 'bottom-center' | 'bottom-right';
  /** Default offset from anchor */
  defaultOffset?: { x: number; y: number };
  /** Default z-index */
  zIndex?: number;
}

/** HUD surface config (editing-core) */
export interface HudSurfaceConfig {
  /** Default region */
  defaultRegion?: 'top' | 'bottom' | 'left' | 'right' | 'overlay';
  /** Size variant */
  sizeVariant?: 'compact' | 'normal' | 'expanded';
}

/** Combined surface configuration - only include what's needed per surface */
export interface WidgetSurfaceConfig {
  header?: HeaderSurfaceConfig;
  statusbar?: StatusbarSurfaceConfig;
  toolbar?: HeaderSurfaceConfig; // Same shape as header
  panelComposer?: PanelComposerSurfaceConfig;
  overlay?: OverlaySurfaceConfig;
  hud?: HudSurfaceConfig;
}

// ============================================================================
// Organization
// ============================================================================

/** Widget category for menu organization */
export type WidgetCategory =
  | 'status'      // Status indicators
  | 'actions'     // Action triggers
  | 'info'        // Information display
  | 'automation'  // Automation-related
  | 'generation'  // Generation-related
  | 'media'       // Media-related
  | 'display'     // Display widgets (from blocks)
  | 'input'       // Input widgets (from blocks)
  | 'visualization' // Charts, graphs (from blocks)
  | 'layout'      // Layout widgets (from blocks)
  | 'overlay'     // Overlay-specific (editing-core)
  | 'hud'         // HUD-specific (editing-core)
  | 'utilities';  // General utilities

/** Widget domain for ownership */
export type WidgetDomain =
  | 'core'
  | 'automation'
  | 'generation'
  | 'media'
  | 'workspace'
  | 'overlay'     // Editing-core overlay
  | 'hud';        // Editing-core HUD

// ============================================================================
// Component Props
// ============================================================================

/**
 * Props passed to widget React components.
 * Used for chrome/panel-composer surfaces.
 */
export interface WidgetComponentProps<TSettings = Record<string, unknown>, TData = unknown> {
  /** Widget instance ID */
  instanceId: string;
  /** Widget settings (static config) */
  settings: TSettings;
  /** Current surface */
  surface: WidgetSurface;
  /** Update settings callback */
  onSettingsChange?: (settings: Partial<TSettings>) => void;
  /** Resolved data binding values (for panel-composer blocks) */
  data?: TData;
  /** Data change callback (for panel-composer blocks) */
  onDataChange?: (data: TData) => void;
}

/**
 * Runtime options for factory-based widgets (editing-core pattern).
 * Used for overlay/hud surfaces.
 */
export interface WidgetFactoryOptions {
  /** Surface type (overlay, hud) */
  componentType: string;
  /** Click handler */
  onClick?: (data: unknown) => void;
  /** Upload handler */
  onUpload?: (data: unknown) => void | Promise<void>;
  /** Retry handler */
  onRetry?: (data: unknown) => void | Promise<void>;
  /** Additional options */
  [key: string]: unknown;
}

/**
 * Factory function for creating widget instances (editing-core pattern).
 */
export type WidgetFactory<TWidget = unknown> = (
  config: import('@lib/editing-core/unifiedConfig').UnifiedWidgetConfig,
  options?: WidgetFactoryOptions
) => TWidget;

// ============================================================================
// Widget Definition
// ============================================================================

/**
 * Unified widget definition.
 *
 * Supports both patterns:
 * - React component (chrome, panel-composer)
 * - Factory function (overlay, hud via editing-core)
 */
export interface WidgetDefinition<TSettings = Record<string, unknown>, TWidget = unknown> {
  // ---- Identity ----
  /** Unique widget ID */
  id: string;
  /** Display title */
  title: string;
  /** Short description */
  description?: string;
  /** Icon (emoji or icon ID) */
  icon?: string;

  // ---- Organization ----
  /** Category for menus */
  category: WidgetCategory;
  /** Domain for ownership */
  domain?: WidgetDomain;
  /** Search tags */
  tags?: string[];

  // ---- Surfaces ----
  /**
   * Explicit surface visibility override.
   * If omitted, surfaces are inferred from renderer capability:
   * - component present → chrome surfaces (header, statusbar, toolbar, panel-composer)
   * - factory present → editing-core surfaces (overlay, hud)
   */
  surfaces?: WidgetSurface[];

  /**
   * Surfaces to explicitly exclude, even if renderer supports them.
   * Use when a widget technically could render but shouldn't appear in palette.
   */
  excludeSurfaces?: WidgetSurface[];

  /** Per-surface configuration */
  surfaceConfig?: WidgetSurfaceConfig;

  // ---- Rendering (provide one or both) ----
  /**
   * React component for chrome/panel-composer surfaces.
   * Receives WidgetComponentProps.
   */
  component?: ComponentType<WidgetComponentProps<TSettings>>;

  /**
   * Factory function for overlay/hud surfaces (editing-core pattern).
   * Receives UnifiedWidgetConfig and WidgetFactoryOptions.
   */
  factory?: WidgetFactory<TWidget>;

  // ---- Configuration ----
  /** Default settings for new instances */
  defaultSettings?: TSettings;

  /**
   * Default config for editing-core surfaces.
   * Used when creating new overlay/hud widgets.
   */
  defaultConfig?: Partial<import('@lib/editing-core/unifiedConfig').UnifiedWidgetConfig>;

  /** Config schema for validation/editors */
  configSchema?: unknown;

  /**
   * Settings editor component.
   */
  settingsComponent?: ComponentType<{
    settings: TSettings;
    onChange: (settings: Partial<TSettings>) => void;
  }>;

  // ---- Capabilities (ContextHub) ----
  /** Capabilities this widget consumes */
  consumesCapabilities?: CapabilityDeclaration[];
  /** Capabilities this widget provides */
  providesCapabilities?: CapabilityDeclaration[];
  /** Panels this widget can interact with */
  targetPanels?: string[];

  // ---- Availability ----
  /** Condition for showing in menus */
  showWhen?: (context: { domain?: string; surface?: WidgetSurface }) => boolean;
}

// ============================================================================
// Widget Placement Envelope
// ============================================================================

/**
 * Unified Placement Envelope
 *
 * A common data structure for widget placement across ALL surfaces.
 * Each surface renderer interprets the fields that apply to it:
 *
 * - **Header/Statusbar/Toolbar**: uses `area`, `order`
 * - **Overlay**: uses `anchor`, `offset`, `zIndex`
 * - **HUD**: uses `region`, `anchor`, `offset`
 * - **Panel-composer**: uses `grid`
 *
 * This allows a single storage format and future UI editor to work
 * across all surfaces, while each renderer keeps its own layout semantics.
 */
export interface WidgetPlacement {
  // === Flow-based (header, statusbar, toolbar) ===
  /**
   * Area/section in flow layout.
   * For header/toolbar: 'left' | 'center' | 'right'
   * For statusbar: 'left' | 'center' | 'right'
   */
  area?: string;

  /**
   * Order within the area (lower = renders first).
   * Used by flex-based surfaces for ordering.
   */
  order?: number;

  // === Anchor-based (overlay, hud) ===
  /**
   * Anchor position using 9-point grid.
   * Used by overlay surface for absolute positioning.
   */
  anchor?: UnifiedAnchor;

  /**
   * Offset from anchor point in pixels.
   * Applied after anchor positioning.
   */
  offset?: { x: number; y: number };

  // === Region-based (hud) ===
  /**
   * HUD region for coarse positioning.
   * Used by HUD surface: 'top' | 'bottom' | 'left' | 'right' | 'overlay'
   */
  region?: UnifiedRegion;

  // === Grid-based (panel-composer) ===
  /**
   * Grid placement for panel-composer.
   * x, y = grid cell position; w, h = cell span
   */
  grid?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };

  // === Style overrides (any surface) ===
  /**
   * Z-index override for layering.
   * Interpreted by surfaces that support stacking.
   */
  zIndex?: number;
}

// ============================================================================
// Widget Instance
// ============================================================================

/**
 * Widget instance - a placed widget with settings.
 *
 * Represents a specific placement of a widget definition on a surface.
 * The `placement` envelope is interpreted by each surface's renderer.
 */
export interface WidgetInstance<TSettings = Record<string, unknown>> {
  /** Unique instance ID */
  id: string;

  /** Widget definition ID */
  widgetId: string;

  /** Surface where this instance is placed */
  surface: WidgetSurface;

  /**
   * Placement envelope - interpreted per surface.
   * @see WidgetPlacement for field usage by surface type.
   */
  placement: WidgetPlacement;

  /** Instance-specific settings (overrides widget defaults) */
  settings?: TSettings;

  /**
   * Full editing-core config for overlay/hud surfaces.
   * Generated from placement + widget definition when rendering.
   */
  config?: import('@lib/editing-core/unifiedConfig').UnifiedWidgetConfig;

  /** Creation timestamp */
  createdAt?: number;
}

// ============================================================================
// Placement State
// ============================================================================

/**
 * Widget placement store state.
 */
export interface WidgetPlacementState {
  instances: Record<string, WidgetInstance>;
  surfaceAreas: Record<string, Record<string, string[]>>;
}
