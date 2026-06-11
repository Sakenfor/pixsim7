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

const opposite = (d: Direction): Direction => (d === 'next' ? 'prev' : 'next');

// We fetch this many neighbors in a single directional call and seed the
// per-step cache for every asset along the chain (see `fetchWindowAndSeed`).
// One round-trip therefore warms up to PREFETCH_SPAN forward/back steps, so
// walking into not-yet-explored territory doesn't stall on a fetch per click.
const PREFETCH_SPAN = 20;

// When the seeded frontier (first asset whose neighbor isn't cached yet) is
// within this many steps of the current pivot, refill the next span in the
// background. Kept comfortably below PREFETCH_SPAN so a refill (which adds a
// whole span) lands long before machine-gun clicking can reach the wall.
const REFILL_AHEAD = 10;

// Bumped from 64: seeding a chain writes up to ~PREFETCH_SPAN entries per
// direction per fetch, and entries are tiny (1-element windows for chevrons),
// so a larger cap keeps a multi-asset walk fully warm without churn.
const CACHE_CAP = 512;
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
    // Neighbor walking never renders the sibling-count badge; skip the
    // expensive prompt-coalesce cohort scan (~2.5s/page on large libraries).
    include_cohort_counts: false,
    // operationType is loose `string` upstream (mirrors AssetModel.operationType);
    // tighten to the generated `OperationType` literal-union at the wire.
    // Use `asset_operation_type` (denormalized Asset.operation_type COLUMN) — not
    // the lineage-EXISTS `operation_type` — so the walk rides
    // idx_asset_user_op_created and stays fast for sparse cohorts. The filter
    // value is the pivot's own column, so results match the EXISTS path for the
    // generated assets this cohort walks.
    ...(filters?.operationType ? { asset_operation_type: filters.operationType as OperationType } : {}),
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
  // The sequence is a TOTAL ORDER on the composite key `(created_at, id)`, not
  // on `created_at` alone. This matters whenever assets share an identical
  // timestamp (e.g. a batch/cohort generated in one operation): the
  // `created_from` / `created_to` boundary is inclusive, so the response for a
  // `next` fetch also contains same-timestamp siblings that are really BEHIND
  // the pivot (and vice-versa for `prev`). Filtering on `id !== pivot.id` alone
  // would let those wrong-side ties through, making `next`/`prev` non-inverse —
  // walking down then up could land on a different cluster member and snap the
  // walk to a new anchor. Partition strictly around the pivot on the composite
  // key so each direction only ever sees assets on its own side.
  const pivotTime = new Date(pivot.createdAt).getTime();
  const candidates = fromAssetResponses(response.assets).filter((a) => {
    if (a.id === pivot.id) return false;
    const t = new Date(a.createdAt).getTime();
    return direction === 'next'
      ? t > pivotTime || (t === pivotTime && a.id > pivot.id)
      : t < pivotTime || (t === pivotTime && a.id < pivot.id);
  });
  // Sort by the same composite key (id breaks timestamp ties) so the order is
  // deterministic regardless of how the server returned same-timestamp rows.
  candidates.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return direction === 'prev' ? tb - ta || b.id - a.id : ta - tb || a.id - b.id;
  });
  return candidates.slice(0, windowSize);
}

/**
 * Resolve the pivot's immediate `windowSize` neighbors in one direction, but
 * fetch a wider `PREFETCH_SPAN` chain and seed the per-step cache for every
 * asset along it — in BOTH directions — so subsequent walks land on warm
 * cache instead of a fresh round-trip.
 *
 * For a `next` fetch returning the chain `[n1, n2, n3, …]` (created_at
 * ascending after pivot), we seed for each `chain[i]`:
 *   - its forward (`next`) window: the assets after it in the chain;
 *   - its reverse (`prev`) window: the earlier chain members nearest-first,
 *     terminating at the original pivot.
 * The symmetric `prev` fetch seeds the mirror image. Two fetches per pivot
 * therefore warm a ±PREFETCH_SPAN neighborhood for chevron-by-chevron walking.
 *
 * Only COMPLETELY FULL windows are seeded. Near the tail of the fetched chain
 * a window is short only because we stopped fetching, NOT because the sequence
 * ended — caching that truncation would assert "no further neighbor" and
 * permanently dead-end the walk at the span boundary. Leaving the boundary
 * uncached lets the hook refetch (and re-seed the next span) when you arrive.
 */
