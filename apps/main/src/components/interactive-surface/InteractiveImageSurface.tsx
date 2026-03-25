/**
 * InteractiveImageSurface
 *
 * A generic interactive surface that overlays an image or video.
 * Provides coordinate transformation, pointer event handling,
 * and a canvas for rendering overlays (masks, annotations, regions, etc.)
 *
 * Usage:
 * ```tsx
 * <InteractiveImageSurface
 *   media={{ type: 'image', url: '/path/to/image.jpg' }}
 *   state={surfaceState}
 *   handlers={{
 *     onPointerDown: (e) => console.log('Pointer at:', e.normalized),
 *     onPointerMove: (e) => { ... }
 *   }}
 * />
 * ```
 */

import {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';

import { drawVariableWidthCurve, traceSmoothPath } from './curveRenderUtils';
import type {
  InteractiveImageSurfaceProps,
  SurfacePointerEvent,
  SurfaceWheelEvent,
  Dimensions,
  ViewState,
  ScreenPoint,
  AnyElement,
  StrokeElement,
  PointElement,
  RegionElement,
  PolygonElement,
} from './types';
import { useCoordinateTransform } from './useCoordinateTransform';

// ============================================================================
// Default State
// ============================================================================

const DEFAULT_VIEW_STATE: ViewState = {
  zoom: 1,
  pan: { x: 0, y: 0 },
  fitMode: 'contain',
};

// ============================================================================
// Ref Handle
// ============================================================================

export interface InteractiveImageSurfaceHandle {
  /** Get the canvas element */
  getCanvas: () => HTMLCanvasElement | null;
  /** Get the image/video element */
  getMedia: () => HTMLImageElement | HTMLVideoElement | null;
  /** Force a redraw of the canvas */
  redraw: () => void;
  /** Export canvas content as data URL */
  exportCanvas: (type?: string, quality?: number) => string | null;
  /** Get current coordinate transform functions */
  getTransform: () => ReturnType<typeof useCoordinateTransform>;
}

// ============================================================================
// Component
// ============================================================================

export const InteractiveImageSurface = forwardRef<
  InteractiveImageSurfaceHandle,
  InteractiveImageSurfaceProps
>(function InteractiveImageSurface(
  {
    media,
    state,
    handlers = {},
    interactive = true,
    cursor,
    className = '',
    onMediaLoad,
    renderLayer,
    renderElement,
    children,
  },
  ref
) {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // State
  const [containerDimensions, setContainerDimensions] = useState<Dimensions>({
    width: 0,
    height: 0,
  });
  const [imageDimensions, setImageDimensions] = useState<Dimensions>(
    media.naturalDimensions ?? { width: 1, height: 1 }
  );
  const [isLoaded, setIsLoaded] = useState(false);

  // Derived state
  const viewState = state?.view ?? DEFAULT_VIEW_STATE;

  // Coordinate transform
  const transform = useCoordinateTransform({
    containerDimensions,
    imageDimensions,
    viewState,
  });

  // ============================================================================
  // Container resize observer
  // ============================================================================

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerDimensions({ width, height });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ============================================================================
  // Media load handling
  // ============================================================================

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const dimensions = { width: img.naturalWidth, height: img.naturalHeight };
      setImageDimensions(dimensions);
      setIsLoaded(true);
      onMediaLoad?.(dimensions);
    },
    [onMediaLoad]
  );

  const handleVideoLoadedMetadata = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = e.currentTarget;
      const dimensions = { width: video.videoWidth, height: video.videoHeight };
      setImageDimensions(dimensions);
      setIsLoaded(true);
      onMediaLoad?.(dimensions);
    },
    [onMediaLoad]
  );

  // ============================================================================
  // Pointer event conversion
  // ============================================================================

  const createSurfacePointerEvent = useCallback(
    (e: PointerEvent): SurfacePointerEvent => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return {
          nativeEvent: e,
          screen: { x: 0, y: 0 },
          normalized: { x: 0, y: 0 },
          pressure: e.pressure,
          pointerType: e.pointerType as 'mouse' | 'pen' | 'touch',
          withinBounds: false,
          timestamp: videoRef.current?.currentTime,
        };
      }

      const rect = canvas.getBoundingClientRect();
      const screen: ScreenPoint = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      const normalized = transform.screenToNormalized(screen);
      const withinBounds = transform.isWithinBounds(normalized);

      return {
        nativeEvent: e,
        screen,
        normalized,
        pressure: e.pressure || 0.5,
        pointerType: e.pointerType as 'mouse' | 'pen' | 'touch',
        withinBounds,
        timestamp: videoRef.current?.currentTime,
      };
    },
    [transform]
  );

  // ============================================================================
  // Event handlers
  // ============================================================================

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive) return;
      const surfaceEvent = createSurfacePointerEvent(e.nativeEvent);
      handlers.onPointerDown?.(surfaceEvent);

      // Capture pointer for drag
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [interactive, createSurfacePointerEvent, handlers]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive) return;
      const surfaceEvent = createSurfacePointerEvent(e.nativeEvent);
      handlers.onPointerMove?.(surfaceEvent);
    },
    [interactive, createSurfacePointerEvent, handlers]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive) return;
      const surfaceEvent = createSurfacePointerEvent(e.nativeEvent);
      handlers.onPointerUp?.(surfaceEvent);

      // Release pointer
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [interactive, createSurfacePointerEvent, handlers]
  );

  const handlePointerEnter = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive) return;
      const surfaceEvent = createSurfacePointerEvent(e.nativeEvent);
      handlers.onPointerEnter?.(surfaceEvent);
    },
    [interactive, createSurfacePointerEvent, handlers]
  );

  const handlePointerLeave = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive) return;
      const surfaceEvent = createSurfacePointerEvent(e.nativeEvent);
      handlers.onPointerLeave?.(surfaceEvent);
    },
    [interactive, createSurfacePointerEvent, handlers]
  );

  // Native non-passive wheel listener so preventDefault can block page scroll
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      if (!interactive || !handlers.onWheel) return;

      const rect = canvas.getBoundingClientRect();
      const screen: ScreenPoint = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      const normalized = transform.screenToNormalized(screen);
      const withinBounds = transform.isWithinBounds(normalized);

      if (withinBounds) {
        e.preventDefault();
      }

      const wheelEvent: SurfaceWheelEvent = {
        nativeEvent: e,
        screen,
        normalized,
        deltaY: e.deltaY,
        withinBounds,
        imageRect: transform.getImageRect(),
      };

      handlers.onWheel(wheelEvent);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [interactive, transform, handlers]);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!interactive || !handlers.onDoubleClick) return;

      // Convert to pointer event format
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const screen: ScreenPoint = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      const normalized = transform.screenToNormalized(screen);
      const withinBounds = transform.isWithinBounds(normalized);

      const surfaceEvent: SurfacePointerEvent = {
        nativeEvent: e.nativeEvent as unknown as PointerEvent,
        screen,
        normalized,
        pressure: 0.5,
        pointerType: 'mouse',
        withinBounds,
        timestamp: videoRef.current?.currentTime,
      };

      handlers.onDoubleClick(surfaceEvent);
    },
    [interactive, transform, handlers]
  );

  // ============================================================================
  // Canvas rendering
  // ============================================================================

  const renderElementDefault = useCallback(
    (element: AnyElement, ctx: CanvasRenderingContext2D) => {
      const imageRect = transform.getImageRect();

      const toScreenX = (nx: number) => nx * imageRect.width + imageRect.x;
      const toScreenY = (ny: number) => ny * imageRect.height + imageRect.y;
      const toScreen = (p: { x: number; y: number }) => ({
        x: toScreenX(p.x),
        y: toScreenY(p.y),
      });
      const tracePolygonPath = (poly: PolygonElement) => {
        if (poly.points.length < 2) return false;
        const curved = !!(poly.metadata as Record<string, unknown> | undefined)?.curved;
        const screenPts = poly.points.map(toScreen);

        if (curved && poly.points.length >= 3) {
          traceSmoothPath(ctx, screenPts, poly.closed, 0.5);
        } else {
          ctx.moveTo(screenPts[0].x, screenPts[0].y);
          for (let i = 1; i < screenPts.length; i++) {
            ctx.lineTo(screenPts[i].x, screenPts[i].y);
          }
          if (poly.closed) ctx.closePath();
        }
        return true;
      };

      switch (element.type) {
        case 'point': {
          const pt = element as PointElement;
          const x = toScreenX(pt.position.x);
          const y = toScreenY(pt.position.y);
          const size = (pt.style?.size ?? 8) * viewState.zoom;

          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fillStyle = pt.style?.color ?? '#ff0000';
          ctx.fill();

          if (pt.label) {
            ctx.font = `${12 * viewState.zoom}px sans-serif`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(pt.label, x + size + 4, y + 4);
          }
          break;
        }

        case 'region': {
          const region = element as RegionElement;
          const x = toScreenX(region.bounds.x);
          const y = toScreenY(region.bounds.y);
          const w = region.bounds.width * imageRect.width;
          const h = region.bounds.height * imageRect.height;

          if (region.style?.fillColor) {
            ctx.fillStyle = region.style.fillColor;
            ctx.fillRect(x, y, w, h);
          }

          ctx.strokeStyle = region.style?.strokeColor ?? '#00ff00';
          ctx.lineWidth = (region.style?.strokeWidth ?? 2) * viewState.zoom;
          ctx.strokeRect(x, y, w, h);

          if (region.label) {
            ctx.font = `${12 * viewState.zoom}px sans-serif`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(region.label, x + 4, y + 14 * viewState.zoom);
          }
          break;
        }

        case 'polygon': {
          const poly = element as PolygonElement;
          if (poly.points.length < 2) break;

          const hasVariableWidth = !poly.closed && poly.pointWidths && poly.pointWidths.length === poly.points.length;

          if (hasVariableWidth) {
            const curved = !!(poly.metadata as Record<string, unknown> | undefined)?.curved;
            ctx.strokeStyle = poly.style?.strokeColor ?? '#0000ff';
            const screenPts = poly.points.map(toScreen);
            const scaledWidths = poly.pointWidths!.map((w) => w * viewState.zoom);
            drawVariableWidthCurve(ctx, screenPts, scaledWidths, curved && poly.points.length >= 3);
          } else {
            ctx.beginPath();
            if (!tracePolygonPath(poly)) break;

            if (poly.style?.fillColor) {
              ctx.fillStyle = poly.style.fillColor;
              ctx.fill();
            }

            ctx.strokeStyle = poly.style?.strokeColor ?? '#0000ff';
            ctx.lineWidth = (poly.style?.strokeWidth ?? 2) * viewState.zoom;
            ctx.stroke();
          }

          // Show editable vertex handles for open polygons
          if (!poly.closed) {
            const hv = state.hoveredVertex;
            const isHoveredPoly = hv?.elementId === element.id;
            for (let i = 0; i < poly.points.length; i++) {
              const p = poly.points[i];
              const x = toScreenX(p.x);
              const y = toScreenY(p.y);
              const isHoveredVert = isHoveredPoly && hv!.vertexIndex === i;
              // Size handle proportional to point width if available
              const pw = poly.pointWidths?.[i];
              const handleRadius = pw != null
                ? Math.max(3, (pw / 2) * viewState.zoom)
                : Math.max(3, 5 * Math.min(2, viewState.zoom));
              // Width indicator ring for hovered vertex
              if (isHoveredVert && pw != null) {
                ctx.beginPath();
                ctx.arc(x, y, handleRadius + 3, 0, Math.PI * 2);
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 2;
                ctx.stroke();
              }
              ctx.beginPath();
              ctx.arc(x, y, handleRadius, 0, Math.PI * 2);
              ctx.fillStyle = isHoveredVert ? '#22c55e' : i === 0 ? '#f59e0b' : '#ffffff';
              ctx.globalAlpha = isHoveredVert ? 0.7 : pw != null ? 0.35 : 1;
              ctx.fill();
              ctx.globalAlpha = 1;
              ctx.strokeStyle = isHoveredVert ? '#ffffff' : '#111827';
              ctx.lineWidth = isHoveredVert ? 2 : 1;
              ctx.stroke();
            }
          }
          break;
        }

        case 'stroke': {
          const stroke = element as StrokeElement;
          if (stroke.points.length < 2) break;

          ctx.beginPath();
          ctx.moveTo(
            toScreenX(stroke.points[0].x),
            toScreenY(stroke.points[0].y)
          );

          for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(
              toScreenX(stroke.points[i].x),
              toScreenY(stroke.points[i].y)
            );
          }

          ctx.strokeStyle = stroke.isErase
            ? 'rgba(0,0,0,1)'
            : stroke.tool.color;
          ctx.lineWidth =
            // tool.size is normalized to image width; imageRect.width already includes zoom
            stroke.tool.size * imageRect.width;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.globalAlpha = stroke.tool.opacity;
          ctx.globalCompositeOperation = stroke.isErase
            ? 'destination-out'
            : 'source-over';
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          break;
        }

      }
    },
    [transform, viewState.zoom]
  );

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get layers from state
    const layers = state?.layers ?? [];

    // Sort layers by z-index
    const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

    // Render each layer
    for (const layer of sortedLayers) {
      if (!layer.visible) continue;

      ctx.save();
      ctx.globalAlpha = layer.opacity;

      if (renderLayer) {
        renderLayer(layer, ctx);
      } else {
        // Default layer rendering
        for (const element of layer.elements) {
          if (!element.visible) continue;

          // Check time range for video
          if (element.timeRange && state?.currentTime !== undefined) {
            const { start, end } = element.timeRange;
            if (state.currentTime < start || state.currentTime > end) {
              continue;
            }
          }

          if (renderElement) {
            renderElement(element, ctx);
          } else {
            renderElementDefault(element, ctx);
          }
        }
      }

      ctx.restore();
    }
  }, [state, renderLayer, renderElement, renderElementDefault]);

  // ============================================================================
  // Imperative handle (before layout effects so ref is available to renderLayer)
  // ============================================================================

  useImperativeHandle(
    ref,
    () => ({
      getCanvas: () => canvasRef.current,
      getMedia: () =>
        media.type === 'video' ? videoRef.current : imageRef.current,
      redraw: redrawCanvas,
      exportCanvas: (type = 'image/png', quality = 1) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        return canvas.toDataURL(type, quality);
      },
      getTransform: () => transform,
    }),
    [media.type, redrawCanvas, transform]
  );

  // Redraw on state change (useLayoutEffect prevents one-frame flash where
  // the image has repositioned but canvas strokes still show at old positions)
  useLayoutEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Sync canvas size with container
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use device pixel ratio for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerDimensions.width * dpr;
    canvas.height = containerDimensions.height * dpr;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    redrawCanvas();
  }, [containerDimensions, redrawCanvas]);

  // ============================================================================
  // Computed styles
  // ============================================================================

  const imageRect = transform.getImageRect();

  const mediaStyle = useMemo(
    () => ({
      position: 'absolute' as const,
      left: imageRect.x,
      top: imageRect.y,
      width: imageRect.width,
      height: imageRect.height,
      // Override global img/video resets (e.g. Tailwind preflight max-width:100%)
      // so zoomed media can exceed the container without aspect distortion.
      maxWidth: 'none' as const,
      maxHeight: 'none' as const,
      pointerEvents: 'none' as const,
    }),
    [imageRect]
  );

  const canvasStyle = useMemo(
    () => ({
      position: 'absolute' as const,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      cursor: cursor ?? (interactive ? 'crosshair' : 'default'),
    }),
    [cursor, interactive]
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{ width: '100%', height: '100%' }}
    >
      {/* Media layer (image or video) */}
      {media.type === 'video' ? (
        <video
          ref={videoRef}
          src={media.url}
          style={mediaStyle}
          onLoadedMetadata={handleVideoLoadedMetadata}
          muted
          playsInline
        />
      ) : (
        <img
          ref={imageRef}
          src={media.url}
          alt=""
          style={mediaStyle}
          onLoad={handleImageLoad}
          draggable={false}
        />
      )}

      {/* Interaction canvas layer */}
      <canvas
        ref={canvasRef}
        style={canvasStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onDoubleClick={handleDoubleClick}
      />

      {/* Additional overlay content - positioned to match image display rect */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: imageRect.x,
          top: imageRect.y,
          width: imageRect.width,
          height: imageRect.height,
        }}
      >
        {children}
      </div>

      {/* Loading indicator */}
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/50">
          <div className="text-neutral-400">Loading...</div>
        </div>
      )}
    </div>
  );
});

export default InteractiveImageSurface;
