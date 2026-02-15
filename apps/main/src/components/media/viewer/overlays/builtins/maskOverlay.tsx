/**
 * Mask Overlay
 *
 * Viewer overlay for drawing inpainting masks on images.
 * Uses the interactive surface system for brush/erase, undo/redo, and mask export.
 * Exported masks are uploaded as assets and wired into the generation flow via mask_url.
 */

import { buildMaskFilename, buildMaskUploadContext } from '@pixsim7/shared.media.core';
import { useToast } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { getAsset } from '@lib/api/assets';
import { uploadAsset } from '@lib/api/upload';
import { Icon } from '@lib/icons';

import type { ViewerAsset } from '@features/assets';
import { assetEvents } from '@features/assets/lib/assetEvents';
import { useGenerationScopeStores } from '@features/generation';

import {
  InteractiveImageSurface,
  useInteractionLayer,
} from '@/components/interactive-surface';
import { useAuthenticatedMedia } from '@/hooks/useAuthenticatedMedia';

import {
  getToolbarButtonClass,
  TOOLBAR_BUTTON_BASE,
  TOOLBAR_BUTTON_INACTIVE,
  TOOLBAR_BUTTON_DISABLED,
} from '../styles';
import type { MediaOverlayComponentProps } from '../types';

import { useMaskOverlayStore } from './maskOverlayStore';

// ── Constants ──────────────────────────────────────────────────────────

const MASK_LAYER_ID = 'mask-layer';

// ── Provider ID resolution (same pattern as useFrameCapture) ──────────

