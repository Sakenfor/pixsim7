/**
 * Generations Store
 *
 * Zustand store for managing generation state.
 * Replaces the legacy jobsStore.
 *
 * Uses internal GenerationModel (camelCase) - API responses are mapped
 * at the boundary before being stored.
 */
import { create } from 'zustand';

import type { GenerationModel, GenerationStatus } from '../models';

/** Keep at most this many generations in memory; prune oldest terminal entries. */
const MAX_GENERATIONS = 500;

export interface GenerationsState {
  // Generations map (by ID)
  generations: Map<number, GenerationModel>;

  // Currently watched generation (for polling)
  watchingGenerationId: number | null;

  // Actions
  addOrUpdate: (generation: GenerationModel) => void;
  /** Optimistic partial update — merges fields into an existing entry without a full replace. */
  patch: (id: number, fields: Partial<GenerationModel>) => void;
  remove: (id: number) => void;
  setWatchingGeneration: (id: number | null) => void;
  clear: () => void;
}

export type { GenerationStatus };

export const useGenerationsStore = create<GenerationsState>((set) => ({
  generations: new Map(),
  watchingGenerationId: null,

  addOrUpdate: (generation) =>
    set((state) => {
      // Guard against invalid generations
      if (!generation || generation.id == null) {
        console.warn('[GenerationsStore] Attempted to add generation with invalid id:', generation);
        return state;
      }
      const newMap = new Map(state.generations);
      newMap.set(generation.id, generation);

      // Prune oldest terminal generations when the map exceeds the cap
      if (newMap.size > MAX_GENERATIONS) {
        for (const [id, g] of newMap) {
          if (newMap.size <= MAX_GENERATIONS) break;
          const status = g.status as string;
          if (status === 'completed' || status === 'failed' || status === 'cancelled') {
            newMap.delete(id);
          }
        }
      }

      return { generations: newMap };
    }),

  patch: (id, fields) =>
    set((state) => {
      const existing = state.generations.get(id);
      if (!existing) return state; // Nothing to patch — wait for full addOrUpdate
      const newMap = new Map(state.generations);
      newMap.set(id, { ...existing, ...fields });
      return { generations: newMap };
    }),

  remove: (id) =>
    set((state) => {
      const newMap = new Map(state.generations);
      newMap.delete(id);
      return { generations: newMap };
    }),

  setWatchingGeneration: (id) =>
    set({ watchingGenerationId: id }),

  clear: () =>
    set({ generations: new Map(), watchingGenerationId: null }),
}));

// Selectors
export const generationsSelectors = {
  byId: (id: number | null) => (state: GenerationsState) =>
    id ? state.generations.get(id) : undefined,

  all: () => (state: GenerationsState) =>
    Array.from(state.generations.values()),

  byStatus: (status: string) => (state: GenerationsState) =>
    Array.from(state.generations.values()).filter((g) => g.status === status),

  watching: () => (state: GenerationsState) =>
    state.watchingGenerationId
      ? state.generations.get(state.watchingGenerationId)
      : undefined,

  // Active child generations using this asset as a source input — extends,
  // regenerates, compositions, artificial-extends. Scope is strictly
  // children-of; the "this asset is itself being produced" case is already
  // covered by `useMediaCardGenerationStatus` (see
  // `generationAssetMapping.ts`), which also handles terminal states
  // (completed/failed) and owns the status ring widget. Keep the two
  // surfaces non-overlapping so we never double-drive the same indicator.
  inFlightTouchingAsset: (assetId: number | null | undefined) => (state: GenerationsState) => {
    if (!assetId) return [] as GenerationModel[];
    const out: GenerationModel[] = [];
    for (const g of state.generations.values()) {
      if (!isActiveStatus(g.status)) continue;
      // Skip self-scope: `useMediaCardGenerationStatus` owns that signal.
      if (g.assetId === assetId) continue;
      const params = g.canonicalParams ?? {};
      const ae = (params as { artificial_extend?: { source_video_id?: number } }).artificial_extend;
      if (ae?.source_video_id === assetId) { out.push(g); continue; }
      const sources = extractGenerationAssetIdsForGeneration(g, params);
      if (sources.includes(assetId)) out.push(g);
    }
    return out;
  },
};

// Localized source-asset extractor for in-store generations. Kept here to
// avoid a dependency from the store on feature-layer utils; the broader
// `extractGenerationAssetIds` in components/media covers API/raw shapes,
// but the store holds normalized GenerationModel — only a few fields on
// `canonicalParams` + `inputs` can carry source asset references.
function extractGenerationAssetIdsForGeneration(
  gen: GenerationModel,
  params: Record<string, unknown>,
): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  const push = (id: unknown) => {
    const n = typeof id === 'number' ? id : typeof id === 'string' ? Number(id) : NaN;
    if (!Number.isFinite(n) || seen.has(n)) return;
    seen.add(n);
    ids.push(n);
  };

  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

  arr((params as { source_asset_ids?: unknown }).source_asset_ids).forEach(push);
  push((params as { source_asset_id?: unknown }).source_asset_id);
  push((params as { original_video_id?: unknown }).original_video_id);

  const composition = (params as { composition_assets?: unknown }).composition_assets;
  arr(composition).forEach((entry) => {
    if (typeof entry === 'number' || typeof entry === 'string') { push(entry); return; }
    if (entry && typeof entry === 'object') {
      const e = entry as { asset_id?: unknown; assetId?: unknown; id?: unknown };
      push(e.asset_id ?? e.assetId ?? e.id);
    }
  });

  for (const input of gen.inputs ?? []) {
    if (!input || typeof input !== 'object') continue;
    const i = input as { asset_id?: unknown; assetId?: unknown; id?: unknown };
    push(i.asset_id ?? i.assetId ?? i.id);
  }

  return ids;
}

// ============================================================================
// Generation Status Helpers
// Re-exported from models for backwards compatibility
// ============================================================================

import { isTerminalStatus, isActiveStatus } from '../models';

/** Statuses that indicate the generation is still in progress */
export const ACTIVE_STATUSES: readonly GenerationStatus[] = ['pending', 'queued', 'processing'] as const;

/** Statuses that indicate the generation is done (won't change) */
export const TERMINAL_STATUSES: readonly GenerationStatus[] = ['completed', 'failed', 'cancelled'] as const;

/** Check if generation status is terminal (won't change anymore) */
export const isGenerationTerminal = isTerminalStatus;

/** Check if generation status is active (still in progress) */
export const isGenerationActive = isActiveStatus;
