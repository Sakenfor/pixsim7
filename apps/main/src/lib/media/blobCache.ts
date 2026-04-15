/**
 * Shared LRU blob-URL cache with byte-budget tracking.
 *
 * Used by useMediaThumbnail and useAuthenticatedMedia to keep blob URLs alive
 * across virtualized unmount/remount cycles so images render instantly when
 * cards scroll back into view.
 *
 * Each cache is identified by a stable hmrSingleton key so HMR re-evals
 * don't recreate the Map.  The singleton key is suffixed ":v2" internally
 * because the entry shape changed (string → { blobUrl, bytes }) — callers
 * should access caches via the returned object, not the raw singleton.
 */

import { hmrSingleton } from '@lib/utils';

export interface BlobCacheConfig {
  maxEntries: number;
  /** Optional total byte budget — oldest entries evicted when exceeded. */
  maxBytes?: number;
}

export interface BlobCache {
  get(fetchUrl: string): string | undefined;
  /** Pass byteSize (blob.size) so the cache can enforce maxBytes. */
  set(fetchUrl: string, blobUrl: string, byteSize?: number): void;
  /**
   * Deduplicated fetch: if a fetch for `url` is already in-flight, returns
   * the same promise instead of starting a duplicate.  This prevents the
   * race where two concurrent fetches for the same URL create two different
   * blob URLs and the second revokes the first (causing ERR_FILE_NOT_FOUND
   * in the first consumer's <img>).
   */
  deduplicatedFetch(
    url: string,
    doFetch: () => Promise<string | undefined>,
  ): Promise<string | undefined>;
  clear(): void;
  readonly size: number;
  readonly totalBytes: number;
  readonly maxEntries: number;
  readonly maxBytes: number | undefined;
}

interface Entry {
  blobUrl: string;
  bytes: number;
}

export function createBlobCache(
  singletonKey: string,
  config: BlobCacheConfig | number,
): BlobCache {
  const opts: BlobCacheConfig =
    typeof config === 'number' ? { maxEntries: config } : config;
  const { maxEntries, maxBytes } = opts;

  const map = hmrSingleton(`${singletonKey}:v2`, () => new Map<string, Entry>());
  const inFlight = hmrSingleton(
    `${singletonKey}:v2:inFlight`,
    () => new Map<string, Promise<string | undefined>>(),
  );

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      for (const entry of map.values()) URL.revokeObjectURL(entry.blobUrl);
      map.clear();
      inFlight.clear();
    });
  }

  // Recompute totalBytes from existing entries (survives module re-eval).
  let totalBytes = 0;
  for (const entry of map.values()) totalBytes += entry.bytes;

  const evictOldestIfOver = () => {
    while (
      map.size > maxEntries ||
      (maxBytes != null && totalBytes > maxBytes && map.size > 0)
    ) {
      const firstKey = map.keys().next().value;
      if (firstKey === undefined) break;
      const oldEntry = map.get(firstKey);
      map.delete(firstKey);
      if (oldEntry) {
        totalBytes -= oldEntry.bytes;
        URL.revokeObjectURL(oldEntry.blobUrl);
      }
    }
  };

  return {
    get(fetchUrl: string): string | undefined {
      const entry = map.get(fetchUrl);
      if (entry !== undefined) {
        // Move to end (most recently used)
        map.delete(fetchUrl);
        map.set(fetchUrl, entry);
        return entry.blobUrl;
      }
      return undefined;
    },

    set(fetchUrl: string, blobUrl: string, byteSize = 0): void {
      const existing = map.get(fetchUrl);
      if (existing) {
        if (existing.blobUrl !== blobUrl) URL.revokeObjectURL(existing.blobUrl);
        totalBytes -= existing.bytes;
        map.delete(fetchUrl);
      }
      map.set(fetchUrl, { blobUrl, bytes: byteSize });
      totalBytes += byteSize;
      evictOldestIfOver();
    },

    deduplicatedFetch(
      url: string,
      doFetch: () => Promise<string | undefined>,
    ): Promise<string | undefined> {
      const existing = inFlight.get(url);
      if (existing) return existing;

      const promise = doFetch().finally(() => {
        inFlight.delete(url);
      });
      inFlight.set(url, promise);
      return promise;
    },

    clear(): void {
      for (const entry of map.values()) URL.revokeObjectURL(entry.blobUrl);
      map.clear();
      inFlight.clear();
      totalBytes = 0;
    },

    get size() {
      return map.size;
    },

    get totalBytes() {
      return totalBytes;
    },

    get maxEntries() {
      return maxEntries;
    },

    get maxBytes() {
      return maxBytes;
    },
  };
}
