import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * VideoScrubWidget hover-preview pooling.
 *
 * Locks in the leak fix: many hover activations must NOT mint many <video>
 * elements. The widget borrows from videoElementPool, so the cumulative element
 * count (= GPU decoder contexts, ~30MB each, leaked under Chrome's lazy reclaim)
 * stays bounded by POOL_MAX no matter how many cards are dwell-hovered.
 * See plan `viewer-media-memory` → checkpoint `video-element-pooling`.
 */

const mocks = vi.hoisted(() => ({
  suspended: false,
  slotGranted: true,
  registerActiveVideo: vi.fn(),
  unregister: vi.fn(),
}));

vi.mock('@pixsim7/shared.media.core', () => ({
  formatTime: (n: number) => String(n),
}));
vi.mock('@pixsim7/shared.player.core', () => ({
  clampUnit: (n: number) => Math.max(0, Math.min(1, n)),
  getProgressPercent: () => 0,
  getTimeFromPercent: () => 0,
}));
vi.mock('@lib/editing-core', () => ({
  resolveDataBinding: (b: unknown, d: unknown) =>
    typeof b === 'function' ? (b as (x: unknown) => unknown)(d) : b,
}));
vi.mock('@lib/media/mediaSuspendStore', () => ({
  useMediaSuspended: () => mocks.suspended,
}));
vi.mock('@lib/media/videoActivationPool', () => ({
  useVideoActivationSlot: () => mocks.slotGranted,
}));
vi.mock('@lib/ui/coarsePointer', () => ({ useIsCoarsePointer: () => false }));
vi.mock('@lib/media/capturedFrameStore', () => ({
  captureVideoFrame: () => Promise.resolve(null),
  setCapturedFrame: vi.fn(),
  clearCapturedFrame: vi.fn(),
}));
vi.mock('@features/assets/lib/activeVideoRegistry', () => ({
  claimAudio: () => () => {},
  isAnyVideoPlaybackActiveExcept: () => false,
  registerActiveVideo: (...args: unknown[]) => {
    mocks.registerActiveVideo(...args);
    return mocks.unregister;
  },
  subscribeActiveVideoRegistry: () => () => {},
}));
vi.mock('@/hooks/useAuthenticatedMedia', () => ({
  useAuthenticatedMedia: (url: string | undefined) => ({ src: url }),
}));

import { getVideoElementPoolStats } from '@lib/media/videoElementPool';

import { VideoScrubWidgetRenderer } from '../VideoScrubWidget';

// Dwell time before a hover actually borrows the element (VIDEO_HOVER_INTENT_MS).
const INTENT_MS = 180;

beforeEach(() => {
  mocks.suspended = false;
  mocks.slotGranted = true;
  mocks.registerActiveVideo.mockReset();
  mocks.unregister.mockReset();
  HTMLMediaElement.prototype.pause = vi.fn();
  HTMLMediaElement.prototype.load = vi.fn();
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderScrub() {
  return render(
    <VideoScrubWidgetRenderer url="/clip.mp4" configDuration={5} isHovering />,
  );
}

describe('VideoScrubWidget pooling', () => {
  it('borrows a pooled <video> on dwell-hover and releases it on hover-out', () => {
    vi.useFakeTimers();
    const before = getVideoElementPoolStats();
    const { container, unmount } = renderScrub();

    // Quick sweep (< intent): no element borrowed yet.
    expect(container.querySelectorAll('video')).toHaveLength(0);

    // Dwell past the intent threshold → borrow.
    act(() => { vi.advanceTimersByTime(INTENT_MS + 20); });
    expect(container.querySelectorAll('video')).toHaveLength(1);
    expect(getVideoElementPoolStats().live).toBe(before.live + 1);

    // Unmount releases the borrow back to the pool.
    unmount();
    expect(getVideoElementPoolStats().live).toBe(before.live);
  });

  it('keeps cumulative element creation bounded across many activations', () => {
    vi.useFakeTimers();
    const before = getVideoElementPoolStats();
    const { max } = before;

    // 20 serial dwell-hovers (concurrency 1). Without pooling this would mint 20
    // elements; with the pool it recycles, so `created` plateaus.
    for (let i = 0; i < 20; i++) {
      const { unmount } = renderScrub();
      act(() => { vi.advanceTimersByTime(INTENT_MS + 20); });
      unmount();
    }

    const after = getVideoElementPoolStats();
    expect(after.created - before.created).toBeLessThanOrEqual(max);
    // And it actually exercised reuse rather than just not activating.
    expect(after.reused).toBeGreaterThan(before.reused);
  });
});