function resolveMaskProviderId(asset: ViewerAsset): string | null {
  const providerId = asset.metadata?.providerId;
  if (providerId) return providerId;
  if (asset.source !== 'local') return null;
  try {
    const raw = localStorage.getItem('ps7_localFolders_providerId');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

// ── MaskOverlayMain ───────────────────────────────────────────────────

export function MaskOverlayMain({ asset, mediaDimensions }: MediaOverlayComponentProps) {
  const toast = useToast();
  const store = useMaskOverlayStore;
  const { useSettingsStore } = useGenerationScopeStores();
  const setParam = useSettingsStore((s) => s.setParam);

  // Resolve authenticated image URL
  const imageUrl = asset.fullUrl || asset.url;
  const { src: resolvedSrc } = useAuthenticatedMedia(imageUrl);

  // Set up interaction layer
  const interaction = useInteractionLayer({
    initialMode: 'draw',
    initialTool: { size: 0.03, color: '#ffffff', opacity: 0.7 },
  });

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
  } = interaction;

  // Create mask layer on mount
  useEffect(() => {
    if (!getLayer(MASK_LAYER_ID)) {
      addLayer({ type: 'mask', name: 'Mask', id: MASK_LAYER_ID });
    }
  }, [addLayer, getLayer]);

  // Check if layer has content
  const hasContent = useMemo(() => {
    const layer = getLayer(MASK_LAYER_ID);
    return layer ? layer.elements.length > 0 : false;
  }, [getLayer, state.layers]);

  // Sync state to bridge store
  useEffect(() => {
    store.getState()._syncState({
      mode: state.mode,
      brushSize: state.tool.size,
      brushOpacity: state.tool.opacity,
      canUndo,
      canRedo,
      hasContent,
    });
  }, [state.mode, state.tool.size, state.tool.opacity, canUndo, canRedo, hasContent, store]);

  // ── Ref-based callback bridge ──────────────────────────────────────
  // The undo/redo/clearLayer/exportMask functions from useInteractionLayer
  // recreate on every history change (they close over history/historyIndex).
  // Registering them directly into the store causes the Toolbar to hold
  // stale references. Instead, keep a ref that always points to the latest
  // callbacks, and register stable wrappers once.

  const callbacksRef = useRef({
    setMode,
    setBrushSize,
    setBrushOpacity,
    undo,
    redo,
    clearLayer: () => clearLayer(MASK_LAYER_ID),
    exportMask: async () => {},
  });

  // Keep ref current on every render
  callbacksRef.current.setMode = setMode;
  callbacksRef.current.setBrushSize = setBrushSize;
  callbacksRef.current.setBrushOpacity = setBrushOpacity;
  callbacksRef.current.undo = undo;
  callbacksRef.current.redo = redo;
  callbacksRef.current.clearLayer = () => clearLayer(MASK_LAYER_ID);

  // Export mask callback
  const isSavingRef = useRef(false);
  const exportMask = useCallback(async () => {
    if (isSavingRef.current) return;

    const providerId = resolveMaskProviderId(asset);
    if (!providerId) {
      toast.error('Select a provider to save masks.');
      return;
    }

    const width = mediaDimensions?.width || 1024;
    const height = mediaDimensions?.height || 1024;
    const maskDataUrl = exportLayerAsMask(MASK_LAYER_ID, width, height);
    if (!maskDataUrl) {
      toast.error('No mask content to export.');
      return;
    }

    isSavingRef.current = true;
    store.getState()._syncState({ isSaving: true });

    try {
      // Convert data URL to Blob
      const res = await fetch(maskDataUrl);
      const blob = await res.blob();

      const assetId = typeof asset.id === 'number' ? asset.id : Number(asset.id);
      const filename = buildMaskFilename(assetId);
      const uploadContext = buildMaskUploadContext({
        sourceAssetId: Number.isFinite(assetId) ? assetId : undefined,
        feature: 'mask_overlay',
        source: 'asset_viewer',
      });

      const uploadResult = await uploadAsset({
        file: blob,
        filename,
        providerId,
        uploadMethod: 'mask_draw',
        uploadContext,
      });

      const newAssetId = uploadResult.asset_id;

      // Fetch and emit so it appears in gallery
      if (newAssetId) {
        try {
          const newAsset = await getAsset(newAssetId);
          assetEvents.emitAssetCreated(newAsset);
        } catch {
          // Non-critical
        }

        // Wire mask into generation flow
        setParam('mask_url', `asset:${newAssetId}`);
      }

      toast.success('Mask saved and attached to generation.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save mask.';
      toast.error(message);
    } finally {
      isSavingRef.current = false;
      store.getState()._syncState({ isSaving: false });
    }
  }, [asset, mediaDimensions, exportLayerAsMask, toast, setParam, store]);

  // Keep exportMask in ref too
  callbacksRef.current.exportMask = exportMask;

  // Register stable wrapper callbacks into bridge store (once)
  useEffect(() => {
    store.getState()._registerCallbacks({
      setMode: (...args) => callbacksRef.current.setMode(...args),
      setBrushSize: (...args) => callbacksRef.current.setBrushSize(...args),
      setBrushOpacity: (...args) => callbacksRef.current.setBrushOpacity(...args),
      undo: () => callbacksRef.current.undo(),
      redo: () => callbacksRef.current.redo(),
      clearLayer: () => callbacksRef.current.clearLayer(),
      exportMask: () => callbacksRef.current.exportMask(),
    });
  }, [store]);

  // Keyboard shortcuts (also use ref to avoid stale closures)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && e.shiftKey) {
          e.preventDefault();
          callbacksRef.current.redo();
        } else if (e.key === 'z') {
          e.preventDefault();
          callbacksRef.current.undo();
        } else if (e.key === 'y') {
          e.preventDefault();
          callbacksRef.current.redo();
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'd':
          callbacksRef.current.setMode('draw');
          break;
        case 'e':
          callbacksRef.current.setMode('erase');
          break;
        case 'v':
          callbacksRef.current.setMode('view');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const media = useMemo(
    () => resolvedSrc ? { type: 'image' as const, url: resolvedSrc } : null,
    [resolvedSrc],
  );

  if (!media) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-xs">
        Loading image...
      </div>
    );
  }

  const cursor = state.mode === 'draw' || state.mode === 'erase' ? 'crosshair' : 'grab';

  return (
    <div className="absolute inset-0">
      <InteractiveImageSurface
        media={media}
        state={state}
        handlers={handlers}
        cursor={cursor}
        className="w-full h-full"
      />
    </div>
  );
}

