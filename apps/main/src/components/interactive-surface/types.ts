/**
 * InteractiveImageSurface Types
 *
 * Core types for the interactive image/video surface system.
 * Designed to support:
 * - Mask drawing (inpaint)
 * - Region tagging with metadata (comments, labels)
 * - Video timestamp annotations
 * - Future extensibility
 */

// ============================================================================
// Core Geometry
// ============================================================================

/**
 * A point in normalized coordinates (0-1 range relative to image dimensions)
 */
export interface NormalizedPoint {
  /** X coordinate (0 = left, 1 = right) */
  x: number;
  /** Y coordinate (0 = top, 1 = bottom) */
  y: number;
}

/**
 * A point in canvas/screen coordinates (pixels)
 */
export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Rectangle in normalized coordinates
 */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Image dimensions
 */
export interface Dimensions {
  width: number;
  height: number;
}

// ============================================================================
// Interaction Events
// ============================================================================

/**
 * Pointer event with both screen and normalized coordinates
 */
export interface SurfacePointerEvent {
  /** Original DOM event */
  nativeEvent: PointerEvent;
  /** Position in screen/canvas pixels */
  screen: ScreenPoint;
  /** Position normalized to image (0-1) */
  normalized: NormalizedPoint;
  /** Current pressure (0-1, for pen/touch) */
  pressure: number;
  /** Pointer type */
  pointerType: 'mouse' | 'pen' | 'touch';
  /** Whether pointer is within image bounds */
  withinBounds: boolean;
  /** For video: current timestamp in seconds */
  timestamp?: number;
}

/**
 * Wheel/zoom event with position context
 */
export interface SurfaceWheelEvent {
  nativeEvent: WheelEvent;
  screen: ScreenPoint;
  normalized: NormalizedPoint;
  deltaY: number;
  withinBounds: boolean;
}

// ============================================================================
// Interaction Modes
// ============================================================================

/**
 * Base interaction mode
 */
export type InteractionMode =
  | 'view' // Pan/zoom only, no drawing
  | 'draw' // Freeform drawing (masks, annotations)
  | 'erase' // Eraser mode
  | 'select' // Select existing elements
  | 'region' // Create rectangular regions
  | 'point' // Place point markers
  | 'polygon' // Draw polygon shapes
  | 'custom'; // Custom mode handled by layer

/**
 * Drawing tool configuration
 */
export interface DrawToolConfig {
  /** Brush/tool size in normalized units (relative to image width) */
  size: number;
  /** Opacity (0-1) */
  opacity: number;
  /** Color (CSS color string) */
  color: string;
  /** Smoothing factor (0 = none, 1 = max) */
  smoothing?: number;
  /** Whether to use pressure sensitivity */
  pressureSensitive?: boolean;
}

// ============================================================================
// Layers and Elements
// ============================================================================

/**
 * Base element that can be placed on the surface
 */
