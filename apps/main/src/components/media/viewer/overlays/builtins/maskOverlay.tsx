/**
 * Mask Overlay
 *
 * Viewer overlay for drawing inpainting masks on images.
 * Uses the interactive surface system for brush/erase, undo/redo, and mask export.
 * Supports multiple mask layers that are composited on export.
 *
 * Layout: left sidebar (tools), center (drawing surface), right sidebar (layers).
 */

import { buildMaskFilename, buildMaskUploadContext } from '@pixsim7/shared.media.core';
import { useToast } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { API_BASE_URL } from '@lib/api';
import { uploadAsset } from '@lib/api/upload';
import { authService } from '@lib/auth';
import { Icon } from '@lib/icons';

import { useAssets, type AssetModel, type ViewerAsset } from '@features/assets';
import { deleteAsset } from '@features/assets/lib/api';
import { extractUploadError, notifyGalleryOfNewAsset } from '@features/assets/lib/uploadActions';
import { getGenerationSettingsStore, useGenerationScopeStores, useGenerationSettingsStore } from '@features/generation';
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
  type PolygonElement,
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

import { useMaskOverlayStore, type MaskLayerInfo } from './maskOverlayStore';

// ── Constants ──────────────────────────────────────────────────────────

const MASK_LAYER_PREFIX = 'mask-layer';
const MASK_DRAFT_STORAGE_PREFIX = 'ps7_mask_overlay_draft_v2';
const MASK_DRAFT_SAVE_DEBOUNCE_MS = 250;

type MaskDraftMode = 'draw' | 'erase' | 'view';

interface MaskLayerDraft {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  elements: AnyElement[];
  savedAssetId?: number;
}

interface MaskOverlayDraft {
  version: 2;
  savedAt: number;
  mode: MaskDraftMode;
  brushSize: number;
  brushOpacity: number;
  activeLayerId: string;
  layers: MaskLayerDraft[];
}

let _layerCounter = 0;
function nextMaskLayerId(): string {
  return `${MASK_LAYER_PREFIX}-${Date.now()}-${++_layerCounter}`;
}

// ── Provider ID resolution ────────────────────────────────────────────

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


function readMaskDraft(asset: ViewerAsset): MaskOverlayDraft | null {
  try {
    const raw = localStorage.getItem(getMaskDraftStorageKey(asset));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 2 || !Array.isArray(parsed.layers)) return null;
    return parsed as MaskOverlayDraft;
  } catch {
    return null;
  }
}

