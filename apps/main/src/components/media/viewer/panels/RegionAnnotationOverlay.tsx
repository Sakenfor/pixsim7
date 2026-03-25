/**
 * RegionAnnotationOverlay
 *
 * Interactive overlay for drawing and editing region annotations on assets.
 * Uses InteractiveImageSurface for rendering and handles region creation.
 */

import {
  distance,
  pointInPolygon,
  clampNormalized,
  movePolygon,
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
  type AnyElement,
  type RegionElement,
  type PolygonElement,
  type ViewState,
} from '@/components/interactive-surface';
import {
  hitTestCurve,
  moveCurveVertex,
  insertCurveVertex,
  removeCurveVertex,
  adjustVertexWidth,
  initPointWidths,
  CURVE_HIT,
} from '@/components/interactive-surface/curveEditUtils';
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
  /** Initial viewport state — lets the overlay start at the host's zoom/pan */
  viewState?: Partial<ViewState>;
  /** Called when the overlay changes zoom/pan */
  onViewStateChange?: (view: { zoom: number; pan: { x: number; y: number } }) => void;
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

/** Undo snapshot for a region's geometric state */
interface RegionSnapshot {
  points?: NormalizedPoint[];
  pointWidths?: number[];
  bounds?: Rect;
}

/** Maximum undo entries per edit session */
const MAX_UNDO = 50;

