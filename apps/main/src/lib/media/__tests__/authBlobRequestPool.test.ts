import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchAuthBlob: vi.fn(),
}));

vi.mock('../fetchAuthBlob', () => ({
  fetchAuthBlob: (...args: unknown[]) => mocks.fetchAuthBlob(...args),
}));

import {
  __resetAuthBlobRequestPoolForTests,
  acquireAuthBlobRequest,
  getAuthBlobRequestPoolStats,
} from '../authBlobRequestPool';
import type { BlobCache } from '../blobCache';

function pendingRequest() {
  return new Promise<never>(() => {});
}

function cache(): BlobCache {
  return {} as BlobCache;
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.fetchAuthBlob.mockReset();
  mocks.fetchAuthBlob.mockImplementation(pendingRequest);
  __resetAuthBlobRequestPoolForTests();
});

afterEach(() => {
  __resetAuthBlobRequestPoolForTests();
  vi.useRealTimers();
});

describe('authBlobRequestPool', () => {
  it('shares a request and aborts it after the final consumer releases', () => {
    const targetCache = cache();
    const first = acquireAuthBlobRequest('/video.mp4', targetCache);
    const second = acquireAuthBlobRequest('/video.mp4', targetCache);

    expect(first.promise).toBe(second.promise);
    expect(mocks.fetchAuthBlob).toHaveBeenCalledTimes(1);
    expect(getAuthBlobRequestPoolStats()).toEqual({ inFlight: 1, consumers: 2 });

    first.release();
    vi.advanceTimersByTime(100);
    expect(
      (mocks.fetchAuthBlob.mock.calls[0][1] as { signal: AbortSignal }).signal.aborted,
    ).toBe(false);

    second.release();
    vi.advanceTimersByTime(100);
    expect(
      (mocks.fetchAuthBlob.mock.calls[0][1] as { signal: AbortSignal }).signal.aborted,
    ).toBe(true);
  });

  it('keeps the request alive when a consumer returns during the grace window', () => {
    const targetCache = cache();
    const first = acquireAuthBlobRequest('/video.mp4', targetCache);
    first.release();
    vi.advanceTimersByTime(50);

    const second = acquireAuthBlobRequest('/video.mp4', targetCache);
    vi.advanceTimersByTime(100);

    expect(first.promise).toBe(second.promise);
    expect(mocks.fetchAuthBlob).toHaveBeenCalledTimes(1);
    expect(
      (mocks.fetchAuthBlob.mock.calls[0][1] as { signal: AbortSignal }).signal.aborted,
    ).toBe(false);
  });

  it('starts a fresh request after an abandoned one was aborted', () => {
    const targetCache = cache();
    const first = acquireAuthBlobRequest('/video.mp4', targetCache);
    first.release();
    vi.advanceTimersByTime(100);

    const second = acquireAuthBlobRequest('/video.mp4', targetCache);

    expect(second.promise).not.toBe(first.promise);
    expect(mocks.fetchAuthBlob).toHaveBeenCalledTimes(2);
  });
});
