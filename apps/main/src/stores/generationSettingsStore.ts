import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createBackendStorage } from '../lib/backendStorage';
import { manuallyRehydrateStore, exposeStoreForDebugging } from '../lib/zustandPersistWorkaround';
import { debugFlags } from '../lib/debugFlags';

export interface GenerationSettingsState {
  /**
   * Current dynamic generation parameters shared across UIs
   * (e.g., model, quality, duration, aspect_ratio, advanced flags).
   */
  params: Record<string, any>;

  /**
   * React-style setter for params. Accepts either a new object or an updater
   * function that receives the previous value and returns the next one.
   */
  setDynamicParams: (
    updater: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)
  ) => void;

  /**
   * Convenience helper to set a single parameter value.
   */
  setParam: (name: string, value: any) => void;

  /**
   * Reset all dynamic parameters.
   */
  reset: () => void;
}

const STORAGE_KEY = 'generation_settings_v1';

export const useGenerationSettingsStore = create<GenerationSettingsState>()(
  persist(
    (set, get) => ({
      params: {},

      setDynamicParams: (updater) =>
        set((prev) => ({
          params:
            typeof updater === 'function'
              ? (updater as (p: Record<string, any>) => Record<string, any>)(prev.params)
              : updater,
        })),

      setParam: (name, value) =>
        set((prev) => ({
          params: { ...prev.params, [name]: value },
        })),

      reset: () => set({ params: {} }),
    }),
    {
      name: STORAGE_KEY,
      storage: createBackendStorage('generationSettings'),
      // Only persist parameter values; methods are recreated by the store
      partialize: (state) => ({
        params: state.params,
      }),
      version: 1,
    }
  )
);

// Manual rehydration workaround for async storage (see zustandPersistWorkaround.ts)
if (typeof window !== 'undefined') {
  setTimeout(() => {
    debugFlags.log('rehydration', '[GenerationSettingsStore] Triggering manual rehydration');
    manuallyRehydrateStore(
      useGenerationSettingsStore,
      'generationSettings_local',
      'GenerationSettingsStore'
    );
    exposeStoreForDebugging(useGenerationSettingsStore, 'GenerationSettings');
  }, 50);
}
