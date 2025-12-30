/**
 * RegionAnnotationOverlay
 *
 * Interactive overlay for drawing and editing region annotations on assets.
 * Uses InteractiveImageSurface for rendering and handles region creation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractiveImageSurface,
  useInteractionLayer,
  type InteractiveImageSurfaceHandle,
  type SurfacePointerEvent,
  type NormalizedPoint,
  type RegionElement,
  type PolygonElement,
} from '@/components/interactive-surface';
import type { ViewerAsset } from '@features/assets';
import type { ViewerSettings } from '../types';
import {
  useAssetRegionStore,
  type AssetRegion,
} from '../stores/assetRegionStore';

// ============================================================================
// Types
// ============================================================================

interface RegionAnnotationOverlayProps {
  asset: ViewerAsset;
  settings: ViewerSettings;
  onRegionCreated?: (region: AssetRegion) => void;
  onRegionSelected?: (regionId: string | null) => void;
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

// ============================================================================
// Component
// ============================================================================

export function RegionAnnotationOverlay({
  asset,
  settings,
  onRegionCreated,
  onRegionSelected,
}: RegionAnnotationOverlayProps) {
  const surfaceRef = useRef<InteractiveImageSurfaceHandle>(null);

  // Store state
  const regions = useAssetRegionStore((s) => s.getRegions(asset.id));
  const selectedRegionId = useAssetRegionStore((s) => s.selectedRegionId);
  const drawingMode = useAssetRegionStore((s) => s.drawingMode);
  const addRegion = useAssetRegionStore((s) => s.addRegion);
  const selectRegion = useAssetRegionStore((s) => s.selectRegion);

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

  // Initialize interaction layer
  const {
    state,
    handlers: baseHandlers,
    addLayer,
    getLayer,
    addElement,
    removeElement,
    updateElement,
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

  const handlePointerDown = useCallback(
    (event: SurfacePointerEvent) => {
      if (!event.withinBounds) return;

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
    [drawingMode, regions, selectRegion, onRegionSelected]
  );

  const handlePointerMove = useCallback(
    (event: SurfacePointerEvent) => {
      if (!isDrawing || !drawStart || drawingMode !== 'rect') return;

      const x = Math.min(drawStart.x, event.normalized.x);
      const y = Math.min(drawStart.y, event.normalized.y);
      const width = Math.abs(event.normalized.x - drawStart.x);
      const height = Math.abs(event.normalized.y - drawStart.y);

      setCurrentRect({ x, y, width, height });
    },
    [isDrawing, drawStart, drawingMode]
  );

  const handlePointerUp = useCallback(
    (event: SurfacePointerEvent) => {
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
        onRegionCreated?.(useAssetRegionStore.getState().getRegion(asset.id, regionId)!);
      }

      setIsDrawing(false);
      setDrawStart(null);
      setCurrentRect(null);
    },
    [isDrawing, drawingMode, currentRect, regions.length, asset.id, addRegion, selectRegion, onRegionCreated]
  );

  const handleDoubleClick = useCallback(
    (_event: SurfacePointerEvent) => {
      // Complete polygon on double-click
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
        onRegionCreated?.(useAssetRegionStore.getState().getRegion(asset.id, regionId)!);
      }
    },
    [drawingMode, polygonPoints, regions.length, asset.id, addRegion, selectRegion, onRegionCreated]
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

  const media = useMemo(
    () => ({
      type: asset.type as 'image' | 'video',
      url: asset.fullUrl || asset.url,
    }),
    [asset]
  );

  const cursor =
    drawingMode === 'select'
      ? 'pointer'
      : drawingMode === 'rect'
        ? 'crosshair'
        : 'crosshair';

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
      if (isPointInPolygon(point, region.points)) {
        return region;
      }
    }
  }

  return null;
}

/**
 * Check if a point is inside a polygon using ray casting
 */
function isPointInPolygon(
  point: NormalizedPoint,
  polygon: NormalizedPoint[]
): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    if (
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }

  return inside;
}
