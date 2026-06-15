/**
 * useInputPromptHistory
 *
 * Returns the distinct prompts previously used in generations made *from* a
 * given input asset — i.e. "what have I already tried with this image?".
 *
 * Derived authoritatively from asset lineage: every generated asset records
 * its origin via `source_asset_id` (a first-class search filter) and carries
 * the prompt that produced it on `AssetModel.prompt` (a first-class provenance
 * column). So a single `listAssets({ source_asset_id })` call yields the
 * children, and their `.prompt` values — deduped — are the answer. No new
 * persistence; covers generations made before this feature existed.
 *
 * Plan: quickgen-input-prompt-history (checkpoint input-prompt-history-hook).
 * Mirrors the cohort-fetch shape of `useSamePromptScope` / `bootstrapFromFilters`.
 */

import type { MediaType } from '@pixsim7/shared.types';
import { useEffect, useMemo, useState } from 'react';

import { listAssets } from '@lib/api/assets';
import { authService } from '@lib/auth';
import { createKeyedAsyncCache } from '@lib/utils';

import { fromAssetResponses, type AssetModel } from '@features/assets';


/**
 * Backend `AssetSearchRequest.limit` is `le=100` (Pydantic → 422 if exceeded).
 * A single input rarely spawns more than a few dozen generations, so this is
 * generous in practice. See `useSamePromptScope`.
 */
const MAX_RESULTS = 100;

function clampLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return MAX_RESULTS;
  return Math.max(1, Math.min(MAX_RESULTS, Math.round(value)));
}

export interface InputPromptHistoryEntry {
  /** The prompt text (original casing of the most recent occurrence). */
  text: string;
  /** Newest child asset that used this prompt — handy for previews/lineage. */
  assetId: number;
  /** ISO timestamp of that newest occurrence. */
  createdAt: string;
  /** How many generations from this input used this (deduped) prompt. */
  count: number;
}

export interface InputPromptHistoryResult {
  /** Deduped prompts, newest occurrence first. */
  prompts: InputPromptHistoryEntry[];
  loading: boolean;
  /** True once a fetch has resolved and produced no usable prompts. */
  isEmpty: boolean;
}

const cache = createKeyedAsyncCache<InputPromptHistoryEntry[]>('useInputPromptHistory', {
  maxEntries: 50,
});

function cacheKey(inputAssetId: number, mediaType: MediaType | undefined, limit: number): string {
  return `${inputAssetId}:${mediaType ?? 'all'}:${limit}`;
}

/** Trim, dedupe (case-insensitive), keep newest occurrence, count duplicates. */
function dedupePrompts(assets: AssetModel[]): InputPromptHistoryEntry[] {
  // `assets` arrives newest-first; first sight of a key is therefore the
  // newest occurrence and wins for display text / assetId / createdAt.
  const byKey = new Map<string, InputPromptHistoryEntry>();
  for (const asset of assets) {
    const text = typeof asset.prompt === 'string' ? asset.prompt.trim() : '';
    if (!text) continue;
    const key = text.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    byKey.set(key, {
      text,
      assetId: asset.id,
      createdAt: asset.createdAt,
      count: 1,
    });
  }
  return [...byKey.values()];
}

async function fetchInputPrompts(
  inputAssetId: number,
  mediaType: MediaType | undefined,
  limit: number,
): Promise<InputPromptHistoryEntry[]> {
  // App can mount this before auth settles; skip rather than emit 401 noise.
  if (!authService.getStoredToken()) return [];

  try {
    const res = await listAssets({
      source_asset_id: inputAssetId,
      // `media_type` is a registry-defined filter, not a top-level field.
      ...(mediaType ? { filters: { media_type: mediaType } } : {}),
      sort_by: 'created_at' as const,
      sort_dir: 'desc' as const,
      limit,
    });
    return dedupePrompts(fromAssetResponses(res.assets));
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 401) return [];
    throw error;
  }
}

/**
 * Read the prompts previously used in generations made from `inputAssetId`.
 * Pass `null`/`undefined`/`<= 0` to disable (returns an empty, non-loading
 * result). Optionally restrict to a single output `mediaType`.
 */
export function useInputPromptHistory(
  inputAssetId: number | null | undefined,
  options?: { mediaType?: MediaType; limit?: number },
): InputPromptHistoryResult {
  const mediaType = options?.mediaType;
  const limit = clampLimit(options?.limit);
  const enabled = typeof inputAssetId === 'number' && Number.isFinite(inputAssetId) && inputAssetId > 0;
  const key = enabled ? cacheKey(inputAssetId, mediaType, limit) : null;

  const [prompts, setPrompts] = useState<InputPromptHistoryEntry[]>(
    () => (key ? cache.get(key) ?? [] : []),
  );
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState(() => Boolean(key && cache.has(key)));

  useEffect(() => {
    if (!key || !enabled) {
      setPrompts([]);
      setLoading(false);
      setResolved(false);
      return;
    }

    let cancelled = false;

    const cached = cache.get(key);
    if (cached) {
      setPrompts(cached);
      setResolved(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setResolved(false);

    // The cache retains the resolved value and de-dupes concurrent fetches;
    // failures aren't cached, so a later mount retries.
    cache
      .fetch(key, () => fetchInputPrompts(inputAssetId, mediaType, limit))
      .then((result) => {
        if (cancelled) return;
        setPrompts(result);
        setResolved(true);
      })
      .catch(() => {
        if (cancelled) return;
        setPrompts([]);
        setResolved(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key, enabled, inputAssetId, mediaType, limit]);

  return useMemo(
    () => ({ prompts, loading, isEmpty: resolved && prompts.length === 0 }),
    [prompts, loading, resolved],
  );
}
