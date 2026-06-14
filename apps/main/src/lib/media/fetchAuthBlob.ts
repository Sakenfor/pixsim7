/**
 * fetchAuthBlob — shared authenticated-media fetch primitive.
 *
 * The single fetch+cache path behind `useAuthenticatedMedia` and
 * `useMediaThumbnail`.  Owns: backend-URL resolution, bearer-token attach,
 * `cache: 'no-store'` (we keep our own LRU blob cache, so a duplicate HTTP
 * cache would waste gigabytes on large galleries), blob creation, the
 * post-blob race re-check, and in-flight HTTP dedup.
 *
 * What it deliberately does NOT own — these policies differ per caller and
 * stay in the hook wrappers:
 *   - blob:/data:/file:// and external-URL passthrough decisions
 *   - retry policy (the thumbnail hook retries 202 regen / 404 CDN-propagation)
 *   - loading/error React state, fallback chains, exhaustion timers
 *
 * HTTP non-OK responses (and 202 "still processing") reject with
 * {@link FetchAuthBlobHttpError} carrying the status code, so callers can
 * implement their own retry/fallback.
 */

import { authService } from '@lib/auth';

import { BACKEND_BASE } from '../api/client';

import { resolveBackendUrl } from './backendUrl';
import type { BlobCache } from './blobCache';

export interface FetchAuthBlobOptions {
  /** Destination LRU cache (caller routes by media type / usage). */
  cache: BlobCache;
  /** Optional abort signal — caller owns timeout/cancellation policy. */
  signal?: AbortSignal;
  /**
   * Share an in-flight request through the cache. Defaults to true.
   * Set false when the caller already owns a reference-counted request pool.
   */
  deduplicate?: boolean;
}

export interface FetchAuthBlobResult {
  /** Object URL held alive by the cache (do not revoke — the cache owns it). */
  blobUrl: string;
  /** True when served from cache without a network round-trip. */
  fromCache: boolean;
}

/** Non-OK HTTP response. `status` lets callers branch (202/404 retry, …). */
export class FetchAuthBlobHttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.name = 'FetchAuthBlobHttpError';
    this.status = status;
  }
}

/** Backend URL with no stored auth token — caller decides the fallback. */
export class FetchAuthBlobNoAuthError extends Error {
  constructor() {
    super('No auth token for backend media URL');
    this.name = 'FetchAuthBlobNoAuthError';
  }
}

/**
 * Fetch `url` into a cached blob URL.
 *
 * - Backend URLs get a `Bearer` token (throws {@link FetchAuthBlobNoAuthError}
 *   if none is stored); external URLs are fetched with `mode: 'cors'`.
 * - Returns immediately from `cache` on a hit (`fromCache: true`).
 * - Concurrent calls share one in-flight request unless `deduplicate` is false.
 * - On a non-OK response, rejects with {@link FetchAuthBlobHttpError}.
 *
 * The returned blob URL is owned by `cache`; never revoke it directly.
 */
export async function fetchAuthBlob(
  url: string,
  { cache, signal, deduplicate = true }: FetchAuthBlobOptions,
): Promise<FetchAuthBlobResult> {
  const { fullUrl, isBackend } = resolveBackendUrl(url, BACKEND_BASE);

  // Instant hit — avoids flash when virtualized cards remount.
  const cached = cache.get(fullUrl);
  if (cached) return { blobUrl: cached, fromCache: true };

  const token = isBackend ? authService.getStoredToken() : null;
  if (isBackend && !token) throw new FetchAuthBlobNoAuthError();

  const doFetch = async () => {
    // Another caller may have populated the cache while this request waited
    // in the dedup queue.
    const cachedAgain = cache.get(fullUrl);
    if (cachedAgain) return cachedAgain;

    const init: RequestInit = isBackend
      ? { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal }
      : { mode: 'cors', cache: 'no-store', signal };

    const res = await fetch(fullUrl, init);
    // 202 is technically `ok`, but it means "accepted / still processing" —
    // the body is not the media.  Reject so callers can poll/retry on status.
    if (!res.ok || res.status === 202) throw new FetchAuthBlobHttpError(res.status);

    const blob = await res.blob();
    // Re-check after the blob read in case another in-flight path populated
    // the cache during this await — reuse it rather than revoking a blob URL
    // that may still back another component's <img> (ERR_FILE_NOT_FOUND).
    const raceCached = cache.get(fullUrl);
    if (raceCached) return raceCached;

    const objectUrl = URL.createObjectURL(blob);
    cache.set(fullUrl, objectUrl, blob.size);
    return objectUrl;
  };
  const blobUrl = await (deduplicate
    ? cache.deduplicatedFetch(fullUrl, doFetch)
    : doFetch());

  if (blobUrl === undefined) {
    // deduplicatedFetch's type allows undefined; our doFetch never returns it.
    throw new Error('fetchAuthBlob: empty blob URL');
  }
  return { blobUrl, fromCache: false };
}
