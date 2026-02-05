/**
 * RegionAnnotationOverlay
 *
 * Interactive overlay for drawing and editing region annotations on assets.
 * Uses InteractiveImageSurface for rendering and handles region creation.
 */

import {
  findNearestVertex,
  moveVertex,
  pointInPolygon,
  clampNormalized,
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
  const [currentRect, setCurrentRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<NormalizedPoint[]>([]);

  // Edit mode state
  const [editingPolygonId, setEditingPolygonId] = useState<string | null>(null);
  const [hoveredVertexIndex, setHoveredVertexIndex] = useState(-1);
  const [draggingVertexIndex, setDraggingVertexIndex] = useState(-1);
  const [vertexDragStartPoints, setVertexDragStartPoints] = useState<NormalizedPoint[] | null>(null);

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

  // ============================================================================
  // Drawing Handlers
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

      // Handle edit mode - vertex dragging
      if (editingPolygonId) {
        const points = getEditingPolygonPoints();
        if (points) {
          const vertexResult = findNearestVertex(event.normalized, points, VERTEX_HIT_THRESHOLD);
          if (vertexResult.index >= 0) {
            // Start vertex drag
            setDraggingVertexIndex(vertexResult.index);
            setVertexDragStartPoints([...points]);
            return;
          }
        }
        // Click outside vertices - exit edit mode
        setEditingPolygonId(null);
        setHoveredVertexIndex(-1);
        return;
      }

      if (drawingMode === 'select') {
        // Try to find which region was clicked
        const clickedRegion = findRegionAtPoint(regions, event.normalized);
        const newSelectedId = clickedRegion?.id ?? null;
        selectRegion(newSelectedId);
        onRegionSelected?.(newSelectedId);
        return;
      }

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
        setPolygonPoints((prev) => [...prev, event.normalized]);
      }
    },
    [drawingMode, regions, selectRegion, onRegionSelected, editingPolygonId, getEditingPolygonPoints]
  );

  const handlePointerMove = useCallback(
    (event: SurfacePointerEvent) => {
      // Handle vertex dragging
      if (editingPolygonId && draggingVertexIndex >= 0 && vertexDragStartPoints) {
        // Calculate new vertex position, clamped to normalized bounds
        const newPosition = clampNormalized(event.normalized);

        // Use shared geometry function to update vertex
        const newPoints = moveVertex(vertexDragStartPoints, draggingVertexIndex, newPosition);

        // Update the region in the store
        updateRegion(asset.id, editingPolygonId, { points: newPoints });
        return;
      }

      // Handle hover state in edit mode
      if (editingPolygonId && draggingVertexIndex < 0) {
        const points = getEditingPolygonPoints();
        if (points) {
          const vertexResult = findNearestVertex(event.normalized, points, VERTEX_HIT_THRESHOLD);
          if (vertexResult.index !== hoveredVertexIndex) {
            setHoveredVertexIndex(vertexResult.index);
          }
        }
        return;
      }

      if (!isDrawing || !drawStart || drawingMode !== 'rect') return;

      const x = Math.min(drawStart.x, event.normalized.x);
      const y = Math.min(drawStart.y, event.normalized.y);
      const width = Math.abs(event.normalized.x - drawStart.x);
      const height = Math.abs(event.normalized.y - drawStart.y);

      setCurrentRect({ x, y, width, height });
    },
    [isDrawing, drawStart, drawingMode, editingPolygonId, draggingVertexIndex, vertexDragStartPoints, hoveredVertexIndex, getEditingPolygonPoints, updateRegion, asset.id]
  );

  const handlePointerUp = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_event: SurfacePointerEvent) => {
      // End vertex dragging
      if (draggingVertexIndex >= 0) {
        setDraggingVertexIndex(-1);
        setVertexDragStartPoints(null);
        return;
      }

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

        // Select the newly created region
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
    [isDrawing, drawingMode, currentRect, regions.length, asset.id, addRegion, selectRegion, getRegion, onRegionCreated, draggingVertexIndex]
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
        const region = getRegion(asset.id, regionId);
        if (region) {
          onRegionCreated?.(region);
        }
        return;
      }

      // Enter edit mode on double-click on a completed polygon (when in select mode)
      if (drawingMode === 'select' && !editingPolygonId) {
        const clickedRegion = findRegionAtPoint(regions, event.normalized);
        if (clickedRegion && clickedRegion.type === 'polygon' && clickedRegion.points) {
          setEditingPolygonId(clickedRegion.id);
          selectRegion(clickedRegion.id);
          onRegionSelected?.(clickedRegion.id);
        }
      }
    },
    [drawingMode, polygonPoints, regions, asset.id, addRegion, selectRegion, getRegion, onRegionCreated, editingPolygonId, onRegionSelected]
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
    if (editingPolygonId) {
      if (draggingVertexIndex >= 0) return 'grabbing';
      if (hoveredVertexIndex >= 0) return 'pointer';
      return 'default';
    }
    if (drawingMode === 'select') return 'pointer';
    return 'crosshair';
  }, [editingPolygonId, draggingVertexIndex, hoveredVertexIndex, drawingMode]);

  // Show loading state while fetching authenticated media
  if (mediaLoading || !resolvedMediaSrc) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-neutral-900/50">
        <div className="animate-spin w-8 h-8 border-2 border-neutral-300 border-t-neutral-600 rounded-full" />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
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
        {polygonPoints.length > 0 && (
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
            {polygonPoints.map((p, i) => (
              <circle
                key={i}
                cx={p.x * 100}
                cy={p.y * 100}
                r="0.8"
                fill="white"
              />
            ))}
          </svg>
        )}

        {/* Edit mode vertex handles */}
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
                // Size: normal=0.6, hovered/dragging=0.9 (in viewBox units)
                const radius = (isHovered || isDragging) ? 0.9 : 0.6;

                return (
                  <circle
                    key={i}
                    cx={p.x * 100}
                    cy={p.y * 100}
                    r={radius}
                    fill={isDragging ? accentColor : 'white'}
                    stroke={isDragging ? 'white' : accentColor}
                    strokeWidth={isDragging ? 0.3 : 0.15}
                    style={{ pointerEvents: 'none' }}
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

