/**
 * Region Drawer System - Types
 *
 * Extensible system for drawing region annotations on assets in the media viewer.
 *
 * ## Domain Clarification
 *
 * These are **viewer/overlay drawing tools** - used in the asset viewer to
 * annotate images with regions (rectangles, polygons, paths, 3D boxes, etc.)
 *
 * "RegionDrawer" naming is used to avoid confusion with other "Tool" types:
 * - `InteractiveTool` (scene gizmos) - physical interaction tools in 3D scenes
 * - `UiToolPlugin` / `WorldUiToolPlugin` / `GalleryUiToolPlugin` - UI panels/widgets
 * - `BrushConfig` (formerly DrawToolConfig) - brush/stroke configuration
 *
 * Drawers register themselves and provide drawing logic, rendering,
 * and editing UI for specific region types.
 */

import type { ReactNode } from 'react';
import type {
  NormalizedPoint,
  NormalizedRect,
  SurfacePointerEvent,
} from '@/components/interactive-surface';

// ============================================================================
// Base Element Types
// ============================================================================

/**
 * Base interface for all annotation elements.
 * Tools extend this with their specific geometry.
 */
export interface BaseAnnotationElement {
  /** Unique element ID */
  id: string;
  /** Tool type that created this element */
  toolType: string;
  /** Short label/tag */
  label: string;
  /** Optional longer note */
  note?: string;
  /** Display style (tool-specific, but common fields here) */
  style?: {
    strokeColor?: string;
    fillColor?: string;
    strokeWidth?: number;
  };
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Tool-specific data (geometry, etc.) */
  data: Record<string, unknown>;
}

/**
 * Known element data types for built-in tools.
 * Tools can define their own data shapes.
 */
export interface RectElementData {
  bounds: NormalizedRect;
}

export interface PolygonElementData {
  points: NormalizedPoint[];
  closed: boolean;
}

export interface PathElementData {
  points: NormalizedPoint[];
  /** Bezier control points for smooth curves */
  controlPoints?: Array<{
    cp1: NormalizedPoint;
    cp2: NormalizedPoint;
  }>;
  closed: boolean;
}

export interface Box3DElementData {
  /** Front face rectangle */
  front: NormalizedRect;
  /** Vanishing point for perspective */
  vanishingPoint: NormalizedPoint;
  /** Depth as percentage of front width */
  depth: number;
}

export interface PointElementData {
  position: NormalizedPoint;
  /** Optional radius for area of influence */
  radius?: number;
}

// ============================================================================
// Drawing State
// ============================================================================

/**
 * State passed to tools during drawing operations
 */
export interface DrawingContext {
  /** Current pointer event */
  event: SurfacePointerEvent;
  /** Start point of the current drawing operation */
  startPoint: NormalizedPoint | null;
  /** All points collected during this drawing operation */
  points: NormalizedPoint[];
  /** Whether a modifier key is held */
  modifiers: {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
  };
  /** Previous elements (for snapping, alignment, etc.) */
  existingElements: BaseAnnotationElement[];
}

/**
 * Result of a drawing operation
 */
export interface DrawingResult {
  /** Whether drawing is complete */
  complete: boolean;
  /** The element data if complete */
  elementData?: Record<string, unknown>;
  /** Preview state for rendering in-progress drawing */
  preview?: {
    type: 'rect' | 'polygon' | 'path' | 'custom';
    data: Record<string, unknown>;
  };
  /** Cursor to show */
  cursor?: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

/**
 * A drawer that can create region annotation elements.
 * Implement this interface to add new annotation types.
 *
 * Named "RegionDrawer" to avoid confusion with:
 * - InteractiveTool (scene gizmos)
 * - ToolPlugin (UI tool plugins)
 */
export interface RegionDrawer<TData = Record<string, unknown>> {
  /** Unique drawer identifier */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Icon (unicode symbol, icon name, or component) */
  icon: string | ReactNode;
  /** Keyboard shortcut (single character) */
  shortcut?: string;
  /** Drawer category for grouping in UI */
  category: 'shape' | 'path' | '3d' | 'point' | 'custom';

  // ─────────────────────────────────────────────────────────────────────────
  // Drawing Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Called when pointer is pressed to start drawing.
   * Return whether to begin tracking this drawing operation.
   */
  onDrawStart: (ctx: DrawingContext) => DrawingResult;

