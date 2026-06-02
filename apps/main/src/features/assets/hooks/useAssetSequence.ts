/**
 * useAssetSequence
 *
 * Read-only neighbor lookup over a configurable sequence axis. Given a
 * pivot asset, returns the immediate `prev` / `next` neighbors and helpers
 * for fetching a wider window in either direction. Render-agnostic: callers
 * decide what "navigating" means (replace an input slot, open in viewer, …).
 *
 * Today: `axis: 'created_at'` filtered by media_type / operation_type.
 * Tomorrow: `'similarity'`, `'version_chain'`, …
 *
 * A small module-level LRU caches per-direction windows, shared across all
 * consumers — so a peek-popover, a chevron click, and a sibling slot share
 * one fetch when they pivot on the same asset+filters.
 *
 * Plan: `media-card-input-time-nav` (sub-plan of `media-card-surface`).
 * First consumer: `inputTimeNavWidget` (input-slot prev/next chevrons).
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { listAssets } from '@lib/api/assets';

import type { OperationType } from '@/types/operations';

import { fromAssetResponses, type AssetModel } from '../models/asset';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type AssetSequenceAxis = 'created_at';
// Future axes: 'similarity' | 'version_chain' | 'manual'

export interface AssetSequenceFilters {
  /** Restrict to a single media_type (default: pivot's media_type). */
  mediaType?: string;
  /** Restrict to a single operation_type. */
  operationType?: string;
  /**
   * Restrict to a single prompt_version_id — the "same prompt" cohort key.
   * Stable across prompt-text tweaks. When set, the sequence walks the
   * created_at axis *within* that prompt cohort.
   */
  promptVersionId?: string;
  /**
   * Restrict to assets uploaded from a specific tracked local folder
   * (`upload_context.source_folder_id`). The "same folder" cohort key for
   * the Source axis on locally-uploaded assets.
   */
  uploadSourceFolderId?: string;
  /**
   * Optional narrowing to a subdirectory within the source folder
   * (`upload_context.source_subfolder`). Empty string matches root-of-folder
   * files; omit to match across all subfolders of the source folder.
   */
  uploadSourceSubfolder?: string;
  /**
   * Server-side variant — backend resolves the pivot asset's
   * `upload_context.source_folder_id` + `source_subfolder` and filters by
   * them. Use this when the caller has the asset id but may not carry the
   * full uploadContext payload (e.g. carousel slot stubs).
   */
  sourceSiblingsOfAssetId?: number;
}

export interface UseAssetSequenceArgs {
  /**
   * Asset to navigate from. Pass `null` to disable (e.g. empty slot).
   * The hook re-fetches when `pivot.id` changes — moving the pivot via
   * the caller (e.g. after committing a swap) is the canonical way to
   * walk the sequence.
   */
  pivot: AssetModel | null;
  /** Sequence axis (default `'created_at'`). */
  axis?: AssetSequenceAxis;
  /** Filter narrowing applied around the pivot. */
  filters?: AssetSequenceFilters;
  /** Neighbors to fetch BEFORE pivot on the axis (default 1). */
  windowBefore?: number;
  /** Neighbors to fetch AFTER pivot on the axis (default 1). */
  windowAfter?: number;
  /** Set false to suspend fetching (the hook still returns cached data). */
  enabled?: boolean;
}

