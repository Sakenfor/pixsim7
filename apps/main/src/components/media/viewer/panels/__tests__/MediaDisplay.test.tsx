import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MediaDisplay render harness.
 *
 * Beyond covering the unresolvable-src watchdog, these tests lock in the
 * memory-relevant invariants for the viewer <video>: exactly one element at a
 * time, the decoder released on asset switch, the active-video registry paired
 * (register/unregister), and a full unmount while suspended. A regression that
 * starts stacking decoders (the multi-GB tab) should trip one of these.
 * See plan `viewer-media-memory`.
 */

const mocks = vi.hoisted(() => ({
  suspended: false,
  streamSrc: vi.fn<(url: string | undefined) => string | undefined>(),
  imageSrc: undefined as string | undefined,
  registerActiveVideo: vi.fn(),
  unregister: vi.fn(),
}));

vi.mock('@lib/api/client', () => ({ BACKEND_BASE: 'http://localhost:8000' }));
vi.mock('@lib/dockview', () => ({ useAutoContextMenu: () => ({}) }));
vi.mock('@lib/media/backendUrl', () => ({
  ensureBackendAbsolute: (url: string | undefined) => url,
}));
vi.mock('@lib/media/mediaSuspendStore', () => ({
  useMediaSuspended: () => mocks.suspended,
}));
vi.mock('@lib/media/mediaToken', () => ({ warmMediaToken: vi.fn() }));
vi.mock('@features/assets/lib/activeVideoRegistry', () => ({
  registerActiveVideo: (...args: unknown[]) => {
    mocks.registerActiveVideo(...args);
    return mocks.unregister;
  },
}));
vi.mock('@features/contextHub', () => ({
  CAP_ASSET: 'asset',
  useProvideCapability: () => {},
}));
vi.mock('@/hooks/useMediaStreamSrc', () => ({
  useMediaStreamSrc: (url: string | undefined) => mocks.streamSrc(url),
}));
vi.mock('@/hooks/useAuthenticatedMedia', () => ({
  useAuthenticatedMedia: () => ({ src: mocks.imageSrc }),
}));

import { MediaDisplay } from '../MediaDisplay';

const SETTINGS = { autoPlayVideos: false, loopVideos: false } as never;

function videoAsset(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'clip',
    type: 'video',
    url: '/api/v1/media/thumb.jpg',
    fullUrl: '/api/v1/media/clip-1.mp4',
    source: 'gallery',
    _assetModel: { remoteUrl: 'https://cdn.example.com/clip-1.mp4' },
    ...over,
  } as never;
}

function renderDisplay(asset: unknown) {
  return render(
    <MediaDisplay
      asset={asset as never}
      settings={SETTINGS}
      fitMode="contain"
      zoom={100}
      pan={{ x: 0, y: 0 }}
    />,
  );
}

beforeEach(() => {
  mocks.suspended = false;
  mocks.imageSrc = undefined;
  mocks.streamSrc.mockReset();
  mocks.registerActiveVideo.mockReset();
  mocks.unregister.mockReset();
  // jsdom doesn't implement these — stub so the real decoder teardown can run
  // and we can assert it fired.
  HTMLMediaElement.prototype.pause = vi.fn();
  HTMLMediaElement.prototype.load = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('MediaDisplay video', () => {
  it('renders exactly one <video> with the resolved stream src', () => {
    mocks.streamSrc.mockReturnValue('http://localhost:8000/api/v1/media/clip-1.mp4?token=t');
    const { container } = renderDisplay(videoAsset());
    const videos = container.querySelectorAll('video');
    expect(videos).toHaveLength(1);
    expect(videos[0].getAttribute('src')).toBe(
      'http://localhost:8000/api/v1/media/clip-1.mp4?token=t',
    );
  });

  it('registers the active video on mount and unregisters on unmount (no leaked registration)', () => {
    mocks.streamSrc.mockReturnValue('http://x/clip.mp4?token=t');
    const { unmount } = renderDisplay(videoAsset());
    expect(mocks.registerActiveVideo).toHaveBeenCalledTimes(1);
    expect(mocks.unregister).not.toHaveBeenCalled();
    unmount();
    expect(mocks.unregister).toHaveBeenCalledTimes(1);
  });

  it('fully unmounts the <video> while suspended (frees the decoder)', () => {
    mocks.suspended = true;
    mocks.streamSrc.mockReturnValue('http://x/clip.mp4?token=t');
    const { container } = renderDisplay(videoAsset());
    expect(container.querySelectorAll('video')).toHaveLength(0);
  });

  it('switching assets never stacks <video> elements and releases the old decoder', () => {
    mocks.streamSrc.mockReturnValue('http://x/clip.mp4?token=t');
    const { container, rerender } = renderDisplay(videoAsset({ id: 1 }));
    expect(container.querySelectorAll('video')).toHaveLength(1);

    rerender(
      <MediaDisplay
        asset={videoAsset({ id: 2, fullUrl: '/api/v1/media/clip-2.mp4' }) as never}
        settings={SETTINGS}
        fitMode="contain"
        zoom={100}
        pan={{ x: 0, y: 0 }}
      />,
    );

    // key={asset.id} → the old element unmounts, only the new one remains.
    expect(container.querySelectorAll('video')).toHaveLength(1);
    // The outgoing element's decoder was explicitly released (pause + load),
    // not left for lazy GC.
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
    // Old registration cleaned up, new one registered.
    expect(mocks.unregister).toHaveBeenCalled();
    expect(mocks.registerActiveVideo).toHaveBeenCalledTimes(2);
  });

  it('watchdog: advances to the next candidate, then fails, when the src never resolves', () => {
    vi.useFakeTimers();
    mocks.streamSrc.mockReturnValue(undefined); // token never resolves → empty src
    const { container } = renderDisplay(videoAsset()); // 2 candidates: full + remote

    // Initially tried the primary (local/backend) candidate.
    expect(mocks.streamSrc).toHaveBeenCalledWith('/api/v1/media/clip-1.mp4');
    expect(container.querySelector('video')?.getAttribute('src')).toBeFalsy();

    // After the grace window it advances to the remote candidate.
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(mocks.streamSrc).toHaveBeenCalledWith('https://cdn.example.com/clip-1.mp4');

    // Remote also unresolved → next grace window surfaces the failure UI.
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(container.textContent).toContain('Video failed to load');
  });
});
