/**
 * InteractiveSurfacePanel Component
 *
 * Context-aware interactive surface panel that provides:
 * - Canvas overlay for drawing/annotating on images/videos
 * - Mask creation for inpainting workflows
 * - Region tagging with metadata
 * - Video timestamp annotations
 *
 * Receives asset context from the panel system and exposes
 * interaction state via the capability system.
 */

import { useEffect, useMemo, useCallback, useRef } from 'react';

import type { ViewerAsset } from '@features/assets';
import {
  CAP_ASSET_SELECTION,
  useCapability,
  type AssetSelection,
} from '@features/contextHub';

import {
  InteractiveImageSurface,
  useInteractionLayer,
  type InteractiveImageSurfaceHandle,
} from '@/components/interactive-surface';
import { useAuthenticatedMedia } from '@/hooks/useAuthenticatedMedia';

// ============================================================================
// Types
// ============================================================================

export interface InteractiveSurfacePanelContext {
  /** Current asset being viewed */
  currentAsset?: ViewerAsset | null;
  /** Callback when mask is exported */
  onMaskExport?: (maskDataUrl: string, layerId: string) => void;
  /** Callback when surface state changes */
  onStateChange?: (state: any) => void;
  /** Any other context data */
  [key: string]: unknown;
}

export interface InteractiveSurfacePanelProps {
  /** Workspace context */
  context?: InteractiveSurfacePanelContext;
  /** Panel-specific params from dockview */
  params?: Record<string, any>;
  /** Panel ID */
  panelId?: string;
}

// ============================================================================
// Toolbar Component
// ============================================================================

interface ToolbarProps {
  mode: string;
  brushSize: number;
  brushOpacity: number;
  onModeChange: (mode: 'view' | 'draw' | 'erase') => void;
  onBrushSizeChange: (size: number) => void;
  onBrushOpacityChange: (opacity: number) => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  canUndo: boolean;
  canRedo: boolean;
  hasContent: boolean;
}

function Toolbar({
  mode,
  brushSize,
  brushOpacity,
  onModeChange,
  onBrushSizeChange,
  onBrushOpacityChange,
  onClear,
  onUndo,
  onRedo,
  onExport,
  canUndo,
  canRedo,
  hasContent,
}: ToolbarProps) {
  const buttonBase =
    'px-2 py-1 text-xs rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const buttonActive = 'bg-blue-600 text-white';
  const buttonInactive =
    'bg-neutral-700 hover:bg-neutral-600 text-neutral-200';

  return (
    <div className="flex items-center gap-1.5 p-1.5 bg-neutral-800/90 border-b border-neutral-700 text-xs">
      {/* Mode buttons */}
      <div className="flex gap-0.5">
        <button
          onClick={() => onModeChange('view')}
          className={`${buttonBase} ${mode === 'view' ? buttonActive : buttonInactive}`}
          title="View mode (V)"
        >
          View
        </button>
        <button
          onClick={() => onModeChange('draw')}
          className={`${buttonBase} ${mode === 'draw' ? buttonActive : buttonInactive}`}
          title="Draw mode (D)"
        >
          Draw
        </button>
        <button
          onClick={() => onModeChange('erase')}
          className={`${buttonBase} ${mode === 'erase' ? buttonActive : buttonInactive}`}
          title="Erase mode (E)"
        >
          Erase
        </button>
      </div>

      <div className="w-px h-4 bg-neutral-600" />

      {/* Brush size */}
      <div className="flex items-center gap-1">
        <span className="text-neutral-400 text-[10px]">Size</span>
        <input
          type="range"
          min="0.005"
          max="0.15"
          step="0.005"
          value={brushSize}
          onChange={(e) => onBrushSizeChange(parseFloat(e.target.value))}
          className="w-14 h-1 accent-blue-500"
        />
      </div>

      {/* Opacity */}
      <div className="flex items-center gap-1">
        <span className="text-neutral-400 text-[10px]">Opacity</span>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.1"
          value={brushOpacity}
          onChange={(e) => onBrushOpacityChange(parseFloat(e.target.value))}
          className="w-10 h-1 accent-blue-500"
        />
      </div>

      <div className="flex-1" />

      {/* Undo/Redo */}
      <div className="flex gap-0.5">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={buttonBase + ' ' + buttonInactive}
          title="Undo (Ctrl+Z)"
        >
          ↩
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={buttonBase + ' ' + buttonInactive}
          title="Redo (Ctrl+Y)"
        >
          ↪
        </button>
      </div>

      <div className="w-px h-4 bg-neutral-600" />

      {/* Clear & Export */}
      <button
        onClick={onClear}
        disabled={!hasContent}
        className={`${buttonBase} bg-red-700/80 hover:bg-red-600 text-white disabled:bg-neutral-700`}
        title="Clear all"
      >
        Clear
      </button>
      <button
        onClick={onExport}
        disabled={!hasContent}
        className={`${buttonBase} bg-green-700/80 hover:bg-green-600 text-white disabled:bg-neutral-700`}
        title="Export mask"
      >
        Export
      </button>
    </div>
  );
}

