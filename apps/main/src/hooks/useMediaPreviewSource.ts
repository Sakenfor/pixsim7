import { BACKEND_BASE } from '@/lib/api/client';
import { isBackendUrl } from '@/lib/media/backendUrl';

import { useResolvedAssetMedia } from './useResolvedAssetMedia';

export interface UseMediaPreviewSourceOptions {
  mediaType: 'video' | 'image' | 'audio' | '3d_model';
  thumbUrl?: string;
  previewUrl?: string;
  remoteUrl?: string;
  /** Override for video blob URL fetching.
   *  Default behavior defers authenticated video fetch when a thumb/preview URL is available. */
  mediaActive?: boolean;
}

export interface UseMediaPreviewSourceResult {
  thumbSrc: string | undefined;
  thumbLoading: boolean;
  thumbFailed: boolean;
  thumbRetry: () => void;
  videoSrc: string | undefined;
  usePosterImage: boolean;
}

export function useMediaPreviewSource(
  options: UseMediaPreviewSourceOptions,
): UseMediaPreviewSourceResult {
  const { mediaType, thumbUrl, previewUrl, remoteUrl, mediaActive } = options;

  const { thumbSrc, thumbLoading, thumbFailed, thumbRetry } = useResolvedAssetMedia({
    thumbUrl,
    previewUrl,
    remoteUrl: mediaType === 'video' ? undefined : remoteUrl,
  });

  const rawVideoSrc = mediaType === 'video' ? (remoteUrl || undefined) : undefined;
  const isBackendVideoSrc = rawVideoSrc ? isBackendUrl(rawVideoSrc, BACKEND_BASE) : false;
  const resolvedMediaActive =
    mediaActive ?? (mediaType === 'video' && !thumbUrl && !previewUrl);
  const { mediaSrc: resolvedVideoSrc } = useResolvedAssetMedia({
    mediaUrl: isBackendVideoSrc ? rawVideoSrc : undefined,
    mediaActive: resolvedMediaActive,
  });
  const videoSrc =
    mediaType === 'video'
      ? (isBackendVideoSrc
          ? (resolvedMediaActive ? resolvedVideoSrc : undefined)
          : rawVideoSrc)
      : undefined;
  const usePosterImage = mediaType === 'video' && !!thumbSrc && isBackendVideoSrc;

  return {
    thumbSrc,
    thumbLoading,
    thumbFailed,
    thumbRetry,
    videoSrc,
    usePosterImage,
  };
}
