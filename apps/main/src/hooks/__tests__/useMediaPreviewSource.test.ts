import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useMediaStreamSrc: vi.fn(),
  useMediaThumbnailFull: vi.fn(),
  isBackendUrl: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  BACKEND_BASE: 'http://localhost:8000',
}));

vi.mock('@/lib/media/backendUrl', () => ({
  isBackendUrl: mocks.isBackendUrl,
}));

vi.mock('../useMediaStreamSrc', () => ({
  useMediaStreamSrc: mocks.useMediaStreamSrc,
}));

vi.mock('../useMediaThumbnail', () => ({
  useMediaThumbnailFull: mocks.useMediaThumbnailFull,
}));

import { useMediaPreviewSource } from '../useMediaPreviewSource';

describe('useMediaPreviewSource', () => {
  beforeEach(() => {
    mocks.isBackendUrl.mockReturnValue(true);
    mocks.useMediaStreamSrc.mockReturnValue('http://localhost:8000/api/video/1?token=t');
    mocks.useMediaThumbnailFull.mockReturnValue({
      src: 'blob:thumb',
      loading: false,
      failed: false,
      retry: vi.fn(),
    });
  });

  it('resolves the thumbnail chain once and streams backend video (no full-file blob)', () => {
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
    // Backend video resolves through the token-stream hook, not a blob fetch.
    expect(mocks.useMediaStreamSrc).toHaveBeenCalledWith('/api/video/1');
    expect(result.current.videoSrc).toBe('http://localhost:8000/api/video/1?token=t');
    expect(result.current.thumbSrc).toBe('blob:thumb');
  });

  it('does not stream while inactive (passes undefined to the stream hook)', () => {
    const { result } = renderHook(() =>
      useMediaPreviewSource({
        mediaType: 'video',
        remoteUrl: '/api/video/1',
        mediaActive: false,
      }),
    );

    expect(mocks.useMediaStreamSrc).toHaveBeenCalledWith(undefined);
    expect(result.current.videoSrc).toBeUndefined();
  });
});
