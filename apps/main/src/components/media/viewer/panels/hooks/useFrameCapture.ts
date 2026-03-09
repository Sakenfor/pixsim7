/**
 * useFrameCapture
 *
 * Hook for capturing video frames and uploading them to the asset library.
 * Handles region selection, upload context assembly, and the capture workflow.
 * Supports clipboard copy and provider upload actions.
 */

import { clampRectNormalized, denormalizeRect } from '@pixsim7/graphics.geometry';
import {
  buildCaptureFilename,
  getFilenameFromUrl,
  getSourceSiteFromUrl,
} from '@pixsim7/shared.media.core';
import { useToast } from '@pixsim7/shared.ui';
import { useState, useCallback, useMemo, type RefObject } from 'react';

import { uploadAsset } from '@lib/api/upload';

import type { ViewerAsset } from '@features/assets';
import { extractUploadError, notifyGalleryOfNewAsset } from '@features/assets/lib/uploadActions';
import {
  useCaptureRegionStore,
  type AssetRegion,
  type AssetRegionLayer,
} from '@features/mediaViewer';

import { findActiveRegion, type MediaOverlayId } from '../../overlays';
import { resolveViewerAssetProviderId } from '../../utils/providerResolution';

export type CaptureAction = 'clipboard' | 'upload';

const EMPTY_CAPTURE_REGIONS: AssetRegion[] = [];
const EMPTY_CAPTURE_LAYERS: AssetRegionLayer[] = [];

export interface UseFrameCaptureOptions {
  /** Current asset being viewed */
  asset: ViewerAsset | null;
  /** Reference to the video element */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Reference to the image element */
  imageRef: RefObject<HTMLImageElement | null>;
  /** Active overlay mode ID */
  activeOverlayId: MediaOverlayId | null;
}

export interface UseFrameCaptureResult {
  /** Whether a capture is currently in progress */
  isCapturing: boolean;
  /** Capture the current frame with the given action */
  captureFrame: (action?: CaptureAction) => Promise<void>;
  /** Currently selected capture region (if any) */
  captureRegion: AssetRegion | null;
  /** All visible capture regions for the current asset */
  captureRegions: AssetRegion[];
}

/**
 * Hook for capturing video frames or image crops with optional region cropping.
 *
 * @param options - Configuration options
 * @returns Frame capture state and actions
 */
