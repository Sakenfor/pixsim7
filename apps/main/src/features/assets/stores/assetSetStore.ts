/**
 * Asset Set Store
 *
 * Persistent named collections of assets for generation strategies.
 * Manual sets hold explicit asset IDs; smart sets hold filter criteria
 * that are resolved dynamically at generation time.
 *
 * Backend-native: sets live in `asset_set` / `asset_set_member` (ownership-scoped)
 * and are reached through the `/asset-sets` API. This store is a thin
 * client-side cache + async mutation layer — it is NOT persisted to
 * localStorage (the old `pixsim7-asset-sets` key is gone). Reads are loaded
 * lazily via `ensureLoaded()` (call it before reading `sets`/`getSet` outside
 * React; the `useAssetSets()` hook does it for you on mount).
 */

import { useEffect } from 'react';
import { create } from 'zustand';

import type { AssetSetCreateRequest, AssetSetResponse, AssetSetUpdateRequest } from '@lib/api/assetSets';
import {
  addAssetSetMembers,
  createAssetSet,
  deleteAssetSet,
  listAssetSets,
  removeAssetSetMembers,
  replaceAssetSetMembers,
  updateAssetSet,
} from '@lib/api/assetSets';

import type { AssetFilters } from '../hooks/useAssets';

// ── Types ──────────────────────────────────────────────────────────────

export type AssetSetKind = 'manual' | 'smart';

interface BaseAssetSet {
  /** Backend integer id (replaces the old client-only `aset_*` string ids). */
  id: number;
  name: string;
  description?: string;
  color?: string;
  /** Optional @lib/icons name shown on set badges / hover add-target toggles. */
  icon?: string;
  /** Owner's read-widening flag — when true the set is visible to everyone. */
  isShared: boolean;
  /** True when the caller is not the owner (set is visible only via isShared). */
  shared: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ManualAssetSet extends BaseAssetSet {
  kind: 'manual';
  assetIds: number[];
}

export interface SmartAssetSet extends BaseAssetSet {
  kind: 'smart';
  filters: AssetFilters;
  maxResults?: number;
}

export type AssetSet = ManualAssetSet | SmartAssetSet;

export type CreateAssetSetInput =
  | {
      name: string;
      kind: 'manual';
      assetIds?: number[];
      description?: string;
      color?: string;
      icon?: string;
      isShared?: boolean;
    }
  | {
      name: string;
      kind: 'smart';
      filters?: AssetFilters;
      maxResults?: number;
      description?: string;
      color?: string;
      icon?: string;
      isShared?: boolean;
    };

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

// ── Mapping ────────────────────────────────────────────────────────────

function fromResponse(r: AssetSetResponse): AssetSet {
  const base: BaseAssetSet = {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    color: r.color ?? undefined,
    icon: r.icon ?? undefined,
    isShared: r.isShared,
    shared: r.shared ?? false,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
  if (r.kind === 'smart') {
    return {
      ...base,
      kind: 'smart',
      filters: (r.filters ?? {}) as AssetFilters,
      maxResults: r.maxResults ?? undefined,
    };
  }
  return { ...base, kind: 'manual', assetIds: r.assetIds ?? [] };
}

function replaceInList(sets: AssetSet[], updated: AssetSet): AssetSet[] {
  let found = false;
  const next = sets.map((s) => {
    if (s.id === updated.id) {
      found = true;
      return updated;
    }
    return s;
  });
  return found ? next : [updated, ...next];
}

// ── One-time localStorage → backend import ───────────────────────────────
//
// Before sets were backend-native they lived only in the zustand-persisted
// `pixsim7-asset-sets` localStorage key. That key is no longer written, but a
// dev who created sets under the old build still has them in their browser.
// On the first successful load — and only when the backend has no sets yet —
// we POST those legacy sets up, then move the key aside (kept as a `__imported`
// backup, never silently destroyed). Guarded so it never runs twice and never
// clobbers existing backend data.

const LEGACY_KEY = 'pixsim7-asset-sets';
const LEGACY_BACKUP_KEY = 'pixsim7-asset-sets__imported';
let legacyImportAttempted = false;

interface LegacyAssetSet {
  name?: string;
  kind?: string;
  assetIds?: number[];
  filters?: AssetFilters;
  maxResults?: number;
  description?: string;
  color?: string;
}

function readLegacyLocalSets(): LegacyAssetSet[] | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(LEGACY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { state?: { sets?: LegacyAssetSet[] } };
    const sets = parsed?.state?.sets;
    return Array.isArray(sets) ? sets : [];
  } catch {
    return [];
  }
}

/**
 * Import legacy localStorage sets into the backend. Returns the number created.
 * Only runs when the backend is empty (a fresh port, not a merge), at most once
 * per session, and archives the source key on success so it never re-imports.
 */
async function importLegacyLocalSets(backendSetCount: number): Promise<number> {
  if (legacyImportAttempted || typeof window === 'undefined') return 0;
  legacyImportAttempted = true;
  if (backendSetCount > 0) return 0; // don't merge into existing backend data

  const legacy = readLegacyLocalSets();
  if (!legacy || legacy.length === 0) return 0;

  let created = 0;
  for (const s of legacy) {
    if (!s?.name) continue;
    try {
      if (s.kind === 'smart') {
        await createAssetSet({
          name: s.name,
          kind: 'smart',
          description: s.description ?? null,
          color: s.color ?? null,
          filters: (s.filters ?? {}) as AssetSetCreateRequest['filters'],
          max_results: s.maxResults ?? null,
        });
      } else {
        await createAssetSet({
          name: s.name,
          kind: 'manual',
          description: s.description ?? null,
          color: s.color ?? null,
          asset_ids: s.assetIds ?? [],
        });
      }
      created += 1;
    } catch (err) {
      // Stop on first failure and leave the source key in place so the import
      // can be retried next session rather than partially losing sets.
      console.warn('[assetSets] legacy localStorage import failed; left source key for retry', err);
      return created;
    }
  }

  // Full success: archive (don't delete) the source key so it never re-imports.
  const raw = window.localStorage.getItem(LEGACY_KEY);
  if (raw !== null) window.localStorage.setItem(LEGACY_BACKUP_KEY, raw);
  window.localStorage.removeItem(LEGACY_KEY);
  return created;
}

// ── Store ──────────────────────────────────────────────────────────────

interface AssetSetState {
  sets: AssetSet[];
  status: LoadStatus;
  error: string | null;

