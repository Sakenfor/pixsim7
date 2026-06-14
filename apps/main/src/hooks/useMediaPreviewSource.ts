import { BACKEND_BASE } from '@/lib/api/client';
import { isBackendUrl } from '@/lib/media/backendUrl';

import { useAuthenticatedMedia } from './useAuthenticatedMedia';
import { useMediaThumbnailFull } from './useMediaThumbnail';

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

  const {
    src: thumbSrc,
    loading: thumbLoading,
    failed: thumbFailed,
    retry: thumbRetry,
  } = useMediaThumbnailFull(
    thumbUrl,
    previewUrl,
    mediaType === 'video' ? undefined : remoteUrl,
  );

  const rawVideoSrc = mediaType === 'video' ? (remoteUrl || undefined) : undefined;
  const isBackendVideoSrc = rawVideoSrc ? isBackendUrl(rawVideoSrc, BACKEND_BASE) : false;
  const resolvedMediaActive =
    mediaActive ?? (mediaType === 'video' && !thumbUrl && !previewUrl);
  const { src: resolvedVideoSrc } = useAuthenticatedMedia(
    isBackendVideoSrc ? rawVideoSrc : undefined,
    {
      active: resolvedMediaActive,
      mediaType: 'video',
    },
  );
  // Gate both backend and external video src on mediaActive so <video>
  // elements unmount when the card scrolls out of viewport range.
  const videoSrc =
    mediaType === 'video'
      ? (isBackendVideoSrc
          ? (resolvedMediaActive ? resolvedVideoSrc : undefined)
          : (resolvedMediaActive ? rawVideoSrc : undefined))
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
