import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createBackendStorage, exposeStoreForDebugging, manuallyRehydrateStore } from '@lib/utils';

import {
  normalizeFanoutRunOptions,
  type FanoutPreset,
  type FanoutRunOptions,
} from '../lib/fanoutPresets';

interface FanoutPresetState {
  presets: FanoutPreset[];
}

interface FanoutPresetActions {
  savePreset: (input: { label: string; options: FanoutRunOptions; description?: string }) => FanoutPreset;
  updatePreset: (id: string, patch: Partial<Omit<FanoutPreset, 'id'>>) => void;
  deletePreset: (id: string) => void;
  duplicatePreset: (id: string, label?: string) => FanoutPreset | undefined;
  reset: () => void;
}

const STORAGE_KEY = 'fanout_presets_v1';
const DEFAULT_PRESETS: FanoutPreset[] = [];

function createFanoutPresetId(): string {
  return `fanout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useFanoutPresetStore = create<FanoutPresetState & FanoutPresetActions>()(
  persist(
    (set, get) => ({
      presets: DEFAULT_PRESETS,

      savePreset: ({ label, options, description }) => {
        const preset: FanoutPreset = {
          id: createFanoutPresetId(),
          label: label.trim(),
          description: description?.trim() || undefined,
          ...normalizeFanoutRunOptions(options),
        };
        set((state) => ({ presets: [...state.presets, preset] }));
        return preset;
      },

      updatePreset: (id, patch) => {
        set((state) => ({
          presets: state.presets.map((p) => {
            if (p.id !== id) return p;
            const merged = normalizeFanoutRunOptions({
              ...p,
              ...patch,
            });
            return {
              ...p,
              ...merged,
              label: typeof patch.label === 'string' ? patch.label : p.label,
              description:
                patch.description === undefined ? p.description : patch.description || undefined,
            };
          }),
        }));
      },

      deletePreset: (id) => {
        set((state) => ({ presets: state.presets.filter((p) => p.id !== id) }));
      },

      duplicatePreset: (id, label) => {
        const original = get().presets.find((p) => p.id === id);
        if (!original) return undefined;
        const duplicated: FanoutPreset = {
          ...original,
          id: createFanoutPresetId(),
          label: label?.trim() || `${original.label} Copy`,
        };
        set((state) => ({ presets: [...state.presets, duplicated] }));
        return duplicated;
      },

      reset: () => set({ presets: DEFAULT_PRESETS }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => createBackendStorage('fanoutPresets')),
      version: 1,
      partialize: (state) => ({ presets: state.presets }),
    },
  ),
);

if (typeof window !== 'undefined') {
  setTimeout(() => {
    manuallyRehydrateStore(useFanoutPresetStore, 'fanoutPresets_local', 'FanoutPresetStore');
    exposeStoreForDebugging(useFanoutPresetStore, 'FanoutPresets');
  }, 50);
}
