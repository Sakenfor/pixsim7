/**
 * useFrameCapture
 *
 * Hook for capturing video frames and uploading them to the asset library.
 * Handles region selection, upload context assembly, and the capture workflow.
 */

import { useToast } from '@pixsim7/shared.ui';
import { useState, useCallback, useMemo, type RefObject } from 'react';

import { API_BASE_URL } from '@lib/api';
import { authService } from '@lib/auth';

import type { ViewerAsset } from '@features/assets';
import { useCaptureRegionStore, type AssetRegion } from '@features/mediaViewer';

import type { MediaOverlayId } from '../../overlays';

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
  const getCaptureRegion = useCaptureRegionStore((s) => s.getRegion);

  // Determine which region to use for capture
  const captureRegion = useMemo(() => {
    if (!asset || activeOverlayId !== 'capture') {
      return null;
    }
    if (captureSelectedRegionId) {
      const selected = getCaptureRegion(asset.id, captureSelectedRegionId);
      if (selected) {
        return selected;
      }
    }
    if (captureRegions.length === 1) {
      return captureRegions[0];
    }
    if (captureRegions.length > 1) {
      return captureRegions[captureRegions.length - 1];
    }
    return null;
  }, [asset, activeOverlayId, captureSelectedRegionId, captureRegions, getCaptureRegion]);

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

  // Extract hostname from URL for source_site
  const getSourceSiteFromUrl = useCallback((url?: string): string | null => {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      return parsed.hostname || null;
    } catch {
      return null;
    }
  }, []);

  // Extract filename from URL
  const getFilenameFromUrl = useCallback((url?: string): string | null => {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length === 0) return null;
      return decodeURIComponent(parts[parts.length - 1]);
    } catch {
      return null;
    }
  }, []);

  // Build capture filename from source and time
  const buildCaptureFilename = useCallback((sourceName: string | null, timeSec: number): string => {
    const base = sourceName?.replace(/\.[^/.]+$/, '') || 'capture';
    const safeBase = base.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '') || 'capture';
    const timeTag = Math.max(0, Math.floor(timeSec * 1000));
    return `${safeBase}_frame_${timeTag}.jpg`;
  }, []);

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

      const clamp = (value: number, min: number, max: number) =>
        Math.min(max, Math.max(min, value));

      let regionBounds = null;
      if (captureRegion?.type === 'rect' && captureRegion.bounds) {
        const boundedX = clamp(captureRegion.bounds.x, 0, 1);
        const boundedY = clamp(captureRegion.bounds.y, 0, 1);
        const boundedWidth = clamp(captureRegion.bounds.width, 0, 1);
        const boundedHeight = clamp(captureRegion.bounds.height, 0, 1);

        const sx = Math.round(boundedX * video.videoWidth);
        const sy = Math.round(boundedY * video.videoHeight);
        const sw = Math.round(boundedWidth * video.videoWidth);
        const sh = Math.round(boundedHeight * video.videoHeight);
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

      const form = new FormData();
      form.append('file', blob, buildCaptureFilename(sourceFilename, video.currentTime));
      form.append('provider_id', providerId);
      form.append('upload_method', 'video_capture');
      form.append('upload_context', JSON.stringify(uploadContext));

      const token = authService.getStoredToken();
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/assets/upload`, {
        method: 'POST',
        body: form,
        headers,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `${res.status} ${res.statusText}`);
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
    buildCaptureFilename,
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
