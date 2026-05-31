/**
 * Pack-category grouping helpers
 *
 * Pure helpers for grouping content-pack inventory entries by their
 * `category` field. Mirrors the canonical order from the backend's
 * `PACK_CATEGORY_REGISTRY` (see
 * `pixsim7/backend/main/services/prompt/block/pack_manifest_header.py`).
 *
 * Consumers: `ContentPacksDashboard`, `PromptLibraryInspectorPanel`.
 */

import {
  PACK_CATEGORY_ORDER,
  packCategoryLabel,
  type ContentPackInfo,
} from '@pixsim7/shared.api.client/domains';

/** Sentinel id for the "Uncategorized" bucket (packs with `category: null`). */
export const UNCATEGORIZED_PACK_CATEGORY = '__uncategorized__' as const;

export interface PackCategoryGroup<TEntry> {
  /**
   * Bucket id — one of `PACK_CATEGORY_ORDER`, the literal
   * `UNCATEGORIZED_PACK_CATEGORY`, or any out-of-registry string surfaced by
   * the backend (rendered after the known order but before "Uncategorized").
   */
  category: string;
  /** Human-readable label (e.g. "Camera", "Uncategorized"). */
  label: string;
  /** Whether this is the canonical Uncategorized bucket. */
  isUncategorized: boolean;
  /** Whether this bucket is in `PACK_CATEGORY_ORDER`. */
  isKnown: boolean;
  /** Entries assigned to this bucket, in input order. */
  entries: TEntry[];
}

/**
 * Group inventory entries by `info.category`, preserving input order within
 * each group and emitting groups in the canonical order:
 *
 *   1. `PACK_CATEGORY_ORDER` (only buckets that have at least one entry)
 *   2. Any out-of-registry categories the backend returned, alphabetically
 *      (defensive — should be empty under Phase 4's closed-registry lint)
 *   3. `Uncategorized` last (entries with `category` null/empty)
 *
 * Empty groups are omitted.
 */
export function groupPacksByCategory<TEntry>(
  entries: readonly TEntry[],
  getCategory: (entry: TEntry) => string | null | undefined,
): PackCategoryGroup<TEntry>[] {
  const buckets = new Map<string, TEntry[]>();

  for (const entry of entries) {
    const raw = getCategory(entry);
    const key = raw && raw.trim().length > 0 ? raw : UNCATEGORIZED_PACK_CATEGORY;
    const list = buckets.get(key);
    if (list) {
      list.push(entry);
    } else {
      buckets.set(key, [entry]);
    }
  }

  const groups: PackCategoryGroup<TEntry>[] = [];

  // 1. Known categories in canonical order
  for (const category of PACK_CATEGORY_ORDER) {
    const list = buckets.get(category);
    if (!list || list.length === 0) continue;
    groups.push({
      category,
      label: packCategoryLabel(category),
      isUncategorized: false,
      isKnown: true,
      entries: list,
    });
    buckets.delete(category);
  }

  // 2. Out-of-registry categories — alphabetically (defensive)
  const unknown = Array.from(buckets.keys())
    .filter((k) => k !== UNCATEGORIZED_PACK_CATEGORY)
    .sort();
  for (const category of unknown) {
    const list = buckets.get(category)!;
    groups.push({
      category,
      label: packCategoryLabel(category),
      isUncategorized: false,
      isKnown: false,
      entries: list,
    });
    buckets.delete(category);
  }

  // 3. Uncategorized — always last
  const uncategorized = buckets.get(UNCATEGORIZED_PACK_CATEGORY);
  if (uncategorized && uncategorized.length > 0) {
    groups.push({
      category: UNCATEGORIZED_PACK_CATEGORY,
      label: 'Uncategorized',
      isUncategorized: true,
      isKnown: false,
      entries: uncategorized,
    });
  }

  return groups;
}

/** Convenience for `Object.entries(inventory.packs)`-shaped input. */
export function groupPackInventoryEntries(
  entries: readonly [string, ContentPackInfo][],
): PackCategoryGroup<[string, ContentPackInfo]>[] {
  return groupPacksByCategory(entries, ([, info]) => info.category);
}
