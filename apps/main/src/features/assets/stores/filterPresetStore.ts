import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AssetFilters } from '../hooks/useAssets';

export interface FilterPreset {
  id: string;
  name: string;
  filters: AssetFilters;
  createdAt: number;
}

// Key used in `pagePerPreset` for the implicit "All" tab (no active preset).
export const ALL_PRESETS_PAGE_KEY = '__all__';

interface FilterPresetState {
  presets: FilterPreset[];
  activePresetId: string | null;
  pagePerPreset: Record<string, number>;

  savePreset: (name: string, filters: AssetFilters) => FilterPreset;
  updatePreset: (id: string, filters: AssetFilters) => void;
  renamePreset: (id: string, name: string) => void;
  deletePreset: (id: string) => void;
  setActivePreset: (id: string | null) => void;
  rememberPage: (presetId: string | null, page: number) => void;
  getRememberedPage: (presetId: string | null) => number;
}

const pageKeyFor = (presetId: string | null) => presetId ?? ALL_PRESETS_PAGE_KEY;

export const useFilterPresetStore = create<FilterPresetState>()(
  persist(
    (set, get) => ({
      presets: [],
      activePresetId: null,
      pagePerPreset: {},

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
        set((state) => {
          const nextPages = { ...state.pagePerPreset };
          delete nextPages[id];
          return {
            presets: state.presets.filter((p) => p.id !== id),
            activePresetId: state.activePresetId === id ? null : state.activePresetId,
            pagePerPreset: nextPages,
          };
        }),

      setActivePreset: (id) => set({ activePresetId: id }),

      rememberPage: (presetId, page) =>
        set((state) => {
          const key = pageKeyFor(presetId);
          const next = { ...state.pagePerPreset };
          if (page > 1) {
            if (next[key] === page) return state;
            next[key] = page;
          } else {
            if (next[key] === undefined) return state;
            delete next[key];
          }
          return { pagePerPreset: next };
        }),

      getRememberedPage: (presetId) => get().pagePerPreset[pageKeyFor(presetId)] ?? 1,
    }),
    { name: 'pixsim7-filter-presets' },
  ),
);
