/**
 * InteractiveSurfaceDemo
 *
 * Demo component showing how to use InteractiveImageSurface
 * with the useInteractionLayer hook for mask drawing.
 *
 * This can be used as a reference for implementing mask editors,
 * annotation tools, or other interactive overlays.
 */

import { useEffect, useRef, useCallback } from 'react';
import { InteractiveImageSurface } from './InteractiveImageSurface';
import { useInteractionLayer } from './useInteractionLayer';
import type { InteractiveImageSurfaceHandle } from './InteractiveImageSurface';

interface InteractiveSurfaceToolbarProps {
  mode: string;
  brushSize: number;
  brushColor: string;
  onModeChange: (mode: 'view' | 'draw' | 'erase') => void;
  onBrushSizeChange: (size: number) => void;
  onBrushColorChange: (color: string) => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

function InteractiveSurfaceToolbar({
  mode,
  brushSize,
  brushColor,
  onModeChange,
  onBrushSizeChange,
  onBrushColorChange,
  onClear,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: InteractiveSurfaceToolbarProps) {
  return (
    <div className="flex items-center gap-2 p-2 bg-neutral-800 rounded-lg text-sm">
      {/* Mode buttons */}
      <div className="flex gap-1">
        <button
          onClick={() => onModeChange('view')}
          className={`px-2 py-1 rounded ${
            mode === 'view' ? 'bg-blue-600' : 'bg-neutral-700 hover:bg-neutral-600'
          }`}
          title="View mode (pan/zoom)"
        >
          View
        </button>
        <button
          onClick={() => onModeChange('draw')}
          className={`px-2 py-1 rounded ${
            mode === 'draw' ? 'bg-blue-600' : 'bg-neutral-700 hover:bg-neutral-600'
          }`}
          title="Draw mode"
        >
          Draw
        </button>
        <button
          onClick={() => onModeChange('erase')}
          className={`px-2 py-1 rounded ${
            mode === 'erase' ? 'bg-blue-600' : 'bg-neutral-700 hover:bg-neutral-600'
          }`}
          title="Erase mode"
        >
          Erase
        </button>
      </div>

      <div className="w-px h-6 bg-neutral-600" />

      {/* Brush size */}
      <div className="flex items-center gap-2">
        <label className="text-neutral-400">Size:</label>
        <input
          type="range"
          min="0.005"
          max="0.1"
          step="0.005"
          value={brushSize}
          onChange={(e) => onBrushSizeChange(parseFloat(e.target.value))}
          className="w-20"
        />
        <span className="text-neutral-300 w-8">{Math.round(brushSize * 100)}%</span>
      </div>

      <div className="w-px h-6 bg-neutral-600" />

      {/* Brush color */}
      <div className="flex items-center gap-2">
        <label className="text-neutral-400">Color:</label>
        <input
          type="color"
          value={brushColor}
          onChange={(e) => onBrushColorChange(e.target.value)}
          className="w-8 h-6 rounded cursor-pointer"
        />
      </div>

      <div className="w-px h-6 bg-neutral-600" />

      {/* Undo/Redo */}
      <div className="flex gap-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`px-2 py-1 rounded ${
            canUndo ? 'bg-neutral-700 hover:bg-neutral-600' : 'bg-neutral-800 text-neutral-600'
          }`}
          title="Undo"
        >
          Undo
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`px-2 py-1 rounded ${
            canRedo ? 'bg-neutral-700 hover:bg-neutral-600' : 'bg-neutral-800 text-neutral-600'
          }`}
          title="Redo"
        >
          Redo
        </button>
      </div>

      <div className="w-px h-6 bg-neutral-600" />

      {/* Clear */}
      <button
        onClick={onClear}
        className="px-2 py-1 rounded bg-red-700 hover:bg-red-600"
        title="Clear all"
      >
        Clear
      </button>
    </div>
  );
}

interface InteractiveSurfaceDemoProps {
  /** Image URL to display */
  imageUrl: string;
  /** Optional callback when mask is exported */
  onMaskExport?: (maskDataUrl: string) => void;
  /** Optional class name */
  className?: string;
}

export function InteractiveSurfaceDemo({
  imageUrl,
  onMaskExport,
  className = '',
}: InteractiveSurfaceDemoProps) {
  const surfaceRef = useRef<InteractiveImageSurfaceHandle>(null);

  const {
    state,
    handlers,
    setMode,
    setBrushSize,
    setBrushColor,
    addLayer,
    clearLayer,
    undo,
    redo,
    canUndo,
    canRedo,
    exportLayerAsMask,
  } = useInteractionLayer({
    initialMode: 'draw',
    initialTool: {
      size: 0.02,
      color: '#ffffff',
      opacity: 0.7,
    },
  });

  // Create mask layer on mount
  useEffect(() => {
    addLayer({ type: 'mask', name: 'Mask', id: 'mask-layer' });
  }, [addLayer]);

  const handleModeChange = useCallback(
    (mode: 'view' | 'draw' | 'erase') => {
      setMode(mode);
    },
    [setMode]
  );

  const handleClear = useCallback(() => {
    clearLayer('mask-layer');
  }, [clearLayer]);

  const handleExportMask = useCallback(() => {
    // Export at a reasonable resolution
    const maskDataUrl = exportLayerAsMask('mask-layer', 1024, 1024);
    if (maskDataUrl && onMaskExport) {
      onMaskExport(maskDataUrl);
    }
  }, [exportLayerAsMask, onMaskExport]);

  // Determine cursor based on mode
  const cursor =
    state.mode === 'draw'
      ? 'crosshair'
      : state.mode === 'erase'
        ? 'cell'
        : 'grab';

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <InteractiveSurfaceToolbar
        mode={state.mode}
        brushSize={state.tool.size}
        brushColor={state.tool.color}
        onModeChange={handleModeChange}
        onBrushSizeChange={setBrushSize}
        onBrushColorChange={setBrushColor}
        onClear={handleClear}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      <div className="flex-1 bg-neutral-900 rounded-lg overflow-hidden">
        <InteractiveImageSurface
          ref={surfaceRef}
          media={{ type: 'image', url: imageUrl }}
          state={state}
          handlers={handlers}
          cursor={cursor}
          className="w-full h-full"
        />
      </div>

      {onMaskExport && (
        <div className="flex justify-end">
          <button
            onClick={handleExportMask}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium"
          >
            Export Mask
          </button>
        </div>
      )}
    </div>
  );
}

export default InteractiveSurfaceDemo;
