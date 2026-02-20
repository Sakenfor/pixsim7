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
  type AnyElement,
  InteractiveImageSurface,
  type InteractionMode,
  useInteractionLayer,
} from '@/components/interactive-surface';
import { useAuthenticatedMedia } from '@/hooks/useAuthenticatedMedia';

import { resolveViewerAssetProviderId } from '../../utils/providerResolution';
import type { MediaOverlayComponentProps } from '../types';

import { useMaskOverlayStore } from './maskOverlayStore';

// ── Constants ──────────────────────────────────────────────────────────

const MASK_LAYER_ID = 'mask-layer';
const MASK_DRAFT_STORAGE_PREFIX = 'ps7_mask_overlay_draft_v1';
const MASK_DRAFT_SAVE_DEBOUNCE_MS = 250;

type MaskDraftMode = 'draw' | 'erase' | 'view';

interface MaskOverlayDraft {
  version: 1;
  savedAt: number;
  mode: MaskDraftMode;
  brushSize: number;
  brushOpacity: number;
  elements: AnyElement[];
}

// ── Provider ID resolution (same pattern as useFrameCapture) ──────────

function getMaskDraftStorageKey(asset: ViewerAsset): string {
  const identity = asset.source === 'local'
    ? String(asset.metadata?.path || asset.id)
    : String(asset.id);
  return `${MASK_DRAFT_STORAGE_PREFIX}:${asset.source}:${encodeURIComponent(identity)}`;
}

function toMaskDraftMode(mode: InteractionMode): MaskDraftMode {
  if (mode === 'erase' || mode === 'view') return mode;
  return 'draw';
}

function parseMaskDraftMode(value: unknown): MaskDraftMode {
  if (value === 'draw' || value === 'erase' || value === 'view') return value;
  return 'draw';
}

function readMaskDraft(asset: ViewerAsset): MaskOverlayDraft | null {
  try {
    const raw = localStorage.getItem(getMaskDraftStorageKey(asset));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<MaskOverlayDraft> | null;
    if (!parsed || !Array.isArray(parsed.elements)) {
      return null;
    }

    const brushSize =
      typeof parsed.brushSize === 'number' && Number.isFinite(parsed.brushSize)
        ? parsed.brushSize
        : 0.03;
    const brushOpacity =
      typeof parsed.brushOpacity === 'number' && Number.isFinite(parsed.brushOpacity)
        ? parsed.brushOpacity
        : 0.7;
    const savedAt =
      typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt)
        ? parsed.savedAt
        : Date.now();

    return {
      version: 1,
      savedAt,
      mode: parseMaskDraftMode(parsed.mode),
      brushSize,
      brushOpacity,
      elements: parsed.elements as AnyElement[],
    };
  } catch {
    return null;
  }
}

