/**
 * Mask Overlay
 *
 * Viewer overlay for drawing inpainting masks on images.
 * Uses the interactive surface system for brush/erase, undo/redo, and mask export.
 * Exported masks are uploaded as assets and wired into the generation flow via mask_url.
 */

import { buildMaskFilename, buildMaskUploadContext } from '@pixsim7/shared.media.core';
import { useToast } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { API_BASE_URL } from '@lib/api';
import { uploadAsset } from '@lib/api/upload';
import { authService } from '@lib/auth';

import { useAssets, type AssetModel, type ViewerAsset } from '@features/assets';
import { extractUploadError, notifyGalleryOfNewAsset } from '@features/assets/lib/uploadActions';
import { getGenerationSettingsStore, useGenerationScopeStores } from '@features/generation';
import {
  GENERATION_SCOPE_ID,
  getInstanceId,
  getScopeMode,
  panelSettingsScopeRegistry,
  resolveScopeInstanceId,
  usePanelInstanceSettingsStore,
} from '@features/panels';


import {
  type AnyElement,
  InteractiveImageSurface,
  type InteractionMode,
  type StrokeElement,
  useInteractionLayer,
} from '@/components/interactive-surface';
import { useAuthenticatedMedia } from '@/hooks/useAuthenticatedMedia';

import {
  OverlaySidePanel,
  SideSection,
  SideDivider,
  SideToolButton,
  SideSlider,
  SideIconButton,
  SidePrimaryButton,
} from '../shared/OverlaySidePanel';
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

function getViewerBackendAssetId(asset: ViewerAsset): number | null {
  const metadataAssetId = asset.metadata?.assetId;
  if (typeof metadataAssetId === 'number' && Number.isFinite(metadataAssetId) && metadataAssetId > 0) {
    return metadataAssetId;
  }

  const directId = Number(asset.id);
  if (Number.isFinite(directId) && directId > 0) {
    return directId;
  }

  return null;
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

function resolveViewerQuickGenScopeId(): string {
  const panelManagerId = 'viewerQuickGenerate';
  const panelId = panelManagerId;
  const instanceId = getInstanceId(panelManagerId, panelId);
  const scopeDef = panelSettingsScopeRegistry.get(GENERATION_SCOPE_ID);
  if (!scopeDef) return instanceId;

  const scopes = usePanelInstanceSettingsStore.getState().instances[instanceId]?.scopes;
  const mode = getScopeMode(scopes, scopeDef, scopeDef.defaultMode);

  if (scopeDef.resolveScopeId) {
    return resolveScopeInstanceId(scopeDef, mode, {
      instanceId,
      panelId,
      dockviewId: panelManagerId,
    });
  }

  return mode === 'global' ? 'global' : instanceId;
}

function setMaskUrlInRelevantGenerationScopes(maskUrl: string | undefined): void {
  getGenerationSettingsStore('global').getState().setParam('mask_url', maskUrl);
  const viewerScopeId = resolveViewerQuickGenScopeId();
  getGenerationSettingsStore(viewerScopeId).getState().setParam('mask_url', maskUrl);
}

function makeMaskStrokeId(index: number): string {
  const rand = globalThis.crypto?.randomUUID?.();
  return rand ?? `mask-import-${Date.now()}-${index}`;
}

async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to decode mask image.'));
    });
    img.src = objectUrl;
    return await loaded;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function rasterMaskToEditableStrokes(
  imageData: ImageData,
  layerId: string,
): StrokeElement[] {
  const { width, height, data } = imageData;
  if (width <= 0 || height <= 0) return [];

  const strokes: StrokeElement[] = [];
  const lineSize = 1 / width;
  let strokeIndex = 0;

  const isWhiteMaskPixel = (idx: number): boolean => {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];
    if (a < 16) return false;
    return (r + g + b) >= 384;
  };

  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      while (x < width && !isWhiteMaskPixel((y * width + x) * 4)) x++;
      if (x >= width) break;

      const start = x;
      while (x < width && isWhiteMaskPixel((y * width + x) * 4)) x++;
      const end = x - 1;

      const yNorm = (y + 0.5) / height;
      const x1 = (start + 0.5) / width;
      const x2 = start === end
        ? Math.min(1, (end + 0.501) / width)
        : (end + 0.5) / width;

      strokes.push({
        id: makeMaskStrokeId(strokeIndex++),
        type: 'stroke',
        layerId,
        visible: true,
        points: [
          { x: x1, y: yNorm },
          { x: x2, y: yNorm },
        ],
        tool: {
          size: lineSize,
          color: '#ffffff',
          opacity: 0.7,
        },
        isErase: false,
      });
    }
  }

  return strokes;
}

