import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AssetFilters } from '../hooks/useAssets';

export interface FilterPreset {
  id: string;
  name: string;
  filters: AssetFilters;
  createdAt: number;
}

interface FilterPresetState {
  presets: FilterPreset[];
  activePresetId: string | null;

  savePreset: (name: string, filters: AssetFilters) => FilterPreset;
  updatePreset: (id: string, filters: AssetFilters) => void;
  renamePreset: (id: string, name: string) => void;
  deletePreset: (id: string) => void;
  setActivePreset: (id: string | null) => void;
}

export const useFilterPresetStore = create<FilterPresetState>()(
  persist(
    (set) => ({
      presets: [],
      activePresetId: null,

      savePreset: (name, filters) => {
        const preset: FilterPreset = {
          id: `preset_${Date.now()}`,
          name,
          filters: { ...filters },
          createdAt: Date.now(),
        };
        set((state) => ({
          presets: [...state.presets, preset],
          activePresetId: preset.id,
        }));
        return preset;
      },

      updatePreset: (id, filters) =>
        set((state) => ({
          presets: state.presets.map((p) =>
            p.id === id ? { ...p, filters: { ...filters } } : p,
          ),
        })),

      renamePreset: (id, name) =>
        set((state) => ({
          presets: state.presets.map((p) =>
            p.id === id ? { ...p, name } : p,
          ),
        })),

      deletePreset: (id) =>
        set((state) => ({
          presets: state.presets.filter((p) => p.id !== id),
          activePresetId: state.activePresetId === id ? null : state.activePresetId,
        })),

      setActivePreset: (id) => set({ activePresetId: id }),
    }),
    { name: 'pixsim7-filter-presets' },
  ),
);
