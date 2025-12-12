/**
 * Generations Store
 *
 * Zustand store for managing generation state.
 * Replaces the legacy jobsStore.
 */
import { create } from 'zustand';
import type { GenerationResponse } from '@/lib/api/generations';

export interface GenerationsState {
  // Generations map (by ID)
  generations: Map<number, GenerationResponse>;

  // Currently watched generation (for polling)
  watchingGenerationId: number | null;

  // Actions
  addOrUpdate: (generation: GenerationResponse) => void;
  remove: (id: number) => void;
  setWatchingGeneration: (id: number | null) => void;
  clear: () => void;
}

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
// Centralized status checking - import these instead of inline checks
// ============================================================================

/** All possible generation statuses */
export type GenerationStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

/** Statuses that indicate the generation is still in progress */
export const ACTIVE_STATUSES: readonly GenerationStatus[] = ['pending', 'queued', 'processing'] as const;

/** Statuses that indicate the generation is done (won't change) */
export const TERMINAL_STATUSES: readonly GenerationStatus[] = ['completed', 'failed', 'cancelled'] as const;

/** Check if generation status is terminal (won't change anymore) */
export function isGenerationTerminal(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

/** Check if generation status is active (still in progress) */
export function isGenerationActive(status: string): boolean {
  return status === 'pending' || status === 'queued' || status === 'processing';
}
