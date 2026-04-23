import { useAuthenticatedMedia } from './useAuthenticatedMedia';
import { useMediaThumbnailFull, type UseMediaThumbnailOptions } from './useMediaThumbnail';

export interface UseResolvedAssetMediaOptions {
  mediaUrl?: string;
  thumbUrl?: string;
  previewUrl?: string;
  remoteUrl?: string;
  mediaActive?: boolean;
  /** Hint for auth cache selection — 'video' uses a smaller cache. */
  mediaType?: 'video' | 'image';
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
    mediaType,
    thumbOptions,
  } = options;

  const media = useAuthenticatedMedia(mediaUrl, { active: mediaActive, mediaType });
  const thumb = useMediaThumbnailFull(thumbUrl, previewUrl, remoteUrl, thumbOptions);

  return {
    mediaSrc: media.src,
    mediaLoading: media.loading,
    mediaError: media.error,
    thumbSrc: thumb.src,
    thumbLoading: thumb.loading,
    thumbFailed: thumb.failed,
    thumbRetry: thumb.retry,
  };
}