export interface UseAssetSequenceReturn {
  /** Immediate previous neighbor on the axis, or `null` until loaded / no neighbor. */
  prev: AssetModel | null;
  /** Immediate next neighbor on the axis. */
  next: AssetModel | null;
  /** Up to N neighbors before pivot, nearest first. */
  prevN: (n: number) => AssetModel[];
  /** Up to N neighbors after pivot, nearest first. */
  nextN: (n: number) => AssetModel[];
  /** Either direction is in flight. */
  isLoading: boolean;
  isLoadingPrev: boolean;
  isLoadingNext: boolean;
  /** Drop this pivot's cache entries and refetch. */
  refresh: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level LRU + in-flight dedupe
// ─────────────────────────────────────────────────────────────────────────────

type Direction = 'prev' | 'next';

// Cap is intentionally small — chevron use cases pivot on at most a handful
// of assets in a session, and stale entries are cheap to refetch.
const CACHE_CAP = 64;
const cache = new Map<string, AssetModel[]>();
const inFlight = new Map<string, Promise<AssetModel[]>>();

function cacheKey(
  pivotId: number,
  axis: AssetSequenceAxis,
  direction: Direction,
  filters: AssetSequenceFilters | undefined,
  windowSize: number,
): string {
  const fk = `mt=${filters?.mediaType ?? ''}|op=${filters?.operationType ?? ''}|pv=${filters?.promptVersionId ?? ''}|sf=${filters?.uploadSourceFolderId ?? ''}|ss=${filters?.uploadSourceSubfolder ?? ''}|ssa=${filters?.sourceSiblingsOfAssetId ?? ''}`;
  return `${pivotId}|${axis}|${direction}|w=${windowSize}|${fk}`;
}

function cacheGet(key: string): AssetModel[] | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  // Touch to bump LRU order.
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function cacheSet(key: string, value: AssetModel[]) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_CAP) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

function cacheInvalidateForPivot(pivotId: number) {
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(`${pivotId}|`)) cache.delete(key);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pull a small window in one direction. Server-side sort default is not
 * guaranteed to match what we want, so we always sort client-side and slice.
 * The "window" we send is `windowSize + 1` to safely overshoot if the pivot
 * itself comes back in the response (it will, since `created_to` / `from`
 * use inclusive comparisons).
 */
async function fetchDirection(
  pivot: AssetModel,
  axis: AssetSequenceAxis,
  direction: Direction,
  filters: AssetSequenceFilters | undefined,
  windowSize: number,
): Promise<AssetModel[]> {
  // axis is always 'created_at' today — branch here when more land.
  void axis;
  const effectiveMediaType = filters?.mediaType ?? pivot.mediaType;
  const apiFilters: Record<string, unknown> = {
    media_type: [effectiveMediaType],
  };
  const limit = Math.max(2, windowSize + 1);
  // Sort direction is critical: with `created_from: pivot` + default desc, the
  // server returns "newest above pivot" (== absolute newest in DB), not
  // "closest above pivot". Use `asc` for next so the oldest-above-pivot (==
  // the immediate next neighbor) lands at the top of the response. `prev`
  // keeps the default desc — newest-below-pivot is exactly the closest.
  const base = {
    filters: apiFilters,
    sort_by: 'created_at' as const,
    sort_dir: direction === 'next' ? ('asc' as const) : ('desc' as const),
    limit,
    // operationType is loose `string` upstream (mirrors AssetModel.operationType);
    // tighten to the generated `OperationType` literal-union at the wire.
    ...(filters?.operationType ? { operation_type: filters.operationType as OperationType } : {}),
    ...(filters?.promptVersionId ? { prompt_version_id: filters.promptVersionId } : {}),
    ...(filters?.uploadSourceFolderId ? { upload_source_folder_id: filters.uploadSourceFolderId } : {}),
    ...(filters?.uploadSourceSubfolder !== undefined ? { upload_source_subfolder: filters.uploadSourceSubfolder } : {}),
    ...(filters?.sourceSiblingsOfAssetId ? { source_siblings_of_asset_id: filters.sourceSiblingsOfAssetId } : {}),
  };
  const query =
    direction === 'prev'
      ? { ...base, created_to: pivot.createdAt }
      : { ...base, created_from: pivot.createdAt };
  const response = await listAssets(query);
  const candidates = fromAssetResponses(response.assets).filter((a) => a.id !== pivot.id);
  // Still sort client-side as defence-in-depth: the server may return ties or
  // the `from/to` boundary may be inclusive in surprising ways.
  candidates.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return direction === 'prev' ? tb - ta : ta - tb;
  });
  return candidates.slice(0, windowSize);
}

