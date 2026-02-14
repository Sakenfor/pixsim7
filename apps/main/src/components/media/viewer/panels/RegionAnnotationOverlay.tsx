/**
 * RegionAnnotationOverlay
 *
 * Interactive overlay for drawing and editing region annotations on assets.
 * Uses InteractiveImageSurface for rendering and handles region creation.
 */

import {
  distance,
  moveVertex,
  pointInPolygon,
  clampNormalized,
  movePolygon,
  polygonHitTest,
  insertVertexOnEdge,
  removeVertex,
  translateRect,
  clampRectNormalized,
  getRectHandles,
  findRectHandle,
  resizeRectByHandle,
  type Rect,
} from '@pixsim7/graphics.geometry';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ViewerAsset } from '@features/assets';
import {
  useAssetRegionStore,
  type AssetRegion,
  type AssetRegionStoreHook,
} from '@features/mediaViewer';

import {
  InteractiveImageSurface,
  useInteractionLayer,
  type InteractiveImageSurfaceHandle,
  type SurfacePointerEvent,
  type NormalizedPoint,
  type RegionElement,
  type PolygonElement,
} from '@/components/interactive-surface';
import { useResolvedAssetMedia } from '@/hooks/useResolvedAssetMedia';


import type { ViewerSettings } from '../types';


// ============================================================================
// Types
// ============================================================================

interface RegionAnnotationOverlayProps {
  asset: ViewerAsset;
  settings: ViewerSettings;
  onRegionCreated?: (region: AssetRegion) => void;
  onRegionSelected?: (regionId: string | null) => void;
  useRegionStore?: AssetRegionStoreHook;
}

// ============================================================================
// Constants
// ============================================================================

const REGION_COLORS = [
  { stroke: '#22c55e', fill: 'rgba(34, 197, 94, 0.15)' },
  { stroke: '#3b82f6', fill: 'rgba(59, 130, 246, 0.15)' },
  { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.15)' },
  { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.15)' },
  { stroke: '#8b5cf6', fill: 'rgba(139, 92, 246, 0.15)' },
  { stroke: '#ec4899', fill: 'rgba(236, 72, 153, 0.15)' },
];

/** Threshold for vertex hit detection (normalized, 3% of viewport) */
const VERTEX_HIT_THRESHOLD = 0.03;

/** Threshold for polygon auto-close detection (normalized, 3% of viewport) */
const CLOSE_THRESHOLD = 0.03;

/** Threshold for edge hit detection (normalized, 2% of viewport) */
const EDGE_HIT_THRESHOLD = 0.02;

/** Threshold for click vs drag discrimination (normalized) */
const DRAG_THRESHOLD = 0.005;

/** Threshold for rect handle hit detection (normalized, 2.5% of viewport) */
const RECT_HANDLE_THRESHOLD = 0.025;

/** Cursor name per handle index */
const HANDLE_CURSORS: Record<number, string> = {
  0: 'nwse-resize', // top-left
  1: 'nesw-resize', // top-right
  2: 'nwse-resize', // bottom-right
  3: 'nesw-resize', // bottom-left
  4: 'ns-resize',   // top-mid
  5: 'ew-resize',   // right-mid
  6: 'ns-resize',   // bottom-mid
  7: 'ew-resize',   // left-mid
};

// ============================================================================
// Component
// ============================================================================

