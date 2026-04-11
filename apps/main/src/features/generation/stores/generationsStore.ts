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
};

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
