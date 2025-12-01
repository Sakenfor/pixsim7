/**
 * Generic Overlay Positioning System - Core Type Definitions
 *
 * A reusable, type-safe system for positioning UI elements (badges, controls,
 * overlays, widgets) on container components throughout the application.
 */

import type { ReactNode, RefObject } from 'react';

// ============================================================================
// Position System
// ============================================================================

/**
 * Preset anchor positions using a 9-point grid system
 */
export type OverlayAnchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

/**
 * Position configuration using anchor-based positioning
 */
export interface OverlayPosition {
  /** Anchor point for the widget */
  anchor: OverlayAnchor;

  /** Offset from anchor point (supports px, %, rem, etc.) */
  offset?: {
    x: number | string;
    y: number | string;
  };

  /** CSS transform override (advanced use only) */
  transform?: string;

  /** Alignment when stacking multiple widgets at same anchor */
  alignment?: 'start' | 'center' | 'end';
}

/**
 * Custom coordinate-based positioning (alternative to anchor-based)
 */
export interface CustomPosition {
  /** X coordinate (supports px, %, rem, etc.) */
  x: number | string;

  /** Y coordinate (supports px, %, rem, etc.) */
  y: number | string;

  /** Transform origin for calculations */
  origin?: 'top-left' | 'center';
}

/**
 * Flexible positioning - either anchor-based or custom coordinates
 */
export type WidgetPosition = OverlayPosition | CustomPosition;

/**
 * Type guard to check if position is anchor-based
 */
export function isOverlayPosition(pos: WidgetPosition): pos is OverlayPosition {
  return 'anchor' in pos;
}

/**
 * Type guard to check if position is custom coordinate-based
 */
export function isCustomPosition(pos: WidgetPosition): pos is CustomPosition {
  return 'x' in pos && 'y' in pos;
}

// ============================================================================
// Visibility System
// ============================================================================

/**
 * Triggers that control when a widget is visible
 */
export type VisibilityTrigger =
  | 'always'           // Always visible
  | 'hover'            // Visible when widget itself is hovered
  | 'hover-container'  // Visible when container is hovered
  | 'hover-sibling'    // Visible when sibling widget is hovered
  | 'focus'            // Visible when widget has focus
  | 'active'           // Visible when widget is active
  | { condition: string }; // Custom condition key

/**
 * Configuration for widget visibility behavior
 */
export interface VisibilityConfig {
  /** When the widget should be visible */
  trigger: VisibilityTrigger;

  /** Delay in ms before showing/hiding (useful for hover) */
  delay?: number;

  /** Transition animation type */
  transition?: 'fade' | 'slide' | 'scale' | 'none';

  /** Transition duration in ms */
  transitionDuration?: number;

  /** Respect user's reduced motion preference */
  reduceMotion?: boolean;
}

// ============================================================================
// Style System
// ============================================================================

/**
 * Widget size variants (preset or custom pixel value)
 */
export type WidgetSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;

/**
 * Style configuration for widgets
 */
export interface WidgetStyle {
  /** Widget size (preset or px) */
  size?: WidgetSize;

  /** Opacity (0-1) */
  opacity?: number;

  /** Padding (number = px, string = CSS unit) */
  padding?: number | string;

  /** Z-index for layering */
  zIndex?: number;

  /** Additional Tailwind/CSS classes */
  className?: string;

  /** Maximum width constraint */
  maxWidth?: number | string;

  /** Maximum height constraint */
  maxHeight?: number | string;

  /** Pointer events behavior */
  pointerEvents?: 'auto' | 'none';
}

// ============================================================================
// Widget System
// ============================================================================

/**
 * Context provided to widget render functions
 */
export interface WidgetContext {
  /** Reference to the container element */
  containerRef: RefObject<HTMLElement>;

  /** Whether the container is currently hovered */
  isHovered: boolean;

  /** Whether the container has focus */
  isFocused: boolean;

  /** Custom state for conditional rendering */
  customState?: Record<string, any>;
}

/**
 * Core widget definition
 *
 * @template TData - Type of data passed to the widget
 */
