import { create } from 'zustand';

/**
 * World Context Store
 *
 * Tracks the currently selected world and location context for the scene editor.
 * This allows scenes to be authored within a specific world/location context
 * while keeping the scene data itself world-agnostic.
 */

interface WorldContextState {
  // Currently selected world ID for scene editing context
  worldId: number | null;

  // Currently selected location ID for scene editing context
  locationId: number | null;

  // Actions
  setWorldId: (id: number | null) => void;
  setLocationId: (id: number | null) => void;
  setContext: (worldId: number | null, locationId: number | null) => void;
  clearContext: () => void;
}

export const useWorldContextStore = create<WorldContextState>((set) => ({
  worldId: null,
  locationId: null,

  setWorldId: (id) => set({ worldId: id }),
  setLocationId: (id) => set({ locationId: id }),
  setContext: (worldId, locationId) => set({ worldId, locationId }),
  clearContext: () => set({ worldId: null, locationId: null }),
}));
