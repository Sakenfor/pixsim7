import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuthenticatedMedia: vi.fn(),
  useMediaThumbnailFull: vi.fn(),
  isBackendUrl: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  BACKEND_BASE: 'http://localhost:8000',
}));

vi.mock('@/lib/media/backendUrl', () => ({
  isBackendUrl: mocks.isBackendUrl,
}));

vi.mock('../useAuthenticatedMedia', () => ({
  useAuthenticatedMedia: mocks.useAuthenticatedMedia,
}));

vi.mock('../useMediaThumbnail', () => ({
  useMediaThumbnailFull: mocks.useMediaThumbnailFull,
}));

import { useMediaPreviewSource } from '../useMediaPreviewSource';

describe('useMediaPreviewSource', () => {
  beforeEach(() => {
    mocks.isBackendUrl.mockReturnValue(true);
    mocks.useAuthenticatedMedia.mockReturnValue({
      src: 'blob:video',
      loading: false,
      error: false,
    });
    mocks.useMediaThumbnailFull.mockReturnValue({
      src: 'blob:thumb',
      loading: false,
      failed: false,
      retry: vi.fn(),
    });
  });

  it('resolves the thumbnail chain once and loads backend video through the media-only hook', () => {
    const { result } = renderHook(() =>
      useMediaPreviewSource({
        mediaType: 'video',
        thumbUrl: '/api/thumb/1',
        previewUrl: '/api/preview/1',
        remoteUrl: '/api/video/1',
        mediaActive: true,
      }),
    );

    expect(mocks.useMediaThumbnailFull).toHaveBeenCalledTimes(1);
    expect(mocks.useMediaThumbnailFull).toHaveBeenCalledWith(
      '/api/thumb/1',
      '/api/preview/1',
      undefined,
    );
    expect(mocks.useAuthenticatedMedia).toHaveBeenCalledWith('/api/video/1', {
      active: true,
      mediaType: 'video',
    });
    expect(result.current.videoSrc).toBe('blob:video');
    expect(result.current.thumbSrc).toBe('blob:thumb');
  });
});