export interface OverlayWidget<TData = any> {
  /** Unique identifier for this widget */
  id: string;

  /** Widget type identifier */
  type: string;

  /** Position configuration */
  position: WidgetPosition;

  /** Visibility configuration */
  visibility: VisibilityConfig;

  /** Style configuration */
  style?: WidgetStyle;

  // Content
  /** Render function for widget content */
  render: (data: TData, context: WidgetContext) => ReactNode;

  // Behavior
  /** Whether the widget accepts user interaction */
  interactive?: boolean;

  /**
   * Whether the widget handles its own interaction internally
   * (e.g., MenuWidget, TooltipWidget with internal state/keyboard handling).
   * When true, OverlayWidget wrapper will not apply role="button" or keyboard handlers.
   */
  handlesOwnInteraction?: boolean;

  /** Whether the widget can be dismissed */
  dismissible?: boolean;

  /** Click handler */
  onClick?: (data: TData) => void;

  // Accessibility
  /** ARIA label for screen readers */
  ariaLabel?: string;

  /** Explicit tab order for keyboard navigation */
  tabIndex?: number;

  // Grouping & Layering
  /** Group identifier for stacking related widgets */
  group?: string;

  /** Render priority (higher = on top) */
  priority?: number;
}

// ============================================================================
// Configuration System
// ============================================================================

/**
 * Spacing between widgets in the same group
 */
export type WidgetSpacing = 'compact' | 'normal' | 'spacious';

/**
 * Complete overlay configuration for a container
 */
export interface OverlayConfiguration {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this configuration does */
  description?: string;

  /** List of widgets to render */
  widgets: OverlayWidget[];

  // Layout
  /** Spacing between widgets */
  spacing?: WidgetSpacing;

  /** Enable automatic collision detection and adjustment */
  collisionDetection?: boolean;

  // Defaults
  /** Default visibility config applied to all widgets */
  defaultVisibility?: VisibilityConfig;

  /** Default style applied to all widgets */
  defaultStyle?: WidgetStyle;

  // Runtime
  /** Whether to allow widgets to overflow container bounds */
  allowOverflow?: boolean;
}

/**
 * Categories for organizing presets
 */
export type PresetCategory = 'media' | 'video' | 'hud' | 'dashboard' | 'custom';

/**
 * Preset configuration that can be saved and reused
 */
export interface OverlayPreset {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Icon identifier for UI */
  icon?: string;

  /** Category for organization */
  category: PresetCategory;

  /** The actual configuration */
  configuration: OverlayConfiguration;

  /** Whether this was created by a user */
  isUserCreated?: boolean;

  /** Preview thumbnail (data URL or path) */
  thumbnail?: string;
}

// ============================================================================
// Validation System
// ============================================================================

/**
 * Validation error with actionable message
 */
export interface ValidationError {
  /** Widget ID that caused the error (if applicable) */
  widgetId?: string;

  /** Error code for programmatic handling */
  code: string;

  /** Human-readable error message */
  message: string;

  /** Severity level */
  severity: 'error' | 'warning' | 'info';
}

/**
 * Result of configuration validation
 */
export interface ValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;

  /** List of validation errors/warnings */
  errors: ValidationError[];
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Computed position in CSS values
 */
export interface ComputedPosition {
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  transform?: string;
}

/**
 * Widget bounds for collision detection
 */
export interface WidgetBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Spacing values in pixels
 */
export const SPACING_VALUES: Record<WidgetSpacing, number> = {
  compact: 4,
  normal: 8,
  spacious: 16,
} as const;

/**
 * Size values in pixels for preset sizes
 */
export const SIZE_VALUES: Record<Exclude<WidgetSize, number>, number> = {
  xs: 16,
  sm: 24,
  md: 32,
  lg: 48,
  xl: 64,
} as const;

/**
 * Default z-index range for overlay widgets
 */
export const WIDGET_Z_INDEX_RANGE = {
  min: 10,
  max: 20,
  default: 15,
} as const;

/**
 * Default transition durations in ms
 */
export const TRANSITION_DURATIONS = {
  fast: 150,
  normal: 250,
  slow: 400,
} as const;