export interface SurfaceElement {
  /** Unique element ID */
  id: string;
  /** Element type for rendering */
  type: string;
  /** Layer this element belongs to */
  layerId: string;
  /** Whether element is visible */
  visible: boolean;
  /** Whether element is locked (not editable) */
  locked?: boolean;
  /** For video: timestamp range this element applies to */
  timeRange?: { start: number; end: number };
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Point marker element
 */
export interface PointElement extends SurfaceElement {
  type: 'point';
  position: NormalizedPoint;
  /** Optional label */
  label?: string;
  /** Point style */
  style?: {
    color?: string;
    size?: number;
    icon?: string;
  };
}

/**
 * Rectangular region element
 */
export interface RegionElement extends SurfaceElement {
  type: 'region';
  bounds: NormalizedRect;
  /** Optional label */
  label?: string;
  /** Region style */
  style?: {
    strokeColor?: string;
    fillColor?: string;
    strokeWidth?: number;
  };
}

/**
 * Polygon element
 */
export interface PolygonElement extends SurfaceElement {
  type: 'polygon';
  points: NormalizedPoint[];
  /** Whether polygon is closed */
  closed: boolean;
  style?: {
    strokeColor?: string;
    fillColor?: string;
    strokeWidth?: number;
  };
}

/**
 * Freeform stroke element (for drawing/masks)
 */
export interface StrokeElement extends SurfaceElement {
  type: 'stroke';
  /** Points along the stroke with optional pressure */
  points: Array<NormalizedPoint & { pressure?: number }>;
  /** Tool config used for this stroke */
  tool: DrawToolConfig;
  /** Whether this is an erase stroke */
  isErase?: boolean;
}

/**
 * Union of all element types
 */
export type AnyElement = PointElement | RegionElement | PolygonElement | StrokeElement;

/**
 * Interaction layer definition
 */
export interface InteractionLayer {
  /** Unique layer ID */
  id: string;
  /** Display name */
  name: string;
  /** Layer type for specialized handling */
  type: 'mask' | 'annotation' | 'region' | 'custom';
  /** Whether layer is visible */
  visible: boolean;
  /** Whether layer is locked */
  locked: boolean;
  /** Layer opacity (0-1) */
  opacity: number;
  /** Z-index for stacking */
  zIndex: number;
  /** Elements in this layer */
  elements: AnyElement[];
  /** Layer-specific config */
  config?: Record<string, unknown>;
}

// ============================================================================
// Surface State
// ============================================================================

/**
 * Viewport/view state
 */
export interface ViewState {
  /** Zoom level (1 = 100%) */
  zoom: number;
  /** Pan offset in screen pixels */
  pan: ScreenPoint;
  /** Fit mode */
  fitMode: 'contain' | 'cover' | 'actual' | 'fill';
}

/**
 * Complete surface state
 */
export interface SurfaceState {
  /** Current interaction mode */
  mode: InteractionMode;
  /** Active tool configuration */
  tool: DrawToolConfig;
  /** View/zoom state */
  view: ViewState;
  /** All layers */
  layers: InteractionLayer[];
  /** Currently active layer ID */
  activeLayerId: string | null;
  /** Currently selected element IDs */
  selectedElementIds: string[];
  /** For video: current playback time */
  currentTime?: number;
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Surface event handlers
 */
export interface SurfaceEventHandlers {
  onPointerDown?: (event: SurfacePointerEvent) => void;
  onPointerMove?: (event: SurfacePointerEvent) => void;
  onPointerUp?: (event: SurfacePointerEvent) => void;
  onPointerEnter?: (event: SurfacePointerEvent) => void;
  onPointerLeave?: (event: SurfacePointerEvent) => void;
  onWheel?: (event: SurfaceWheelEvent) => void;
  onDoubleClick?: (event: SurfacePointerEvent) => void;
  /** Called when an element is clicked */
  onElementClick?: (element: AnyElement, event: SurfacePointerEvent) => void;
  /** Called when an element is selected */
  onElementSelect?: (elementIds: string[]) => void;
}

// ============================================================================
// Component Props
// ============================================================================

/**
 * Media source for the surface
 */
export interface SurfaceMedia {
  /** Media type */
  type: 'image' | 'video';
  /** Media URL */
  url: string;
  /** Natural dimensions (will be detected if not provided) */
  naturalDimensions?: Dimensions;
}

/**
 * InteractiveImageSurface component props
 */
export interface InteractiveImageSurfaceProps {
  /** Media to display */
  media: SurfaceMedia;
  /** Surface state (controlled) */
  state?: SurfaceState;
  /** Event handlers */
  handlers?: SurfaceEventHandlers;
  /** Whether interaction is enabled */
  interactive?: boolean;
  /** Custom cursor CSS */
  cursor?: string;
  /** Additional class name */
  className?: string;
  /** Called when media dimensions are loaded */
  onMediaLoad?: (dimensions: Dimensions) => void;
  /** Custom layer renderer */
  renderLayer?: (layer: InteractionLayer, ctx: CanvasRenderingContext2D) => void;
  /** Custom element renderer */
  renderElement?: (element: AnyElement, ctx: CanvasRenderingContext2D) => void;
  /** Children to render (additional overlays) */
  children?: React.ReactNode;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Coordinate transform functions
 */
export interface CoordinateTransform {
  /** Convert screen coordinates to normalized (0-1) */
  screenToNormalized: (screen: ScreenPoint) => NormalizedPoint;
  /** Convert normalized coordinates to screen */
  normalizedToScreen: (normalized: NormalizedPoint) => ScreenPoint;
  /** Check if a normalized point is within bounds */
  isWithinBounds: (normalized: NormalizedPoint) => boolean;
  /** Get the current image rect in screen coordinates */
  getImageRect: () => { x: number; y: number; width: number; height: number };
}

/**
 * History entry for undo/redo
 */
export interface HistoryEntry {
  /** Unique entry ID */
  id: string;
  /** Description of the action */
  description: string;
  /** State snapshot or delta */
  state: Partial<SurfaceState>;
  /** Timestamp */
  timestamp: number;
}