function writeMaskDraft(asset: ViewerAsset, draft: MaskOverlayDraft | null): void {
  try {
    const key = getMaskDraftStorageKey(asset);
    if (!draft || draft.layers.every((l) => l.elements.length === 0)) {
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
  useGenerationSettingsStore.getState().setParam('mask_url', maskUrl);
  const viewerScopeId = resolveViewerQuickGenScopeId();
  if (viewerScopeId === 'global') {
    useGenerationSettingsStore.getState().setParam('mask_url', maskUrl);
  } else {
    getGenerationSettingsStore(viewerScopeId).getState().setParam('mask_url', maskUrl);
  }
}

function makeMaskStrokeId(index: number): string {
  return globalThis.crypto?.randomUUID?.() ?? `mask-import-${Date.now()}-${index}`;
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

// ── Composite export ─────────────────────────────────────────────────

/**
 * Renders a single interaction layer's elements to a canvas context.
 * Shared between single-layer export and multi-layer compositing.
 */
function renderLayerToContext(
  ctx: CanvasRenderingContext2D,
  elements: AnyElement[],
  width: number,
  height: number,
): void {
  // Draw strokes/polygons/regions in white
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'source-over';

  for (const element of elements) {
    if (element.type === 'stroke' && !(element as StrokeElement).isErase) {
      const stroke = element as StrokeElement;
      if (stroke.points.length < 2) continue;
      ctx.lineWidth = stroke.tool.size * width;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * width, stroke.points[0].y * height);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * width, stroke.points[i].y * height);
      }
      ctx.stroke();
    } else if (element.type === 'polygon') {
      const poly = element as PolygonElement;
      if (!poly.closed || poly.points.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(poly.points[0].x * width, poly.points[0].y * height);
      for (let i = 1; i < poly.points.length; i++) {
        ctx.lineTo(poly.points[i].x * width, poly.points[i].y * height);
      }
      ctx.closePath();
      ctx.fill();
    } else if (element.type === 'region') {
      const region = element as { bounds: { x: number; y: number; width: number; height: number } };
      ctx.fillRect(region.bounds.x * width, region.bounds.y * height, region.bounds.width * width, region.bounds.height * height);
    }
  }

  // Erase strokes
  ctx.globalCompositeOperation = 'destination-out';
  for (const element of elements) {
    if (element.type === 'stroke' && (element as StrokeElement).isErase) {
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
  ctx.globalCompositeOperation = 'source-over';
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
    removeLayer: interactionRemoveLayer,
    setActiveLayer: interactionSetActiveLayer,
    undo,
    redo,
    canUndo,
    canRedo,
    resetView,
  } = interaction;

  // Create initial mask layer on mount
  useEffect(() => {
    if (state.layers.length === 0) {
      const id = nextMaskLayerId();
      addLayer({ type: 'mask', name: 'Mask 1', id });
      interactionSetActiveLayer(id);
    }
  }, [addLayer, interactionSetActiveLayer, state.layers.length]);

  const activeLayerId = state.activeLayerId;

  // Build layer info for the store
  const layerInfos = useMemo<MaskLayerInfo[]>(
    () => state.layers
      .filter((l) => l.type === 'mask')
      .map((l) => ({
        id: l.id,
        name: l.name,
        visible: l.visible,
        opacity: l.opacity,
        hasContent: l.elements.length > 0,
        savedAssetId: l.config?.savedAssetId as number | undefined,
      })),
    [state.layers],
  );

  const hasContent = useMemo(
    () => state.layers.some((l) => l.type === 'mask' && l.elements.length > 0),
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
      return Number.isFinite(candidateSourceId) && candidateSourceId === sourceAssetId;
    });
  }, [sourceAssetId, maskAssetsQuery.items]);

  // ── Layer management callbacks ─────────────────────────────────────

  const handleAddLayer = useCallback(() => {
    const count = state.layers.filter((l) => l.type === 'mask').length;
    const id = nextMaskLayerId();
    addLayer({ type: 'mask', name: `Mask ${count + 1}`, id });
    interactionSetActiveLayer(id);
  }, [addLayer, interactionSetActiveLayer, state.layers]);

  const handleRemoveLayer = useCallback((layerId: string) => {
    const maskLayers = state.layers.filter((l) => l.type === 'mask');
    if (maskLayers.length <= 1) {
      // Don't remove the last layer, just clear it
      clearLayer(layerId);
      return;
    }
    interactionRemoveLayer(layerId);
    // If we removed the active layer, switch to another
    if (activeLayerId === layerId) {
      const remaining = maskLayers.filter((l) => l.id !== layerId);
      if (remaining.length > 0) {
        interactionSetActiveLayer(remaining[0].id);
      }
    }
  }, [activeLayerId, clearLayer, interactionRemoveLayer, interactionSetActiveLayer, state.layers]);

  const handleSetActiveLayer = useCallback((layerId: string) => {
    interactionSetActiveLayer(layerId);
  }, [interactionSetActiveLayer]);

  const handleToggleLayerVisibility = useCallback((layerId: string) => {
    const layer = getLayer(layerId);
    if (layer) {
      updateLayer(layerId, { visible: !layer.visible });
    }
  }, [getLayer, updateLayer]);

  const handleRenameLayer = useCallback((layerId: string, name: string) => {
    updateLayer(layerId, { name });
  }, [updateLayer]);

  const handleImportSavedMask = useCallback(async (maskAssetId: number) => {
    if (isImportingSavedMask) return;

    // If active layer exists and has no content, replace it in-place.
    // Otherwise create a new layer.
    const targetLayer = activeLayerId ? getLayer(activeLayerId) : null;
    const replaceActive = targetLayer && targetLayer.elements.length === 0;

    setIsImportingSavedMask(true);
    try {
      if (replaceActive && targetLayer) {
        const importedStrokes = await fetchMaskAssetAsEditableStrokes(maskAssetId, targetLayer.id);
        updateLayer(targetLayer.id, {
          elements: importedStrokes,
          name: `Mask #${maskAssetId}`,
          config: { savedAssetId: maskAssetId },
        });
        toast.success(`Loaded mask #${maskAssetId} into "${targetLayer.name}".`);
      } else {
        const id = nextMaskLayerId();
        addLayer({ type: 'mask', name: `Mask #${maskAssetId}`, id, config: { savedAssetId: maskAssetId } });
        const importedStrokes = await fetchMaskAssetAsEditableStrokes(maskAssetId, id);
        updateLayer(id, { elements: importedStrokes });
        interactionSetActiveLayer(id);
        toast.success(`Imported mask #${maskAssetId} as new layer.`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load saved mask.';
      toast.error(message);
    } finally {
      setIsImportingSavedMask(false);
    }
  }, [activeLayerId, addLayer, getLayer, interactionSetActiveLayer, isImportingSavedMask, toast, updateLayer]);

  // ── Draft persistence ──────────────────────────────────────────────

  // Restore saved draft
  useEffect(() => {
    if (restoredDraftKeyRef.current === draftStorageKey) return;
    restoredDraftKeyRef.current = draftStorageKey;

    const draft = readMaskDraft(asset);
    if (!draft || draft.layers.length === 0) return;

    // Remove any auto-created layers before restoring draft
    for (const existing of state.layers) {
      if (existing.type === 'mask') {
        interactionRemoveLayer(existing.id);
      }
    }

    // Restore layers from draft
    for (const layerDraft of draft.layers) {
      addLayer({
        type: 'mask',
        name: layerDraft.name,
        id: layerDraft.id,
        config: layerDraft.savedAssetId ? { savedAssetId: layerDraft.savedAssetId } : undefined,
      });
      if (layerDraft.elements.length > 0) {
        updateLayer(layerDraft.id, {
          elements: layerDraft.elements,
          visible: layerDraft.visible,
          opacity: layerDraft.opacity,
        });
      }
    }
    interactionSetActiveLayer(draft.activeLayerId);
    setMode(draft.mode);
    setBrushSize(draft.brushSize);
    setBrushOpacity(draft.brushOpacity);
  }, [asset, draftStorageKey, addLayer, updateLayer, interactionRemoveLayer, interactionSetActiveLayer, setMode, setBrushSize, setBrushOpacity, state.layers]);

  // Persist draft (debounced)
  useEffect(() => {
    if (persistDraftTimerRef.current) {
      clearTimeout(persistDraftTimerRef.current);
    }

    persistDraftTimerRef.current = setTimeout(() => {
      const maskLayers = state.layers.filter((l) => l.type === 'mask');
      if (maskLayers.every((l) => l.elements.length === 0)) {
        writeMaskDraft(asset, null);
        return;
      }

      writeMaskDraft(asset, {
        version: 2,
        savedAt: Date.now(),
        mode: toMaskDraftMode(state.mode),
        brushSize: state.tool.size,
        brushOpacity: state.tool.opacity,
        activeLayerId: activeLayerId ?? maskLayers[0]?.id ?? '',
        layers: maskLayers.map((l) => ({
          id: l.id,
          name: l.name,
          visible: l.visible,
          opacity: l.opacity,
          elements: l.elements,
          savedAssetId: l.config?.savedAssetId as number | undefined,
        })),
      });
    }, MASK_DRAFT_SAVE_DEBOUNCE_MS);

    return () => {
      if (persistDraftTimerRef.current) {
        clearTimeout(persistDraftTimerRef.current);
        persistDraftTimerRef.current = null;
      }
    };
  }, [asset, state.layers, state.mode, state.tool.size, state.tool.opacity, activeLayerId]);

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
      layers: layerInfos,
      activeLayerId,
    });
  }, [state.mode, state.tool.size, state.tool.opacity, canUndo, canRedo, hasContent, currentZoom, isZoomed, layerInfos, activeLayerId, store]);

  // ── Ref-based callback bridge ──────────────────────────────────────

  const callbacksRef = useRef({
    setMode,
    setBrushSize,
    setBrushOpacity,
    undo,
    redo,
    clearLayer: () => activeLayerId && clearLayer(activeLayerId),
    exportMask: async () => {},
    resetView,
    addLayer: handleAddLayer,
    removeLayer: handleRemoveLayer,
    setActiveLayer: handleSetActiveLayer,
    toggleLayerVisibility: handleToggleLayerVisibility,
    renameLayer: handleRenameLayer,
    importSavedMask: handleImportSavedMask,
  });

  // Keep ref current
  callbacksRef.current.setMode = setMode;
  callbacksRef.current.setBrushSize = setBrushSize;
  callbacksRef.current.setBrushOpacity = setBrushOpacity;
  callbacksRef.current.undo = undo;
  callbacksRef.current.redo = redo;
  callbacksRef.current.clearLayer = () => activeLayerId && clearLayer(activeLayerId);
  callbacksRef.current.resetView = resetView;
  callbacksRef.current.addLayer = handleAddLayer;
  callbacksRef.current.removeLayer = handleRemoveLayer;
  callbacksRef.current.setActiveLayer = handleSetActiveLayer;
  callbacksRef.current.toggleLayerVisibility = handleToggleLayerVisibility;
  callbacksRef.current.renameLayer = handleRenameLayer;
  callbacksRef.current.importSavedMask = handleImportSavedMask;

  // ── Composite export ───────────────────────────────────────────────

  const isSavingRef = useRef(false);
  const exportMask = useCallback(async () => {
    if (isSavingRef.current) return;
    const saveTarget = 'library' as const;

    const width = mediaDimensions?.width || 1024;
    const height = mediaDimensions?.height || 1024;

    // Composite all visible mask layers onto one canvas
    const visibleLayers = state.layers.filter((l) => l.type === 'mask' && l.visible && l.elements.length > 0);
    if (visibleLayers.length === 0) {
      toast.error('No visible mask content to export.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      toast.error('Failed to create export canvas.');
      return;
    }

    // Black background (preserve areas)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Render each visible layer (OR composition — any white pixel stays white)
    for (const layer of visibleLayers) {
      if (layer.opacity < 1) {
        // Render to temp canvas with opacity, then composite
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = width;
        tmpCanvas.height = height;
        const tmpCtx = tmpCanvas.getContext('2d');
        if (!tmpCtx) continue;
        tmpCtx.fillStyle = '#000000';
        tmpCtx.fillRect(0, 0, width, height);
        renderLayerToContext(tmpCtx, layer.elements, width, height);
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(tmpCanvas, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      } else {
        renderLayerToContext(ctx, layer.elements, width, height);
      }
    }

    const maskDataUrl = canvas.toDataURL('image/png');

    isSavingRef.current = true;
    store.getState()._syncState({ isSaving: true });

    try {
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

      // Collect old saved asset IDs from layers to clean up
      const oldSavedAssetIds = visibleLayers
        .map((l) => l.config?.savedAssetId as number | undefined)
        .filter((id): id is number => typeof id === 'number');

      if (newAssetId) {
        try {
          await notifyGalleryOfNewAsset(newAssetId);
        } catch {
          // Non-critical
        }

        setMaskUrlInRelevantGenerationScopes(`asset:${newAssetId}`);
        attachedToGeneration = true;

        // Clean up old mask assets that were overwritten
        for (const oldId of oldSavedAssetIds) {
          if (oldId !== newAssetId) {
            try {
              await deleteAsset(oldId, { delete_from_provider: false });
            } catch {
              // Non-critical
            }
          }
        }

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
  }, [asset, mediaDimensions, state.layers, toast, store, maskAssetsQuery.reset, anyMaskAssetsQuery.reset]);

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
      addLayer: () => callbacksRef.current.addLayer(),
      removeLayer: (id) => callbacksRef.current.removeLayer(id),
      setActiveLayer: (id) => callbacksRef.current.setActiveLayer(id),
      toggleLayerVisibility: (id) => callbacksRef.current.toggleLayerVisibility(id),
      renameLayer: (id, name) => callbacksRef.current.renameLayer(id, name),
      importSavedMask: (id) => callbacksRef.current.importSavedMask(id),
    });
  }, [store]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
      <MaskToolsPanel />
      <div className="flex-1 min-w-0 relative">
        <InteractiveImageSurface
          media={media}
          state={state}
          handlers={handlers}
          cursor={cursor}
          className="w-full h-full"
        />
      </div>
      <MaskLayersPanel
        sourceAssetId={sourceAssetId}
        masks={sourceMaskAssets}
        anyMasks={anyMaskAssetsQuery.items}
        loadingMasks={maskAssetsQuery.loading || isImportingSavedMask}
        loadingAnyMasks={anyMaskAssetsQuery.loading || isImportingSavedMask}
        currentMaskUrl={currentMaskUrl}
      />
    </div>
  );
}

