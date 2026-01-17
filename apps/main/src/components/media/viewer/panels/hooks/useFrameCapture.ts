/**
 * useFrameCapture
 *
 * Hook for capturing video frames and uploading them to the asset library.
 * Handles region selection, upload context assembly, and the capture workflow.
 */

import { clampRectNormalized, denormalizeRect } from '@pixsim7/graphics.geometry';
import {
  buildCaptureFilename,
  getFilenameFromUrl,
  getSourceSiteFromUrl,
} from '@pixsim7/shared.media.core';
import { useToast } from '@pixsim7/shared.ui';
import { useState, useCallback, useMemo, type RefObject } from 'react';

import { getAsset } from '@lib/api/assets';
import { uploadAsset } from '@lib/api/upload';

import type { ViewerAsset } from '@features/assets';
import { assetEvents } from '@features/assets/lib/assetEvents';
import { useCaptureRegionStore, type AssetRegion } from '@features/mediaViewer';

import { findActiveRegion, type MediaOverlayId } from '../../overlays';

const EMPTY_CAPTURE_REGIONS: AssetRegion[] = [];

export interface UseFrameCaptureOptions {
  /** Current asset being viewed */
  asset: ViewerAsset | null;
  /** Reference to the video element */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Active overlay mode ID */
  activeOverlayId: MediaOverlayId | null;
}

export interface UseFrameCaptureResult {
  /** Whether a capture is currently in progress */
  isCapturing: boolean;
  /** Capture the current video frame */
  captureFrame: () => Promise<void>;
  /** Currently selected capture region (if any) */
  captureRegion: AssetRegion | null;
  /** All capture regions for the current asset */
  captureRegions: AssetRegion[];
}

/**
 * Hook for capturing video frames with optional region cropping.
 *
 * @param options - Configuration options
 * @returns Frame capture state and actions
 */
export function useFrameCapture({
  asset,
  videoRef,
  activeOverlayId,
}: UseFrameCaptureOptions): UseFrameCaptureResult {
  const toast = useToast();
  const [isCapturing, setIsCapturing] = useState(false);

  // Capture region store selectors
  const captureRegions = useCaptureRegionStore((s) =>
    asset ? s.getRegions(asset.id) : EMPTY_CAPTURE_REGIONS
  );
  const captureSelectedRegionId = useCaptureRegionStore((s) => s.selectedRegionId);

  // Determine which region to use for capture
  const captureRegion = useMemo(() => {
    if (!asset || activeOverlayId !== 'capture') {
      return null;
    }
    return findActiveRegion(captureRegions, captureSelectedRegionId);
  }, [asset, activeOverlayId, captureSelectedRegionId, captureRegions]);

  // Resolve the provider ID for upload
  const resolveCaptureProviderId = useCallback((): string | null => {
    if (!asset) return null;
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
  }, [asset]);

  const buildCaptureFilenameFromSource = useCallback(
    (sourceName: string | null, timeSec: number): string =>
      buildCaptureFilename(sourceName, timeSec),
    []
  );

  // Main capture function
  const captureFrame = useCallback(async () => {
    if (!asset || asset.type !== 'video') return;
    const providerId = resolveCaptureProviderId();
    if (!providerId) {
      toast.error('Select a provider to capture frames.');
      return;
    }
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      toast.error('Video not ready for capture.');
      return;
    }

    setIsCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to capture frame.');
      }

      let regionBounds = null;
      if (captureRegion?.type === 'rect' && captureRegion.bounds) {
        const clamped = clampRectNormalized(captureRegion.bounds);
        const denormalized = denormalizeRect(clamped, video.videoWidth, video.videoHeight);
        const sx = Math.round(denormalized.x);
        const sy = Math.round(denormalized.y);
        const sw = Math.round(denormalized.width);
        const sh = Math.round(denormalized.height);
        if (sw > 1 && sh > 1) {
          regionBounds = { sx, sy, sw, sh };
        }
      }

      if (regionBounds) {
        const sw = Math.min(regionBounds.sw, video.videoWidth - regionBounds.sx);
        const sh = Math.min(regionBounds.sh, video.videoHeight - regionBounds.sy);
        if (sw > 1 && sh > 1) {
          canvas.width = sw;
          canvas.height = sh;
          try {
            ctx.drawImage(
              video,
              regionBounds.sx,
              regionBounds.sy,
              sw,
              sh,
              0,
              0,
              canvas.width,
              canvas.height
            );
          } catch {
            throw new Error('Capture blocked by browser security.');
          }
        } else {
          regionBounds = null;
        }
      }

      if (!regionBounds) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } catch {
          throw new Error('Capture blocked by browser security.');
        }
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.92);
      });
      if (!blob) {
        throw new Error('Failed to capture frame.');
      }

      const sourceUrl = asset.fullUrl || asset.url || undefined;
      const sourceFilename = getFilenameFromUrl(sourceUrl) || asset.name || null;
      const uploadContext: Record<string, unknown> = {
        client: 'web_app',
        feature: 'asset_viewer_capture',
        source: 'asset_viewer',
        frame_time: video.currentTime,
        has_region: Boolean(regionBounds),
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
        const assetId = typeof asset.id === 'number' ? asset.id : Number(asset.id);
        if (Number.isFinite(assetId)) {
          uploadContext.source_asset_id = assetId;
        }
      }

      const uploadResult = await uploadAsset({
        file: blob,
        filename: buildCaptureFilenameFromSource(sourceFilename, video.currentTime),
        providerId,
        uploadMethod: 'video_capture',
        uploadContext,
      });

      const newAssetId = uploadResult.asset_id;

      // Fetch and emit the new asset so it appears in the gallery
      if (newAssetId) {
        try {
          const newAsset = await getAsset(newAssetId);
          assetEvents.emitAssetCreated(newAsset);
        } catch {
          // Non-critical: asset was created but won't auto-appear
        }
      }

      toast.success('Frame captured to library.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Capture failed.';
      toast.error(message);
    } finally {
      setIsCapturing(false);
    }
  }, [
    asset,
    captureRegion,
    buildCaptureFilenameFromSource,
    getFilenameFromUrl,
    getSourceSiteFromUrl,
    resolveCaptureProviderId,
    toast,
    videoRef,
  ]);

  return {
    isCapturing,
    captureFrame,
    captureRegion,
    captureRegions,
  };
}
