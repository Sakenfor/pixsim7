/**
 * Generations Store
 *
 * Zustand store for managing generation state.
 * Replaces the legacy jobsStore.
 */
import { create } from 'zustand';
import type { GenerationResponse } from '../lib/api/generations';

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

// Helper function to check if generation is in terminal state
export function isGenerationTerminal(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}
