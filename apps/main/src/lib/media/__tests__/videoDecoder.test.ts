import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { releaseVideoDecoder, useManagedVideoSource } from '../videoDecoder';

/**
 * Minimal <video> stand-in: jsdom doesn't implement load()/pause(), and we only
 * need to observe the src attribute + the decoder-release calls.
 */
function makeVideoStub() {
  let srcAttr: string | null = null;
  const el = {
    pause: vi.fn(),
    load: vi.fn(),
    getAttribute: vi.fn((name: string) => (name === 'src' ? srcAttr : null)),
    removeAttribute: vi.fn((name: string) => {
      if (name === 'src') srcAttr = null;
    }),
    set src(v: string) {
      srcAttr = v;
    },
    get src() {
      return srcAttr ?? '';
    },
    peekSrc: () => srcAttr,
  };
  return el;
}

describe('releaseVideoDecoder', () => {
  it('pauses, clears src, and reloads to drop the decoder', () => {
    const el = makeVideoStub();
    el.src = 'clip.mp4';
    releaseVideoDecoder(el as unknown as HTMLVideoElement);
    expect(el.pause).toHaveBeenCalled();
    expect(el.removeAttribute).toHaveBeenCalledWith('src');
    expect(el.load).toHaveBeenCalled();
    expect(el.peekSrc()).toBeNull();
  });

  it('is a no-op on null', () => {
    expect(() => releaseVideoDecoder(null)).not.toThrow();
  });
});

describe('useManagedVideoSource', () => {
  it('restores src when the same element is detached then re-attached (StrictMode/panel move)', () => {
    const forward: { current: HTMLVideoElement | null } = { current: null };
    const { result } = renderHook(() => useManagedVideoSource('clip.mp4', forward));
    const ref = result.current;
    const el = makeVideoStub();

    // React sets the declarative src during commit, then invokes the ref.
    el.src = 'clip.mp4';
    ref(el as unknown as HTMLVideoElement);
    expect(el.load).not.toHaveBeenCalled(); // already has src → nothing to restore
    expect(forward.current).toBe(el as unknown as HTMLVideoElement);

    // Synthetic detach (StrictMode) releases the decoder → src stripped.
    ref(null);
    expect(el.peekSrc()).toBeNull();
    expect(forward.current).toBeNull();

    // Re-attach the SAME, now-sourceless element. React won't re-apply the
    // unchanged declarative src — the hook must restore it.
    ref(el as unknown as HTMLVideoElement);
    expect(el.peekSrc()).toBe('clip.mp4');
    expect(el.load).toHaveBeenCalled();
    expect(forward.current).toBe(el as unknown as HTMLVideoElement);
  });

  it('does not fabricate a src when there is none to restore', () => {
    const { result } = renderHook(() => useManagedVideoSource(undefined));
    const ref = result.current;
    const el = makeVideoStub();
    ref(el as unknown as HTMLVideoElement);
    expect(el.peekSrc()).toBeNull();
    expect(el.load).not.toHaveBeenCalled();
  });
});
