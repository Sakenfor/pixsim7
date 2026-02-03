/**
 * useInteractionLayer
 *
 * Hook for managing interaction layers, elements, and drawing state.
 * Provides high-level API for common operations like drawing, erasing,
 * creating regions, and managing undo/redo history.
 */

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
  SurfacePointerEvent,
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

  const pushHistory = useCallback(
    (description: string, stateDelta: Partial<SurfaceState>) => {
      const entry: HistoryEntry = {
        id: generateUUID(),
        description,
        state: stateDelta,
        timestamp: Date.now(),
      };

      setHistory((prev) => {
        // Remove any redo entries
        const newHistory = prev.slice(0, historyIndex + 1);
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
    [historyIndex, maxHistorySize]
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
    setModeState(newMode);
  }, []);

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
  // Drawing Handlers
  // ============================================================================

  const handlePointerDown = useCallback(
    (event: SurfacePointerEvent) => {
      if (!event.withinBounds) return;

      const activeLayer = layers.find((l) => l.id === activeLayerId);
      if (!activeLayer || activeLayer.locked) return;

      if (mode === 'draw' || mode === 'erase') {
        isDrawingRef.current = true;
        lastPointRef.current = event.normalized;

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
          isErase: mode === 'erase',
        };

        currentStrokeRef.current = stroke;

        // Add to layer immediately for live preview
        setLayers((prev) =>
          prev.map((l) =>
            l.id === activeLayerId ? { ...l, elements: [...l.elements, stroke] } : l
          )
        );
      } else if (mode === 'point') {
        addElement(activeLayerId!, {
          type: 'point',
          visible: true,
          position: event.normalized,
          style: { color: tool.color, size: tool.size * 100 },
        } as Omit<PointElement, 'id' | 'layerId'>);
      }
    },
    [mode, tool, layers, activeLayerId, addElement]
  );

  const handlePointerMove = useCallback(
    (event: SurfacePointerEvent) => {
      if (!isDrawingRef.current || !currentStrokeRef.current) return;
      if (!event.withinBounds && mode !== 'draw' && mode !== 'erase') return;

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
    [mode, tool.pressureSensitive, activeLayerId]
  );

  const handlePointerUp = useCallback(
    (event: SurfacePointerEvent) => {
      void event;
      if (!isDrawingRef.current) return;

      isDrawingRef.current = false;

      if (currentStrokeRef.current) {
        const completedStroke = currentStrokeRef.current;
        currentStrokeRef.current = null;
        lastPointRef.current = null;

        // Push to history
        pushHistory('Draw stroke', { layers });

        // Notify completion
        onStrokeComplete?.(completedStroke);
      }
    },
    [layers, pushHistory, onStrokeComplete]
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
    }),
    [handlePointerDown, handlePointerMove, handlePointerUp]
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
