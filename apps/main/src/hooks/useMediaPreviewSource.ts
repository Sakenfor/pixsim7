import { BACKEND_BASE } from '@/lib/api/client';
import { isBackendUrl } from '@/lib/media/backendUrl';

import { useResolvedAssetMedia } from './useResolvedAssetMedia';

export interface UseMediaPreviewSourceOptions {
  mediaType: 'video' | 'image' | 'audio' | '3d_model';
  thumbUrl?: string;
  previewUrl?: string;
  remoteUrl?: string;
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
  const { mediaType, thumbUrl, previewUrl, remoteUrl } = options;

  const { thumbSrc, thumbLoading, thumbFailed, thumbRetry } = useResolvedAssetMedia({
    thumbUrl,
    previewUrl,
    remoteUrl: mediaType === 'video' ? undefined : remoteUrl,
  });

  const rawVideoSrc = mediaType === 'video' ? (remoteUrl || thumbSrc) : undefined;
  const isBackendVideoSrc = rawVideoSrc ? isBackendUrl(rawVideoSrc, BACKEND_BASE) : false;
  const { mediaSrc: resolvedVideoSrc } = useResolvedAssetMedia({
    mediaUrl: isBackendVideoSrc ? rawVideoSrc : undefined,
    mediaActive: mediaType === 'video',
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