  // Loading
  fetchSets: () => Promise<void>;
  ensureLoaded: () => Promise<void>;

  // Mutations (async — call the backend, then reconcile local cache)
  createSet: (input: CreateAssetSetInput) => Promise<AssetSet>;
  updateSet: (id: number, patch: Partial<Pick<AssetSet, 'name' | 'description' | 'color' | 'icon'>>) => Promise<void>;
  deleteSet: (id: number) => Promise<void>;
  renameSet: (id: number, name: string) => Promise<void>;

  // Manual set mutations
  addAssetsToSet: (id: number, assetIds: number[]) => Promise<void>;
  removeAssetsFromSet: (id: number, assetIds: number[]) => Promise<void>;
  reorderAssetsInSet: (id: number, assetIds: number[]) => Promise<void>;

  // Smart set mutations
  updateSmartFilters: (id: number, filters: AssetFilters, maxResults?: number) => Promise<void>;

  // Queries (sync reads of the loaded cache)
  getSet: (id: number) => AssetSet | undefined;
  getAllSets: () => AssetSet[];
}

// Module-level dedupe so concurrent ensureLoaded() callers share one request.
let loadPromise: Promise<void> | null = null;

export const useAssetSetStore = create<AssetSetState>()((set, get) => ({
  sets: [],
  status: 'idle',
  error: null,

  fetchSets: async () => {
    set((s) => ({ status: s.status === 'ready' ? 'ready' : 'loading', error: null }));
    try {
      let rows = await listAssetSets();
      // One-time port of pre-backend localStorage sets (no-op after first run).
      const imported = await importLegacyLocalSets(rows.length);
      if (imported > 0) {
        rows = await listAssetSets();
        console.info(`[assetSets] imported ${imported} legacy localStorage set(s) into the backend`);
      }
      set({ sets: rows.map(fromResponse), status: 'ready', error: null });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  ensureLoaded: async () => {
    if (get().status === 'ready') return;
    if (!loadPromise) {
      loadPromise = get()
        .fetchSets()
        .finally(() => {
          loadPromise = null;
        });
    }
    return loadPromise;
  },

  createSet: async (input) => {
    const created = fromResponse(
      await createAssetSet({
        name: input.name,
        kind: input.kind,
        description: input.description ?? null,
        color: input.color ?? null,
        icon: input.icon ?? null,
        is_shared: input.isShared ?? false,
        ...(input.kind === 'smart'
          ? { filters: input.filters ?? {}, max_results: input.maxResults ?? null }
          : { asset_ids: input.assetIds ?? [] }),
      }),
    );
    set((s) => ({ sets: [created, ...s.sets] }));
    return created;
  },

  updateSet: async (id, patch) => {
    // Only send keys actually present in the patch; map present-but-undefined to
    // null so a cleared color/icon is persisted (the backend uses
    // exclude_unset, so an omitted key is a no-op, while null clears).
    const body: AssetSetUpdateRequest = {};
    if ('name' in patch) body.name = patch.name;
    if ('description' in patch) body.description = patch.description ?? null;
    if ('color' in patch) body.color = patch.color ?? null;
    if ('icon' in patch) body.icon = patch.icon ?? null;
    const updated = fromResponse(await updateAssetSet(id, body));
    set((s) => ({ sets: replaceInList(s.sets, updated) }));
  },

  deleteSet: async (id) => {
    await deleteAssetSet(id);
    set((s) => ({ sets: s.sets.filter((x) => x.id !== id) }));
  },

  renameSet: async (id, name) => {
    await get().updateSet(id, { name });
  },

  addAssetsToSet: async (id, assetIds) => {
    const updated = fromResponse(await addAssetSetMembers(id, assetIds));
    set((s) => ({ sets: replaceInList(s.sets, updated) }));
  },

  removeAssetsFromSet: async (id, assetIds) => {
    const updated = fromResponse(await removeAssetSetMembers(id, assetIds));
    set((s) => ({ sets: replaceInList(s.sets, updated) }));
  },

  reorderAssetsInSet: async (id, assetIds) => {
    const updated = fromResponse(await replaceAssetSetMembers(id, assetIds));
    set((s) => ({ sets: replaceInList(s.sets, updated) }));
  },

  updateSmartFilters: async (id, filters, maxResults) => {
    const updated = fromResponse(
      await updateAssetSet(id, {
        filters,
        ...(maxResults !== undefined ? { max_results: maxResults } : {}),
      }),
    );
    set((s) => ({ sets: replaceInList(s.sets, updated) }));
  },

  getSet: (id) => get().sets.find((s) => s.id === id),
  getAllSets: () => get().sets,
}));

// ── Hook ───────────────────────────────────────────────────────────────

export interface UseAssetSetsResult {
  sets: AssetSet[];
  status: LoadStatus;
  isLoading: boolean;
  error: string | null;
}

/**
 * Subscribe to the asset-set cache, lazily loading it from the backend on
 * first mount. Components that read sets should use this so the cache is
 * populated; plain modules should `await useAssetSetStore.getState().ensureLoaded()`.
 */
export function useAssetSets(): UseAssetSetsResult {
  const sets = useAssetSetStore((s) => s.sets);
  const status = useAssetSetStore((s) => s.status);
  const error = useAssetSetStore((s) => s.error);

  useEffect(() => {
    void useAssetSetStore.getState().ensureLoaded();
  }, []);

  return { sets, status, isLoading: status === 'loading' || status === 'idle', error };
}
