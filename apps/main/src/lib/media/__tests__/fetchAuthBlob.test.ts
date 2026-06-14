import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lib/auth', () => ({
  authService: { getStoredToken: () => 'test-token' },
}));
vi.mock('../../api/client', () => ({
  BACKEND_BASE: 'http://localhost:8000',
}));

import type { BlobCache } from '../blobCache';
import { fetchAuthBlob } from '../fetchAuthBlob';

function makeCache() {
  const get = vi.fn()
    .mockReturnValueOnce(undefined)
    .mockReturnValueOnce(undefined)
    .mockReturnValueOnce('blob:race-winner');
  const deduplicatedFetch = vi.fn(
    async (_url: string, doFetch: () => Promise<string | undefined>) => doFetch(),
  );
  const cache = {
    get,
    set: vi.fn(),
    deduplicatedFetch,
  } as unknown as BlobCache;
  return { cache, deduplicatedFetch };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    blob: async () => new Blob(['video bytes'], { type: 'video/mp4' }),
  })));
});

describe('fetchAuthBlob deduplication ownership', () => {
  it('uses the cache-level in-flight deduplication by default', async () => {
    const { cache, deduplicatedFetch } = makeCache();

    await fetchAuthBlob('https://cdn.example.com/video.mp4', { cache });

    expect(deduplicatedFetch).toHaveBeenCalledTimes(1);
  });

  it('bypasses cache-level deduplication for a reference-counted caller', async () => {
    const { cache, deduplicatedFetch } = makeCache();

    await fetchAuthBlob('https://cdn.example.com/video.mp4', {
      cache,
      deduplicate: false,
    });

    expect(deduplicatedFetch).not.toHaveBeenCalled();
  });
});
