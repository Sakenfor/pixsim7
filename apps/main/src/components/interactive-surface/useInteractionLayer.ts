/**
 * useInteractionLayer
 *
 * Hook for managing interaction layers, elements, and drawing state.
 * Provides high-level API for common operations like drawing, erasing,
 * creating regions, and managing undo/redo history.
 */

import {
  smoothPoints as smoothPathPoints,
  findNearestVertex as findNearestPolygonVertex,
  calculateVertexThreshold as calculatePolygonVertexThreshold,
  moveVertex as movePolygonVertex,
} from '@pixsim7/graphics.geometry';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

import { generateUUID } from '@lib/utils/uuid';

import type {
  SurfaceState,
  InteractionLayer,
  AnyElement,
  StrokeElement,
  PointElement,
  RegionElement,
  PolygonElement,
  InteractionMode,
  DrawToolConfig,
  ViewState,
  NormalizedPoint,
  NormalizedRect,
  ScreenPoint,
  SurfacePointerEvent,
  SurfaceWheelEvent,
  SurfaceEventHandlers,
  HistoryEntry,
} from './types';

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_TOOL_CONFIG: DrawToolConfig = {
  size: 0.02, // 2% of image width
  opacity: 1,
  color: '#ffffff',
  smoothing: 0.5,
  pressureSensitive: true,
};

const DEFAULT_VIEW_STATE: ViewState = {
  zoom: 1,
  pan: { x: 0, y: 0 },
  fitMode: 'contain',
};

// ============================================================================
// Types
// ============================================================================

export interface UseInteractionLayerOptions {
  /** Initial layers */
  initialLayers?: InteractionLayer[];
  /** Initial mode */
  initialMode?: InteractionMode;
  /** Initial tool config */
  initialTool?: Partial<DrawToolConfig>;
  /** Maximum history entries for undo/redo */
  maxHistorySize?: number;
  /** When false, polygon mode creates open curves instead of closed filled shapes */
  polygonCloseOnFinalize?: boolean;
  /** Callback when state changes */
  onStateChange?: (state: SurfaceState) => void;
  /** Callback when an element is added */
  onElementAdd?: (element: AnyElement, layer: InteractionLayer) => void;
  /** Callback when stroke is completed */
  onStrokeComplete?: (stroke: StrokeElement) => void;
}

export interface UseInteractionLayerReturn {
  /** Current surface state */
  state: SurfaceState;
  /** Event handlers to pass to InteractiveImageSurface */
  handlers: SurfaceEventHandlers;

  // Mode management
  setMode: (mode: InteractionMode) => void;

  // Tool management
  setTool: (config: Partial<DrawToolConfig>) => void;
  setBrushSize: (size: number) => void;
  setBrushColor: (color: string) => void;
  setBrushOpacity: (opacity: number) => void;

  // View management
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setView: (updates: Partial<Pick<ViewState, 'zoom' | 'pan'>>) => void;
  setFitMode: (mode: ViewState['fitMode']) => void;
  resetView: () => void;

  // Layer management
  addLayer: (layer: Partial<InteractionLayer> & { type: InteractionLayer['type'] }) => string;
  removeLayer: (layerId: string) => void;
  setActiveLayer: (layerId: string | null) => void;
  updateLayer: (layerId: string, updates: Partial<InteractionLayer>) => void;
  getLayer: (layerId: string) => InteractionLayer | undefined;
  clearLayer: (layerId: string) => void;

  // Element management
  addElement: (layerId: string, element: Omit<AnyElement, 'id' | 'layerId'>) => string;
  removeElement: (layerId: string, elementId: string) => void;
  updateElement: (
    layerId: string,
    elementId: string,
    updates: Partial<Omit<AnyElement, 'id' | 'layerId' | 'type'>>
  ) => void;
  getElement: (layerId: string, elementId: string) => AnyElement | undefined;

  // Selection
  selectElements: (elementIds: string[]) => void;
  clearSelection: () => void;

  // History
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clearHistory: () => void;