  /**
   * Called as pointer moves during drawing.
   * Return preview data for rendering.
   */
  onDrawMove: (ctx: DrawingContext) => DrawingResult;

  /**
   * Called when pointer is released.
   * Return the final element data if drawing is complete.
   */
  onDrawEnd: (ctx: DrawingContext) => DrawingResult;

  /**
   * Called on double-click (for multi-step tools like polygon).
   * Return the final element data if drawing should complete.
   */
  onDrawComplete?: (ctx: DrawingContext) => DrawingResult;

  /**
   * Called when drawing is cancelled (e.g., Escape key).
   */
  onDrawCancel?: () => void;

  // ─────────────────────────────────────────────────────────────────────────
  // Rendering
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Render a completed element to canvas.
   * Called for each element during redraw.
   */
  renderElement: (
    element: BaseAnnotationElement,
    ctx: CanvasRenderingContext2D,
    options: RenderOptions
  ) => void;

  /**
   * Render the in-progress preview while drawing.
   */
  renderPreview?: (
    preview: DrawingResult['preview'],
    ctx: CanvasRenderingContext2D,
    options: RenderOptions
  ) => void;

  /**
   * Optional: Render as React/SVG overlay instead of canvas.
   * Use for complex UI like handles, labels, etc.
   */
  renderOverlay?: (
    element: BaseAnnotationElement,
    options: RenderOptions
  ) => ReactNode;

  // ─────────────────────────────────────────────────────────────────────────
  // Editing
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Return a React component for editing drawer-specific properties.
   * Receives the element and update callback.
   */
  getEditor?: () => React.ComponentType<RegionDrawerEditorProps<TData>>;

  /**
   * Validate element data.
   * Return error message if invalid, undefined if valid.
   */
  validate?: (data: TData) => string | undefined;

  // ─────────────────────────────────────────────────────────────────────────
  // Interaction
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check if a point is inside/on this element.
   * Used for selection and hit testing.
   */
  hitTest: (
    element: BaseAnnotationElement,
    point: NormalizedPoint,
    tolerance: number
  ) => boolean;

  /**
   * Get bounding box for an element.
   * Used for selection bounds, export, etc.
   */
  getBounds: (element: BaseAnnotationElement) => NormalizedRect;

  /**
   * Transform an element (move, scale, rotate).
   * Return new element data.
   */
  transform?: (
    element: BaseAnnotationElement,
    transform: ElementTransform
  ) => Record<string, unknown>;
}

/**
 * Options passed to render functions
 */
export interface RenderOptions {
  /** Whether element is selected */
  isSelected: boolean;
  /** Whether element is hovered */
  isHovered: boolean;
  /** Current zoom level */
  zoom: number;
  /** Conversion functions */
  toScreenX: (normalizedX: number) => number;
  toScreenY: (normalizedY: number) => number;
  /** Image dimensions in screen coords */
  imageRect: { x: number; y: number; width: number; height: number };
}

/**
 * Props for drawer-specific editor components
 */
export interface RegionDrawerEditorProps<TData = Record<string, unknown>> {
  element: BaseAnnotationElement;
  data: TData;
  onChange: (updates: Partial<TData>) => void;
}

/**
 * Transform to apply to an element
 */
export interface ElementTransform {
  /** Translation in normalized coords */
  translate?: { dx: number; dy: number };
  /** Scale factor (1 = no change) */
  scale?: { sx: number; sy: number; origin: NormalizedPoint };
  /** Rotation in radians */
  rotate?: { angle: number; origin: NormalizedPoint };
}

// ============================================================================
// Registry Types
// ============================================================================

/**
 * Drawer registration options
 */
export interface RegionDrawerRegistration {
  drawer: RegionDrawer;
  /** Override default priority in toolbar */
  priority?: number;
  /** Whether drawer is enabled by default */
  enabled?: boolean;
}

/**
 * Region drawer registry interface
 */
export interface IRegionDrawerRegistry {
  /** Register a new drawer */
  register: (registration: RegionDrawerRegistration) => void;
  /** Unregister a drawer */
  unregister: (drawerId: string) => void;
  /** Get a drawer by ID */
  get: (drawerId: string) => RegionDrawer | undefined;
  /** Get all registered drawers */
  getAll: () => RegionDrawer[];
  /** Get drawers by category */
  getByCategory: (category: RegionDrawer['category']) => RegionDrawer[];
  /** Subscribe to registry changes */
  subscribe: (callback: () => void) => () => void;
}
