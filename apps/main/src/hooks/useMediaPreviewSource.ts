import { BACKEND_BASE } from '@/lib/api/client';
import { isBackendUrl } from '@/lib/media/backendUrl';

import { useResolvedAssetMedia } from './useResolvedAssetMedia';

export interface UseMediaPreviewSourceOptions {
  mediaType: 'video' | 'image' | 'audio' | '3d_model';
  thumbUrl?: string;
  previewUrl?: string;
  remoteUrl?: string;
  /** Override for video blob URL fetching. Defaults to true for video, meaning fetch immediately.
   *  Pass `false` to defer the authenticated blob fetch until the video is actually needed. */
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
  const { mediaSrc: resolvedVideoSrc } = useResolvedAssetMedia({
    mediaUrl: isBackendVideoSrc ? rawVideoSrc : undefined,
    mediaActive: mediaActive ?? (mediaType === 'video'),
  });
  const videoSrc = mediaType === 'video' ? (isBackendVideoSrc ? resolvedVideoSrc : rawVideoSrc) : undefined;
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