  // Convenience methods
  addPoint: (position: NormalizedPoint, options?: Partial<PointElement>) => string;
  addRegion: (bounds: NormalizedRect, options?: Partial<RegionElement>) => string;
  addPolygon: (points: NormalizedPoint[], options?: Partial<PolygonElement>) => string;

  // Export
  exportLayerAsMask: (layerId: string, width: number, height: number) => string | null;
  exportAllLayers: () => InteractionLayer[];
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useInteractionLayer(
  options: UseInteractionLayerOptions = {}
): UseInteractionLayerReturn {
  const {
    initialLayers = [],
    initialMode = 'view',
    initialTool = {},
    maxHistorySize = 50,
    polygonCloseOnFinalize = true,
    onStateChange,
    onElementAdd,
    onStrokeComplete,
  } = options;

  // ============================================================================
  // State
  // ============================================================================

  const [mode, setModeState] = useState<InteractionMode>(initialMode);
  const [tool, setToolState] = useState<DrawToolConfig>({
    ...DEFAULT_TOOL_CONFIG,
    ...initialTool,
  });
  const [view, setViewState] = useState<ViewState>(DEFAULT_VIEW_STATE);
  const [layers, setLayers] = useState<InteractionLayer[]>(initialLayers);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(
    initialLayers[0]?.id ?? null
  );
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [currentTime] = useState<number | undefined>(undefined);

  // History
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Drawing state (not part of persistent state)
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<StrokeElement | null>(null);
  const lastPointRef = useRef<NormalizedPoint | null>(null);
  /** Layers snapshot taken BEFORE stroke starts, used by pushHistory on pointer-up */
  const preStrokeLayersRef = useRef<InteractionLayer[] | null>(null);
  const preShapeLayersRef = useRef<InteractionLayer[] | null>(null);
  const currentPolygonRef = useRef<{ layerId: string; elementId: string } | null>(null);
  const activePolygonVertexDragRef = useRef<{ layerId: string; elementId: string; vertexIndex: number } | null>(null);

  // View ref (avoids stale closures in pointer/wheel handlers)
  const viewRef = useRef<ViewState>(view);
  viewRef.current = view;

  // Pan tracking
  const isPanningRef = useRef(false);
  const panStartRef = useRef<ScreenPoint>({ x: 0, y: 0 });
  const panStartViewRef = useRef<ScreenPoint>({ x: 0, y: 0 });

  // ============================================================================
  // Computed State
  // ============================================================================

  const state = useMemo<SurfaceState>(
    () => ({
      mode,
      tool,
      view,
      layers,
      activeLayerId,
      selectedElementIds,
      currentTime,
    }),
    [mode, tool, view, layers, activeLayerId, selectedElementIds, currentTime]
  );

  // ============================================================================
  // History Management
  // ============================================================================

  // Ref mirrors historyIndex so pushHistory never reads a stale closure value
  const historyIndexRef = useRef(historyIndex);
  historyIndexRef.current = historyIndex;

  const pushHistory = useCallback(
    (description: string, stateDelta: Partial<SurfaceState>) => {
      const entry: HistoryEntry = {
        id: generateUUID(),
        description,
        state: stateDelta,
        timestamp: Date.now(),
      };

      setHistory((prev) => {
        // Remove any redo entries (use ref to avoid stale closure)
        const newHistory = prev.slice(0, historyIndexRef.current + 1);
        // Add new entry
        newHistory.push(entry);
        // Limit size
        if (newHistory.length > maxHistorySize) {
          newHistory.shift();
        }
        return newHistory;
      });

      setHistoryIndex((prev) => Math.min(prev + 1, maxHistorySize - 1));
    },
    [maxHistorySize]
  );

  const undo = useCallback(() => {
    if (historyIndex < 0) return;

    const entry = history[historyIndex];
    if (!entry) return;

    // Restore previous state
    if (entry.state.layers) {
      setLayers(entry.state.layers);
    }

    setHistoryIndex((prev) => prev - 1);
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;

    const nextEntry = history[historyIndex + 1];
    if (!nextEntry) return;

    if (nextEntry.state.layers) {
      setLayers(nextEntry.state.layers);
    }

    setHistoryIndex((prev) => prev + 1);
  }, [history, historyIndex]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setHistoryIndex(-1);
  }, []);

