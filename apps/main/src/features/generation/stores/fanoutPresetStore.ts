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
const LEGACY_MIGRATION_FLAG_KEY = 'fanout_presets_migrated_from_scope_each_v1';

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
    migrateLegacyScopedEachCustomPresets();
    exposeStoreForDebugging(useFanoutPresetStore, 'FanoutPresets');
  }, 50);
}

function migrateLegacyScopedEachCustomPresets(): void {
  try {
    if (localStorage.getItem(LEGACY_MIGRATION_FLAG_KEY) === '1') return;

    const imported: FanoutPreset[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('generation_session:')) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }

      const rec = parsed as Record<string, unknown> | null;
      const state = (rec?.state && typeof rec.state === 'object')
        ? (rec.state as Record<string, unknown>)
        : null;
      const uiState = (state?.uiState && typeof state.uiState === 'object')
        ? (state.uiState as Record<string, unknown>)
        : null;
      const legacy = uiState?.eachCustomPresets;
      if (!Array.isArray(legacy) || legacy.length === 0) continue;

      for (const item of legacy) {
        if (!item || typeof item !== 'object') continue;
        const src = item as Record<string, unknown>;
        if (typeof src.label !== 'string' || !src.label.trim()) continue;
        try {
          const normalized = normalizeFanoutRunOptions(src as Partial<FanoutRunOptions>);
          const preset: FanoutPreset = {
            id: createFanoutPresetId(),
            label: src.label.trim(),
            description: typeof src.description === 'string' ? src.description : undefined,
            ...normalized,
          };
          const signature = JSON.stringify({
            label: preset.label,
            description: preset.description ?? '',
            strategy: preset.strategy,
            setId: preset.setId ?? null,
            repeatCount: preset.repeatCount,
            setPickMode: preset.setPickMode,
            setPickCount: preset.setPickCount ?? null,
            seed: preset.seed ?? null,
            onError: preset.onError,
            dispatch: preset.dispatch,
            executionMode: preset.executionMode,
            reusePreviousOutputAsInput: preset.reusePreviousOutputAsInput,
          });
          if (seen.has(signature)) continue;
          seen.add(signature);
          imported.push(preset);
        } catch {
          // Ignore malformed legacy presets
        }
      }

      // Clear legacy per-scope field to avoid stale drift.
      try {
        if (uiState && Object.prototype.hasOwnProperty.call(uiState, 'eachCustomPresets')) {
          const nextUiState = { ...uiState };
          delete nextUiState.eachCustomPresets;
          const nextState = { ...(state ?? {}), uiState: nextUiState };
          localStorage.setItem(key, JSON.stringify({ ...(rec ?? {}), state: nextState }));
        }
      } catch {
        // Non-fatal; migration still proceeds.
      }
    }

    if (imported.length > 0) {
      useFanoutPresetStore.setState((state) => {
        const merged = [...state.presets];
        const existingSignatures = new Set(
          merged.map((p) =>
            JSON.stringify({
              label: p.label,
              description: p.description ?? '',
              strategy: p.strategy,
              setId: p.setId ?? null,
              repeatCount: p.repeatCount,
              setPickMode: p.setPickMode,
              setPickCount: p.setPickCount ?? null,
              seed: p.seed ?? null,
              onError: p.onError,
              dispatch: p.dispatch,
              executionMode: p.executionMode,
              reusePreviousOutputAsInput: p.reusePreviousOutputAsInput,
            }),
          ),
        );
        for (const preset of imported) {
          const sig = JSON.stringify({
            label: preset.label,
            description: preset.description ?? '',
            strategy: preset.strategy,
            setId: preset.setId ?? null,
            repeatCount: preset.repeatCount,
            setPickMode: preset.setPickMode,
            setPickCount: preset.setPickCount ?? null,
            seed: preset.seed ?? null,
            onError: preset.onError,
            dispatch: preset.dispatch,
            executionMode: preset.executionMode,
            reusePreviousOutputAsInput: preset.reusePreviousOutputAsInput,
          });
          if (existingSignatures.has(sig)) continue;
          existingSignatures.add(sig);
          merged.push(preset);
        }
        return { presets: merged };
      });
    }

    localStorage.setItem(LEGACY_MIGRATION_FLAG_KEY, '1');
  } catch {
    // Don't break the app on migration failure.
  }
}