export function useFrameCapture({
  asset,
  videoRef,
  imageRef,
  activeOverlayId,
}: UseFrameCaptureOptions): UseFrameCaptureResult {
  const toast = useToast();
  const [isCapturing, setIsCapturing] = useState(false);

  // Capture region store selectors
  const captureRegions = useCaptureRegionStore((s) =>
    asset ? s.getRegions(asset.id) : EMPTY_CAPTURE_REGIONS
  );
  const captureLayers = useCaptureRegionStore((s) =>
    asset ? s.getLayers(asset.id) : EMPTY_CAPTURE_LAYERS
  );
  const captureSelectedRegionId = useCaptureRegionStore((s) => s.selectedRegionId);

  const visibleCaptureLayerIds = useMemo(
    () => new Set(captureLayers.filter((layer) => layer.visible).map((layer) => layer.id)),
    [captureLayers]
  );
  const visibleCaptureRegions = useMemo(
    () => captureRegions.filter((region) => visibleCaptureLayerIds.has(region.layerId)),
    [captureRegions, visibleCaptureLayerIds]
  );

  // Determine which region to use for capture
  const captureRegion = useMemo(() => {
    if (!asset || activeOverlayId !== 'capture') {
      return null;
    }
    return findActiveRegion(visibleCaptureRegions, captureSelectedRegionId);
  }, [asset, activeOverlayId, captureSelectedRegionId, visibleCaptureRegions]);

  // Resolve the provider ID for upload
  const resolveCaptureProviderId = useCallback((): string | null => {
    if (!asset) return null;
    return resolveViewerAssetProviderId(asset);
  }, [asset]);

  const buildCaptureFilenameFromSource = useCallback(
    (sourceName: string | null, timeSec: number): string =>
      buildCaptureFilename(sourceName, timeSec),
    []
  );

  /**
   * Load an untainted draw source from an element.
   * For images, re-fetches the src as a blob to avoid cross-origin canvas tainting.
   * For videos, returns the element directly (same-origin blob URLs work fine).
   */
  const loadUntaintedSource = useCallback(
    async (
      el: HTMLVideoElement | HTMLImageElement,
      width: number,
      height: number,
    ): Promise<CanvasImageSource> => {
      if (el instanceof HTMLVideoElement) return el;
      try {
        const res = await fetch(el.src);
        const blob = await res.blob();
        return await createImageBitmap(blob, { resizeWidth: width, resizeHeight: height });
      } catch {
        // Fall back to DOM element (may taint canvas for cross-origin images)
        return el;
      }
    },
    [],
  );

  /**
   * Render the current frame (with optional region crop) to a JPEG blob.
   */
  const renderCaptureBlob = useCallback(
    async (
      sourceElement: HTMLVideoElement | HTMLImageElement,
      sourceWidth: number,
      sourceHeight: number,
    ): Promise<Blob> => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to capture.');
      }

      const drawSource = await loadUntaintedSource(sourceElement, sourceWidth, sourceHeight);

      let regionBounds = null;
      if (captureRegion?.type === 'rect' && captureRegion.bounds) {
        const clamped = clampRectNormalized(captureRegion.bounds);
        const denormalized = denormalizeRect(clamped, sourceWidth, sourceHeight);
        const sx = Math.round(denormalized.x);
        const sy = Math.round(denormalized.y);
        const sw = Math.round(denormalized.width);
        const sh = Math.round(denormalized.height);
        if (sw > 1 && sh > 1) {
          regionBounds = { sx, sy, sw, sh };
        }
      }

      if (regionBounds) {
        const sw = Math.min(regionBounds.sw, sourceWidth - regionBounds.sx);
        const sh = Math.min(regionBounds.sh, sourceHeight - regionBounds.sy);
        if (sw > 1 && sh > 1) {
          canvas.width = sw;
          canvas.height = sh;
          ctx.drawImage(
            drawSource,
            regionBounds.sx,
            regionBounds.sy,
            sw,
            sh,
            0,
            0,
            canvas.width,
            canvas.height
          );
        } else {
          regionBounds = null;
        }
      }

      if (!regionBounds) {
        canvas.width = sourceWidth;
        canvas.height = sourceHeight;
        ctx.drawImage(drawSource, 0, 0, canvas.width, canvas.height);
      }

      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error('Failed to capture.'))),
          'image/jpeg',
          0.92
        );
      });
    },
    [captureRegion, loadUntaintedSource]
  );

  // Main capture function
  const captureFrame = useCallback(async (action: CaptureAction = 'upload') => {
    if (!asset || (asset.type !== 'video' && asset.type !== 'image')) return;

    // Determine source element and dimensions based on asset type
    const isVideo = asset.type === 'video';
    const video = videoRef.current;
    const image = imageRef.current;

    let sourceElement: HTMLVideoElement | HTMLImageElement | null = null;
    let sourceWidth = 0;
    let sourceHeight = 0;

    if (isVideo) {
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
        toast.error('Video not ready for capture.');
        return;
      }
      sourceElement = video;
      sourceWidth = video.videoWidth;
      sourceHeight = video.videoHeight;
    } else {
      if (!image || image.naturalWidth === 0 || image.naturalHeight === 0) {
        toast.error('Image not ready for capture.');
        return;
      }
      sourceElement = image;
      sourceWidth = image.naturalWidth;
      sourceHeight = image.naturalHeight;
    }

    setIsCapturing(true);
    try {
      const blob = await renderCaptureBlob(sourceElement, sourceWidth, sourceHeight);

      if (action === 'clipboard') {
        // Copy to clipboard
        try {
          // Convert JPEG blob to PNG for clipboard (better compatibility)
          await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob }),
          ]);
          toast.success('Copied to clipboard.');
        } catch {
          throw new Error('Failed to copy to clipboard.');
        }
        return;
      }

      // Upload action
      const providerId = resolveCaptureProviderId();
      const saveTarget: 'provider' | 'library' = providerId ? 'provider' : 'library';
      const sourceUrl = asset.fullUrl || asset.url || undefined;
      const sourceFilename = getFilenameFromUrl(sourceUrl) || asset.name || null;
      const frameTime = isVideo ? video!.currentTime : 0;
      const uploadContext: Record<string, unknown> = {
        client: 'web_app',
        feature: 'asset_viewer_capture',
        source: 'asset_viewer',
        save_target: saveTarget,
        frame_time: frameTime,
        has_region: Boolean(captureRegion),
      };

      if (sourceFilename) {
        uploadContext.source_filename = sourceFilename;
      }
      if (asset.source === 'local') {
        uploadContext.source_site = 'local';
        if (asset.metadata?.folderName) {
          uploadContext.source_folder = asset.metadata.folderName;
        } else if (asset.metadata?.path) {
          const normalized = asset.metadata.path.replace(/\\/g, '/');
          const parts = normalized.split('/').filter(Boolean);
          if (parts.length > 1) {
            uploadContext.source_folder = parts[0];
          }
        }
      } else {
        if (sourceUrl && (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://'))) {
          uploadContext.source_url = sourceUrl;
          const site = getSourceSiteFromUrl(sourceUrl);
          if (site) {
            uploadContext.source_site = site;
          }
        }
      }

      // Always include source_asset_id for library assets (needed for lineage tracking)
      const assetId = typeof asset.id === 'number' ? asset.id : Number(asset.id);
      if (Number.isFinite(assetId)) {
        uploadContext.source_asset_id = assetId;
      }

      const uploadMethod = isVideo ? 'video_capture' : 'image_crop';
      const uploadResult = await uploadAsset({
        file: blob,
        filename: buildCaptureFilenameFromSource(sourceFilename, frameTime),
        saveTarget,
        providerId: providerId || undefined,
        uploadMethod,
        uploadContext,
      });

      const newAssetId = uploadResult.asset_id;

      // Notify gallery so the new asset appears without a full refresh
      if (newAssetId) {
        try {
          await notifyGalleryOfNewAsset(newAssetId);
        } catch {
          // Non-critical: asset was created but won't auto-appear
        }
      }

      const successMessage =
        saveTarget === 'provider'
          ? (isVideo ? 'Frame captured and uploaded.' : 'Cropped image uploaded.')
          : (isVideo ? 'Frame captured to library.' : 'Cropped image saved to library.');
      toast.success(successMessage);
    } catch (error) {
      toast.error(extractUploadError(error, 'Capture failed.'));
    } finally {
      setIsCapturing(false);
    }
  }, [
    asset,
    captureRegion,
    renderCaptureBlob,
    buildCaptureFilenameFromSource,
    resolveCaptureProviderId,
    toast,
    videoRef,
    imageRef,
  ]);

  return {
    isCapturing,
    captureFrame,
    captureRegion,
    captureRegions: visibleCaptureRegions,
  };
}