// ── MaskToolsPanel (LEFT) ─────────────────────────────────────────────

const TOOL_MODES = [
  { mode: 'draw' as const, icon: 'paintbrush' as const, label: 'Draw', shortcut: 'D' },
  { mode: 'polygon' as const, icon: 'pencil' as const, label: 'Curve', shortcut: 'C' },
  { mode: 'erase' as const, icon: 'xCircle' as const, label: 'Erase', shortcut: 'E' },
  { mode: 'view' as const, icon: 'eye' as const, label: 'View', shortcut: 'V' },
];

function MaskToolsPanel() {
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
    <OverlaySidePanel className="w-32">
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
          Click to place points. Double-click to close and fill.
        </div>
      )}

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
            title="Clear active layer"
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
        title="Save composite mask and attach to generation"
        onClick={exportMask}
      >
        {isSaving ? 'Saving...' : 'Save Mask'}
      </SidePrimaryButton>
    </OverlaySidePanel>
  );
}

// ── MaskLayersPanel (RIGHT) ───────────────────────────────────────────

interface MaskLayersPanelProps {
  sourceAssetId: number | null;
  masks: AssetModel[];
  anyMasks: AssetModel[];
  loadingMasks: boolean;
  loadingAnyMasks: boolean;
  currentMaskUrl?: string;
}

