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
import { PanelShell, useToast } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { API_BASE_URL, deleteAsset } from '@lib/api';
import { withCorrelationHeaders } from '@lib/api/correlationHeaders';
import { uploadAsset } from '@lib/api/upload';
import { authService } from '@lib/auth';
import { Icon } from '@lib/icons';
// import { VersionNavigator, useVersions } from '@lib/ui/versioning';

import { useAssets, useLocalFolders, type AssetModel, type ViewerAsset } from '@features/assets';
import { assetEvents } from '@features/assets/lib/assetEvents';
import { extractUploadError, notifyGalleryOfNewAsset } from '@features/assets/lib/uploadActions';
import { useGenerationSettingsStore, getRegisteredSettingsStores } from '@features/generation';
// import { MiniGalleryPopover } from '@features/generation/components/MiniGalleryPopover';


import {
  type AnyElement,
  type InteractionLayer,
  InteractiveImageSurface,
  type InteractionMode,
  type InteractiveImageSurfaceHandle,
  type StrokeElement,
  type PolygonElement,
  useInteractionLayer,
} from '@/components/interactive-surface';
import { drawVariableWidthCurve, traceSmoothPath } from '@/components/interactive-surface/curveRenderUtils';
import { useViewerToolPresets, type ResolvedPreset } from '@/components/media/viewer/tools';
import { useAuthenticatedMedia } from '@/hooks/useAuthenticatedMedia';