async function fetchMaskAssetAsEditableStrokes(maskAssetId: number, layerId: string): Promise<StrokeElement[]> {
  const token = authService.getStoredToken();
  const url = `${API_BASE_URL.replace(/\/$/, '')}/assets/${maskAssetId}/file`;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    throw new Error(`Failed to load mask image (${res.status})`);
  }

  const blob = await res.blob();
  const decoded = await loadImageFromBlob(blob);

  const maxDim = 512;
  const scale = Math.min(1, maxDim / Math.max(decoded.naturalWidth || decoded.width, decoded.naturalHeight || decoded.height));
  const width = Math.max(1, Math.round((decoded.naturalWidth || decoded.width) * scale));
  const height = Math.max(1, Math.round((decoded.naturalHeight || decoded.height) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Failed to prepare mask import canvas.');
  }

  ctx.drawImage(decoded, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  return rasterMaskToEditableStrokes(imageData, layerId);
}

// ── MaskOverlayMain ───────────────────────────────────────────────────

export function MaskOverlayMain({ asset, mediaDimensions }: MediaOverlayComponentProps) {
  const toast = useToast();
  const store = useMaskOverlayStore;
  const { useSettingsStore } = useGenerationScopeStores();
  const currentMaskUrl = useSettingsStore((s) => (s.params as Record<string, unknown>)?.mask_url as string | undefined);

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
  const sourceAssetId = useMemo(() => getViewerBackendAssetId(asset), [asset]);
  const restoredDraftKeyRef = useRef<string | null>(null);
  const persistDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isImportingSavedMask, setIsImportingSavedMask] = useState(false);
  const maskAssetsQuery = useAssets({
    limit: 50,
    filters: {
      source_asset_id: sourceAssetId ?? -1,
      media_type: 'image',
      upload_method: 'mask_draw',
      sort: 'new',
    },
  });
  const anyMaskAssetsQuery = useAssets({
    limit: 100,
    filters: {
      media_type: 'image',
      upload_method: 'mask_draw',
      sort: 'new',
    },
  });

  const sourceMaskAssets = useMemo(() => {
    if (!sourceAssetId) return [] as AssetModel[];
    return maskAssetsQuery.items.filter((candidate) => {
      const ctx = candidate.uploadContext ?? null;
      const candidateSourceId =
        typeof ctx?.source_asset_id === 'number'
          ? ctx.source_asset_id
          : (typeof ctx?.source_asset_id === 'string' ? Number(ctx.source_asset_id) : NaN);
      if (!Number.isFinite(candidateSourceId) || candidateSourceId !== sourceAssetId) return false;
      return true;
    });
  }, [sourceAssetId, maskAssetsQuery.items]);

  const attachSavedMask = useCallback(async (maskAssetId: number) => {
    if (isImportingSavedMask) return;
    if (!maskLayer) {
      toast.error('Mask layer is not ready yet.');
      return;
    }

    if (hasContent) {
      const ok = window.confirm('Replace the current mask strokes with the selected saved mask?');
      if (!ok) return;
    }

    setIsImportingSavedMask(true);
    try {
      const importedStrokes = await fetchMaskAssetAsEditableStrokes(maskAssetId, MASK_LAYER_ID);
      updateLayer(MASK_LAYER_ID, { elements: importedStrokes });
      setMaskUrlInRelevantGenerationScopes(`asset:${maskAssetId}`);
      toast.success(`Loaded saved mask #${maskAssetId} for editing.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load saved mask.';
      toast.error(message);
    } finally {
      setIsImportingSavedMask(false);
    }
  }, [hasContent, isImportingSavedMask, maskLayer, toast, updateLayer]);

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
    const saveTarget = 'library' as const;

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

      const sourceAssetIdForUpload = getViewerBackendAssetId(asset);
      const filename = buildMaskFilename(sourceAssetIdForUpload ?? asset.id);
      const uploadContext = buildMaskUploadContext({
        sourceAssetId: sourceAssetIdForUpload ?? undefined,
        feature: 'mask_overlay',
        source: 'asset_viewer',
      });
      uploadContext.save_target = saveTarget;

      const uploadResult = await uploadAsset({
        file: blob,
        filename,
        saveTarget,
        uploadMethod: 'mask_draw',
        uploadContext,
      });

      const newAssetId = uploadResult.asset_id;
      let attachedToGeneration = false;

      // Notify gallery so the new mask asset appears without a full refresh
      if (newAssetId) {
        try {
          await notifyGalleryOfNewAsset(newAssetId);
        } catch {
          // Non-critical
        }

        // Wire mask into generation flow
        setMaskUrlInRelevantGenerationScopes(`asset:${newAssetId}`);
        attachedToGeneration = true;
        maskAssetsQuery.reset();
        anyMaskAssetsQuery.reset();
      }

      toast.success(attachedToGeneration ? 'Mask saved to library and set for generation.' : 'Mask saved to library.');
    } catch (err) {
      toast.error(extractUploadError(err, 'Failed to save mask.'));
    } finally {
      isSavingRef.current = false;
      store.getState()._syncState({ isSaving: false });
    }
  }, [asset, mediaDimensions, exportLayerAsMask, toast, store, maskAssetsQuery.reset, anyMaskAssetsQuery.reset]);

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
        case 'c':
          callbacksRef.current.setMode('polygon');
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

  const cursor = state.mode === 'draw' || state.mode === 'erase' || state.mode === 'polygon'
    ? 'crosshair'
    : 'grab';

  return (
    <div className="absolute inset-0 flex bg-surface-inset">
      <MaskSidePanel
        sourceAssetId={sourceAssetId}
        masks={sourceMaskAssets}
        anyMasks={anyMaskAssetsQuery.items}
        loadingMasks={maskAssetsQuery.loading || isImportingSavedMask}
        loadingAnyMasks={anyMaskAssetsQuery.loading || isImportingSavedMask}
        currentMaskUrl={currentMaskUrl}
        onAttachSavedMask={attachSavedMask}
      />
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
  { mode: 'polygon' as const, icon: 'pencil' as const, label: 'Curve', shortcut: 'C' },
  { mode: 'erase' as const, icon: 'xCircle' as const, label: 'Erase', shortcut: 'E' },
  { mode: 'view' as const, icon: 'eye' as const, label: 'View', shortcut: 'V' },
];

interface MaskSidePanelProps {
  sourceAssetId: number | null;
  masks: AssetModel[];
  anyMasks: AssetModel[];
  loadingMasks: boolean;
  loadingAnyMasks: boolean;
  currentMaskUrl?: string;
  onAttachSavedMask: (assetId: number) => void;
}

function MaskSidePanel({
  sourceAssetId,
  masks,
  anyMasks,
  loadingMasks,
  loadingAnyMasks,
  currentMaskUrl,
  onAttachSavedMask,
}: MaskSidePanelProps) {
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

  const selectedMaskAssetId = useMemo(() => {
    if (!currentMaskUrl || typeof currentMaskUrl !== 'string') return '';
    const match = currentMaskUrl.match(/^asset:(\d+)$/);
    return match ? match[1] : '';
  }, [currentMaskUrl]);

  const sortedMasks = useMemo(
    () => [...masks].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [masks],
  );
  const sortedAnyMasks = useMemo(
    () => [...anyMasks].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [anyMasks],
  );

  const formatMaskLabel = useCallback((mask: AssetModel) => {
    const created = Number.isFinite(Date.parse(mask.createdAt))
      ? new Date(mask.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    return created ? `#${mask.id} • ${created}` : `#${mask.id}`;
  }, []);

  return (
    <OverlaySidePanel>
      <SideSection label="Tools">
        {TOOL_MODES.map(({ mode: m, icon, label, shortcut }) => (
          <SideToolButton
            key={m}
            icon={icon}
            label={label}
            active={mode === m}
            title={`${label} (${shortcut})`}
            onClick={() => setMode(m)}
          />
        ))}
      </SideSection>

      {mode === 'polygon' && (
        <div className="px-2 text-[10px] text-th-muted leading-snug">
          Click points to place the curve outline. Double-click to close and fill the mask shape.
        </div>
      )}

      <SideDivider />

      <SideSection label="Saved Masks" className="gap-1">
        {!sourceAssetId ? (
          <div className="text-[10px] text-th-muted leading-snug">
            Save/upload the source image first to list linked masks here.
          </div>
        ) : (
          <>
            <select
              value={selectedMaskAssetId}
              onChange={(e) => {
                const next = e.target.value;
                if (!next) return;
                onAttachSavedMask(Number(next));
              }}
              className="w-full h-7 rounded bg-th/10 hover:bg-th/15 border border-th/10 text-[11px] text-th-secondary px-1.5"
              title="Choose a saved mask for this asset"
              disabled={loadingMasks}
            >
              <option value="">
                {loadingMasks
                  ? 'Loading masks...'
                  : sortedMasks.length > 0
                    ? 'Choose saved mask...'
                    : 'No saved masks'}
              </option>
              {sortedMasks.map((mask) => (
                <option key={mask.id} value={mask.id}>
                  {formatMaskLabel(mask)}
                </option>
              ))}
            </select>
            {sortedMasks.length > 0 && (
              <div className="text-[10px] text-th-muted">
                {sortedMasks.length} linked mask{sortedMasks.length === 1 ? '' : 's'}
              </div>
            )}
          </>
        )}
      </SideSection>

      <SideDivider />

      <SideSection label="Any Mask" className="gap-1">
        <select
          value={selectedMaskAssetId}
          onChange={(e) => {
            const next = e.target.value;
            if (!next) return;
            onAttachSavedMask(Number(next));
          }}
          className="w-full h-7 rounded bg-th/10 hover:bg-th/15 border border-th/10 text-[11px] text-th-secondary px-1.5"
          title="Choose any saved mask"
          disabled={loadingAnyMasks}
        >
          <option value="">
            {loadingAnyMasks
              ? 'Loading masks...'
              : sortedAnyMasks.length > 0
                ? 'Choose any saved mask...'
                : 'No saved masks'}
          </option>
          {sortedAnyMasks.map((mask) => (
            <option key={mask.id} value={mask.id}>
              {formatMaskLabel(mask)}
            </option>
          ))}
        </select>
        {sortedAnyMasks.length > 0 && (
          <div className="text-[10px] text-th-muted">
            {sortedAnyMasks.length} recent mask{sortedAnyMasks.length === 1 ? '' : 's'}
          </div>
        )}
      </SideSection>

      <SideDivider />

      <SideSection label="Brush" className="gap-1.5">
        <SideSlider label="Size" value={brushSize} min={0.005} max={0.15} step={0.005} onChange={setBrushSize} />
        <SideSlider label="Opacity" value={brushOpacity} min={0.1} max={1} step={0.1} onChange={setBrushOpacity} />
      </SideSection>

      <SideDivider />

      <SideSection label="Actions">
        <div className="flex items-center gap-1">
          <SideIconButton icon="undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo} />
          <SideIconButton icon="redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo} />
          <button
            onClick={clearLayer}
            disabled={!hasContent}
            className="flex-1 h-7 rounded bg-th/10 hover:bg-th/15 text-th-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[11px]"
            title="Clear mask"
          >
            Clear
          </button>
        </div>
      </SideSection>

      {isZoomed && (
        <>
          <SideDivider />
          <div className="px-2 flex items-center gap-1.5">
            <span className="text-th-secondary text-[11px] tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <SideIconButton icon="maximize2" title="Fit to view (0)" onClick={resetView} />
          </div>
        </>
      )}

      <div className="flex-1" />

      <SidePrimaryButton
        disabled={!hasContent || isSaving}
        title="Save mask and attach to generation"
        onClick={exportMask}
      >
        {isSaving ? 'Saving...' : 'Save Mask'}
      </SidePrimaryButton>
    </OverlaySidePanel>
  );
}