export function RegionAnnotationOverlay({
  asset,
  settings: _settings,
  onRegionCreated,
  onRegionSelected,
  useRegionStore: regionStore,
}: RegionAnnotationOverlayProps) {
  void _settings; // Reserved for future use
  const useRegionStore = regionStore ?? useAssetRegionStore;
  const surfaceRef = useRef<InteractiveImageSurfaceHandle>(null);

  // Store state
  const regions = useRegionStore((s) => s.getRegions(asset.id));
  const selectedRegionId = useRegionStore((s) => s.selectedRegionId);
  const drawingMode = useRegionStore((s) => s.drawingMode);
  const addRegion = useRegionStore((s) => s.addRegion);
  const updateRegion = useRegionStore((s) => s.updateRegion);
  const selectRegion = useRegionStore((s) => s.selectRegion);
  const getRegion = useRegionStore((s) => s.getRegion);

  // Local drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<NormalizedPoint | null>(null);
  const [currentRect, setCurrentRect] = useState<Rect | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<NormalizedPoint[]>([]);
  const [cursorPosition, setCursorPosition] = useState<NormalizedPoint | null>(null);

  // Polygon edit mode state
  const [editingPolygonId, setEditingPolygonId] = useState<string | null>(null);
  const [hoveredVertexIndex, setHoveredVertexIndex] = useState(-1);
  const [draggingVertexIndex, setDraggingVertexIndex] = useState(-1);
  const [vertexDragStartPoints, setVertexDragStartPoints] = useState<NormalizedPoint[] | null>(null);
  const [hoveredEdgeIndex, setHoveredEdgeIndex] = useState(-1);

  // Rect edit mode state
  const [editingRectId, setEditingRectId] = useState<string | null>(null);
  const [draggingHandleIndex, setDraggingHandleIndex] = useState(-1);
  const [handleDragStartBounds, setHandleDragStartBounds] = useState<Rect | null>(null);
  const [hoveredHandleIndex, setHoveredHandleIndex] = useState(-1);

  // Region dragging (both types)
  const [isDraggingRegion, setIsDraggingRegion] = useState(false);
  const [regionDragStart, setRegionDragStart] = useState<NormalizedPoint | null>(null);
  const [regionDragOriginalBounds, setRegionDragOriginalBounds] = useState<Rect | null>(null);
  const [regionDragOriginalPoints, setRegionDragOriginalPoints] = useState<NormalizedPoint[] | null>(null);

  // Modifier key tracking (for vertex removal hint)
  const [modifierHeld, setModifierHeld] = useState(false);

  // Derived
  const editingRegionId = editingPolygonId ?? editingRectId;

  // Initialize interaction layer
  const {
    state,
    handlers: baseHandlers,
    addLayer,
    getLayer,
    addElement,
    removeElement,
    setMode,
  } = useInteractionLayer({
    initialMode: drawingMode === 'select' ? 'view' : 'region',
  });

  // ============================================================================
  // Effects
  // ============================================================================

  // Create region layer on mount
  useEffect(() => {
    if (!getLayer('regions')) {
      addLayer({
        type: 'region',
        name: 'Regions',
        id: 'regions',
      });
    }
  }, [addLayer, getLayer]);

  // Sync store regions to layer elements
  useEffect(() => {
    const layer = getLayer('regions');
    if (!layer) return;

    // Clear existing elements
    for (const el of layer.elements) {
      removeElement('regions', el.id);
    }

    // Add regions from store
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      const colorIndex = i % REGION_COLORS.length;
      const colors = REGION_COLORS[colorIndex];
      const isSelected = region.id === selectedRegionId;

      if (region.type === 'rect' && region.bounds) {
        addElement('regions', {
          type: 'region',
          visible: true,
          bounds: region.bounds,
          label: region.label || '',
          style: {
            strokeColor: isSelected ? '#ffffff' : colors.stroke,
            fillColor: isSelected ? 'rgba(255, 255, 255, 0.2)' : colors.fill,
            strokeWidth: isSelected ? 3 : 2,
          },
          metadata: { storeId: region.id },
        } as Omit<RegionElement, 'id' | 'layerId'>);
      } else if (region.type === 'polygon' && region.points) {
        addElement('regions', {
          type: 'polygon',
          visible: true,
          points: region.points,
          closed: true,
          style: {
            strokeColor: isSelected ? '#ffffff' : colors.stroke,
            fillColor: isSelected ? 'rgba(255, 255, 255, 0.2)' : colors.fill,
            strokeWidth: isSelected ? 3 : 2,
          },
          metadata: { storeId: region.id },
        } as Omit<PolygonElement, 'id' | 'layerId'>);
      }
    }
  }, [regions, selectedRegionId, addElement, removeElement, getLayer]);

  // Update interaction mode when drawing mode changes
  useEffect(() => {
    if (drawingMode === 'select') {
      setMode('view');
    } else {
      setMode('region');
    }
  }, [drawingMode, setMode]);

  // Clear all edit state
  const exitEditMode = useCallback(() => {
    setEditingPolygonId(null);
    setEditingRectId(null);
    setHoveredVertexIndex(-1);
    setHoveredEdgeIndex(-1);
    setHoveredHandleIndex(-1);
    setDraggingVertexIndex(-1);
    setDraggingHandleIndex(-1);
    setVertexDragStartPoints(null);
    setHandleDragStartBounds(null);
    setIsDraggingRegion(false);
    setRegionDragStart(null);
    setRegionDragOriginalBounds(null);
    setRegionDragOriginalPoints(null);
  }, []);

  // Exit edit mode when drawing mode changes away from select
  useEffect(() => {
    if (drawingMode !== 'select') {
      exitEditMode();
    }
  }, [drawingMode, exitEditMode]);

  // Modifier key tracking
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey) setModifierHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey && !e.ctrlKey) setModifierHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // ============================================================================
  // Drawing & Editing Handlers
  // ============================================================================

  // Helper to get the editing polygon's points
  const getEditingPolygonPoints = useCallback((): NormalizedPoint[] | null => {
    if (!editingPolygonId) return null;
    const region = regions.find((r) => r.id === editingPolygonId);
    return region?.points ?? null;
  }, [editingPolygonId, regions]);

  const handlePointerDown = useCallback(
    (event: SurfacePointerEvent) => {
      if (!event.withinBounds) return;
      const isRightClick = event.nativeEvent.button === 2;

      // ---- Rect edit mode ----
      if (editingRectId) {
        const editingRegion = regions.find((r) => r.id === editingRectId);
        if (editingRegion?.bounds) {
          // Check handle hit
          const handleIdx = findRectHandle(event.normalized, editingRegion.bounds, RECT_HANDLE_THRESHOLD);
          if (handleIdx >= 0 && !isRightClick) {
            setDraggingHandleIndex(handleIdx);
            setHandleDragStartBounds({ ...editingRegion.bounds });
            return;
          }
          // Check inside rect -> start drag
          const { x, y, width, height } = editingRegion.bounds;
          if (
            event.normalized.x >= x && event.normalized.x <= x + width &&
            event.normalized.y >= y && event.normalized.y <= y + height
          ) {
            if (!isRightClick) {
              setIsDraggingRegion(true);
              setRegionDragStart(event.normalized);
              setRegionDragOriginalBounds({ ...editingRegion.bounds });
            }
            return;
          }
        }
        // Click outside -> exit edit mode
        exitEditMode();
        return;
      }

      // ---- Polygon edit mode ----
      if (editingPolygonId) {
        const points = getEditingPolygonPoints();
        if (points) {
          const hit = polygonHitTest(event.normalized, points, VERTEX_HIT_THRESHOLD, EDGE_HIT_THRESHOLD);

          // Right-click or modifier+click vertex -> remove vertex
          if (hit.vertexIndex >= 0 && (isRightClick || modifierHeld)) {
            const newPoints = removeVertex(points, hit.vertexIndex);
            if (newPoints) {
              updateRegion(asset.id, editingPolygonId, { points: newPoints });
              setHoveredVertexIndex(-1);
            }
            return;
          }

          // Vertex drag
          if (hit.vertexIndex >= 0 && !isRightClick) {
            setDraggingVertexIndex(hit.vertexIndex);
            setVertexDragStartPoints([...points]);
            return;
          }

          // Edge insert (auto-start drag on inserted vertex)
          if (hit.edgeIndex >= 0 && !isRightClick) {
            const newPoints = insertVertexOnEdge(points, event.normalized, EDGE_HIT_THRESHOLD);
            if (newPoints.length > points.length) {
              updateRegion(asset.id, editingPolygonId, { points: newPoints });
              const insertedIndex = hit.edgeIndex + 1;
              setDraggingVertexIndex(insertedIndex);
              setVertexDragStartPoints([...newPoints]);
              setHoveredEdgeIndex(-1);
            }
            return;
          }

          // Inside polygon -> drag whole polygon
          if (hit.isInside && !isRightClick) {
            setIsDraggingRegion(true);
            setRegionDragStart(event.normalized);
            setRegionDragOriginalPoints([...points]);
            return;
          }
        }
        // Click outside -> exit edit mode
        exitEditMode();
        return;
      }

      // ---- Select mode ----
      if (drawingMode === 'select') {
        const clickedRegion = findRegionAtPoint(regions, event.normalized);
        if (clickedRegion && !isRightClick) {
          selectRegion(clickedRegion.id);
          onRegionSelected?.(clickedRegion.id);
          // Prepare for potential drag
          setRegionDragStart(event.normalized);
          if (clickedRegion.type === 'rect' && clickedRegion.bounds) {
            setRegionDragOriginalBounds({ ...clickedRegion.bounds });
          } else if (clickedRegion.type === 'polygon' && clickedRegion.points) {
            setRegionDragOriginalPoints([...clickedRegion.points]);
          }
        } else if (!isRightClick) {
          selectRegion(null);
          onRegionSelected?.(null);
        }
        return;
      }

      // ---- Drawing modes (unchanged) ----
      if (isRightClick) return;

      if (drawingMode === 'rect') {
        setIsDrawing(true);
        setDrawStart(event.normalized);
        setCurrentRect({
          x: event.normalized.x,
          y: event.normalized.y,
          width: 0,
          height: 0,
        });
      } else if (drawingMode === 'polygon') {
        if (polygonPoints.length >= 3) {
          const first = polygonPoints[0];
          if (distance(event.normalized, first) < CLOSE_THRESHOLD) {
            const colorIndex = regions.length % REGION_COLORS.length;
            const colors = REGION_COLORS[colorIndex];
            const regionId = addRegion(asset.id, {
              type: 'polygon',
              points: polygonPoints,
              label: `Region ${regions.length + 1}`,
              style: { strokeColor: colors.stroke, fillColor: colors.fill },
            });
            selectRegion(regionId);
            setPolygonPoints([]);
            setCursorPosition(null);
            const region = getRegion(asset.id, regionId);
            if (region) onRegionCreated?.(region);
            return;
          }
        }
        setPolygonPoints((prev) => [...prev, event.normalized]);
      }
    },
    [drawingMode, regions, polygonPoints, selectRegion, onRegionSelected, editingPolygonId, editingRectId, getEditingPolygonPoints, addRegion, getRegion, onRegionCreated, asset.id, modifierHeld, updateRegion, exitEditMode]
  );

  const handlePointerMove = useCallback(
    (event: SurfacePointerEvent) => {
      // 1. Track cursor for polygon preview line
      if (drawingMode === 'polygon' && polygonPoints.length > 0) {
        setCursorPosition(event.normalized);
      }

      // 2. Rect handle drag
      if (editingRectId && draggingHandleIndex >= 0 && handleDragStartBounds) {
        const newBounds = resizeRectByHandle(handleDragStartBounds, draggingHandleIndex, event.normalized);
        const clamped = clampRectNormalized(newBounds);
        updateRegion(asset.id, editingRectId, { bounds: clamped });
        return;
      }

      // 3. Region drag (both types)
      if (isDraggingRegion && regionDragStart && selectedRegionId) {
        const dx = event.normalized.x - regionDragStart.x;
        const dy = event.normalized.y - regionDragStart.y;

        if (regionDragOriginalBounds) {
          const moved = translateRect(regionDragOriginalBounds, dx, dy);
          const clamped = clampRectNormalized(moved);
          updateRegion(asset.id, selectedRegionId, { bounds: clamped });
        } else if (regionDragOriginalPoints) {
          const moved = movePolygon(regionDragOriginalPoints, { x: dx, y: dy });
          updateRegion(asset.id, selectedRegionId, { points: moved });
        }
        return;
      }

      // 4. Drag threshold check (select mode) - promote to drag if threshold exceeded
      if (drawingMode === 'select' && regionDragStart && !isDraggingRegion && selectedRegionId) {
        const dx = Math.abs(event.normalized.x - regionDragStart.x);
        const dy = Math.abs(event.normalized.y - regionDragStart.y);
        if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
          setIsDraggingRegion(true);
        }
        return;
      }

      // 5. Vertex drag (polygon edit mode)
      if (editingPolygonId && draggingVertexIndex >= 0 && vertexDragStartPoints) {
        const newPosition = clampNormalized(event.normalized);
        const newPoints = moveVertex(vertexDragStartPoints, draggingVertexIndex, newPosition);
        updateRegion(asset.id, editingPolygonId, { points: newPoints });
        return;
      }

      // 6. Polygon edit hover (vertex + edge)
      if (editingPolygonId && draggingVertexIndex < 0) {
        const points = getEditingPolygonPoints();
        if (points) {
          const hit = polygonHitTest(event.normalized, points, VERTEX_HIT_THRESHOLD, EDGE_HIT_THRESHOLD);
          if (hit.vertexIndex !== hoveredVertexIndex) {
            setHoveredVertexIndex(hit.vertexIndex);
          }
          if (hit.vertexIndex < 0 && hit.edgeIndex !== hoveredEdgeIndex) {
            setHoveredEdgeIndex(hit.edgeIndex);
          } else if (hit.vertexIndex >= 0 && hoveredEdgeIndex >= 0) {
            setHoveredEdgeIndex(-1);
          }
        }
        return;
      }

      // 7. Rect edit hover (handle detection)
      if (editingRectId && draggingHandleIndex < 0) {
        const editingRegion = regions.find((r) => r.id === editingRectId);
        if (editingRegion?.bounds) {
          const handleIdx = findRectHandle(event.normalized, editingRegion.bounds, RECT_HANDLE_THRESHOLD);
          if (handleIdx !== hoveredHandleIndex) {
            setHoveredHandleIndex(handleIdx);
          }
        }
        return;
      }

      // 8. Rect drawing (existing)
      if (!isDrawing || !drawStart || drawingMode !== 'rect') return;

      const x = Math.min(drawStart.x, event.normalized.x);
      const y = Math.min(drawStart.y, event.normalized.y);
      const width = Math.abs(event.normalized.x - drawStart.x);
      const height = Math.abs(event.normalized.y - drawStart.y);

      setCurrentRect({ x, y, width, height });
    },
    [isDrawing, drawStart, drawingMode, polygonPoints, editingPolygonId, editingRectId, draggingVertexIndex, draggingHandleIndex, vertexDragStartPoints, hoveredVertexIndex, hoveredEdgeIndex, hoveredHandleIndex, getEditingPolygonPoints, updateRegion, asset.id, isDraggingRegion, regionDragStart, regionDragOriginalBounds, regionDragOriginalPoints, selectedRegionId, handleDragStartBounds, regions]
  );

  const handlePointerUp = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_event: SurfacePointerEvent) => {
      // End handle drag
      if (draggingHandleIndex >= 0) {
        setDraggingHandleIndex(-1);
        setHandleDragStartBounds(null);
        return;
      }

      // End region drag
      if (isDraggingRegion) {
        setIsDraggingRegion(false);
        setRegionDragStart(null);
        setRegionDragOriginalBounds(null);
        setRegionDragOriginalPoints(null);
        return;
      }

      // End vertex drag
      if (draggingVertexIndex >= 0) {
        setDraggingVertexIndex(-1);
        setVertexDragStartPoints(null);
        return;
      }

      // Clean up select mode drag start (didn't pass threshold)
      if (regionDragStart) {
        setRegionDragStart(null);
        setRegionDragOriginalBounds(null);
        setRegionDragOriginalPoints(null);
      }

      // Rect drawing completion
      if (!isDrawing || drawingMode !== 'rect' || !currentRect) {
        setIsDrawing(false);
        return;
      }

      // Minimum size check
      if (currentRect.width > 0.01 && currentRect.height > 0.01) {
        const colorIndex = regions.length % REGION_COLORS.length;
        const colors = REGION_COLORS[colorIndex];

        const regionId = addRegion(asset.id, {
          type: 'rect',
          bounds: currentRect,
          label: `Region ${regions.length + 1}`,
          style: {
            strokeColor: colors.stroke,
            fillColor: colors.fill,
          },
        });

        selectRegion(regionId);
        const region = getRegion(asset.id, regionId);
        if (region) {
          onRegionCreated?.(region);
        }
      }

      setIsDrawing(false);
      setDrawStart(null);
      setCurrentRect(null);
    },
    [isDrawing, drawingMode, currentRect, regions.length, asset.id, addRegion, selectRegion, getRegion, onRegionCreated, draggingVertexIndex, draggingHandleIndex, isDraggingRegion, regionDragStart]
  );

  const handleDoubleClick = useCallback(
    (event: SurfacePointerEvent) => {
      // Complete polygon on double-click when drawing
      if (drawingMode === 'polygon' && polygonPoints.length >= 3) {
        const colorIndex = regions.length % REGION_COLORS.length;
        const colors = REGION_COLORS[colorIndex];

        const regionId = addRegion(asset.id, {
          type: 'polygon',
          points: polygonPoints,
          label: `Region ${regions.length + 1}`,
          style: {
            strokeColor: colors.stroke,
            fillColor: colors.fill,
          },
        });

        selectRegion(regionId);
        setPolygonPoints([]);
        setCursorPosition(null);
        const region = getRegion(asset.id, regionId);
        if (region) {
          onRegionCreated?.(region);
        }
        return;
      }

      // Enter edit mode on double-click (when in select mode)
      if (drawingMode === 'select' && !editingRegionId) {
        const clickedRegion = findRegionAtPoint(regions, event.normalized);
        if (clickedRegion) {
          if (clickedRegion.type === 'polygon' && clickedRegion.points) {
            setEditingPolygonId(clickedRegion.id);
            selectRegion(clickedRegion.id);
            onRegionSelected?.(clickedRegion.id);
          } else if (clickedRegion.type === 'rect' && clickedRegion.bounds) {
            setEditingRectId(clickedRegion.id);
            selectRegion(clickedRegion.id);
            onRegionSelected?.(clickedRegion.id);
          }
        }
      }
    },
    [drawingMode, polygonPoints, regions, asset.id, addRegion, selectRegion, getRegion, onRegionCreated, editingRegionId, onRegionSelected]
  );

  // Combine handlers
  const handlers = useMemo(
    () => ({
      ...baseHandlers,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onDoubleClick: handleDoubleClick,
    }),
    [baseHandlers, handlePointerDown, handlePointerMove, handlePointerUp, handleDoubleClick]
  );

  // ============================================================================
  // Render
  // ============================================================================

  // Use authenticated fetching for backend URLs
  const rawMediaUrl = asset.fullUrl || asset.url;
  const { mediaSrc: resolvedMediaSrc, mediaLoading } = useResolvedAssetMedia({
    mediaUrl: rawMediaUrl,
  });

  const media = useMemo(
    () => ({
      type: asset.type as 'image' | 'video',
      url: resolvedMediaSrc || '',
    }),
    [asset.type, resolvedMediaSrc]
  );

  // Determine cursor based on state
  const cursor = useMemo(() => {
    if (isDraggingRegion) return 'move';
    if (draggingHandleIndex >= 0) return HANDLE_CURSORS[draggingHandleIndex] ?? 'default';
    if (draggingVertexIndex >= 0) return 'grabbing';
    if (hoveredHandleIndex >= 0) return HANDLE_CURSORS[hoveredHandleIndex] ?? 'default';
    if (hoveredVertexIndex >= 0 && modifierHeld) return 'not-allowed';
    if (hoveredVertexIndex >= 0) return 'pointer';
    if (hoveredEdgeIndex >= 0) return 'copy';
    if (editingPolygonId || editingRectId) return 'default';
    if (drawingMode === 'select') return 'pointer';
    return 'crosshair';
  }, [isDraggingRegion, draggingHandleIndex, draggingVertexIndex, hoveredHandleIndex, hoveredVertexIndex, hoveredEdgeIndex, editingPolygonId, editingRectId, drawingMode, modifierHeld]);

  // Show loading state while fetching authenticated media
  if (mediaLoading || !resolvedMediaSrc) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-neutral-900/50">
        <div className="animate-spin w-8 h-8 border-2 border-neutral-300 border-t-neutral-600 rounded-full" />
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-full"
      onContextMenu={editingRegionId ? (e) => e.preventDefault() : undefined}
    >
      <InteractiveImageSurface
        ref={surfaceRef}
        media={media}
        state={state}
        handlers={handlers}
        cursor={cursor}
        className="w-full h-full"
      >
        {/* Current rect being drawn */}
        {isDrawing && currentRect && (
          <div
            className="absolute border-2 border-dashed border-white bg-white/10 pointer-events-none"
            style={{
              left: `${currentRect.x * 100}%`,
              top: `${currentRect.y * 100}%`,
              width: `${currentRect.width * 100}%`,
              height: `${currentRect.height * 100}%`,
            }}
          />
        )}

        {/* Polygon points being drawn */}
        {polygonPoints.length > 0 && (() => {
          const first = polygonPoints[0];
          const last = polygonPoints[polygonPoints.length - 1];
          const isNearClose = cursorPosition && polygonPoints.length >= 3 &&
            distance(cursorPosition, first) < CLOSE_THRESHOLD;

          return (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polyline
                points={polygonPoints.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
                fill="rgba(255,255,255,0.1)"
                stroke="white"
                strokeWidth="0.3"
                strokeDasharray="1,1"
              />
              {/* Preview line from last point to cursor */}
              {cursorPosition && (
                <line
                  x1={last.x * 100}
                  y1={last.y * 100}
                  x2={cursorPosition.x * 100}
                  y2={cursorPosition.y * 100}
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth="0.2"
                  strokeDasharray="0.6,0.6"
                />
              )}
              {/* Close preview line from cursor to first point when near */}
              {isNearClose && cursorPosition && (
                <line
                  x1={cursorPosition.x * 100}
                  y1={cursorPosition.y * 100}
                  x2={first.x * 100}
                  y2={first.y * 100}
                  stroke="rgba(34, 197, 94, 0.7)"
                  strokeWidth="0.2"
                  strokeDasharray="0.6,0.6"
                />
              )}
              {/* Vertex dots */}
              {polygonPoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x * 100}
                  cy={p.y * 100}
                  r={i === 0 && isNearClose ? 1.2 : 0.8}
                  fill={i === 0 && isNearClose ? '#22c55e' : 'white'}
                  stroke={i === 0 && isNearClose ? 'white' : 'none'}
                  strokeWidth={i === 0 && isNearClose ? 0.2 : 0}
                />
              ))}
            </svg>
          );
        })()}

        {/* Polygon edit mode: edge highlight */}
        {editingPolygonId && hoveredEdgeIndex >= 0 && (() => {
          const editingRegion = regions.find((r) => r.id === editingPolygonId);
          if (!editingRegion?.points) return null;
          const points = editingRegion.points;
          const ei = hoveredEdgeIndex;
          const ej = (ei + 1) % points.length;
          const p1 = points[ei];
          const p2 = points[ej];
          const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

          return (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <line
                x1={p1.x * 100} y1={p1.y * 100}
                x2={p2.x * 100} y2={p2.y * 100}
                stroke="#22c55e" strokeWidth="0.4"
              />
              <circle
                cx={mid.x * 100} cy={mid.y * 100}
                r={0.7}
                fill="#22c55e" fillOpacity={0.7}
                stroke="white" strokeWidth={0.15}
              />
            </svg>
          );
        })()}

        {/* Polygon edit mode: vertex handles */}
        {editingPolygonId && (() => {
          const editingRegion = regions.find((r) => r.id === editingPolygonId);
          if (!editingRegion?.points) return null;
          const colorIndex = regions.indexOf(editingRegion) % REGION_COLORS.length;
          const accentColor = REGION_COLORS[colorIndex].stroke;

          return (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {editingRegion.points.map((p, i) => {
                const isHovered = i === hoveredVertexIndex;
                const isDragging = i === draggingVertexIndex;
                const showRemoveHint = isHovered && modifierHeld;
                const radius = (isHovered || isDragging) ? 0.9 : 0.6;

                return (
                  <circle
                    key={i}
                    cx={p.x * 100}
                    cy={p.y * 100}
                    r={radius}
                    fill={showRemoveHint ? '#ef4444' : isDragging ? accentColor : 'white'}
                    stroke={showRemoveHint ? 'white' : isDragging ? 'white' : accentColor}
                    strokeWidth={isDragging ? 0.3 : 0.15}
                    style={{ pointerEvents: 'none' }}
                  />
                );
              })}
            </svg>
          );
        })()}

        {/* Rect edit mode: handles */}
        {editingRectId && (() => {
          const editingRegion = regions.find((r) => r.id === editingRectId);
          if (!editingRegion?.bounds) return null;
          const colorIndex = regions.indexOf(editingRegion) % REGION_COLORS.length;
          const accentColor = REGION_COLORS[colorIndex].stroke;
          const handles = getRectHandles(editingRegion.bounds);
          const { x, y, width, height } = editingRegion.bounds;

          return (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {/* Dashed border */}
              <rect
                x={x * 100} y={y * 100}
                width={width * 100} height={height * 100}
                fill="none" stroke={accentColor}
                strokeWidth="0.3" strokeDasharray="1,1"
              />
              {/* Corner handles (squares) */}
              {handles.slice(0, 4).map((h, i) => {
                const isActive = i === hoveredHandleIndex || i === draggingHandleIndex;
                const size = isActive ? 1.4 : 1.0;
                return (
                  <rect
                    key={`corner-${i}`}
                    x={h.x * 100 - size / 2}
                    y={h.y * 100 - size / 2}
                    width={size} height={size}
                    fill={isActive ? accentColor : 'white'}
                    stroke={isActive ? 'white' : accentColor}
                    strokeWidth={0.15}
                  />
                );
              })}
              {/* Edge midpoint handles (circles) */}
              {handles.slice(4).map((h, i) => {
                const handleIdx = i + 4;
                const isActive = handleIdx === hoveredHandleIndex || handleIdx === draggingHandleIndex;
                const radius = isActive ? 0.8 : 0.5;
                return (
                  <circle
                    key={`edge-${i}`}
                    cx={h.x * 100} cy={h.y * 100}
                    r={radius}
                    fill={isActive ? accentColor : 'white'}
                    stroke={isActive ? 'white' : accentColor}
                    strokeWidth={0.15}
                  />
                );
              })}
            </svg>
          );
        })()}
      </InteractiveImageSurface>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Find a region at a given normalized point
 */
function findRegionAtPoint(
  regions: AssetRegion[],
  point: NormalizedPoint
): AssetRegion | null {
  // Check in reverse order (top-most first)
  for (let i = regions.length - 1; i >= 0; i--) {
    const region = regions[i];

    if (region.type === 'rect' && region.bounds) {
      const { x, y, width, height } = region.bounds;
      if (
        point.x >= x &&
        point.x <= x + width &&
        point.y >= y &&
        point.y <= y + height
      ) {
        return region;
      }
    } else if (region.type === 'polygon' && region.points) {
      if (pointInPolygon(point, region.points)) {
        return region;
      }
    }
  }

  return null;
}
