/**
 * Reference-counted authenticated blob request pool.
 *
 * Completed-blob LRUs cap cached bytes, but cannot constrain requests still
 * downloading inside response.blob(). Rapid viewer navigation or hover-scrub
 * churn can otherwise leave many full videos downloading after every consumer
 * has moved on.
 */
import { hmrSingleton } from '@lib/utils';

import type { BlobCache } from './blobCache';
import {
  fetchAuthBlob,
  type FetchAuthBlobResult,
} from './fetchAuthBlob';

const RELEASE_GRACE_MS = 100;

interface RequestEntry {
  controller: AbortController;
  consumers: number;
  promise: Promise<FetchAuthBlobResult>;
  abortTimer: ReturnType<typeof setTimeout> | null;
}

type RequestPools = Map<BlobCache, Map<string, RequestEntry>>;

const pools = hmrSingleton<RequestPools>(
  'media:authBlobRequestPool',
  () => new Map(),
);

export interface AuthBlobRequestLease {
  promise: Promise<FetchAuthBlobResult>;
  release: () => void;
}

function getPool(cache: BlobCache): Map<string, RequestEntry> {
  let pool = pools.get(cache);
  if (!pool) {
    pool = new Map();
    pools.set(cache, pool);
  }
  return pool;
}

export function acquireAuthBlobRequest(
  url: string,
  cache: BlobCache,
): AuthBlobRequestLease {
  const pool = getPool(cache);
  let entry = pool.get(url);

  if (entry?.controller.signal.aborted) {
    pool.delete(url);
    entry = undefined;
  }

  if (!entry) {
    const controller = new AbortController();
    const nextEntry = {
      controller,
      consumers: 0,
      promise: fetchAuthBlob(url, {
        cache,
        signal: controller.signal,
        // This pool is the deduplication owner. Disabling cache-level dedup
        // lets a new request start immediately after an abandoned one aborts.
        deduplicate: false,
      }),
      abortTimer: null,
    } satisfies RequestEntry;
    nextEntry.promise = nextEntry.promise.finally(() => {
      if (pool.get(url) === nextEntry) {
        pool.delete(url);
      }
    });
    entry = nextEntry;
    pool.set(url, entry);
  }

  const leasedEntry = entry;
  if (leasedEntry.abortTimer) {
    clearTimeout(leasedEntry.abortTimer);
    leasedEntry.abortTimer = null;
  }
  leasedEntry.consumers += 1;

  let released = false;
  return {
    promise: leasedEntry.promise,
    release: () => {
      if (released) return;
      released = true;
      leasedEntry.consumers = Math.max(0, leasedEntry.consumers - 1);
      if (
        leasedEntry.consumers > 0 ||
        leasedEntry.controller.signal.aborted ||
        pool.get(url) !== leasedEntry
      ) return;

      leasedEntry.abortTimer = setTimeout(() => {
        leasedEntry.abortTimer = null;
        if (leasedEntry.consumers === 0 && pool.get(url) === leasedEntry) {
          leasedEntry.controller.abort();
        }
      }, RELEASE_GRACE_MS);
    },
  };
}

export function getAuthBlobRequestPoolStats(): {
  inFlight: number;
  consumers: number;
} {
  let inFlight = 0;
  let consumers = 0;
  for (const pool of pools.values()) {
    inFlight += pool.size;
    for (const entry of pool.values()) {
      consumers += entry.consumers;
    }
  }
  return { inFlight, consumers };
}

/** Test-only: abort and remove every request lease. */
export function __resetAuthBlobRequestPoolForTests(): void {
  for (const pool of pools.values()) {
    for (const entry of pool.values()) {
      if (entry.abortTimer) clearTimeout(entry.abortTimer);
      entry.controller.abort();
    }
    pool.clear();
  }
  pools.clear();
}