// ── MaskOverlayToolbar ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function MaskOverlayToolbar(_props: MediaOverlayComponentProps) {
  const {
    mode,
    brushSize,
    brushOpacity,
    canUndo,
    canRedo,
    hasContent,
    isSaving,
    setMode,
    setBrushSize,
    setBrushOpacity,
    undo,
    redo,
    clearLayer,
    exportMask,
  } = useMaskOverlayStore();

  return (
    <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800/90 border-b border-neutral-700 text-xs">
      <span className="text-neutral-400 mr-1">Mode:</span>

      <button
        onClick={() => setMode('draw')}
        className={getToolbarButtonClass(mode === 'draw')}
        title="Draw mask (D)"
      >
        Draw
      </button>
      <button
        onClick={() => setMode('erase')}
        className={getToolbarButtonClass(mode === 'erase')}
        title="Erase mask (E)"
      >
        Erase
      </button>
      <button
        onClick={() => setMode('view')}
        className={getToolbarButtonClass(mode === 'view')}
        title="View/pan (V)"
      >
        View
      </button>

      <div className="w-px h-4 bg-neutral-600 mx-1" />

      {/* Brush size slider */}
      <label className="flex items-center gap-1 text-neutral-400" title="Brush size">
        <span className="text-[10px]">Size</span>
        <input
          type="range"
          min={0.005}
          max={0.15}
          step={0.005}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="w-16 h-1 accent-blue-500"
        />
      </label>

      {/* Opacity slider */}
      <label className="flex items-center gap-1 text-neutral-400" title="Brush opacity">
        <span className="text-[10px]">Opacity</span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.1}
          value={brushOpacity}
          onChange={(e) => setBrushOpacity(Number(e.target.value))}
          className="w-14 h-1 accent-blue-500"
        />
      </label>

      <div className="w-px h-4 bg-neutral-600 mx-1" />

      {/* Undo / Redo */}
      <button
        onClick={undo}
        disabled={!canUndo}
        className={`${TOOLBAR_BUTTON_BASE} ${TOOLBAR_BUTTON_INACTIVE} ${TOOLBAR_BUTTON_DISABLED}`}
        title="Undo (Ctrl+Z)"
      >
        <Icon name="undo" size={12} />
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        className={`${TOOLBAR_BUTTON_BASE} ${TOOLBAR_BUTTON_INACTIVE} ${TOOLBAR_BUTTON_DISABLED}`}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Icon name="redo" size={12} />
      </button>

      {/* Clear */}
      <button
        onClick={clearLayer}
        disabled={!hasContent}
        className={`${TOOLBAR_BUTTON_BASE} ${TOOLBAR_BUTTON_INACTIVE} ${TOOLBAR_BUTTON_DISABLED}`}
        title="Clear mask"
      >
        Clear
      </button>

      <div className="flex-1" />

      <span className="text-neutral-500 text-[10px]">
        {mode === 'draw' && 'Draw to create inpaint mask'}
        {mode === 'erase' && 'Erase mask regions'}
        {mode === 'view' && 'Pan / zoom'}
      </span>

      {/* Save Mask */}
      <button
        onClick={exportMask}
        disabled={!hasContent || isSaving}
        className={`${TOOLBAR_BUTTON_BASE} ${hasContent && !isSaving ? 'bg-blue-600 hover:bg-blue-500 text-white' : TOOLBAR_BUTTON_INACTIVE} ${TOOLBAR_BUTTON_DISABLED}`}
        title="Save mask and attach to generation"
      >
        {isSaving ? 'Saving...' : 'Save Mask'}
      </button>
    </div>
  );
}