/** Threshold for polygon auto-close detection (normalized, 3% of viewport) */
const CLOSE_THRESHOLD = 0.03;

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
  viewState: initialViewState,
  onViewStateChange,
}: RegionAnnotationOverlayProps) {
  void _settings; // Reserved for future use
  const useRegionStore = regionStore ?? useAssetRegionStore;
  const surfaceRef = useRef<InteractiveImageSurfaceHandle>(null);

  // Store state
  const regions = useRegionStore((s) => s.getRegions(asset.id));
  const layers = useRegionStore((s) => s.getLayers(asset.id));
  const activeLayerId = useRegionStore((s) => s.getActiveLayerId(asset.id));
  const selectedRegionId = useRegionStore((s) => s.selectedRegionId);
  const drawingMode = useRegionStore((s) => s.drawingMode);
  const ensureDefaultLayer = useRegionStore((s) => s.ensureDefaultLayer);
  const addRegion = useRegionStore((s) => s.addRegion);
  const updateRegion = useRegionStore((s) => s.updateRegion);
  const selectRegion = useRegionStore((s) => s.selectRegion);
  const setDrawingMode = useRegionStore((s) => s.setDrawingMode);
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

  // Select-mode hover state (before entering edit mode)
  const [selectHoverCursor, setSelectHoverCursor] = useState<string | null>(null);

  // Region dragging (both types)
  const [isDraggingRegion, setIsDraggingRegion] = useState(false);
  const [regionDragStart, setRegionDragStart] = useState<NormalizedPoint | null>(null);
  const [regionDragOriginalBounds, setRegionDragOriginalBounds] = useState<Rect | null>(null);
  const [regionDragOriginalPoints, setRegionDragOriginalPoints] = useState<NormalizedPoint[] | null>(null);

  // Modifier key tracking (for vertex removal hint)
  const [modifierHeld, setModifierHeld] = useState(false);

  // Undo stack for edit-mode mutations (region snapshots)
  const undoStackRef = useRef<RegionSnapshot[]>([]);

  /** Push the current state of the editing region onto the undo stack */
  const pushUndo = useCallback((regionId: string) => {
    const region = regions.find((r) => r.id === regionId);
    if (!region) return;
    const snapshot: RegionSnapshot = {};
    if (region.points) snapshot.points = [...region.points];
    if (region.pointWidths) snapshot.pointWidths = [...region.pointWidths];
    if (region.bounds) snapshot.bounds = { ...region.bounds };
    const stack = undoStackRef.current;
    stack.push(snapshot);
    if (stack.length > MAX_UNDO) stack.splice(0, stack.length - MAX_UNDO);
  }, [regions]);

  /** Pop and restore the last snapshot */
  const performUndo = useCallback(() => {
    const editId = editingPolygonId ?? editingRectId;
    if (!editId) return;
    const snapshot = undoStackRef.current.pop();
    if (!snapshot) return;
    const updates: Partial<AssetRegion> = {};
    if (snapshot.points) updates.points = snapshot.points;
    if (snapshot.pointWidths) updates.pointWidths = snapshot.pointWidths;
    if (snapshot.bounds) updates.bounds = snapshot.bounds;
    updateRegion(asset.id, editId, updates);
  }, [editingPolygonId, editingRectId, updateRegion, asset.id]);

  /**
   * Finalize the in-progress polygon/curve without switching away from the
   * current drawing mode.  Called on Enter / Escape so the user can finish
   * one shape and immediately start the next.
   *
   * @param switchToSelect  When true (double-click path), also switches mode
   *                        to 'select'.
   */
  const finalizeInProgressShape = useCallback(
    (switchToSelect = false) => {
      if (!isActiveLayerEditable) return;
      const targetLayerId = activeLayerId ?? ensureDefaultLayer(asset.id);
      const colorIndex = regions.length % REGION_COLORS.length;
      const colors = REGION_COLORS[colorIndex];

      if (drawingMode === 'polygon' && polygonPoints.length >= 3) {
        const regionId = addRegion(asset.id, {
          layerId: targetLayerId,
          type: 'polygon',
          points: polygonPoints,
          label: `Region ${regions.length + 1}`,
          style: { strokeColor: colors.stroke, fillColor: colors.fill },
        });
        selectRegion(regionId);
        const region = getRegion(asset.id, regionId);
        if (region) onRegionCreated?.(region);
      } else if (drawingMode === 'curve' && polygonPoints.length >= 2) {
        const regionId = addRegion(asset.id, {
          layerId: targetLayerId,
          type: 'curve',
          points: polygonPoints,
          label: `Curve ${regions.length + 1}`,
          style: { strokeColor: colors.stroke, strokeWidth: 3 },
        });
        selectRegion(regionId);
        const region = getRegion(asset.id, regionId);
        if (region) onRegionCreated?.(region);
      } else {
        // Not enough points — just discard
      }

      setPolygonPoints([]);
      setCursorPosition(null);
      if (switchToSelect) setDrawingMode('select');
    },
    [
      activeLayerId, addRegion, asset.id, drawingMode, ensureDefaultLayer,
      getRegion, isActiveLayerEditable, onRegionCreated, polygonPoints,
      regions, selectRegion, setDrawingMode,
    ],
  );

  // Derived
  const editingRegionId = editingPolygonId ?? editingRectId;
  /** Whether the polygon currently being edited is an open curve (not a closed polygon) */
  const editingIsCurve = useMemo(() => {
    if (!editingPolygonId) return false;
    const region = regions.find((r) => r.id === editingPolygonId);
    return region?.type === 'curve';
  }, [editingPolygonId, regions]);

  // Initialize interaction layer
  const {
    state,
    handlers: baseHandlers,
    addLayer: addInteractionLayer,
    removeLayer: removeInteractionLayer,
    updateLayer: updateInteractionLayer,
    setActiveLayer: setInteractionActiveLayer,
    setMode,
  } = useInteractionLayer({
    initialMode: drawingMode === 'select' ? 'view' : 'region',
    initialViewState,
  });

  // Sync zoom/pan changes back to host
  const currentZoom = state.view.zoom;
  const currentPan = state.view.pan;
  useEffect(() => {
    onViewStateChange?.({ zoom: currentZoom, pan: currentPan });
  }, [currentZoom, currentPan, onViewStateChange]);

  // ============================================================================
  // Effects
  // ============================================================================

  // Ensure each asset has at least one region layer.
  useEffect(() => {
    ensureDefaultLayer(asset.id);
  }, [asset.id, ensureDefaultLayer]);

  const visibleLayerIds = useMemo(() => {
    return new Set(
      layers
        .filter((layer) => layer.visible)
        .map((layer) => layer.id)
    );
  }, [layers]);
  const layerById = useMemo(
    () => new Map(layers.map((layer) => [layer.id, layer])),
    [layers]
  );

  const interactiveRegions = useMemo(() => {
    return regions.filter((region) => visibleLayerIds.has(region.layerId));
  }, [regions, visibleLayerIds]);
  const isRegionLayerLocked = useCallback(
    (region: AssetRegion | null | undefined): boolean =>
      !!region && !!layerById.get(region.layerId)?.locked,
    [layerById]
  );
  const isActiveLayerEditable = useMemo(() => {
    const id = activeLayerId ?? null;
    if (!id) return false;
    const layer = layerById.get(id);
    return !!layer && layer.visible && !layer.locked;
  }, [activeLayerId, layerById]);

  const syncSignatureRef = useRef('');

  // Sync store layers + regions into interaction layers.
  useEffect(() => {
    const signature = [
      activeLayerId ?? '',
      selectedRegionId ?? '',
      layers
        .map((layer) => `${layer.id}:${layer.name}:${layer.visible ? 1 : 0}:${layer.opacity}:${layer.locked ? 1 : 0}:${layer.zIndex}:${layer.updatedAt}`)
        .join(','),
      regions
        .map((region) => `${region.id}:${region.layerId}:${region.updatedAt}`)
        .join(','),
    ].join('|');
    if (syncSignatureRef.current === signature) {
      return;
    }
    syncSignatureRef.current = signature;

    const layerIds = new Set(layers.map((layer) => layer.id));

    // Remove stale interaction layers.
    for (const layer of state.layers) {
      if (layer.type !== 'region') continue;
      if (!layerIds.has(layer.id)) {
        removeInteractionLayer(layer.id);
      }
    }

    // Keep color assignment stable across all regions.
    const regionIndexById = new Map<string, number>(
      regions.map((region, index) => [region.id, index])
    );

    for (const layer of layers) {
      if (!state.layers.some((existing) => existing.id === layer.id)) {
        addInteractionLayer({
          type: 'region',
          id: layer.id,
          name: layer.name,
        });
      }

      const layerElements: AnyElement[] = regions
        .filter((region) => region.layerId === layer.id)
        .flatMap((region) => {
          const colorIndex = (regionIndexById.get(region.id) ?? 0) % REGION_COLORS.length;
          const colors = REGION_COLORS[colorIndex];
          const isSelected = region.id === selectedRegionId;

          if (region.type === 'rect' && region.bounds) {
            return [{
              id: `region-${region.id}`,
              type: 'region',
              layerId: layer.id,
              visible: true,
              bounds: region.bounds,
              label: region.label || '',
              style: {
                strokeColor: isSelected ? '#ffffff' : colors.stroke,
                fillColor: isSelected ? 'rgba(255, 255, 255, 0.2)' : colors.fill,
                strokeWidth: isSelected ? 3 : 2,
              },
              metadata: { storeId: region.id },
            } as RegionElement];
          }

          if ((region.type === 'polygon' || region.type === 'curve') && region.points) {
            const isCurve = region.type === 'curve';
            return [{
              id: `region-${region.id}`,
              type: 'polygon',
              layerId: layer.id,
              visible: true,
              points: region.points,
              pointWidths: isCurve ? region.pointWidths : undefined,
              closed: !isCurve,
              style: {
                strokeColor: isSelected ? '#ffffff' : colors.stroke,
                fillColor: isCurve ? undefined : (isSelected ? 'rgba(255, 255, 255, 0.2)' : colors.fill),
                strokeWidth: region.style?.strokeWidth ?? (isSelected ? 3 : 2),
              },
              metadata: { storeId: region.id, curved: isCurve },
            } as PolygonElement];
          }

          return [];
        });

      updateInteractionLayer(layer.id, {
        name: layer.name,
        visible: layer.visible,
        locked: layer.locked,
        opacity: layer.opacity,
        zIndex: layer.zIndex,
        elements: layerElements,
      });
    }

    if (activeLayerId && layers.some((layer) => layer.id === activeLayerId)) {
      setInteractionActiveLayer(activeLayerId);
    }
  }, [
    activeLayerId,
    addInteractionLayer,
    layers,
    regions,
    removeInteractionLayer,
    selectedRegionId,
    setInteractionActiveLayer,
    state.layers,
    updateInteractionLayer,
  ]);

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
    setSelectHoverCursor(null);
    undoStackRef.current = [];
  }, []);

  // Exit edit mode when drawing mode changes away from select
  useEffect(() => {
    if (drawingMode !== 'select') {
      exitEditMode();
    }
  }, [drawingMode, exitEditMode]);

  // Edit mode always tracks a selected region. If selection is cleared
  // (e.g. layer hidden/removed), drop local edit state immediately.
  useEffect(() => {
    if (selectedRegionId) return;
    if (editingPolygonId || editingRectId) {
      exitEditMode();
    }
  }, [selectedRegionId, editingPolygonId, editingRectId, exitEditMode]);

  // If the edited region's layer becomes locked, leave edit mode.
  useEffect(() => {
    const editingId = editingPolygonId ?? editingRectId;
    if (!editingId) return;
    const region = regions.find((r) => r.id === editingId);
    if (isRegionLayerLocked(region)) {
      exitEditMode();
    }
  }, [editingPolygonId, editingRectId, regions, isRegionLayerLocked, exitEditMode]);

  // Modifier key tracking + undo shortcut + shape finalization
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey) setModifierHeld(true);

      // Ctrl+Z / Cmd+Z -> undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (editingPolygonId || editingRectId) {
          e.preventDefault();
          performUndo();
        }
      }

      // Enter / Escape -> finalize in-progress shape (stay in draw mode)
      if (e.key === 'Enter' || e.key === 'Escape') {
        if (polygonPoints.length > 0 && (drawingMode === 'polygon' || drawingMode === 'curve')) {
          e.preventDefault();
          finalizeInProgressShape(false);
        }
      }
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
  }, [drawingMode, editingPolygonId, editingRectId, finalizeInProgressShape, performUndo, polygonPoints.length]);

  // ============================================================================
  // Drawing & Editing Handlers
  // ============================================================================

  // Helper to get the editing polygon's points
  const getEditingPolygonPoints = useCallback((): NormalizedPoint[] | null => {
    if (!editingPolygonId) return null;
    const region = regions.find((r) => r.id === editingPolygonId);
    return region?.points ?? null;
  }, [editingPolygonId, regions]);

  // Track whether a middle-click pan is in progress (forwarded to baseHandlers)
  const isPanningRef = useRef(false);

  const handlePointerDown = useCallback(
    (event: SurfacePointerEvent) => {
      // Middle-click → delegate to base handler for pan
      if (event.nativeEvent.button === 1) {
        isPanningRef.current = true;
        baseHandlers.onPointerDown?.(event);
        return;
      }

      if (!event.withinBounds) return;
      const isRightClick = event.nativeEvent.button === 2;

      // ---- Rect edit mode ----
      if (editingRectId) {
        const editingRegion = regions.find((r) => r.id === editingRectId);
        if (isRegionLayerLocked(editingRegion)) {
          exitEditMode();
          return;
        }
        if (editingRegion?.bounds) {
          // Check handle hit
          const handleIdx = findRectHandle(event.normalized, editingRegion.bounds, RECT_HANDLE_THRESHOLD);
          if (handleIdx >= 0 && !isRightClick) {
            pushUndo(editingRectId);
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
              pushUndo(editingRectId);
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

      // ---- Polygon/curve edit mode ----
      if (editingPolygonId) {
        const points = getEditingPolygonPoints();
        const isCurve = editingIsCurve;
        const closed = !isCurve;
        const editingRegion = regions.find((r) => r.id === editingPolygonId);
        if (isRegionLayerLocked(editingRegion)) {
          exitEditMode();
          return;
        }
        if (points) {
          const hit = hitTestCurve(event.normalized, points, closed);

          // Right-click or modifier+click vertex -> remove vertex
          if (hit.vertexIndex >= 0 && (isRightClick || modifierHeld)) {
            const result = removeCurveVertex(points, hit.vertexIndex, closed, editingRegion?.pointWidths);
            if (result) {
              pushUndo(editingPolygonId);
              updateRegion(asset.id, editingPolygonId, { points: result.points, pointWidths: result.pointWidths });
              setHoveredVertexIndex(-1);
            }
            return;
          }

          // Vertex drag
          if (hit.vertexIndex >= 0 && !isRightClick) {
            pushUndo(editingPolygonId);
            setDraggingVertexIndex(hit.vertexIndex);
            setVertexDragStartPoints([...points]);
            return;
          }

          // Edge insert (auto-start drag on inserted vertex)
          if (hit.edgeIndex >= 0 && !isRightClick) {
            const result = insertCurveVertex(points, event.normalized, closed, editingRegion?.pointWidths);
            if (result) {
              pushUndo(editingPolygonId);
              updateRegion(asset.id, editingPolygonId, { points: result.points, pointWidths: result.pointWidths });
              setDraggingVertexIndex(result.insertedIndex ?? hit.edgeIndex + 1);
              setVertexDragStartPoints([...result.points]);
              setHoveredEdgeIndex(-1);
            }
            return;
          }

          // Inside polygon -> drag whole polygon; for curves, use proximity
          const shouldDrag = isCurve
            ? pointNearPath(event.normalized, points, CURVE_HIT.PROXIMITY)
            : hit.isInside;
          if (shouldDrag && !isRightClick) {
            pushUndo(editingPolygonId);
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
        // Direct vertex click: enter edit mode and start vertex drag immediately
        if (!isRightClick) {
          for (const region of interactiveRegions) {
            if (isRegionLayerLocked(region)) continue;
            if ((region.type === 'polygon' || region.type === 'curve') && region.points) {
              const isCurve = region.type === 'curve';
              const hit = hitTestCurve(event.normalized, region.points, !isCurve);
              if (hit.vertexIndex >= 0) {
                selectRegion(region.id);
                onRegionSelected?.(region.id);
                setEditingPolygonId(region.id);
                if (isCurve && !region.pointWidths) {
                  updateRegion(asset.id, region.id, {
                    pointWidths: initPointWidths(region.points.length, region.style?.strokeWidth ?? 3),
                  });
                }
                pushUndo(region.id);
                setDraggingVertexIndex(hit.vertexIndex);
                setVertexDragStartPoints([...region.points]);
                return;
              }
              if (hit.edgeIndex >= 0) {
                selectRegion(region.id);
                onRegionSelected?.(region.id);
                setEditingPolygonId(region.id);
                if (isCurve && !region.pointWidths) {
                  updateRegion(asset.id, region.id, {
                    pointWidths: initPointWidths(region.points.length, region.style?.strokeWidth ?? 3),
                  });
                }
                const result = insertCurveVertex(region.points, event.normalized, !isCurve, region.pointWidths);
                if (result) {
                  pushUndo(region.id);
                  updateRegion(asset.id, region.id, { points: result.points, pointWidths: result.pointWidths });
                  setDraggingVertexIndex(result.insertedIndex ?? hit.edgeIndex + 1);
                  setVertexDragStartPoints([...result.points]);
                  setHoveredEdgeIndex(-1);
                }
                return;
              }
            } else if (region.type === 'rect' && region.bounds) {
              const handleIdx = findRectHandle(event.normalized, region.bounds, RECT_HANDLE_THRESHOLD);
              if (handleIdx >= 0) {
                selectRegion(region.id);
                onRegionSelected?.(region.id);
                setEditingRectId(region.id);
                pushUndo(region.id);
                setDraggingHandleIndex(handleIdx);
                setHandleDragStartBounds({ ...region.bounds });
                return;
              }
            }
          }
        }

        const clickedRegion = findRegionAtPoint(interactiveRegions, event.normalized);
        if (clickedRegion && !isRightClick) {
          selectRegion(clickedRegion.id);
          onRegionSelected?.(clickedRegion.id);
          // Prepare for potential drag
          setRegionDragStart(event.normalized);
          if (clickedRegion.type === 'rect' && clickedRegion.bounds) {
            setRegionDragOriginalBounds({ ...clickedRegion.bounds });
          } else if ((clickedRegion.type === 'polygon' || clickedRegion.type === 'curve') && clickedRegion.points) {
            setRegionDragOriginalPoints([...clickedRegion.points]);
          }
        } else if (!isRightClick) {
          selectRegion(null);
          onRegionSelected?.(null);
        }
        return;
      }

      // ---- Drawing modes ----
      if (isRightClick) return;

      // Contextual move: if clicking on the selected region, drag it instead of drawing
      if (selectedRegionId) {
        const selectedRegion = interactiveRegions.find((r) => r.id === selectedRegionId);
        if (selectedRegion) {
          if (isRegionLayerLocked(selectedRegion)) {
            return;
          }
          const isHit = selectedRegion.type === 'rect' && selectedRegion.bounds
            ? (event.normalized.x >= selectedRegion.bounds.x &&
               event.normalized.x <= selectedRegion.bounds.x + selectedRegion.bounds.width &&
               event.normalized.y >= selectedRegion.bounds.y &&
               event.normalized.y <= selectedRegion.bounds.y + selectedRegion.bounds.height)
            : selectedRegion.type === 'polygon' && selectedRegion.points
              ? pointInPolygon(event.normalized, selectedRegion.points)
              : selectedRegion.type === 'curve' && selectedRegion.points
                ? pointNearPath(event.normalized, selectedRegion.points, CURVE_HIT.EDGE)
                : false;

          if (isHit) {
            setRegionDragStart(event.normalized);
            if (selectedRegion.type === 'rect' && selectedRegion.bounds) {
              setRegionDragOriginalBounds({ ...selectedRegion.bounds });
            } else if ((selectedRegion.type === 'polygon' || selectedRegion.type === 'curve') && selectedRegion.points) {
              setRegionDragOriginalPoints([...selectedRegion.points]);
            }
            return;
          }
          // Clicking outside the selected region deselects it
          selectRegion(null);
        }
      }

      // Curve mode: click adds points (open path, no auto-close)
      if (drawingMode === 'curve') {
        if (!isActiveLayerEditable) return;
        setPolygonPoints((prev) => [...prev, event.normalized]);
        return;
      }

      if (!isActiveLayerEditable) return;

      const targetLayerId = activeLayerId ?? ensureDefaultLayer(asset.id);

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
              layerId: targetLayerId,
              type: 'polygon',
              points: polygonPoints,
              label: `Region ${regions.length + 1}`,
              style: { strokeColor: colors.stroke, fillColor: colors.fill },
            });
            selectRegion(regionId);
            setPolygonPoints([]);
            setCursorPosition(null);
            setDrawingMode('select');
            const region = getRegion(asset.id, regionId);
            if (region) onRegionCreated?.(region);
            return;
          }
        }
        setPolygonPoints((prev) => [...prev, event.normalized]);
      }
    },
    [
      activeLayerId,
      addRegion,
      asset.id,
      baseHandlers,
      drawingMode,
      editingIsCurve,
      editingPolygonId,
      editingRectId,
      ensureDefaultLayer,
      exitEditMode,
      getEditingPolygonPoints,
      getRegion,
      isActiveLayerEditable,
      isRegionLayerLocked,
      interactiveRegions,
      modifierHeld,
      onRegionCreated,
      onRegionSelected,
      polygonPoints,
      pushUndo,
      regions,
      selectRegion,
      setDrawingMode,
      selectedRegionId,
      updateRegion,
    ]
  );

  const handlePointerMove = useCallback(
    (event: SurfacePointerEvent) => {
      // Middle-click pan — delegate to base handler
      if (isPanningRef.current) {
        baseHandlers.onPointerMove?.(event);
        return;
      }

      // 1. Track cursor for polygon/curve preview line
      if ((drawingMode === 'polygon' || drawingMode === 'curve') && polygonPoints.length > 0) {
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
        const selectedRegion = regions.find((r) => r.id === selectedRegionId);
        if (isRegionLayerLocked(selectedRegion)) return;

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

      // 4. Drag threshold check - promote to drag if threshold exceeded
      if (regionDragStart && !isDraggingRegion && selectedRegionId) {
        const dx = Math.abs(event.normalized.x - regionDragStart.x);
        const dy = Math.abs(event.normalized.y - regionDragStart.y);
        if (dx > CURVE_HIT.DRAG || dy > CURVE_HIT.DRAG) {
          setIsDraggingRegion(true);
        }
        return;
      }

      // 5. Vertex drag (polygon/curve edit mode)
      if (editingPolygonId && draggingVertexIndex >= 0 && vertexDragStartPoints) {
        const editingRegion = regions.find((r) => r.id === editingPolygonId);
        if (isRegionLayerLocked(editingRegion)) return;

        const newPosition = clampNormalized(event.normalized);
        const newPoints = moveCurveVertex(vertexDragStartPoints, draggingVertexIndex, newPosition);
        updateRegion(asset.id, editingPolygonId, { points: newPoints });
        return;
      }

      // 6. Polygon/curve edit hover (vertex + edge)
      if (editingPolygonId && draggingVertexIndex < 0) {
        const points = getEditingPolygonPoints();
        if (points) {
          const hit = hitTestCurve(event.normalized, points, !editingIsCurve);
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

      // 8. Select mode hover — cursor hints over vertices/edges/regions
      if (drawingMode === 'select' && !editingPolygonId && !editingRectId) {
        let nextCursor: string | null = null;
        for (const region of interactiveRegions) {
          if (isRegionLayerLocked(region)) continue;
          if ((region.type === 'polygon' || region.type === 'curve') && region.points) {
            const hit = hitTestCurve(event.normalized, region.points, region.type !== 'curve');
            if (hit.vertexIndex >= 0) { nextCursor = 'pointer'; break; }
            if (hit.edgeIndex >= 0) { nextCursor = 'copy'; break; }
          } else if (region.type === 'rect' && region.bounds) {
            const handleIdx = findRectHandle(event.normalized, region.bounds, RECT_HANDLE_THRESHOLD);
            if (handleIdx >= 0) { nextCursor = HANDLE_CURSORS[handleIdx] ?? 'pointer'; break; }
          }
        }
        if (!nextCursor) {
          // Check if hovering over any region body
          const hovered = findRegionAtPoint(interactiveRegions, event.normalized);
          if (hovered) nextCursor = 'move';
        }
        if (nextCursor !== selectHoverCursor) setSelectHoverCursor(nextCursor);
        return;
      }

      // 9. Rect drawing (existing)
      if (!isDrawing || !drawStart || drawingMode !== 'rect') return;

      const x = Math.min(drawStart.x, event.normalized.x);
      const y = Math.min(drawStart.y, event.normalized.y);
      const width = Math.abs(event.normalized.x - drawStart.x);
      const height = Math.abs(event.normalized.y - drawStart.y);

      setCurrentRect({ x, y, width, height });
    },
    [
      baseHandlers,
      isDrawing,
      drawStart,
      drawingMode,
      polygonPoints,
      editingPolygonId,
      editingRectId,
      editingIsCurve,
      draggingVertexIndex,
      draggingHandleIndex,
      vertexDragStartPoints,
      hoveredVertexIndex,
      hoveredEdgeIndex,
      hoveredHandleIndex,
      getEditingPolygonPoints,
      updateRegion,
      asset.id,
      isDraggingRegion,
      regionDragStart,
      regionDragOriginalBounds,
      regionDragOriginalPoints,
      selectedRegionId,
      handleDragStartBounds,
      regions,
      interactiveRegions,
      isRegionLayerLocked,
      selectHoverCursor,
    ]
  );

  const handlePointerUp = useCallback(
     
    (_event: SurfacePointerEvent) => {
      // End middle-click pan
      if (isPanningRef.current) {
        isPanningRef.current = false;
        baseHandlers.onPointerUp?.(_event);
        return;
      }

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
      if (isActiveLayerEditable && currentRect.width > 0.01 && currentRect.height > 0.01) {
        const targetLayerId = activeLayerId ?? ensureDefaultLayer(asset.id);
        const colorIndex = regions.length % REGION_COLORS.length;
        const colors = REGION_COLORS[colorIndex];

        const regionId = addRegion(asset.id, {
          layerId: targetLayerId,
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
    [
      activeLayerId,
      addRegion,
      asset.id,
      baseHandlers,
      currentRect,
      draggingHandleIndex,
      draggingVertexIndex,
      drawingMode,
      ensureDefaultLayer,
      getRegion,
      isDraggingRegion,
      isDrawing,
      isActiveLayerEditable,
      onRegionCreated,
      regionDragStart,
      regions.length,
      selectRegion,
    ]
  );

  const handleDoubleClick = useCallback(
    (event: SurfacePointerEvent) => {
      // Complete polygon / curve on double-click → finalize and switch to select
      if (
        (drawingMode === 'polygon' && polygonPoints.length >= 3) ||
        (drawingMode === 'curve' && polygonPoints.length >= 2)
      ) {
        finalizeInProgressShape(true);
        return;
      }

      // Enter edit mode on double-click (when in select mode)
      if (drawingMode === 'select' && !editingRegionId) {
        const clickedRegion = findRegionAtPoint(interactiveRegions, event.normalized);
        if (clickedRegion) {
          if (isRegionLayerLocked(clickedRegion)) {
            selectRegion(clickedRegion.id);
            onRegionSelected?.(clickedRegion.id);
            return;
          }

          if ((clickedRegion.type === 'polygon' || clickedRegion.type === 'curve') && clickedRegion.points) {
            setEditingPolygonId(clickedRegion.id);
            selectRegion(clickedRegion.id);
            onRegionSelected?.(clickedRegion.id);
            // Initialize pointWidths for curves if not present
            if (clickedRegion.type === 'curve' && !clickedRegion.pointWidths) {
              updateRegion(asset.id, clickedRegion.id, {
                pointWidths: initPointWidths(clickedRegion.points.length, clickedRegion.style?.strokeWidth ?? 3),
              });
            }
          } else if (clickedRegion.type === 'rect' && clickedRegion.bounds) {
            setEditingRectId(clickedRegion.id);
            selectRegion(clickedRegion.id);
            onRegionSelected?.(clickedRegion.id);
          }
        }
      }
    },
    [
      asset.id,
      drawingMode,
      editingRegionId,
      finalizeInProgressShape,
      isRegionLayerLocked,
      interactiveRegions,
      onRegionSelected,
      polygonPoints,
      selectRegion,
      updateRegion,
    ]
  );

  // Scroll wheel handler for per-point width adjustment in curve edit mode
  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (!editingPolygonId || !editingIsCurve || hoveredVertexIndex < 0) return;
      const editingRegion = regions.find((r) => r.id === editingPolygonId);
      if (!editingRegion?.pointWidths) return;

      event.preventDefault();
      const delta = event.deltaY < 0 ? 0.5 : -0.5;
      const newWidths = adjustVertexWidth(editingRegion.pointWidths, hoveredVertexIndex, delta);
      if (newWidths) {
        pushUndo(editingPolygonId);
        updateRegion(asset.id, editingPolygonId, { pointWidths: newWidths });
      }
    },
    [editingPolygonId, editingIsCurve, hoveredVertexIndex, regions, updateRegion, asset.id, pushUndo]
  );

  // Attach wheel listener (passive: false needed for preventDefault)
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !editingPolygonId || !editingIsCurve) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel, editingPolygonId, editingIsCurve]);

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
    if (drawingMode === 'select') return selectHoverCursor ?? 'default';
    return 'crosshair';
  }, [isDraggingRegion, draggingHandleIndex, draggingVertexIndex, hoveredHandleIndex, hoveredVertexIndex, hoveredEdgeIndex, editingPolygonId, editingRectId, drawingMode, modifierHeld, selectHoverCursor]);

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
      ref={containerRef}
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

        {/* Polygon/curve points being drawn */}
        {polygonPoints.length > 0 && (() => {
          const isCurveMode = drawingMode === 'curve';
          const first = polygonPoints[0];
          const last = polygonPoints[polygonPoints.length - 1];
          const isNearClose = !isCurveMode && cursorPosition && polygonPoints.length >= 3 &&
            distance(cursorPosition, first) < CLOSE_THRESHOLD;

          return (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polyline
                points={polygonPoints.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
                fill={isCurveMode ? 'none' : 'rgba(255,255,255,0.1)'}
                stroke="white"
                strokeWidth={isCurveMode ? '0.5' : '0.3'}
                strokeDasharray={isCurveMode ? undefined : '1,1'}
                strokeLinejoin="round"
                strokeLinecap="round"
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

        {/* Select mode: subtle vertex dots on selected region (hint: click to edit) */}
        {drawingMode === 'select' && !editingPolygonId && !editingRectId && selectedRegionId && (() => {
          const selectedRegion = regions.find((r) => r.id === selectedRegionId);
          if (!selectedRegion?.points) return null;
          const colorIndex = regions.indexOf(selectedRegion) % REGION_COLORS.length;
          const accentColor = REGION_COLORS[colorIndex].stroke;

          return (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {selectedRegion.points.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x * 100}
                  cy={p.y * 100}
                  r={0.5}
                  fill={accentColor}
                  opacity={0.6}
                />
              ))}
            </svg>
          );
        })()}

        {/* Polygon/curve edit mode: vertex handles */}
        {editingPolygonId && (() => {
          const editingRegion = regions.find((r) => r.id === editingPolygonId);
          if (!editingRegion?.points) return null;
          const colorIndex = regions.indexOf(editingRegion) % REGION_COLORS.length;
          const accentColor = REGION_COLORS[colorIndex].stroke;
          const isCurve = editingRegion.type === 'curve';
          const pointWidths = editingRegion.pointWidths;

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
                const pw = isCurve && pointWidths ? pointWidths[i] : undefined;

                return (
                  <g key={i}>
                    {/* Width indicator ring for curves */}
                    {pw != null && (
                      <circle
                        cx={p.x * 100}
                        cy={p.y * 100}
                        r={Math.max(0.8, pw * 0.25)}
                        fill="none"
                        stroke={isHovered ? '#ffffff' : accentColor}
                        strokeWidth={isHovered ? 0.15 : 0.1}
                        strokeDasharray="0.4,0.25"
                        opacity={isHovered ? 0.9 : 0.5}
                      />
                    )}
                    <circle
                      cx={p.x * 100}
                      cy={p.y * 100}
                      r={radius}
                      fill={showRemoveHint ? '#ef4444' : isDragging ? accentColor : 'white'}
                      stroke={showRemoveHint ? 'white' : isDragging ? 'white' : accentColor}
                      strokeWidth={isDragging ? 0.3 : 0.15}
                    />
                  </g>
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
    } else if (region.type === 'curve' && region.points) {
      // Proximity hit-test for open curves
      if (pointNearPath(point, region.points, CURVE_HIT.EDGE)) {
        return region;
      }
    }
  }

  return null;
}

/**
 * Check if a point is near any segment of an open path
 */
function pointNearPath(
  point: NormalizedPoint,
  path: NormalizedPoint[],
  threshold: number,
): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    if (distanceToSegment(point, path[i], path[i + 1]) < threshold) {
      return true;
    }
  }
  return false;
}

/**
 * Distance from a point to a line segment
 */
function distanceToSegment(
  p: NormalizedPoint,
  a: NormalizedPoint,
  b: NormalizedPoint,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return distance(p, proj);
}