  // ============================================================================
  // Mode & Tool Management
  // ============================================================================

  const setMode = useCallback((newMode: InteractionMode) => {
    // Finalize or discard in-progress polygon when leaving polygon mode.
    if (mode === 'polygon' && newMode !== 'polygon' && currentPolygonRef.current) {
      const { layerId, elementId } = currentPolygonRef.current;
      const shouldClose = polygonCloseOnFinalize;
      const minPoints = shouldClose ? 3 : 2;
      let shouldPushHistory = false;

      setLayers((prev) =>
        prev.map((l) => {
          if (l.id !== layerId) return l;
          return {
            ...l,
            elements: l.elements.flatMap((e) => {
              if (e.id !== elementId || e.type !== 'polygon') return [e];
              const poly = e as PolygonElement;
              if (poly.points.length < minPoints) return [];
              shouldPushHistory = true;
              return [{ ...poly, closed: shouldClose }];
            }),
          };
        })
      );

      if (shouldPushHistory && preShapeLayersRef.current) {
        pushHistory(shouldClose ? 'Create polygon' : 'Create curve', { layers: preShapeLayersRef.current });
      }
      preShapeLayersRef.current = null;
      currentPolygonRef.current = null;
    }

    setModeState(newMode);
  }, [mode, pushHistory]);

  const setTool = useCallback((config: Partial<DrawToolConfig>) => {
    setToolState((prev) => ({ ...prev, ...config }));
  }, []);

  const setBrushSize = useCallback((size: number) => {
    setToolState((prev) => ({ ...prev, size }));
  }, []);

  const setBrushColor = useCallback((color: string) => {
    setToolState((prev) => ({ ...prev, color }));
  }, []);

  const setBrushOpacity = useCallback((opacity: number) => {
    setToolState((prev) => ({ ...prev, opacity }));
  }, []);

  // ============================================================================
  // View Management
  // ============================================================================

  const setZoom = useCallback((zoom: number) => {
    setViewState((prev) => ({ ...prev, zoom: Math.max(0.1, Math.min(10, zoom)) }));
  }, []);

  const setPan = useCallback((pan: { x: number; y: number }) => {
    setViewState((prev) => ({ ...prev, pan }));
  }, []);

  const setFitMode = useCallback((fitMode: ViewState['fitMode']) => {
    setViewState((prev) => ({ ...prev, fitMode }));
  }, []);

  const resetView = useCallback(() => {
    setViewState(DEFAULT_VIEW_STATE);
  }, []);

  /** Atomic zoom+pan setter — prevents double-render flash when both change. */
  const setView = useCallback((updates: Partial<Pick<ViewState, 'zoom' | 'pan'>>) => {
    setViewState((prev) => {
      const next = { ...prev };
      if (updates.zoom !== undefined) next.zoom = Math.max(0.1, Math.min(10, updates.zoom));
      if (updates.pan !== undefined) next.pan = updates.pan;
      return next;
    });
  }, []);

  // ============================================================================
  // Layer Management
  // ============================================================================

  const addLayer = useCallback(
    (layerConfig: Partial<InteractionLayer> & { type: InteractionLayer['type'] }): string => {
      const id = layerConfig.id ?? generateUUID();
      const newLayer: InteractionLayer = {
        id,
        name: layerConfig.name ?? `Layer ${layers.length + 1}`,
        type: layerConfig.type,
        visible: layerConfig.visible ?? true,
        locked: layerConfig.locked ?? false,
        opacity: layerConfig.opacity ?? 1,
        zIndex: layerConfig.zIndex ?? layers.length,
        elements: layerConfig.elements ?? [],
        config: layerConfig.config,
      };

      setLayers((prev) => [...prev, newLayer]);
      setActiveLayerId(id);

      return id;
    },
    [layers.length]
  );