async function fetchWindowAndSeed(
  pivot: AssetModel,
  axis: AssetSequenceAxis,
  direction: Direction,
  filters: AssetSequenceFilters | undefined,
  windowSize: number,
): Promise<AssetModel[]> {
  const directKey = cacheKey(pivot.id, axis, direction, filters, windowSize);
  const cached = cacheGet(directKey);
  if (cached) return cached;

  // Dedupe on a span-scoped key so concurrent consumers share the wide fetch.
  const spanKey = `span#${directKey}`;
  const existing = inFlight.get(spanKey);
  if (existing) return existing;

  const span = Math.max(windowSize, PREFETCH_SPAN);
  const promise = fetchDirection(pivot, axis, direction, filters, span)
    .then((chain) => {
      // Seed the pivot's own immediate window first — this is the authoritative
      // result of the fetch, so a short/empty window here is a genuine end.
      cacheSet(directKey, chain.slice(0, windowSize));
      const back = opposite(direction);
      for (let i = 0; i < chain.length; i++) {
        const node = chain[i];
        // Forward window: the assets further along the chain from `node`.
        // Seed only when full — a short window at the chain tail is a fetch
        // boundary, not a real end (see fn doc).
        const forward = chain.slice(i + 1, i + 1 + windowSize);
        if (forward.length === windowSize) {
          cacheSet(cacheKey(node.id, axis, direction, filters, windowSize), forward);
        }
        // Reverse window: earlier chain members nearest-first, then the pivot.
        // The pivot is a real boundary, so this is complete whenever it's full.
        const reverse = [...chain.slice(0, i).reverse(), pivot].slice(0, windowSize);
        if (reverse.length === windowSize) {
          cacheSet(cacheKey(node.id, axis, back, filters, windowSize), reverse);
        }
      }
      return chain.slice(0, windowSize);
    })
    .finally(() => {
      inFlight.delete(spanKey);
    });
  inFlight.set(spanKey, promise);
  return promise;
}

/**
 * Walk the seeded chain forward from `pivot` (cache lookups only, no network)
 * to locate the frontier — the first asset whose neighbor window isn't cached.
 * If that frontier is within `REFILL_AHEAD` steps, kick a background fetch from
 * it to extend the chain by another span. This is what keeps machine-gun
 * clicking ahead of the wall: the buffer is topped up well before you reach it,
 * not one step before. A genuinely-ended sequence (empty seeded window) stops
 * the walk without refetching.
 */
function extendFrontier(
  pivot: AssetModel,
  axis: AssetSequenceAxis,
  direction: Direction,
  filters: AssetSequenceFilters | undefined,
  windowSize: number,
): void {
  let current = pivot;
  for (let dist = 0; dist <= REFILL_AHEAD; dist++) {
    const win = cacheGet(cacheKey(current.id, axis, direction, filters, windowSize));
    if (win === undefined) {
      // Frontier within reach — extend from here (deduped + no-op if the
      // immediate window is already warm under a different code path).
      void fetchWindowAndSeed(current, axis, direction, filters, windowSize);
      return;
    }
    if (win.length === 0) return; // genuine end of sequence — nothing to fetch
    current = win[0];
  }
  // Frontier is farther than REFILL_AHEAD — plenty of buffer, nothing to do.
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
      // cached neighbors instead of flickering through empty state. When the
      // walk pre-seeded this pivot we already have the neighbor, so skip the
      // loading flag entirely — otherwise the chevron disables on every step
      // even though it has somewhere to go.
      const cached = cacheGet(cacheKey(pivotForRun.id, axis, 'prev', filters, windowBefore));
      if (cached) setPrevItems(cached);
      else setLoadingPrev(true);
      fetchWindowAndSeed(pivotForRun, axis, 'prev', filters, windowBefore)
        .then((items) => {
          if (cancelled) return;
          setPrevItems(items);
          // Keep a deep buffer ahead of the pivot so rapid walking never hits
          // a cold fetch at the boundary (no-op while the buffer is full).
          extendFrontier(pivotForRun, axis, 'prev', filters, windowBefore);
        })
        .catch(() => { if (!cancelled && !cached) setPrevItems(EMPTY); })
        .finally(() => { if (!cancelled) setLoadingPrev(false); });
    } else {
      setPrevItems(EMPTY);
    }

    if (windowAfter > 0) {
      const cached = cacheGet(cacheKey(pivotForRun.id, axis, 'next', filters, windowAfter));
      if (cached) setNextItems(cached);
      else setLoadingNext(true);
      fetchWindowAndSeed(pivotForRun, axis, 'next', filters, windowAfter)
        .then((items) => {
          if (cancelled) return;
          setNextItems(items);
          // Keep a deep buffer ahead of the pivot so rapid walking never hits
          // a cold fetch at the boundary (no-op while the buffer is full).
          extendFrontier(pivotForRun, axis, 'next', filters, windowAfter);
        })
        .catch(() => { if (!cancelled && !cached) setNextItems(EMPTY); })
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
