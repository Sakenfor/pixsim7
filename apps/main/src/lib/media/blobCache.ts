/**
 * Shared LRU blob-URL cache.
 *
 * Used by useMediaThumbnail and useAuthenticatedMedia to keep blob URLs alive
 * across virtualized unmount/remount cycles so images render instantly when
 * cards scroll back into view.
 *
 * Each cache is identified by a stable hmrSingleton key so:
 *  - HMR re-evals don't recreate the Map (surviving module replacement)
 *  - PerformancePanel can read the same Map via the same key
 */

import { hmrSingleton } from '@lib/utils';

export interface BlobCache {
  get(fetchUrl: string): string | undefined;
  set(fetchUrl: string, blobUrl: string): void;
  clear(): void;
  readonly size: number;
}

export function createBlobCache(singletonKey: string, maxSize: number): BlobCache {
  const map = hmrSingleton(singletonKey, () => new Map<string, string>());

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      for (const blobUrl of map.values()) URL.revokeObjectURL(blobUrl);
      map.clear();
    });
  }

  return {
    get(fetchUrl: string): string | undefined {
      const blobUrl = map.get(fetchUrl);
      if (blobUrl !== undefined) {
        // Move to end (most recently used)
        map.delete(fetchUrl);
        map.set(fetchUrl, blobUrl);
      }
      return blobUrl;
    },

    set(fetchUrl: string, blobUrl: string): void {
      const existing = map.get(fetchUrl);
      if (existing && existing !== blobUrl) URL.revokeObjectURL(existing);
      map.delete(fetchUrl);
      map.set(fetchUrl, blobUrl);
      while (map.size > maxSize) {
        const first = map.keys().next().value;
        if (first === undefined) break;
        const old = map.get(first);
        map.delete(first);
        if (old) URL.revokeObjectURL(old);
      }
    },

    clear(): void {
      for (const blobUrl of map.values()) URL.revokeObjectURL(blobUrl);
      map.clear();
    },

    get size() {
      return map.size;
    },
  };
}