  const removeLayer = useCallback((layerId: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== layerId));
    setActiveLayerId((prev) => (prev === layerId ? null : prev));
  }, []);

  const setActiveLayer = useCallback((layerId: string | null) => {
    setActiveLayerId(layerId);
  }, []);

  const updateLayer = useCallback((layerId: string, updates: Partial<InteractionLayer>) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, ...updates } : l))
    );
  }, []);

  const getLayer = useCallback(
    (layerId: string) => layers.find((l) => l.id === layerId),
    [layers]
  );

  const clearLayer = useCallback(
    (layerId: string) => {
      const prevLayers = layers;
      setLayers((prev) =>
        prev.map((l) => (l.id === layerId ? { ...l, elements: [] } : l))
      );
      pushHistory('Clear layer', { layers: prevLayers });
    },
    [layers, pushHistory]
  );

  // ============================================================================
  // Element Management
  // ============================================================================

  const addElement = useCallback(
    (layerId: string, elementData: Omit<AnyElement, 'id' | 'layerId'>): string => {
      const id = generateUUID();
      const element = {
        ...elementData,
        id,
        layerId,
      } as AnyElement;

      setLayers((prev) =>
        prev.map((l) =>
          l.id === layerId ? { ...l, elements: [...l.elements, element] } : l
        )
      );

      const layer = layers.find((l) => l.id === layerId);
      if (layer) {
        onElementAdd?.(element, layer);
      }

      return id;
    },
    [layers, onElementAdd]
  );

  const removeElement = useCallback((layerId: string, elementId: string) => {
    setLayers((prev) =>
      prev.map((l) =>
        l.id === layerId
          ? { ...l, elements: l.elements.filter((e) => e.id !== elementId) }
          : l
      )
    );
  }, []);

  const updateElement = useCallback(
    (
      layerId: string,
      elementId: string,
      updates: Partial<Omit<AnyElement, 'id' | 'layerId' | 'type'>>
    ) => {
      setLayers((prev) =>
        prev.map((l) =>
          l.id === layerId
            ? {
                ...l,
                elements: l.elements.map((e) =>
                  e.id === elementId ? { ...e, ...updates } : e
                ),
              }
            : l
        )
      );
    },
    []
  );

  const getElement = useCallback(
    (layerId: string, elementId: string) => {
      const layer = layers.find((l) => l.id === layerId);
      return layer?.elements.find((e) => e.id === elementId);
    },
    [layers]
  );

  // ============================================================================
  // Selection
  // ============================================================================

  const selectElements = useCallback((elementIds: string[]) => {
    setSelectedElementIds(elementIds);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedElementIds([]);
  }, []);

  // ============================================================================
  // Drawing & Pan/Zoom Handlers
  // ============================================================================

  // Ref that always has the latest mode so pointer handlers don't go stale
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const polygonCloseRef = useRef(polygonCloseOnFinalize);
  polygonCloseRef.current = polygonCloseOnFinalize;

  /** Last known normalized cursor position (for vertex hit-testing on wheel) */
  const lastPointerRef = useRef<NormalizedPoint | null>(null);

  const handlePointerDown = useCallback(
    (event: SurfacePointerEvent) => {
      const native = event.nativeEvent;
      const currentMode = modeRef.current;

      // View mode OR middle-mouse in any mode → start pan
      if (currentMode === 'view' || native.button === 1) {
        isPanningRef.current = true;
        panStartRef.current = { x: native.clientX, y: native.clientY };
        panStartViewRef.current = { ...viewRef.current.pan };
        return;
      }

      // Left-button only for drawing / points
      if (native.button !== 0) return;
      if (!event.withinBounds) return;

      const activeLayer = layers.find((l) => l.id === activeLayerId);
      if (!activeLayer || activeLayer.locked) return;

      if (currentMode === 'draw' || currentMode === 'erase') {
        isDrawingRef.current = true;
        lastPointRef.current = event.normalized;
        // Snapshot layers BEFORE adding the stroke so undo can restore this state
        preStrokeLayersRef.current = layers;

        // Start new stroke
        const stroke: StrokeElement = {
          id: generateUUID(),
          type: 'stroke',
          layerId: activeLayerId!,
          visible: true,
          points: [
            {
              ...event.normalized,
              pressure: tool.pressureSensitive ? event.pressure : 1,
            },
          ],
          tool: { ...tool },
          isErase: currentMode === 'erase',
        };

        currentStrokeRef.current = stroke;

        // Add to layer immediately for live preview
        setLayers((prev) =>
          prev.map((l) =>
            l.id === activeLayerId ? { ...l, elements: [...l.elements, stroke] } : l
          )
        );
      } else if (currentMode === 'polygon') {
        if (!currentPolygonRef.current) {
          preShapeLayersRef.current = layers;

          const willClose = polygonCloseRef.current;
          const polygonId = addElement(activeLayerId!, {
            type: 'polygon',
            visible: true,
            closed: false,
            points: [event.normalized],
            pointWidths: willClose ? undefined : [tool.size * 500],
            style: {
              strokeColor: tool.color,
              fillColor: willClose ? 'rgba(255,255,255,0.18)' : undefined,
              strokeWidth: willClose ? 2 : tool.size * 500,
            },
            metadata: {
              curved: true,
            },
          } as Omit<PolygonElement, 'id' | 'layerId'>);

          currentPolygonRef.current = { layerId: activeLayerId!, elementId: polygonId };
        } else {
          const { layerId, elementId } = currentPolygonRef.current;
          const polygonLayer = layers.find((l) => l.id === layerId);
          const polygonElement = polygonLayer?.elements.find((e) => e.id === elementId && e.type === 'polygon') as PolygonElement | undefined;

          if (polygonElement && polygonElement.points.length > 0) {
            const threshold = Math.max(
              0.015,
              calculatePolygonVertexThreshold(polygonElement.points, 0.08),
            );
            const hit = findNearestPolygonVertex(event.normalized, polygonElement.points, threshold);
            if (hit.index >= 0) {
              activePolygonVertexDragRef.current = { layerId, elementId, vertexIndex: hit.index };
              return;
            }
          }

          setLayers((prev) =>
            prev.map((l) => {
              if (l.id !== layerId) return l;
              return {
                ...l,
                elements: l.elements.map((e) => {
                  if (e.id !== elementId || e.type !== 'polygon') return e;
                  const poly = e as PolygonElement;
                  return {
                    ...poly,
                    points: [...poly.points, event.normalized],
                    pointWidths: poly.pointWidths
                      ? [...poly.pointWidths, tool.size * 500]
                      : undefined,
                  };
                }),
              };
            })
          );
        }
      } else if (currentMode === 'point') {
        addElement(activeLayerId!, {
          type: 'point',
          visible: true,
          position: event.normalized,
          style: { color: tool.color, size: tool.size * 100 },
        } as Omit<PointElement, 'id' | 'layerId'>);
      }
    },
    [tool, layers, activeLayerId, addElement]
  );

  const handlePointerMove = useCallback(
    (event: SurfacePointerEvent) => {
      lastPointerRef.current = event.normalized;

      // Pan handling
      if (isPanningRef.current) {
        const native = event.nativeEvent;
        const dx = native.clientX - panStartRef.current.x;
        const dy = native.clientY - panStartRef.current.y;
        setView({
          pan: {
            x: panStartViewRef.current.x + dx,
            y: panStartViewRef.current.y + dy,
          },
        });
        return;
      }

      if (activePolygonVertexDragRef.current) {
        const { layerId, elementId, vertexIndex } = activePolygonVertexDragRef.current;
        const clampedPoint: NormalizedPoint = {
          x: Math.max(0, Math.min(1, event.normalized.x)),
          y: Math.max(0, Math.min(1, event.normalized.y)),
        };

        setLayers((prev) =>
          prev.map((l) => {
            if (l.id !== layerId) return l;
            return {
              ...l,
              elements: l.elements.map((e) => {
                if (e.id !== elementId || e.type !== 'polygon') return e;
                const poly = e as PolygonElement;
                return {
                  ...poly,
                  points: movePolygonVertex(poly.points, vertexIndex, clampedPoint, {
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1,
                  }) as NormalizedPoint[],
                };
              }),
            };
          })
        );
        return;
      }

      // Drawing handling
      if (!isDrawingRef.current || !currentStrokeRef.current) return;
      const currentMode = modeRef.current;
      if (!event.withinBounds && currentMode !== 'draw' && currentMode !== 'erase') return;

      const stroke = currentStrokeRef.current;
      const newPoint = {
        ...event.normalized,
        pressure: tool.pressureSensitive ? event.pressure : 1,
      };

      // Add point to current stroke
      stroke.points.push(newPoint);

      // Update the stroke in the layer
      setLayers((prev) =>
        prev.map((l) =>
          l.id === activeLayerId
            ? {
                ...l,
                elements: l.elements.map((e) =>
                  e.id === stroke.id ? { ...stroke } : e
                ),
              }
            : l
        )
      );

      lastPointRef.current = event.normalized;
    },
    [tool.pressureSensitive, activeLayerId, setView]
  );

  const handlePointerUp = useCallback(
    (event: SurfacePointerEvent) => {
      // End pan
      if (isPanningRef.current) {
        isPanningRef.current = false;
        return;
      }

      if (activePolygonVertexDragRef.current) {
        activePolygonVertexDragRef.current = null;
        return;
      }

      void event;
      if (!isDrawingRef.current) return;

      isDrawingRef.current = false;

      if (currentStrokeRef.current) {
        const completedStroke = currentStrokeRef.current;
        currentStrokeRef.current = null;
        lastPointRef.current = null;

        // Push the BEFORE-stroke snapshot so undo restores pre-stroke state
        const beforeLayers = preStrokeLayersRef.current;
        preStrokeLayersRef.current = null;
        if (beforeLayers) {
          pushHistory('Draw stroke', { layers: beforeLayers });
        }

        // Notify completion
        onStrokeComplete?.(completedStroke);
      }
    },
    [pushHistory, onStrokeComplete]
  );

  const handleDoubleClick = useCallback((event: SurfacePointerEvent) => {
    void event;
    if (modeRef.current !== 'polygon') return;
    const current = currentPolygonRef.current;
    if (!current) return;
    if (activePolygonVertexDragRef.current) return;

    const shouldClose = polygonCloseRef.current;
    const minPoints = shouldClose ? 3 : 2;

    let finalized = false;
    setLayers((prev) =>
      prev.map((l) => {
        if (l.id !== current.layerId) return l;
        return {
          ...l,
          elements: l.elements.flatMap((e) => {
            if (e.id !== current.elementId || e.type !== 'polygon') return [e];
            const poly = e as PolygonElement;
            if (poly.points.length < minPoints) {
              return [];
            }
            finalized = true;
            return [{ ...poly, closed: shouldClose }];
          }),
        };
      })
    );

    if (finalized && preShapeLayersRef.current) {
      pushHistory(shouldClose ? 'Create polygon' : 'Create curve', { layers: preShapeLayersRef.current });
    }
    preShapeLayersRef.current = null;
    currentPolygonRef.current = null;
  }, [pushHistory]);

  // ── Wheel → zoom centered on cursor ──────────────────────────────────

  const handleWheel = useCallback(
    (event: SurfaceWheelEvent) => {
      if (!event.withinBounds) return;

      // Per-point width adjustment: scroll on a vertex of an open polygon
      if (modeRef.current === 'polygon' && currentPolygonRef.current && !polygonCloseRef.current) {
        const { layerId, elementId } = currentPolygonRef.current;
        const cursor = lastPointerRef.current ?? event.normalized;
        const layer = layers.find((l) => l.id === layerId);
        const poly = layer?.elements.find(
          (e) => e.id === elementId && e.type === 'polygon',
        ) as PolygonElement | undefined;

        if (poly?.pointWidths && poly.points.length > 0) {
          const threshold = Math.max(
            0.02,
            calculatePolygonVertexThreshold(poly.points, 0.08),
          );
          const hit = findNearestPolygonVertex(cursor, poly.points, threshold);
          if (hit.index >= 0) {
            const delta = event.deltaY < 0 ? 1.5 : -1.5;
            const newWidths = [...poly.pointWidths];
            newWidths[hit.index] = Math.max(1, newWidths[hit.index] + delta);
            setLayers((prev) =>
              prev.map((l) => {
                if (l.id !== layerId) return l;
                return {
                  ...l,
                  elements: l.elements.map((e) => {
                    if (e.id !== elementId || e.type !== 'polygon') return e;
                    return { ...e, pointWidths: newWidths };
                  }),
                };
              }),
            );
            return; // consumed — don't zoom
          }
        }
      }

      const { zoom: currentZoom, pan } = viewRef.current;
      const { imageRect, normalized } = event;

      // Zoom factor: scroll down = zoom out, scroll up = zoom in
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.max(0.1, Math.min(10, currentZoom * factor));
      const dz = newZoom - currentZoom;

      // fitW/fitH = displayed image size at zoom 1
      const fitW = imageRect.width / currentZoom;
      const fitH = imageRect.height / currentZoom;

      // Keep point under cursor stationary
      const newPan = {
        x: pan.x - fitW * dz * (normalized.x - 0.5),
        y: pan.y - fitH * dz * (normalized.y - 0.5),
      };

      setView({ zoom: newZoom, pan: newPan });
    },
    [setView, layers],
  );

  // ============================================================================
  // Convenience Methods
  // ============================================================================

  const addPoint = useCallback(
    (position: NormalizedPoint, options?: Partial<PointElement>): string => {
      if (!activeLayerId) {
        const layerId = addLayer({ type: 'annotation', name: 'Points' });
        return addElement(layerId, {
          type: 'point',
          visible: true,
          position,
          ...options,
        } as Omit<PointElement, 'id' | 'layerId'>);
      }

      return addElement(activeLayerId, {
        type: 'point',
        visible: true,
        position,
        ...options,
      } as Omit<PointElement, 'id' | 'layerId'>);
    },
    [activeLayerId, addLayer, addElement]
  );

  const addRegion = useCallback(
    (bounds: NormalizedRect, options?: Partial<RegionElement>): string => {
      if (!activeLayerId) {
        const layerId = addLayer({ type: 'region', name: 'Regions' });
        return addElement(layerId, {
          type: 'region',
          visible: true,
          bounds,
          ...options,
        } as Omit<RegionElement, 'id' | 'layerId'>);
      }

      return addElement(activeLayerId, {
        type: 'region',
        visible: true,
        bounds,
        ...options,
      } as Omit<RegionElement, 'id' | 'layerId'>);
    },
    [activeLayerId, addLayer, addElement]
  );

  const addPolygon = useCallback(
    (points: NormalizedPoint[], options?: Partial<PolygonElement>): string => {
      if (!activeLayerId) {
        const layerId = addLayer({ type: 'annotation', name: 'Polygons' });
        return addElement(layerId, {
          type: 'polygon',
          visible: true,
          points,
          closed: true,
          ...options,
        } as Omit<PolygonElement, 'id' | 'layerId'>);
      }

      return addElement(activeLayerId, {
        type: 'polygon',
        visible: true,
        points,
        closed: true,
        ...options,
      } as Omit<PolygonElement, 'id' | 'layerId'>);
    },
    [activeLayerId, addLayer, addElement]
  );

  // ============================================================================
  // Export
  // ============================================================================

  const exportLayerAsMask = useCallback(
    (layerId: string, width: number, height: number): string | null => {
      const layer = layers.find((l) => l.id === layerId);
      if (!layer) return null;

      // Create offscreen canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Fill with black (preserve areas)
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      // Draw strokes in white (inpaint areas)
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const tracePolygonPath = (poly: PolygonElement) => {
        if (poly.points.length < 2) return false;
        const curved = !!(poly.metadata as Record<string, unknown> | undefined)?.curved;
        const pts = poly.points;
        const sx = (x: number) => x * width;
        const sy = (y: number) => y * height;

        const pathPoints = curved && pts.length >= 3
          ? smoothPathPoints(pts, poly.closed, 0.5, 8)
          : pts;

        if (pathPoints.length < 2) return false;

        if (!curved || pts.length < 3) {
          ctx.moveTo(sx(pts[0].x), sy(pts[0].y));
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(sx(pts[i].x), sy(pts[i].y));
          }
          if (poly.closed) ctx.closePath();
          return true;
        }

        ctx.moveTo(sx(pathPoints[0].x), sy(pathPoints[0].y));
        for (let i = 1; i < pathPoints.length; i++) {
          ctx.lineTo(sx(pathPoints[i].x), sy(pathPoints[i].y));
        }
        if (poly.closed) {
          ctx.closePath();
        }
        return true;
      };

      for (const element of layer.elements) {
        if (element.type === 'stroke' && !element.isErase) {
          const stroke = element as StrokeElement;
          if (stroke.points.length < 2) continue;

          ctx.lineWidth = stroke.tool.size * width;
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x * width, stroke.points[0].y * height);

          for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x * width, stroke.points[i].y * height);
          }

          ctx.stroke();
          continue;
        }

        if (element.type === 'polygon') {
          const poly = element as PolygonElement;
          if (!poly.closed || poly.points.length < 3) continue;
          ctx.beginPath();
          if (tracePolygonPath(poly)) {
            ctx.fill();
          }
          continue;
        }

        if (element.type === 'region') {
          const region = element as RegionElement;
          ctx.fillRect(
            region.bounds.x * width,
            region.bounds.y * height,
            region.bounds.width * width,
            region.bounds.height * height,
          );
        }
      }

      // Handle erase strokes (set back to black)
      ctx.strokeStyle = '#000000';
      ctx.fillStyle = '#000000';
      ctx.globalCompositeOperation = 'destination-out';

      for (const element of layer.elements) {
        if (element.type === 'stroke' && element.isErase) {
          const stroke = element as StrokeElement;
          if (stroke.points.length < 2) continue;

          ctx.lineWidth = stroke.tool.size * width;
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x * width, stroke.points[0].y * height);

          for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x * width, stroke.points[i].y * height);
          }

          ctx.stroke();
        }
      }

      return canvas.toDataURL('image/png');
    },
    [layers]
  );

  const exportAllLayers = useCallback(() => {
    return layers;
  }, [layers]);

  // ============================================================================
  // Event Handlers for Surface
  // ============================================================================

  const handlers = useMemo<SurfaceEventHandlers>(
    () => ({
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onDoubleClick: handleDoubleClick,
      onWheel: handleWheel,
    }),
    [handlePointerDown, handlePointerMove, handlePointerUp, handleDoubleClick, handleWheel]
  );

  // ============================================================================
  // Notify on state change
  // ============================================================================

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    state,
    handlers,

    // Mode
    setMode,

    // Tool
    setTool,
    setBrushSize,
    setBrushColor,
    setBrushOpacity,

    // View
    setZoom,
    setPan,
    setView,
    setFitMode,
    resetView,

    // Layers
    addLayer,
    removeLayer,
    setActiveLayer,
    updateLayer,
    getLayer,
    clearLayer,

    // Elements
    addElement,
    removeElement,
    updateElement,
    getElement,

    // Selection
    selectElements,
    clearSelection,

    // History
    undo,
    redo,
    canUndo: historyIndex >= 0,
    canRedo: historyIndex < history.length - 1,
    clearHistory,

    // Convenience
    addPoint,
    addRegion,
    addPolygon,

    // Export
    exportLayerAsMask,
    exportAllLayers,
  };
}