import { useViewerViewportStore } from '../../panels/viewerViewportStore';
import { useOverlayLayerStore } from '../shared/overlayLayerStore';
import {
  OverlaySidePanel,
  SideSection,
  SideDivider,
  SideToolButton,
  SideSlider,
  SideIconButton,
  // SidePrimaryButton,
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

/**
 * Broadcast mask_url to the global settings store AND all registered scoped
 * settings stores. This ensures whichever scope the QuickGen widget is using
 * will pick up the mask — avoids hardcoding a specific scope ID.
 */
function broadcastMaskUrlToGenerationScopes(maskUrl: string | undefined): void {
  useGenerationSettingsStore.getState().setParam('mask_url', maskUrl);
  for (const store of getRegisteredSettingsStores()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zustand hook type doesn't expose getState()
    (store as any).getState().setParam('mask_url', maskUrl);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

/**
 * Fetch a saved mask asset and return it as an ImageBitmap with transparent
 * background (black→transparent, white stays white).  This is stored at the
 * layer level as a base image — no element conversion needed.
 */
async function fetchMaskAsBaseImage(maskAssetId: number): Promise<ImageBitmap> {
  const token = authService.getStoredToken();
  const url = `${API_BASE_URL.replace(/\/$/, '')}/assets/${maskAssetId}/file`;
  const res = await fetch(url, {
    headers: withCorrelationHeaders(
      token ? { Authorization: `Bearer ${token}` } : undefined,
      'overlay:mask:fetch-base-image',
    ),
  });
  if (!res.ok) {
    throw new Error(`Failed to load mask image (${res.status})`);
  }

  const blob = await res.blob();
  const decoded = await loadImageFromBlob(blob);
  const width = decoded.naturalWidth || decoded.width;
  const height = decoded.naturalHeight || decoded.height;

  // Convert black→transparent so the mask composites correctly on both
  // the live overlay canvas (transparent bg) and the black-bg export canvas.
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Failed to prepare mask import canvas.');

  ctx.drawImage(decoded, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const brightness = d[i] + d[i + 1] + d[i + 2];
    if (brightness < 384) {
      d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0;
    } else {
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return createImageBitmap(canvas);
}

// ── Composite export ─────────────────────────────────────────────────

/**
 * Renders a single interaction layer's elements to a canvas context.
 * Shared between single-layer export and multi-layer compositing.
 */
/**
 * Which element categories to render.
 * - 'all'          — everything (default, used for composite export)
 * - 'raster-only'  — strokes + regions + base image, skip polygons/curves
 * - 'vector-only'  — polygons/curves only, skip strokes/regions/base image
 */
type RenderFilter = 'all' | 'raster-only' | 'vector-only';

function renderLayerToContext(
  ctx: CanvasRenderingContext2D,
  elements: AnyElement[],
  width: number,
  height: number,
  baseImage?: ImageBitmap,
  filter: RenderFilter = 'all',
): void {
  // Draw base image first (imported mask), then vector elements on top
  if (baseImage && filter !== 'vector-only') {
    ctx.drawImage(baseImage, 0, 0, width, height);
  }

  // Draw strokes/polygons/regions in white
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'source-over';

  for (const element of elements) {
    if (element.type === 'stroke' && !(element as StrokeElement).isErase) {
      if (filter === 'vector-only') continue;
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
      if (filter === 'raster-only') continue;
      const poly = element as PolygonElement;
      if (poly.closed) {
        // Closed polygon — fill
        if (poly.points.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(poly.points[0].x * width, poly.points[0].y * height);
        for (let i = 1; i < poly.points.length; i++) {
          ctx.lineTo(poly.points[i].x * width, poly.points[i].y * height);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        // Open curve — stroke with width (variable or uniform)
        if (poly.points.length < 2) continue;
        const screenPts = poly.points.map((p) => ({ x: p.x * width, y: p.y * height }));
        const isCurved = !!(poly.metadata as Record<string, unknown> | undefined)?.curved;

        if (poly.pointWidths && poly.pointWidths.length === poly.points.length) {
          const scaledWidths = poly.pointWidths.map((w) => w * (width / 500));
          drawVariableWidthCurve(ctx, screenPts, scaledWidths, isCurved && poly.points.length >= 3);
        } else {
          ctx.lineWidth = (poly.style?.strokeWidth ?? 2) * (width / 500);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(screenPts[0].x, screenPts[0].y);
          for (let i = 1; i < screenPts.length; i++) {
            ctx.lineTo(screenPts[i].x, screenPts[i].y);
          }
          ctx.stroke();
        }
      }
    } else if (element.type === 'region') {
      if (filter === 'vector-only') continue;
      const region = element as { bounds: { x: number; y: number; width: number; height: number } };
      ctx.fillRect(region.bounds.x * width, region.bounds.y * height, region.bounds.width * width, region.bounds.height * height);
    }
  }

  // Erase strokes (raster operation)
  if (filter !== 'vector-only') {
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
}

/**
 * Render visible mask layers to a canvas with the given element filter.
 * Returns the canvas, or null if there's nothing to render.
 */
function renderMaskComposite(
  layers: InteractionLayer[],
  width: number,
  height: number,
  baseImages: Map<string, ImageBitmap>,
  filter: RenderFilter,
  forceFullAlpha: boolean,
): HTMLCanvasElement | null {
  const visibleLayers = layers.filter(
    (l) => l.type === 'mask' && l.visible && (l.elements.length > 0 || baseImages.has(l.id)),
  );
  if (visibleLayers.length === 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  for (const layer of visibleLayers) {
    if (layer.opacity < 1) {
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = width;
      tmpCanvas.height = height;
      const tmpCtx = tmpCanvas.getContext('2d');
      if (!tmpCtx) continue;
      tmpCtx.fillStyle = '#000000';
      tmpCtx.fillRect(0, 0, width, height);
      renderLayerToContext(tmpCtx, layer.elements, width, height, baseImages.get(layer.id), filter);
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(tmpCanvas, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    } else {
      renderLayerToContext(ctx, layer.elements, width, height, baseImages.get(layer.id), filter);
    }
  }

  if (forceFullAlpha) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 0 || d[i + 1] > 0 || d[i + 2] > 0) {
        d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return canvas;
}

// ── MaskOverlayMain ───────────────────────────────────────────────────

export function MaskOverlayMain({ asset, mediaDimensions }: MediaOverlayComponentProps) {
  const toast = useToast();
  const store = useMaskOverlayStore;

  // Resolve authenticated image URL
  const imageUrl = asset.fullUrl || asset.url;
  const { src: resolvedSrc } = useAuthenticatedMedia(imageUrl);

  // Track media dimensions from our own InteractiveImageSurface (more reliable
  // than the mediaDimensions prop from MediaPanel which can be stale).
  const [surfaceDimensions, setSurfaceDimensions] = useState<{ width: number; height: number } | undefined>();
  const handleMediaLoad = useCallback((dims: { width: number; height: number }) => {
    setSurfaceDimensions(dims);
  }, []);
  // Prefer our own dimensions, fall back to prop
  const resolvedMediaDimensions = surfaceDimensions ?? mediaDimensions;

  // Set up interaction layer — seed the initial view from the shared viewer
  // viewport so entering mask mode preserves the user's zoom/pan/fit.
  const interaction = useInteractionLayer({
    initialMode: 'draw',
    initialTool: { size: 0.03, color: '#ffffff', opacity: 0.7 },
    polygonCloseOnFinalize: false,
    initialViewState: (() => {
      const vp = useViewerViewportStore.getState();
      return { zoom: vp.zoom / 100, pan: vp.pan, fitMode: vp.fitMode };
    })(),
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
    setView: setInteractionView,
    setFitMode: setInteractionFitMode,
    viewCursorHint,
    hoveredVertex,
    setVertexWidth,
  } = interaction;

  // Bidirectional sync between this overlay's interaction view and the
  // shared viewer viewport store. Equality guards on both sides prevent
  // feedback loops.
  const interactionViewRef = useRef(state.view);
  interactionViewRef.current = state.view;

  useEffect(() => {
    const cur = useViewerViewportStore.getState();
    const nextZoom = state.view.zoom * 100;
    const sameZoom = Math.abs(cur.zoom - nextZoom) < 0.001;
    const samePan = cur.pan.x === state.view.pan.x && cur.pan.y === state.view.pan.y;
    const sameFit = cur.fitMode === state.view.fitMode;
    if (sameZoom && samePan && sameFit) return;
    cur.setViewport({ zoom: nextZoom, pan: state.view.pan, fitMode: state.view.fitMode });
  }, [state.view.zoom, state.view.pan, state.view.fitMode]);

  useEffect(() => {
    return useViewerViewportStore.subscribe((vp) => {
      const v = interactionViewRef.current;
      const internalZoom = v.zoom * 100;
      if (Math.abs(internalZoom - vp.zoom) > 0.001 ||
          v.pan.x !== vp.pan.x ||
          v.pan.y !== vp.pan.y) {
        setInteractionView({ zoom: vp.zoom / 100, pan: vp.pan });
      }
      if (v.fitMode !== vp.fitMode) {
        setInteractionFitMode(vp.fitMode);
      }
    });
  }, [setInteractionView, setInteractionFitMode]);

  const draftStorageKey = useMemo(() => getMaskDraftStorageKey(asset), [asset]);
  const sourceAssetId = useMemo(() => getViewerBackendAssetId(asset), [asset]);
  const restoredDraftKeyRef = useRef<string | null>(null);
  const persistDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isImportingSavedMask, setIsImportingSavedMask] = useState(false);

  /** Base images for imported mask layers (layerId → ImageBitmap). */
  const baseImagesRef = useRef<Map<string, ImageBitmap>>(new Map());
  const surfaceRef = useRef<InteractiveImageSurfaceHandle>(null);

  /**
   * Custom layer renderer that draws the base image (imported mask) before
   * the default element rendering.  Returns undefined when no base images
   * exist so the default renderer handles everything.
   */
  const handleRenderLayer = useMemo(() => {
    if (baseImagesRef.current.size === 0) return undefined;

    return (layer: InteractionLayer, ctx: CanvasRenderingContext2D) => {
      // Get image rect from ref (may be unavailable on first frame — that's OK,
      // the canvas will redraw on the next state change when the ref is set)
      const transform = surfaceRef.current?.getTransform();
      const imageRect = transform?.getImageRect();

      // Draw imported mask base image
      const baseImage = baseImagesRef.current.get(layer.id);
      if (baseImage && imageRect) {
        ctx.drawImage(baseImage, imageRect.x, imageRect.y, imageRect.width, imageRect.height);
      }

      if (!imageRect) return;

      const toScreenX = (nx: number) => nx * imageRect.width + imageRect.x;
      const toScreenY = (ny: number) => ny * imageRect.height + imageRect.y;
      const toScreen = (p: { x: number; y: number }) => ({
        x: toScreenX(p.x),
        y: toScreenY(p.y),
      });
      const zoom = state.view.zoom;

      // Render all element types — same logic as InteractiveImageSurface defaults
      for (const element of layer.elements) {
        if (!element.visible) continue;

        if (element.type === 'stroke') {
          const stroke = element as StrokeElement;
          if (stroke.points.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(toScreenX(stroke.points[0].x), toScreenY(stroke.points[0].y));
          for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(toScreenX(stroke.points[i].x), toScreenY(stroke.points[i].y));
          }
          ctx.strokeStyle = stroke.isErase ? 'rgba(0,0,0,1)' : stroke.tool.color;
          ctx.lineWidth = stroke.tool.size * imageRect.width;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.globalAlpha = stroke.tool.opacity;
          ctx.globalCompositeOperation = stroke.isErase ? 'destination-out' : 'source-over';
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        } else if (element.type === 'polygon') {
          const poly = element as PolygonElement;
          const screenPts = poly.points.map(toScreen);
          if (poly.closed) {
            if (poly.points.length < 3) continue;
            ctx.beginPath();
            ctx.moveTo(screenPts[0].x, screenPts[0].y);
            for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].x, screenPts[i].y);
            ctx.closePath();
            ctx.fillStyle = poly.style?.fillColor ?? '#ffffff';
            ctx.fill();
          } else {
            if (poly.points.length < 2) continue;
            const isCurved = !!(poly.metadata as Record<string, unknown> | undefined)?.curved;
            if (poly.pointWidths && poly.pointWidths.length === poly.points.length) {
              const scaledWidths = poly.pointWidths.map((w) => w * zoom);
              ctx.strokeStyle = poly.style?.strokeColor ?? '#ffffff';
              drawVariableWidthCurve(ctx, screenPts, scaledWidths, isCurved && poly.points.length >= 3);
            } else {
              ctx.lineWidth = (poly.style?.strokeWidth ?? 2) * zoom;
              ctx.strokeStyle = poly.style?.strokeColor ?? '#ffffff';
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.beginPath();
              if (isCurved && poly.points.length >= 3) {
                traceSmoothPath(ctx, screenPts, false, 0.5);
              } else {
                ctx.moveTo(screenPts[0].x, screenPts[0].y);
                for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].x, screenPts[i].y);
              }
              ctx.stroke();
            }
            // Vertex handles
            for (let i = 0; i < poly.points.length; i++) {
              const p = toScreen(poly.points[i]);
              const pw = poly.pointWidths?.[i];
              const handleRadius = pw != null ? Math.max(3, (pw / 2) * zoom) : Math.max(3, 5 * Math.min(2, zoom));
              ctx.beginPath();
              ctx.arc(p.x, p.y, handleRadius, 0, Math.PI * 2);
              ctx.fillStyle = i === 0 ? '#f59e0b' : '#ffffff';
              ctx.globalAlpha = pw != null ? 0.35 : 1;
              ctx.fill();
              ctx.globalAlpha = 1;
              ctx.strokeStyle = '#111827';
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          }
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.layers, state.view.zoom]);

  // Combined initialization: restore draft OR create default layer (once per asset).
  // Uses ref guard to survive React StrictMode double-invoke.
  useEffect(() => {
    if (restoredDraftKeyRef.current === draftStorageKey) return;
    restoredDraftKeyRef.current = draftStorageKey;

    // Reset save-tracking refs so a new asset doesn't chain to the previous one
    lastSavedCompositeIdRef.current = null;
    autoSavedSourceAssetIdRef.current = null;

    const draft = readMaskDraft(asset);
    if (draft && draft.layers.length > 0) {
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
        // Re-fetch base image for layers that were imported from a saved mask
        if (layerDraft.savedAssetId) {
          const assetId = layerDraft.savedAssetId;
          const layerId = layerDraft.id;
          fetchMaskAsBaseImage(assetId).then((bitmap) => {
            baseImagesRef.current.set(layerId, bitmap);
            // Force a re-render so the canvas picks up the base image
            updateLayer(layerId, {});
          }).catch((err) => {
            console.warn('[MaskOverlay] Failed to restore base image for layer:', err);
          });
        }
      }
      interactionSetActiveLayer(draft.activeLayerId);
      setMode(draft.mode);
      setBrushSize(draft.brushSize);
      setBrushOpacity(draft.brushOpacity);
    } else {
      // No draft — remove any stale layers from previous asset, then create default
      for (const existing of state.layers) {
        if (existing.type === 'mask') {
          interactionRemoveLayer(existing.id);
        }
      }
      const id = nextMaskLayerId();
      addLayer({ type: 'mask', name: 'Mask 1', id });
      interactionSetActiveLayer(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStorageKey]);

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
        hasContent: l.elements.length > 0 || baseImagesRef.current.has(l.id),
        savedAssetId: l.config?.savedAssetId as number | undefined,
      })),
    [state.layers],
  );

  const hasContent = useMemo(
    () => state.layers.some((l) => l.type === 'mask' && (l.elements.length > 0 || baseImagesRef.current.has(l.id))),
    [state.layers],
  );

  const maskAssetsQuery = useAssets({
    limit: 50,
    filters: {
      source_asset_id: sourceAssetId ?? -1,
      media_type: 'image',
      upload_method: 'mask_draw',
      asset_kind: 'mask',
      sort: 'new',
    },
  });
  const anyMaskAssetsQuery = useAssets({
    limit: 100,
    filters: {
      media_type: 'image',
      upload_method: 'mask_draw',
      asset_kind: 'mask',
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
      baseImagesRef.current.delete(layerId);
      return;
    }
    baseImagesRef.current.delete(layerId);
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
    const replaceActive = targetLayer && targetLayer.elements.length === 0 && !baseImagesRef.current.has(activeLayerId!);

    // Look up asset metadata for vector layers / raster-only data URL
    const assetModel = [...maskAssetsQuery.items, ...anyMaskAssetsQuery.items]
      .find((a) => a.id === maskAssetId);
    const ctx = assetModel?.uploadContext;
    const vectorElements = Array.isArray(ctx?.vector_layers) ? ctx.vector_layers as AnyElement[] : [];
    const rasterDataUrl = typeof ctx?.raster_data_url === 'string' ? ctx.raster_data_url : null;

    setIsImportingSavedMask(true);
    try {
      // If we have a raster-only data URL, use that (strokes only, no baked vectors).
      // Otherwise fall back to the full composite asset file.
      let bitmap: ImageBitmap;
      if (rasterDataUrl) {
        const img = await loadImageFromBlob(await (await fetch(rasterDataUrl)).blob());
        const canvas = document.createElement('canvas');
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        canvas.width = w;
        canvas.height = h;
        const c = canvas.getContext('2d', { willReadFrequently: true })!;
        c.drawImage(img, 0, 0);
        // Convert black→transparent (same as fetchMaskAsBaseImage)
        const imageData = c.getImageData(0, 0, w, h);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] + d[i + 1] + d[i + 2] < 384) {
            d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0;
          } else {
            d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 255;
          }
        }
        c.putImageData(imageData, 0, 0);
        bitmap = await createImageBitmap(canvas);
      } else {
        bitmap = await fetchMaskAsBaseImage(maskAssetId);
      }

      if (replaceActive && targetLayer) {
        baseImagesRef.current.set(targetLayer.id, bitmap);
        // Restore vector elements with correct layerId
        const restoredVectors = vectorElements.map((el) => ({ ...el, layerId: targetLayer.id }));
        updateLayer(targetLayer.id, {
          elements: restoredVectors,
          name: `Mask #${maskAssetId}`,
          config: { savedAssetId: maskAssetId },
        });
        toast.success(`Loaded mask #${maskAssetId} into "${targetLayer.name}".`);
      } else {
        const id = nextMaskLayerId();
        addLayer({ type: 'mask', name: `Mask #${maskAssetId}`, id, config: { savedAssetId: maskAssetId } });
        baseImagesRef.current.set(id, bitmap);
        // Restore vector elements with correct layerId
        if (vectorElements.length > 0) {
          const restoredVectors = vectorElements.map((el) => ({ ...el, layerId: id }));
          updateLayer(id, { elements: restoredVectors });
        }
        interactionSetActiveLayer(id);
        toast.success(`Imported mask #${maskAssetId} as new layer.`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load saved mask.';
      toast.error(message);
    } finally {
      setIsImportingSavedMask(false);
    }
  }, [activeLayerId, addLayer, getLayer, interactionSetActiveLayer, isImportingSavedMask, toast, updateLayer, maskAssetsQuery.items, anyMaskAssetsQuery.items]);

  // ── Draft persistence ──────────────────────────────────────────────

  // Persist draft (debounced)
  useEffect(() => {
    if (persistDraftTimerRef.current) {
      clearTimeout(persistDraftTimerRef.current);
    }

    persistDraftTimerRef.current = setTimeout(() => {
      const maskLayers = state.layers.filter((l) => l.type === 'mask');
      // A layer has content if it has stroke elements OR a base image
      if (maskLayers.every((l) => l.elements.length === 0 && !baseImagesRef.current.has(l.id))) {
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

  // Resolve hovered vertex width from interaction layer state
  const hoveredVertexWidth = useMemo(() => {
    if (!hoveredVertex) return null;
    const layer = state.layers.find((l) => l.id === hoveredVertex.layerId);
    const el = layer?.elements.find((e) => e.id === hoveredVertex.elementId && e.type === 'polygon');
    if (!el) return null;
    const poly = el as PolygonElement;
    return poly.pointWidths?.[hoveredVertex.vertexIndex] ?? null;
  }, [hoveredVertex, state.layers]);

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
      hoveredVertex,
      hoveredVertexWidth,
    });
  }, [state.mode, state.tool.size, state.tool.opacity, canUndo, canRedo, hasContent, currentZoom, isZoomed, layerInfos, activeLayerId, hoveredVertex, hoveredVertexWidth, store]);

  // Sync layer state to shared overlay layer store (for default sidebar)
  useEffect(() => {
    useOverlayLayerStore.getState().syncLayers(layerInfos, activeLayerId, true);
  }, [layerInfos, activeLayerId]);

  useEffect(() => {
    return () => useOverlayLayerStore.getState().clearLayers();
  }, []);

  // ── Ref-based callback bridge ──────────────────────────────────────

  const callbacksRef = useRef({
    setMode,
    setBrushSize,
    setBrushOpacity,
    undo,
    redo,
    clearLayer: () => { if (activeLayerId) { baseImagesRef.current.delete(activeLayerId); clearLayer(activeLayerId); } },
    exportMask: async () => {},
    saveAsNew: async () => {},
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
  callbacksRef.current.clearLayer = () => { if (activeLayerId) { baseImagesRef.current.delete(activeLayerId); clearLayer(activeLayerId); } };
  callbacksRef.current.resetView = resetView;
  callbacksRef.current.addLayer = handleAddLayer;
  callbacksRef.current.removeLayer = handleRemoveLayer;
  callbacksRef.current.setActiveLayer = handleSetActiveLayer;
  callbacksRef.current.toggleLayerVisibility = handleToggleLayerVisibility;
  callbacksRef.current.renameLayer = handleRenameLayer;
  callbacksRef.current.setVertexWidth = setVertexWidth;
  callbacksRef.current.importSavedMask = handleImportSavedMask;

  // ── Composite export ───────────────────────────────────────────────

  /** Tracks the last saved composite mask asset ID so subsequent saves overwrite it. */
  const lastSavedCompositeIdRef = useRef<number | null>(null);
  /** Caches the backend asset ID if the source image was auto-saved to library. */
  const autoSavedSourceAssetIdRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);

  /** Resolve version parent from ref, any layer's savedAssetId, or existing saved masks. */
  const resolveVersionParent = useCallback((): number | null => {
    if (lastSavedCompositeIdRef.current) return lastSavedCompositeIdRef.current;
    // Check all visible mask layers for a savedAssetId (first one wins)
    for (const layer of state.layers) {
      if (layer.type === 'mask' && layer.visible && (layer.elements.length > 0 || baseImagesRef.current.has(layer.id))) {
        const savedId = layer.config?.savedAssetId as number | undefined;
        if (savedId) return savedId;
      }
    }
    // Fallback: if there are already saved masks for this source asset, version from the latest
    if (sourceMaskAssets.length > 0) {
      return sourceMaskAssets[0].id;
    }
    return null;
  }, [state.layers, sourceMaskAssets]);

  // Sync hasVersionParent to store so toolbar can show Save vs Save As
  useEffect(() => {
    store.getState()._syncState({ hasVersionParent: resolveVersionParent() !== null });
  }, [resolveVersionParent, store]);

  const doExportMask = useCallback(async (forceNew: boolean) => {
    if (isSavingRef.current) return;
    const saveTarget = 'library' as const;

    const width = resolvedMediaDimensions?.width || 1024;
    const height = resolvedMediaDimensions?.height || 1024;
    const forceFullAlpha = store.getState().forceFullAlpha;

    // ── Render composite (strokes + vectors) — this is the file consumers see
    const compositeCanvas = renderMaskComposite(
      state.layers, width, height, baseImagesRef.current, 'all', forceFullAlpha,
    );
    if (!compositeCanvas) {
      toast.error('No visible mask content to export.');
      return;
    }

    // ── Collect vector elements for metadata (polygons/curves across all visible layers)
    const visibleLayers = state.layers.filter(
      (l) => l.type === 'mask' && l.visible && (l.elements.length > 0 || baseImagesRef.current.has(l.id)),
    );
    const vectorElements = visibleLayers.flatMap((l) =>
      l.elements.filter((el) => el.type === 'polygon'),
    );

    // ── Render raster-only PNG (strokes + base images, no vectors) for re-editing
    let rasterOnlyDataUrl: string | undefined;
    if (vectorElements.length > 0) {
      const rasterCanvas = renderMaskComposite(
        state.layers, width, height, baseImagesRef.current, 'raster-only', forceFullAlpha,
      );
      if (rasterCanvas) {
        rasterOnlyDataUrl = rasterCanvas.toDataURL('image/png');
      }
    }

    const maskDataUrl = compositeCanvas.toDataURL('image/png');

    isSavingRef.current = true;
    store.getState()._syncState({ isSaving: true });

    try {
      const res = await fetch(maskDataUrl);
      const blob = await res.blob();

      let sourceAssetIdForUpload = getViewerBackendAssetId(asset) ?? autoSavedSourceAssetIdRef.current;

      // If the source asset is not in the library yet, save it first so the mask
      // gets a proper source_asset_id link.
      if (sourceAssetIdForUpload === null) {
        try {
          const srcUrl = asset.fullUrl || asset.url;
          const token = authService.getStoredToken();
          const sourceHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;
          const shouldAttachCorrelation =
            srcUrl.startsWith('/api/v1/') || srcUrl.startsWith(API_BASE_URL);
          const imgRes = await fetch(
            srcUrl,
            shouldAttachCorrelation
              ? {
                  headers: withCorrelationHeaders(
                    sourceHeaders,
                    'overlay:mask:auto-save-source',
                  ),
                }
              : (sourceHeaders ? { headers: sourceHeaders } : undefined),
          );
          const imgBlob = await imgRes.blob();
          const srcFilename = asset.name || `source_${Date.now()}.png`;
          const srcResult = await uploadAsset({
            file: imgBlob,
            filename: srcFilename,
            saveTarget: 'library',
            uploadMethod: 'mask_source_auto',
          });
          if (srcResult.asset_id) {
            sourceAssetIdForUpload = srcResult.asset_id;
            autoSavedSourceAssetIdRef.current = srcResult.asset_id;
            await notifyGalleryOfNewAsset(srcResult.asset_id);

            // Update local folder store so the card reflects the library link
            if (asset.source === 'local') {
              const localAssetKey = String(asset.id);
              useLocalFolders.getState().updateAssetUploadStatus(
                localAssetKey, 'success', 'Auto-saved via mask overlay',
                { assetId: srcResult.asset_id, providerId: 'library' },
              );
            }
          }
        } catch (err) {
          console.warn('[MaskOverlay] Failed to auto-save source asset to library:', err);
        }
      }

      const filename = buildMaskFilename(sourceAssetIdForUpload ?? asset.id);
      const uploadContext: Record<string, unknown> = {
        ...buildMaskUploadContext({
          sourceAssetId: sourceAssetIdForUpload ?? undefined,
          feature: 'mask_overlay',
          source: 'asset_viewer',
        }),
        save_target: saveTarget,
      };

      // Stash editing data: vector elements + raster-only PNG for clean re-editing
      if (vectorElements.length > 0) {
        uploadContext.vector_layers = vectorElements;
        if (rasterOnlyDataUrl) {
          uploadContext.raster_data_url = rasterOnlyDataUrl;
        }
      }

      // Chain as a version unless forced new
      if (!forceNew) {
        const versionParentId = resolveVersionParent();
        if (versionParentId) {
          uploadContext.version_parent_id = versionParentId;
          uploadContext.version_message = 'Mask updated';
        }
      }

      const uploadResult = await uploadAsset({
        file: blob,
        filename,
        saveTarget,
        uploadMethod: 'mask_draw',
        uploadContext,
      });

      const newAssetId = uploadResult.asset_id;
      let attachedToGeneration = false;

      const versionWasApplied = uploadResult.versioning_status === 'applied';

      if (newAssetId) {
        try {
          // Add new asset to gallery first, then remove old parent if versioned.
          // Order matters: add before remove so gallery is never empty.
          await notifyGalleryOfNewAsset(newAssetId);
          if (versionWasApplied && uploadContext.version_parent_id) {
            assetEvents.emitAssetDeleted(uploadContext.version_parent_id as number);
          }
        } catch {
          // Non-critical
        }

        broadcastMaskUrlToGenerationScopes(`asset:${newAssetId}`);
        attachedToGeneration = true;

        // Track so next save versions from this composite
        lastSavedCompositeIdRef.current = newAssetId;

        // Stamp savedAssetId on all visible layers so reopening the overlay
        // chains from the correct parent (not stale or missing).
        for (const layer of visibleLayers) {
          updateLayer(layer.id, { config: { ...layer.config, savedAssetId: newAssetId } });
        }

        maskAssetsQuery.reset();
        anyMaskAssetsQuery.reset();
      }

      const idLabel = newAssetId ? ` #${newAssetId}` : '';
      if (forceNew) {
        toast.success(`Mask${idLabel} saved as new asset.`);
      } else if (versionWasApplied) {
        toast.success(`Mask${idLabel} updated (version of #${uploadContext.version_parent_id}).`);
      } else if (attachedToGeneration) {
        toast.success(`Mask${idLabel} saved and set for generation.`);
      } else {
        toast.success(`Mask${idLabel} saved to library.`);
      }
    } catch (err) {
      toast.error(extractUploadError(err, 'Failed to save mask.'));
    } finally {
      isSavingRef.current = false;
      store.getState()._syncState({ isSaving: false });
    }
  }, [asset, resolvedMediaDimensions, state.layers, toast, store, updateLayer, maskAssetsQuery.reset, anyMaskAssetsQuery.reset, resolveVersionParent]);

  const exportMask = useCallback(() => doExportMask(false), [doExportMask]);
  const saveAsNew = useCallback(() => doExportMask(true), [doExportMask]);

  callbacksRef.current.exportMask = exportMask;
  callbacksRef.current.saveAsNew = saveAsNew;

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
      saveAsNew: () => callbacksRef.current.saveAsNew(),
      resetView: () => callbacksRef.current.resetView(),
      addLayer: () => callbacksRef.current.addLayer(),
      removeLayer: (id) => callbacksRef.current.removeLayer(id),
      setActiveLayer: (id) => callbacksRef.current.setActiveLayer(id),
      toggleLayerVisibility: (id) => callbacksRef.current.toggleLayerVisibility(id),
      renameLayer: (id, name) => callbacksRef.current.renameLayer(id, name),
      importSavedMask: (id) => callbacksRef.current.importSavedMask(id),
      setVertexWidth: (lid, eid, vi, w) => callbacksRef.current.setVertexWidth(lid, eid, vi, w),
    });
  }, [store]);

  // Register layer callbacks into shared overlay layer store
  useEffect(() => {
    useOverlayLayerStore.getState().registerLayerCallbacks({
      addLayer: () => callbacksRef.current.addLayer(),
      removeLayer: (id) => callbacksRef.current.removeLayer(id),
      setActiveLayer: (id) => callbacksRef.current.setActiveLayer(id),
      toggleLayerVisibility: (id) => callbacksRef.current.toggleLayerVisibility(id),
      renameLayer: (id, name) => callbacksRef.current.renameLayer(id, name),
    });
  }, []);

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
        case '0':
          callbacksRef.current.resetView();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Delete a saved mask asset from the backend and remove its layer
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDeleteMaskAsset = useCallback(async (assetId: number, layerId: string) => {
    try {
      await deleteAsset(assetId);
    } catch (err) {
      // 404 = asset already gone — still clean up the layer
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== 404) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete mask.');
        return;
      }
    }
    // Remove the layer from the editing session
    interaction.removeLayer(layerId);
    maskAssetsQuery.reset();
    anyMaskAssetsQuery.reset();
    toast.success(`Mask #${assetId} deleted.`);
  }, [interaction, maskAssetsQuery, anyMaskAssetsQuery, toast]);

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
    : viewCursorHint ?? 'default';

  return (
    <PanelShell
      className="absolute inset-0 bg-surface-inset"
      sidebar={<MaskToolsPanel />}
      sidebarWidth="w-32"
      bodyScroll={false}
    >
      <div className="w-full h-full" onContextMenu={(e) => { if (state.mode === 'view') e.preventDefault(); }}>
        <InteractiveImageSurface
          ref={surfaceRef}
          media={media}
          state={state}
          handlers={handlers}
          cursor={cursor}
          className="w-full h-full"
          onMediaLoad={handleMediaLoad}
          renderLayer={handleRenderLayer}
        >
          <MaskPreviewOverlay />
        </InteractiveImageSurface>
      </div>
    </PanelShell>
  );
}

// ── MaskPreviewOverlay ────────────────────────────────────────────────

function MaskPreviewOverlay() {
  const previewMaskUrl = useMaskOverlayStore((s) => s.previewMaskUrl);
  const { src } = useAuthenticatedMedia(previewMaskUrl ?? undefined);

  if (!src) return null;

  return (
    <img
      src={src}
      alt=""
      className="w-full h-full opacity-60"
      style={{ mixBlendMode: 'screen', maxWidth: 'none', maxHeight: 'none' }}
      draggable={false}
    />
  );
}

// ── MaskToolsPanel (LEFT) ─────────────────────────────────────────────

const TOOL_MODES = [
  { mode: 'draw' as const, icon: 'paintbrush' as const, label: 'Draw', shortcut: 'D' },
  { mode: 'polygon' as const, icon: 'penTool' as const, label: 'Curve', shortcut: 'C' },
  { mode: 'erase' as const, icon: 'xCircle' as const, label: 'Erase', shortcut: 'E' },
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
    forceFullAlpha,
    hasVersionParent,
    activePresetId,
    setActivePresetId,
    setMode,
    setBrushSize,
    setBrushOpacity,
    undo,
    redo,
    clearLayer,
    exportMask,
    saveAsNew,
    resetView,
    setForceFullAlpha,
    hoveredVertex,
    hoveredVertexWidth,
    setVertexWidth,
  } = useMaskOverlayStore();

  const { manual, automatic } = useViewerToolPresets({ hasImage: true, hasSelection: hasContent });

  const isManualPreset = activePresetId.startsWith('manual-');

  return (
    <OverlaySidePanel>
      {/* Preset source selector — only shown when non-manual presets exist */}
      {automatic.length > 0 && (
        <>
          <SideSection label="Source">
            {manual.map(({ preset, availability }) => (
              <PresetButton
                key={preset.id}
                preset={{ preset, availability }}
                active={activePresetId === preset.id}
                onClick={() => setActivePresetId(preset.id)}
              />
            ))}
            {automatic.map(({ preset, availability }) => (
              <PresetButton
                key={preset.id}
                preset={{ preset, availability }}
                active={activePresetId === preset.id}
                onClick={() => {
                  if (availability.available) setActivePresetId(preset.id);
                }}
              />
            ))}
          </SideSection>
          <SideDivider />
        </>
      )}

      <SideSection label={isManualPreset ? 'Tools' : 'Tools (manual only)'}>
        {TOOL_MODES.map(({ mode: m, icon, label, shortcut }) => (
          <SideToolButton
            key={m}
            icon={icon}
            label={label}
            active={isManualPreset && mode === m}
            title={isManualPreset ? `${label} (${shortcut})` : 'Switch to a manual preset to use drawing tools'}
            onClick={() => {
              if (!isManualPreset) setActivePresetId('manual-draw');
              setMode(m);
            }}
          />
        ))}
      </SideSection>

      {mode === 'polygon' && (
        <div className="px-2 text-[10px] text-th-muted leading-snug">
          Click to place points. Double-click to finish. Scroll on a vertex to adjust its width.
        </div>
      )}
      {mode === 'view' && (
        <div className="px-2 text-[10px] text-th-muted leading-snug">
          Click a vertex to drag it. Click an edge to add a point. Right-click a vertex to remove. Scroll to adjust width.
        </div>
      )}

      <SideDivider />

      <SideSection label={mode === 'polygon' ? 'Curve Width' : 'Brush'} className="gap-1.5">
        <SideSlider
          label={mode === 'polygon' ? `Width: ${Math.round(brushSize * 500)}` : 'Size'}
          value={brushSize}
          min={0.005}
          max={0.15}
          step={0.005}
          onChange={setBrushSize}
        />
        {mode !== 'polygon' && (
          <SideSlider label="Opacity" value={brushOpacity} min={0.1} max={1} step={0.1} onChange={setBrushOpacity} />
        )}
      </SideSection>

      {hoveredVertex && hoveredVertexWidth != null && (
        <>
          <SideDivider />
          <SideSection label={`Point ${hoveredVertex.vertexIndex + 1} Width`} className="gap-1">
            <SideSlider
              label={`${Math.round(hoveredVertexWidth)}`}
              value={hoveredVertexWidth}
              min={1}
              max={75}
              step={0.5}
              onChange={(w) => setVertexWidth(
                hoveredVertex.layerId,
                hoveredVertex.elementId,
                hoveredVertex.vertexIndex,
                w,
              )}
            />
          </SideSection>
        </>
      )}

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

      <label
        className="px-2 flex items-center gap-1.5 cursor-pointer select-none"
        title="Binarize mask on export: any painted pixel becomes fully white"
      >
        <input
          type="checkbox"
          checked={forceFullAlpha}
          onChange={(e) => setForceFullAlpha(e.target.checked)}
          className="accent-accent w-3 h-3"
        />
        <span className="text-[10px] text-th-secondary leading-none">Full alpha</span>
      </label>

      <div className="px-2">
        <div className="flex w-full rounded overflow-hidden">
          <button
            disabled={!hasContent || isSaving}
            onClick={exportMask}
            className={`flex-1 py-2 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              !hasContent || isSaving ? 'bg-th/10 text-th-muted' : 'bg-accent hover:bg-accent-hover text-accent-text'
            } ${hasVersionParent ? 'rounded-l' : 'rounded'}`}
            title={hasVersionParent ? 'Overwrite current mask version' : 'Save as new mask asset'}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          {hasVersionParent && (
            <button
              disabled={!hasContent || isSaving}
              onClick={saveAsNew}
              className={`w-7 flex items-center justify-center border-l border-black/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                !hasContent || isSaving ? 'bg-th/10 text-th-muted' : 'bg-accent hover:bg-accent-hover text-accent-text'
              } rounded-r`}
              title="Save as new mask (no version chain)"
            >
              <Icon name="chevronDown" size={10} />
            </button>
          )}
        </div>
      </div>
    </OverlaySidePanel>
  );
}

// ── PresetButton ──────────────────────────────────────────────────────

function PresetButton({ preset: resolved, active, onClick }: {
  preset: ResolvedPreset;
  active: boolean;
  onClick: () => void;
}) {
  const { preset, availability } = resolved;
  const disabled = !availability.available;
  const reason = !availability.available ? availability.reason : undefined;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={reason ?? preset.label}
      className={[
        'flex items-center gap-1.5 w-full px-2 py-1 rounded text-[11px] transition-colors',
        active
          ? 'bg-accent/20 text-accent'
          : disabled
            ? 'opacity-40 cursor-not-allowed text-th-muted'
            : 'hover:bg-th/10 text-th-secondary',
      ].join(' ')}
    >
      {preset.icon && <Icon name={preset.icon} size={12} />}
      <span className="truncate">{preset.label}</span>
      {preset.source !== 'manual' && (
        <span className="ml-auto text-[9px] text-th-muted uppercase">{preset.source}</span>
      )}
    </button>
  );
}
