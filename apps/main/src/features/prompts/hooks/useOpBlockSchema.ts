/**
 * Fetches a block's schema (text + tags + op declaration) by block_id.
 *
 * Used by the prompt-composer span popover's Adjust tab to find out whether
 * the matched primitive is op-backed and, if so, what params/refs to render.
 *
 * Cached at module level — schemas are static within a session (content
 * packs reload triggers a hard refresh elsewhere).
 *
 * Phase 1 of plan:op-runtime-span-popover.
 */
import { useEffect, useState } from 'react';

import { getBlockSchema, type BlockSchemaResponse } from '@lib/api/blockTemplates';

type CacheEntry =
  | { status: 'pending'; promise: Promise<BlockSchemaResponse | null> }
  | { status: 'resolved'; value: BlockSchemaResponse }
  | { status: 'missing' }
  | { status: 'error'; error: Error };

const cache = new Map<string, CacheEntry>();

function fetchAndCache(blockId: string): Promise<BlockSchemaResponse | null> {
  const promise = getBlockSchema(blockId)
    .then((schema) => {
      cache.set(blockId, { status: 'resolved', value: schema });
      return schema;
    })
    .catch((err: unknown) => {
      // 404 → cache as missing so we don't refetch repeatedly when a
      // candidate references a stale block_id. Other errors stay error so
      // the user can retry by reopening the popover.
      const isNotFound =
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        (err as { status?: unknown }).status === 404;
      if (isNotFound) {
        cache.set(blockId, { status: 'missing' });
        return null;
      }
      const error = err instanceof Error ? err : new Error(String(err));
      cache.set(blockId, { status: 'error', error });
      throw error;
    });
  cache.set(blockId, { status: 'pending', promise });
  return promise;
}

export interface UseOpBlockSchemaResult {
  schema: BlockSchemaResponse | null;
  loading: boolean;
  error: Error | null;
}

export function useOpBlockSchema(blockId: string | null | undefined): UseOpBlockSchemaResult {
  const [, force] = useState(0);

  useEffect(() => {
    if (!blockId) return;
    const entry = cache.get(blockId);
    if (entry && entry.status !== 'pending') return;
    let cancelled = false;
    const promise = entry?.status === 'pending' ? entry.promise : fetchAndCache(blockId);
    promise.finally(() => {
      if (!cancelled) force((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [blockId]);

  if (!blockId) {
    return { schema: null, loading: false, error: null };
  }
  const entry = cache.get(blockId);
  if (!entry || entry.status === 'pending') {
    return { schema: null, loading: true, error: null };
  }
  if (entry.status === 'error') {
    return { schema: null, loading: false, error: entry.error };
  }
  if (entry.status === 'missing') {
    return { schema: null, loading: false, error: null };
  }
  return { schema: entry.value, loading: false, error: null };
}
