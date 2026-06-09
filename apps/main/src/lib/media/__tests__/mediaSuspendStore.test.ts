import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Suspend clears native media buffers as a side effect — stub those so the test
// exercises only the visibility/suspend state machine.
vi.mock('@/hooks/useAuthenticatedMedia', () => ({
  authMediaCaches: { video: { clear: vi.fn() } },
}));
vi.mock('@lib/media/capturedFrameStore', () => ({
  clearAllCapturedFrames: vi.fn(),
}));

import { __resetMediaSuspendForTests, isMediaSuspendedNow } from '../mediaSuspendStore';

const GRACE_MS = 1500;

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  });
}

describe('mediaSuspendStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
    __resetMediaSuspendForTests();
  });
  afterEach(() => {
    setHidden(false);
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('suspends only after the grace window while hidden', () => {
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(isMediaSuspendedNow()).toBe(false);
    vi.advanceTimersByTime(GRACE_MS);
    expect(isMediaSuspendedNow()).toBe(true);
  });

  it('cancels a pending suspend when visibility returns within the grace window', () => {
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(GRACE_MS - 1);

    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(GRACE_MS);

    expect(isMediaSuspendedNow()).toBe(false);
  });

  // The regression this store was wedging on: it went suspended while hidden,
  // then the `visibilitychange` → visible event never arrived (missed/coalesced),
  // leaving the viewer blank forever. Regaining window focus must recover it.
  it('recovers on window focus even when no visibilitychange fires', () => {
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(GRACE_MS);
    expect(isMediaSuspendedNow()).toBe(true);

    setHidden(false);
    window.dispatchEvent(new Event('focus')); // no visibilitychange
    expect(isMediaSuspendedNow()).toBe(false);
  });

  it('recovers from bfcache restore (pageshow) without a visibilitychange', () => {
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(GRACE_MS);
    expect(isMediaSuspendedNow()).toBe(true);

    setHidden(false);
    window.dispatchEvent(new Event('pageshow'));
    expect(isMediaSuspendedNow()).toBe(false);
  });
});
