import { useMemo } from 'react';

import { useAuthenticatedMedia } from './useAuthenticatedMedia';
import { useMediaThumbnailFull, type UseMediaThumbnailOptions } from './useMediaThumbnail';

export interface UseResolvedAssetMediaOptions {
  mediaUrl?: string;
  thumbUrl?: string;
  previewUrl?: string;
  remoteUrl?: string;
  mediaActive?: boolean;
  thumbOptions?: UseMediaThumbnailOptions;
}

export interface UseResolvedAssetMediaResult {
  mediaSrc: string | undefined;
  mediaLoading: boolean;
  mediaError: boolean;
  thumbSrc: string | undefined;
  thumbLoading: boolean;
  thumbFailed: boolean;
  thumbRetry: () => void;
}

export function useResolvedAssetMedia(
  options: UseResolvedAssetMediaOptions,
): UseResolvedAssetMediaResult {
  const {
    mediaUrl,
    thumbUrl,
    previewUrl,
    remoteUrl,
    mediaActive = true,
    thumbOptions,
  } = options;

  const media = useAuthenticatedMedia(mediaUrl, { active: mediaActive });
  const thumb = useMediaThumbnailFull(thumbUrl, previewUrl, remoteUrl, thumbOptions);

  const resolvedMediaSrc = useMemo(
    () => media.src ?? mediaUrl,
    [media.src, mediaUrl],
  );

  return {
    mediaSrc: resolvedMediaSrc,
    mediaLoading: media.loading,
    mediaError: media.error,
    thumbSrc: thumb.src,
    thumbLoading: thumb.loading,
    thumbFailed: thumb.failed,
    thumbRetry: thumb.retry,
  };
}