async function fetchDirectionCached(
  pivot: AssetModel,
  axis: AssetSequenceAxis,
  direction: Direction,
  filters: AssetSequenceFilters | undefined,
  windowSize: number,
): Promise<AssetModel[]> {
  const key = cacheKey(pivot.id, axis, direction, filters, windowSize);
  const cached = cacheGet(key);
  if (cached) return cached;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = fetchDirection(pivot, axis, direction, filters, windowSize)
    .then((items) => {
      cacheSet(key, items);
      return items;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY: AssetModel[] = [];

export function useAssetSequence({
  pivot,
  axis = 'created_at',
  filters,
  windowBefore = 1,
  windowAfter = 1,
  enabled = true,
}: UseAssetSequenceArgs): UseAssetSequenceReturn {
  const [prevItems, setPrevItems] = useState<AssetModel[]>(EMPTY);
  const [nextItems, setNextItems] = useState<AssetModel[]>(EMPTY);
  const [isLoadingPrev, setLoadingPrev] = useState(false);
  const [isLoadingNext, setLoadingNext] = useState(false);

  // Stable serialization of args that should retrigger fetches.
  const filterKey = useMemo(
    () => `mt=${filters?.mediaType ?? ''}|op=${filters?.operationType ?? ''}|pv=${filters?.promptVersionId ?? ''}|sf=${filters?.uploadSourceFolderId ?? ''}|ss=${filters?.uploadSourceSubfolder ?? ''}|ssa=${filters?.sourceSiblingsOfAssetId ?? ''}`,
    [
      filters?.mediaType,
      filters?.operationType,
      filters?.promptVersionId,
      filters?.uploadSourceFolderId,
      filters?.uploadSourceSubfolder,
      filters?.sourceSiblingsOfAssetId,
    ],
  );

  // Reset counter — refresh() bumps it to drop cache + refetch.
  const refreshTickRef = useRef(0);
  const [, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!enabled || !pivot) {
      setPrevItems(EMPTY);
      setNextItems(EMPTY);
      return;
    }
    let cancelled = false;
    const pivotForRun = pivot;

    if (windowBefore > 0) {
      // Read sync cache first so the first paint after a pivot change shows
      // cached neighbors instead of flickering through empty state.
      const cached = cacheGet(cacheKey(pivotForRun.id, axis, 'prev', filters, windowBefore));
      if (cached) setPrevItems(cached);
      setLoadingPrev(true);
      fetchDirectionCached(pivotForRun, axis, 'prev', filters, windowBefore)
        .then((items) => {
          if (cancelled) return;
          setPrevItems(items);
        })
        .catch(() => { if (!cancelled) setPrevItems(EMPTY); })
        .finally(() => { if (!cancelled) setLoadingPrev(false); });
    } else {
      setPrevItems(EMPTY);
    }

    if (windowAfter > 0) {
      const cached = cacheGet(cacheKey(pivotForRun.id, axis, 'next', filters, windowAfter));
      if (cached) setNextItems(cached);
      setLoadingNext(true);
      fetchDirectionCached(pivotForRun, axis, 'next', filters, windowAfter)
        .then((items) => {
          if (cancelled) return;
          setNextItems(items);
        })
        .catch(() => { if (!cancelled) setNextItems(EMPTY); })
        .finally(() => { if (!cancelled) setLoadingNext(false); });
    } else {
      setNextItems(EMPTY);
    }

    return () => {
      cancelled = true;
    };
    // refreshTickRef.current is read via state setter below; intentional dep.
  }, [pivot?.id, axis, filterKey, windowBefore, windowAfter, enabled, refreshTickRef.current]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevN = useMemo(
    () => (n: number) => prevItems.slice(0, n),
    [prevItems],
  );
  const nextN = useMemo(
    () => (n: number) => nextItems.slice(0, n),
    [nextItems],
  );

  const refresh = useMemo(
    () => () => {
      if (pivot) cacheInvalidateForPivot(pivot.id);
      refreshTickRef.current += 1;
      setRefreshTick((t) => t + 1);
    },
    [pivot?.id], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return {
    prev: prevItems[0] ?? null,
    next: nextItems[0] ?? null,
    prevN,
    nextN,
    isLoading: isLoadingPrev || isLoadingNext,
    isLoadingPrev,
    isLoadingNext,
    refresh,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test / debug helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Test helper — clears the entire sequence cache. Not exported from index. */
export function __resetAssetSequenceCache() {
  cache.clear();
  inFlight.clear();
}
