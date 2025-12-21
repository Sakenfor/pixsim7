/**
 * Interactive Image Surface
 *
 * A generic interactive surface system for images and videos.
 * Supports drawing, annotations, regions, and other overlays.
 *
 * @example Basic usage
 * ```tsx
 * import {
 *   InteractiveImageSurface,
 *   useInteractionLayer
 * } from '@components/interactive-surface';
 *
 * function MaskEditor({ imageUrl }: { imageUrl: string }) {
 *   const { state, handlers, setMode, addLayer } = useInteractionLayer({
 *     initialMode: 'draw',
 *   });
 *
 *   useEffect(() => {
 *     addLayer({ type: 'mask', name: 'Mask' });
 *   }, []);
 *
 *   return (
 *     <InteractiveImageSurface
 *       media={{ type: 'image', url: imageUrl }}
 *       state={state}
 *       handlers={handlers}
 *     />
 *   );
 * }
 * ```
 */

// Main component
export { InteractiveImageSurface, default } from './InteractiveImageSurface';
export type { InteractiveImageSurfaceHandle } from './InteractiveImageSurface';

// Demo component (reference implementation for mask editing)
export { InteractiveSurfaceDemo } from './InteractiveSurfaceDemo';

// Hooks
export { useInteractionLayer } from './useInteractionLayer';
export type {
  UseInteractionLayerOptions,
  UseInteractionLayerReturn,
} from './useInteractionLayer';

export {
  useCoordinateTransform,
  clampNormalized,
  normalizedDistance,
  lerpPoint,
  interpolateStroke,
  smoothPoints,
  getBoundingBox,
} from './useCoordinateTransform';

// Types
export type {
  // Geometry
  NormalizedPoint,
  ScreenPoint,
  NormalizedRect,
  Dimensions,
  // Events
  SurfacePointerEvent,
  SurfaceWheelEvent,
  // Modes & Tools
  InteractionMode,
  DrawToolConfig,
  // Elements
  SurfaceElement,
  PointElement,
  RegionElement,
  PolygonElement,
  StrokeElement,
  AnyElement,
  // Layers
  InteractionLayer,
  // State
  ViewState,
  SurfaceState,
  // Handlers
  SurfaceEventHandlers,
  // Props
  SurfaceMedia,
  InteractiveImageSurfaceProps,
  // Utils
  CoordinateTransform,
  HistoryEntry,
} from './types';