function MaskLayersPanel({
  sourceAssetId,
  masks,
  anyMasks,
  loadingMasks,
  loadingAnyMasks,
}: MaskLayersPanelProps) {
  const {
    layers,
    activeLayerId,
    addLayer: storeAddLayer,
    removeLayer: storeRemoveLayer,
    setActiveLayer,
    toggleLayerVisibility,
    renameLayer,
    importSavedMask,
  } = useMaskOverlayStore();

  const activeLayer = layers.find((l) => l.id === activeLayerId) ?? null;

  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

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

  const handleStartRename = useCallback((layer: MaskLayerInfo) => {
    setEditingLayerId(layer.id);
    setEditName(layer.name);
  }, []);

  const handleFinishRename = useCallback(() => {
    if (editingLayerId && editName.trim()) {
      renameLayer(editingLayerId, editName.trim());
    }
    setEditingLayerId(null);
  }, [editingLayerId, editName, renameLayer]);

  return (
    <OverlaySidePanel className="w-40">
      <SideSection label="Layers">
        <div className="flex flex-col gap-0.5">
          {layers.map((layer) => {
            const isActive = layer.id === activeLayerId;
            const isEditing = editingLayerId === layer.id;

            return (
              <div
                key={layer.id}
                className={`flex items-center gap-1 px-1.5 py-1 rounded cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-accent/20 border border-accent/40'
                    : 'hover:bg-surface-elevated border border-transparent'
                }`}
                onClick={() => setActiveLayer(layer.id)}
              >
                {/* Visibility toggle */}
                <button
                  className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors ${
                    layer.visible ? 'text-th-secondary' : 'text-th-muted opacity-40'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLayerVisibility(layer.id);
                  }}
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                >
                  <Icon name={layer.visible ? 'eye' : 'eyeOff'} size={11} />
                </button>

                {/* Layer name */}
                {isEditing ? (
                  <input
                    className="flex-1 min-w-0 bg-transparent border-b border-accent text-[11px] text-th-primary outline-none px-0.5"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={handleFinishRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleFinishRename();
                      if (e.key === 'Escape') setEditingLayerId(null);
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className={`flex-1 min-w-0 truncate text-[11px] ${
                      layer.visible ? 'text-th-secondary' : 'text-th-muted line-through'
                    }`}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleStartRename(layer);
                    }}
                    title={`${layer.name}${layer.hasContent ? '' : ' (empty)'}`}
                  >
                    {layer.name}
                  </span>
                )}

                {/* Content indicator */}
                {layer.hasContent && (
                  <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-accent/60" title="Has content" />
                )}
              </div>
            );
          })}
        </div>

        {/* + / - buttons */}
        <div className="flex items-center gap-1 px-0.5">
          <button
            onClick={storeAddLayer}
            className="flex items-center justify-center w-7 h-6 rounded bg-th/10 hover:bg-th/15 text-th-secondary transition-colors"
            title="Add layer"
          >
            <Icon name="plus" size={12} />
          </button>
          <button
            onClick={() => activeLayerId && storeRemoveLayer(activeLayerId)}
            disabled={layers.length <= 1}
            className="flex items-center justify-center w-7 h-6 rounded bg-th/10 hover:bg-th/15 text-th-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Remove active layer"
          >
            <Icon name="minus" size={12} />
          </button>
        </div>
      </SideSection>

      <SideDivider />

      {/* Import saved masks — replaces active layer if empty, else adds new */}
      <SideSection label="Import Mask" className="gap-1">
        {activeLayer && !activeLayer.hasContent && (
          <div className="text-[10px] text-th-muted leading-snug">
            Loads into active layer
          </div>
        )}
        {sourceAssetId ? (
          <select
            onChange={(e) => {
              const next = e.target.value;
              if (!next) return;
              importSavedMask(Number(next));
              e.target.value = '';
            }}
            className="w-full h-7 rounded bg-th/10 hover:bg-th/15 border border-th/10 text-[11px] text-th-secondary px-1.5"
            title={activeLayer && !activeLayer.hasContent ? 'Load into active layer' : 'Import as new layer'}
            disabled={loadingMasks}
            value=""
          >
            <option value="">
              {loadingMasks
                ? 'Loading...'
                : sortedMasks.length > 0
                  ? 'Linked masks...'
                  : 'No linked masks'}
            </option>
            {sortedMasks.map((mask) => (
              <option key={mask.id} value={mask.id}>
                {formatMaskLabel(mask)}
              </option>
            ))}
          </select>
        ) : (
          <div className="text-[10px] text-th-muted leading-snug">
            Save source image first.
          </div>
        )}

        <select
          onChange={(e) => {
            const next = e.target.value;
            if (!next) return;
            importSavedMask(Number(next));
            e.target.value = '';
          }}
          className="w-full h-7 rounded bg-th/10 hover:bg-th/15 border border-th/10 text-[11px] text-th-secondary px-1.5"
          title={activeLayer && !activeLayer.hasContent ? 'Load into active layer' : 'Import as new layer'}
          disabled={loadingAnyMasks}
          value=""
        >
          <option value="">
            {loadingAnyMasks
              ? 'Loading...'
              : sortedAnyMasks.length > 0
                ? 'Any mask...'
                : 'No saved masks'}
          </option>
          {sortedAnyMasks.map((mask) => (
            <option key={mask.id} value={mask.id}>
              {formatMaskLabel(mask)}
            </option>
          ))}
        </select>
      </SideSection>
    </OverlaySidePanel>
  );
}
