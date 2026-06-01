import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn<(path: string) => Promise<unknown>>(),
}));

vi.mock('@lib/api/client', () => ({
  pixsimClient: { get: (path: string) => mocks.get(path) },
}));

import {
  __resetMediaTokenForTests,
  appendMediaToken,
  getMediaToken,
  peekMediaToken,
} from '../mediaToken';

describe('appendMediaToken', () => {
  it('uses ? for a URL without a query and & when one exists, and encodes', () => {
    expect(appendMediaToken('https://h/api/v1/media/u/1/x.mp4', 'a b')).toBe(
      'https://h/api/v1/media/u/1/x.mp4?token=a%20b',
    );
    expect(appendMediaToken('https://h/media?v=2', 'tok')).toBe('https://h/media?v=2&token=tok');
  });
});

describe('getMediaToken caching', () => {
  beforeEach(() => {
    __resetMediaTokenForTests();
    mocks.get.mockReset();
  });

  it('fetches once, then serves the cached token (and peek sees it)', async () => {
    mocks.get.mockResolvedValue({ token: 'tok-1', expires_in: 900 });

    expect(peekMediaToken()).toBeUndefined();
    const first = await getMediaToken();
    const second = await getMediaToken();

    expect(first).toBe('tok-1');
    expect(second).toBe('tok-1');
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledWith('/media/auth-token');
    expect(peekMediaToken()).toBe('tok-1');
  });

  it('dedupes concurrent requests into a single fetch', async () => {
    mocks.get.mockResolvedValue({ token: 'tok-2', expires_in: 900 });

    const [a, b] = await Promise.all([getMediaToken(), getMediaToken()]);

    expect(a).toBe('tok-2');
    expect(b).toBe('tok-2');
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it('treats an already-expired ttl as not fresh (peek returns undefined)', async () => {
    // expires_in 0 → expiresAt in the past after skew → never fresh.
    mocks.get.mockResolvedValue({ token: 'tok-3', expires_in: 0 });
    await getMediaToken();
    expect(peekMediaToken()).toBeUndefined();
  });
});