function writeMaskDraft(asset: ViewerAsset, draft: MaskOverlayDraft | null): void {
  try {
    const key = getMaskDraftStorageKey(asset);
    if (!draft || draft.elements.length === 0) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Best effort only.
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
    updateLayer,
    clearLayer,
    undo,
    redo,
    canUndo,
    canRedo,
    exportLayerAsMask,
    resetView,
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
  }, [getLayer]);

  const maskLayer = useMemo(
    () => state.layers.find((layer) => layer.id === MASK_LAYER_ID) ?? null,
    [state.layers],
  );

  const draftStorageKey = useMemo(() => getMaskDraftStorageKey(asset), [asset]);
  const restoredDraftKeyRef = useRef<string | null>(null);
  const persistDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore saved draft when entering mask overlay for this asset.
  useEffect(() => {
    if (!maskLayer) return;
    if (restoredDraftKeyRef.current === draftStorageKey) return;
    restoredDraftKeyRef.current = draftStorageKey;

    const draft = readMaskDraft(asset);
    if (!draft) return;

    if (draft.elements.length > 0) {
      updateLayer(MASK_LAYER_ID, { elements: draft.elements });
    }
    setMode(draft.mode);
    setBrushSize(draft.brushSize);
    setBrushOpacity(draft.brushOpacity);
  }, [asset, draftStorageKey, maskLayer, updateLayer, setMode, setBrushSize, setBrushOpacity]);

  // Persist draft state (debounced) so masks survive refresh.
  useEffect(() => {
    if (!maskLayer) return;

    if (persistDraftTimerRef.current) {
      clearTimeout(persistDraftTimerRef.current);
    }

    persistDraftTimerRef.current = setTimeout(() => {
      if (maskLayer.elements.length === 0) {
        writeMaskDraft(asset, null);
        return;
      }

      writeMaskDraft(asset, {
        version: 1,
        savedAt: Date.now(),
        mode: toMaskDraftMode(state.mode),
        brushSize: state.tool.size,
        brushOpacity: state.tool.opacity,
        elements: maskLayer.elements,
      });
    }, MASK_DRAFT_SAVE_DEBOUNCE_MS);

    return () => {
      if (persistDraftTimerRef.current) {
        clearTimeout(persistDraftTimerRef.current);
        persistDraftTimerRef.current = null;
      }
    };
  }, [asset, maskLayer, state.mode, state.tool.size, state.tool.opacity]);

  // Sync state to bridge store
  const currentZoom = state.view.zoom;
  const isZoomed = Math.abs(currentZoom - 1) > 0.01;

  useEffect(() => {
    store.getState()._syncState({
      mode: state.mode,
      brushSize: state.tool.size,
      brushOpacity: state.tool.opacity,
      canUndo,
      canRedo,
      hasContent,
      zoom: currentZoom,
      isZoomed,
    });
  }, [state.mode, state.tool.size, state.tool.opacity, canUndo, canRedo, hasContent, currentZoom, isZoomed, store]);

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
    resetView,
  });

  // Keep ref current on every render
  callbacksRef.current.setMode = setMode;
  callbacksRef.current.setBrushSize = setBrushSize;
  callbacksRef.current.setBrushOpacity = setBrushOpacity;
  callbacksRef.current.undo = undo;
  callbacksRef.current.redo = redo;
  callbacksRef.current.clearLayer = () => clearLayer(MASK_LAYER_ID);
  callbacksRef.current.resetView = resetView;

  // Export mask callback
  const isSavingRef = useRef(false);
  const exportMask = useCallback(async () => {
    if (isSavingRef.current) return;

    const providerId = resolveViewerAssetProviderId(asset);
    const saveTarget: 'provider' | 'library' = providerId ? 'provider' : 'library';

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
      uploadContext.save_target = saveTarget;

      const uploadResult = await uploadAsset({
        file: blob,
        filename,
        saveTarget,
        providerId: providerId || undefined,
        uploadMethod: 'mask_draw',
        uploadContext,
      });

      const newAssetId = uploadResult.asset_id;
      let attachedToGeneration = false;

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
        attachedToGeneration = true;
      }

      if (saveTarget === 'provider') {
        toast.success(attachedToGeneration ? 'Mask uploaded and set for generation.' : 'Mask uploaded.');
      } else {
        toast.success(attachedToGeneration ? 'Mask saved to library and set for generation.' : 'Mask saved to library.');
      }
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
      resetView: () => callbacksRef.current.resetView(),
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
        case '0':
          callbacksRef.current.resetView();
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
    <div className="absolute inset-0 flex">
      <MaskSidePanel />
      <div className="flex-1 min-w-0 relative">
        <InteractiveImageSurface
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

// ── MaskSidePanel ─────────────────────────────────────────────────────

const TOOL_MODES = [
  { mode: 'draw' as const, icon: 'paintbrush' as const, label: 'Draw', shortcut: 'D' },
  { mode: 'erase' as const, icon: 'xCircle' as const, label: 'Erase', shortcut: 'E' },
  { mode: 'view' as const, icon: 'eye' as const, label: 'View', shortcut: 'V' },
];

function SectionDivider() {
  return <div className="h-px bg-th/10 mx-1" />;
}

function MaskSidePanel() {
  const {
    mode,
    brushSize,
    brushOpacity,
    canUndo,
    canRedo,
    hasContent,
    isSaving,
    zoom,
    isZoomed,
    setMode,
    setBrushSize,
    setBrushOpacity,
    undo,
    redo,
    clearLayer,
    exportMask,
    resetView,
  } = useMaskOverlayStore();

  return (
    <div className="w-36 flex-shrink-0 flex flex-col gap-2 py-2 bg-surface-secondary/95 border-r border-th/10 text-xs select-none">
      {/* ── Tools ── */}
      <div className="px-2 flex flex-col gap-1">
        <span className="text-[10px] text-th-muted uppercase tracking-wider">Tools</span>
        {TOOL_MODES.map(({ mode: m, icon, label, shortcut }) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex items-center gap-2 w-full px-2 py-1.5 rounded transition-colors ${
              mode === m
                ? 'bg-accent text-accent-text'
                : 'text-th-secondary hover:bg-surface-elevated'
            }`}
            title={`${label} (${shortcut})`}
          >
            <Icon name={icon} size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <SectionDivider />

      {/* ── Brush ── */}
      <div className="px-2 flex flex-col gap-1.5">
        <span className="text-[10px] text-th-muted uppercase tracking-wider">Brush</span>
        <label className="flex flex-col gap-0.5 text-th-secondary">
          <span className="text-[10px]">Size</span>
          <input
            type="range"
            min={0.005}
            max={0.15}
            step={0.005}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-full h-1 accent-accent"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-th-secondary">
          <span className="text-[10px]">Opacity</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.1}
            value={brushOpacity}
            onChange={(e) => setBrushOpacity(Number(e.target.value))}
            className="w-full h-1 accent-accent"
          />
        </label>
      </div>

      <SectionDivider />

      {/* ── Actions ── */}
      <div className="px-2 flex flex-col gap-1">
        <span className="text-[10px] text-th-muted uppercase tracking-wider">Actions</span>
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="flex items-center justify-center w-8 h-7 rounded bg-th/10 hover:bg-th/15 text-th-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <Icon name="undo" size={14} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="flex items-center justify-center w-8 h-7 rounded bg-th/10 hover:bg-th/15 text-th-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Icon name="redo" size={14} />
          </button>
          <button
            onClick={clearLayer}
            disabled={!hasContent}
            className="flex-1 h-7 rounded bg-th/10 hover:bg-th/15 text-th-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[11px]"
            title="Clear mask"
          >
            Clear
          </button>
        </div>
      </div>

      {/* ── Zoom (conditional) ── */}
      {isZoomed && (
        <>
          <SectionDivider />
          <div className="px-2 flex items-center gap-1.5">
            <span className="text-th-secondary text-[11px] tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={resetView}
              className="flex items-center justify-center w-7 h-7 rounded bg-th/10 hover:bg-th/15 text-th-secondary transition-colors"
              title="Fit to view (0)"
            >
              <Icon name="maximize2" size={14} />
            </button>
          </div>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* ── Save ── */}
      <div className="px-2">
        <button
          onClick={exportMask}
          disabled={!hasContent || isSaving}
          className={`w-full py-2 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            hasContent && !isSaving
              ? 'bg-accent hover:bg-accent-hover text-accent-text'
              : 'bg-th/10 text-th-muted'
          }`}
          title="Save mask and attach to generation"
        >
          {isSaving ? 'Saving...' : 'Save Mask'}
        </button>
      </div>
    </div>
  );
}
