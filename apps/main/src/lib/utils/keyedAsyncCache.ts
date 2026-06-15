/**
 * createKeyedAsyncCache — a small module-level cache for keyed async results
 * that survives component unmount/remount and HMR.
 *
 * Two behaviours matter:
 *   - Resolved values are retained, so a remount that asks for the same key
 *     gets its result instantly instead of re-paying the fetch.
 *   - Concurrent requests for the same key share one in-flight promise
 *     (de-dupe), so N simultaneous mounts trigger one network call, not N.
 *
 * Failures are NOT cached — a rejected loader drops the in-flight entry so the
 * next request retries.
 *
 * Use one instance per logical dataset (give it a unique, stable `cacheId`):
 * ```ts
 * const cache = createKeyedAsyncCache<Foo[]>('myFeature:foos');
 * const foos = await cache.fetch(key, () => fetchFoos(key));
 * ```
 *
 * Pass `{ maxEntries }` to bound retained *resolved* values with LRU eviction
 * (reads and resolves bump recency). In-flight promises are never evicted.
 * Omit it for an unbounded cache (fine for small, naturally-bounded key spaces).
 */

import { hmrSingleton } from './hmrSafe';

interface CacheState<T> {
  values: Map<string, T>;
  promises: Map<string, Promise<T>>;
}

export interface KeyedAsyncCache<T> {
  /** Resolved value for `key`, or undefined if not yet cached. */
  get(key: string): T | undefined;
  /** Whether a resolved value exists for `key`. */
  has(key: string): boolean;
  /** In-flight promise for `key`, if a fetch is running; otherwise undefined. */
  inFlight(key: string): Promise<T> | undefined;
  /**
   * Return the cached value, the in-flight promise, or start `loader()` —
   * whichever applies — de-duping concurrent callers onto one promise.
   */
  fetch(key: string, loader: () => Promise<T>): Promise<T>;
  /** Imperatively seed a resolved value. */
  set(key: string, value: T): void;
  /** Drop a key's value and any in-flight promise (e.g. to force a refetch). */
  delete(key: string): void;
  /** Clear everything. */
  clear(): void;
}

export function createKeyedAsyncCache<T>(
  cacheId: string,
  options?: { maxEntries?: number },
): KeyedAsyncCache<T> {
  const maxEntries = options?.maxEntries;
  const state = hmrSingleton<CacheState<T>>(`keyedAsyncCache:${cacheId}`, () => ({
    values: new Map<string, T>(),
    promises: new Map<string, Promise<T>>(),
  }));

  // Map iteration is insertion-ordered, so the first key is the least-recently
  // used once we re-insert on access. Bump moves a hit to most-recent.
  const bump = (key: string): void => {
    if (maxEntries == null || !state.values.has(key)) return;
    const value = state.values.get(key) as T;
    state.values.delete(key);
    state.values.set(key, value);
  };
  const evict = (): void => {
    if (maxEntries == null) return;
    while (state.values.size > maxEntries) {
      const oldest = state.values.keys().next().value;
      if (oldest === undefined) break;
      state.values.delete(oldest);
    }
  };

  return {
    get: (key) => {
      if (!state.values.has(key)) return undefined;
      const value = state.values.get(key) as T;
      bump(key);
      return value;
    },
    has: (key) => state.values.has(key),
    inFlight: (key) => state.promises.get(key),
    set: (key, value) => {
      state.values.set(key, value);
      evict();
    },
    delete: (key) => {
      state.values.delete(key);
      state.promises.delete(key);
    },
    clear: () => {
      state.values.clear();
      state.promises.clear();
    },
    fetch(key, loader) {
      if (state.values.has(key)) {
        const value = state.values.get(key) as T;
        bump(key);
        return Promise.resolve(value);
      }
      const existing = state.promises.get(key);
      if (existing) return existing;

      const promise = loader()
        .then((value) => {
          state.values.set(key, value);
          state.promises.delete(key);
          evict();
          return value;
        })
        .catch((err) => {
          // Don't cache failures — allow the next request to retry.
          state.promises.delete(key);
          throw err;
        });
      state.promises.set(key, promise);
      return promise;
    },
  };
}