// ============================================================================
// Main Panel Component
// ============================================================================

const MASK_LAYER_ID = 'mask-layer';

export function InteractiveSurfacePanel({
  context,
  params,
}: InteractiveSurfacePanelProps) {
  const surfaceRef = useRef<InteractiveImageSurfaceHandle>(null);
  const { value: selection } = useCapability<AssetSelection>(CAP_ASSET_SELECTION);

  // Get asset from context hierarchy
  const asset = useMemo(() => {
    return context?.currentAsset || params?.asset || selection?.asset || null;
  }, [context?.currentAsset, params?.asset, selection?.asset]);

  // Initialize interaction layer
  const {
    state,
    handlers,
    setMode,
    setBrushSize,
    setBrushOpacity,
    addLayer,
    getLayer,
    clearLayer,
    undo,
    redo,
    canUndo,
    canRedo,
    exportLayerAsMask,
  } = useInteractionLayer({
    initialMode: 'draw',
    initialTool: {
      size: 0.03,
      color: '#ffffff',
      opacity: 0.7,
    },
    onStateChange: context?.onStateChange,
  });

  // Create mask layer on mount
  useEffect(() => {
    if (!getLayer(MASK_LAYER_ID)) {
      addLayer({
        type: 'mask',
        name: 'Mask',
        id: MASK_LAYER_ID,
      });
    }
  }, [addLayer, getLayer]);

  // Check if layer has content
  const hasContent = useMemo(() => {
    const layer = getLayer(MASK_LAYER_ID);
    return layer ? layer.elements.length > 0 : false;
  }, [getLayer, state.layers]);

  // Handlers
  const handleModeChange = useCallback(
    (mode: 'view' | 'draw' | 'erase') => {
      setMode(mode);
    },
    [setMode]
  );

  const handleClear = useCallback(() => {
    clearLayer(MASK_LAYER_ID);
  }, [clearLayer]);

  const handleExport = useCallback(() => {
    if (!asset) return;

    // Export at the asset's resolution or a reasonable default
    const width = 1024;
    const height = 1024;

    const maskDataUrl = exportLayerAsMask(MASK_LAYER_ID, width, height);
    if (maskDataUrl) {
      context?.onMaskExport?.(maskDataUrl, MASK_LAYER_ID);

      // Also log for debugging
      console.log('[InteractiveSurfacePanel] Mask exported:', {
        layerId: MASK_LAYER_ID,
        width,
        height,
        dataUrlLength: maskDataUrl.length,
      });
    }
  }, [asset, exportLayerAsMask, context]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if in input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'v':
          setMode('view');
          break;
        case 'd':
          setMode('draw');
          break;
        case 'e':
          setMode('erase');
          break;
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              redo();
            } else {
              undo();
            }
          }
          break;
        case 'y':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            redo();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setMode, undo, redo]);

  // Determine cursor
  const cursor =
    state.mode === 'draw'
      ? 'crosshair'
      : state.mode === 'erase'
        ? 'cell'
        : 'grab';

  // Use authenticated fetching for backend URLs
  const rawMediaUrl = asset?.fullUrl || asset?.url;
  const { src: authenticatedUrl, loading: mediaLoading } = useAuthenticatedMedia(rawMediaUrl);

  // No asset - show placeholder
  if (!asset) {
    return (
      <div className="h-full flex items-center justify-center p-4 text-center bg-neutral-900">
        <div className="max-w-sm">
          <div className="text-neutral-500 dark:text-neutral-400 text-sm mb-2">
            No Asset Selected
          </div>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            Select an image or video asset to use the interactive surface for
            mask creation and annotations.
          </p>
        </div>
      </div>
    );
  }

  // Show loading state while fetching authenticated media
  if (mediaLoading || !authenticatedUrl) {
    return (
      <div className="h-full flex items-center justify-center bg-neutral-900">
        <div className="animate-spin w-8 h-8 border-2 border-neutral-300 border-t-neutral-600 rounded-full" />
      </div>
    );
  }

  // Build media object with authenticated URL
  const media = {
    type: asset.type as 'image' | 'video',
    url: authenticatedUrl,
  };

  return (
    <div className="h-full flex flex-col bg-neutral-900">
      <Toolbar
        mode={state.mode}
        brushSize={state.tool.size}
        brushOpacity={state.tool.opacity}
        onModeChange={handleModeChange}
        onBrushSizeChange={setBrushSize}
        onBrushOpacityChange={setBrushOpacity}
        onClear={handleClear}
        onUndo={undo}
        onRedo={redo}
        onExport={handleExport}
        canUndo={canUndo}
        canRedo={canRedo}
        hasContent={hasContent}
      />

      <div className="flex-1 min-h-0">
        <InteractiveImageSurface
          ref={surfaceRef}
          media={media}
          state={state}
          handlers={handlers}
          cursor={cursor}
          className="w-full h-full"
        />
      </div>
    </div>
  );
}
