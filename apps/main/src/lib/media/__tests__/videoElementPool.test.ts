import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * videoElementPool invariants — the core of the hover-preview leak fix.
 *
 * The leak was CUMULATIVE <video> count (each minted element's GPU decoder
 * context ~30MB, reclaimed too lazily by Chrome). The pool's job is to keep the
 * lifetime element count bounded by recycling: reuse on acquire, tear the
 * decoder down on release, never retain more than POOL_MAX idle.
 * See plan `viewer-media-memory` → checkpoint `video-element-pooling`.
 */
import {
  acquirePooledVideo,
  getVideoElementPoolStats,
  releasePooledVideo,
} from '../videoElementPool';

beforeEach(() => {
  // jsdom doesn't implement these; releaseVideoDecoder calls them (and swallows
  // throws). Stub so we can assert teardown fired without console noise.
  HTMLMediaElement.prototype.pause = vi.fn();
  HTMLMediaElement.prototype.load = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('videoElementPool', () => {
  it('reuses the just-released element instead of minting a new one', () => {
    const before = getVideoElementPoolStats().created;
    const a = acquirePooledVideo();
    releasePooledVideo(a);
    const b = acquirePooledVideo();
    expect(b).toBe(a); // LIFO reuse of the element we just released
    // Only `a` was ever created; `b` was served from the idle pool.
    expect(getVideoElementPoolStats().created - before).toBe(1);
    releasePooledVideo(b);
  });

  it('tears down the decoder on release (src removed, load() called)', () => {
    const el = acquirePooledVideo();
    el.setAttribute('src', 'blob:fake');
    expect(el.getAttribute('src')).toBe('blob:fake');
    releasePooledVideo(el);
    expect(el.getAttribute('src')).toBeNull();
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
  });

  it('caps the idle pool at POOL_MAX even when more are released', () => {
    const { max } = getVideoElementPoolStats();
    const borrowed = Array.from({ length: max + 2 }, () => acquirePooledVideo());
    borrowed.forEach(releasePooledVideo);
    // Extras beyond the cap are dropped (decoder already freed), so the retained
    // idle set can never grow unbounded.
    expect(getVideoElementPoolStats().idle).toBe(max);
  });

  it('balances the live (borrowed) count across acquire/release', () => {
    const before = getVideoElementPoolStats().live;
    const a = acquirePooledVideo();
    const b = acquirePooledVideo();
    expect(getVideoElementPoolStats().live).toBe(before + 2);
    releasePooledVideo(a);
    releasePooledVideo(b);
    expect(getVideoElementPoolStats().live).toBe(before);
  });

  it('release(null) is a safe no-op', () => {
    const before = getVideoElementPoolStats().live;
    releasePooledVideo(null);
    expect(getVideoElementPoolStats().live).toBe(before);
  });
});
