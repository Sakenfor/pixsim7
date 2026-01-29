/**
 * Generation Preset Store
 *
 * Global store for managing named generation presets (sets of inputs).
 * Each preset bundles: prompt + input assets + generation params.
 *
 * This store is independent of any specific quickgen scope - any scope can
 * save to or load from this store.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { createBackendStorage, manuallyRehydrateStore, exposeStoreForDebugging } from '@lib/utils';

import type { OperationType } from '@/types/operations';

/**
 * Input reference stored in a preset.
 * We store asset IDs (not full AssetModel) since assets may change.
 */
export interface PresetInputRef {
  assetId: number;
  lockedTimestamp?: number;
}

/**
 * A generation preset - a named, saveable configuration.
 */
export interface GenerationPreset {
  id: string;
  name: string;
  /** Operation type this preset is for */
  operationType: OperationType;
  /** The prompt text */
  prompt: string;
  /** Input asset references */
  inputs: PresetInputRef[];
  /** Generation parameters (model, quality, duration, etc.) */
  params: Record<string, any>;
  /** Optional description */
  description?: string;
  /** ISO timestamp when created */
  createdAt: string;
  /** ISO timestamp when last updated */
  updatedAt: string;
  /** Whether this is a built-in default preset */
  isDefault?: boolean;
}

/**
 * Data needed to create/update a preset from current scope state.
 */
export interface PresetSnapshot {
  operationType: OperationType;
  prompt: string;
  inputs: PresetInputRef[];
  params: Record<string, any>;
}

export interface GenerationPresetState {
  /** All saved presets */
  presets: GenerationPreset[];

  /** Last used preset ID per operation type (for quick access) */
  lastUsedByOperation: Partial<Record<OperationType, string>>;
}

export interface GenerationPresetActions {
  /**
   * Save a new preset from a snapshot of current state.
   */
  savePreset: (name: string, snapshot: PresetSnapshot, description?: string) => GenerationPreset;

  /**
   * Update an existing preset with new snapshot data.
   */
  updatePreset: (id: string, snapshot: Partial<PresetSnapshot>) => void;

  /**
   * Rename a preset.
   */
  renamePreset: (id: string, name: string) => void;

  /**
   * Delete a preset (cannot delete default presets).
   */
  deletePreset: (id: string) => void;

  /**
   * Get a preset by ID.
   */
  getPreset: (id: string) => GenerationPreset | undefined;

  /**
   * Get all presets for a specific operation type.
   */
  getPresetsForOperation: (operationType: OperationType) => GenerationPreset[];

  /**
   * Get all presets (optionally filtered).
   */
  getAllPresets: (filter?: { operationType?: OperationType }) => GenerationPreset[];

  /**
   * Set the last used preset for an operation type.
   */
  setLastUsed: (operationType: OperationType, presetId: string | null) => void;

  /**
   * Get the last used preset for an operation type.
   */
  getLastUsed: (operationType: OperationType) => GenerationPreset | undefined;

  /**
   * Duplicate a preset with a new name.
   */
  duplicatePreset: (id: string, newName: string) => GenerationPreset | undefined;

  /**
   * Reset to initial state.
   */
  reset: () => void;
}

function createPresetId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const STORAGE_KEY = 'generation_presets_v1';

const DEFAULT_PRESETS: GenerationPreset[] = [];

export const useGenerationPresetStore = create<GenerationPresetState & GenerationPresetActions>()(
  persist(
    (set, get) => ({
      presets: DEFAULT_PRESETS,
      lastUsedByOperation: {},

      savePreset: (name, snapshot, description) => {
        const now = new Date().toISOString();
        const newPreset: GenerationPreset = {
          id: createPresetId(),
          name,
          operationType: snapshot.operationType,
          prompt: snapshot.prompt,
          inputs: snapshot.inputs,
          params: snapshot.params,
          description,
          createdAt: now,
          updatedAt: now,
          isDefault: false,
        };

        set((state) => ({
          presets: [...state.presets, newPreset],
          lastUsedByOperation: {
            ...state.lastUsedByOperation,
            [snapshot.operationType]: newPreset.id,
          },
        }));

        return newPreset;
      },

      updatePreset: (id, snapshot) => {
        set((state) => ({
          presets: state.presets.map((p) => {
            if (p.id !== id || p.isDefault) return p;
            return {
              ...p,
              ...(snapshot.operationType !== undefined && { operationType: snapshot.operationType }),
              ...(snapshot.prompt !== undefined && { prompt: snapshot.prompt }),
              ...(snapshot.inputs !== undefined && { inputs: snapshot.inputs }),
              ...(snapshot.params !== undefined && { params: snapshot.params }),
              updatedAt: new Date().toISOString(),
            };
          }),
        }));
      },

      renamePreset: (id, name) => {
        set((state) => ({
          presets: state.presets.map((p) => {
            if (p.id !== id || p.isDefault) return p;
            return { ...p, name, updatedAt: new Date().toISOString() };
          }),
        }));
      },

      deletePreset: (id) => {
        const preset = get().presets.find((p) => p.id === id);
        if (!preset || preset.isDefault) return;

        set((state) => {
          const remaining = state.presets.filter((p) => p.id !== id);
          const newLastUsed = { ...state.lastUsedByOperation };

          // Clear last used if this was it
          if (newLastUsed[preset.operationType] === id) {
            delete newLastUsed[preset.operationType];
          }

          return { presets: remaining, lastUsedByOperation: newLastUsed };
        });
      },

      getPreset: (id) => {
        return get().presets.find((p) => p.id === id);
      },

      getPresetsForOperation: (operationType) => {
        return get().presets.filter((p) => p.operationType === operationType);
      },

      getAllPresets: (filter) => {
        let presets = get().presets;
        if (filter?.operationType) {
          presets = presets.filter((p) => p.operationType === filter.operationType);
        }
        return presets;
      },

      setLastUsed: (operationType, presetId) => {
        set((state) => {
          const newLastUsed = { ...state.lastUsedByOperation };
          if (presetId) {
            newLastUsed[operationType] = presetId;
          } else {
            delete newLastUsed[operationType];
          }
          return { lastUsedByOperation: newLastUsed };
        });
      },

      getLastUsed: (operationType) => {
        const lastUsedId = get().lastUsedByOperation[operationType];
        if (!lastUsedId) return undefined;
        return get().presets.find((p) => p.id === lastUsedId);
      },

      duplicatePreset: (id, newName) => {
        const original = get().presets.find((p) => p.id === id);
        if (!original) return undefined;

        const now = new Date().toISOString();
        const duplicate: GenerationPreset = {
          ...original,
          id: createPresetId(),
          name: newName,
          createdAt: now,
          updatedAt: now,
          isDefault: false,
        };

        set((state) => ({
          presets: [...state.presets, duplicate],
        }));

        return duplicate;
      },

      reset: () => {
        set({
          presets: DEFAULT_PRESETS,
          lastUsedByOperation: {},
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => createBackendStorage('generationPresets')),
      version: 1,
      partialize: (state) => ({
        presets: state.presets,
        lastUsedByOperation: state.lastUsedByOperation,
      }),
    }
  )
);

// Manual rehydration workaround for async storage
if (typeof window !== 'undefined') {
  setTimeout(() => {
    manuallyRehydrateStore(
      useGenerationPresetStore,
      'generationPresets_local',
      'GenerationPresetStore'
    );
    exposeStoreForDebugging(useGenerationPresetStore, 'GenerationPresets');
  }, 50);
}
