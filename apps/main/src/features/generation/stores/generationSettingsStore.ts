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
   * Whether the settings bar is expanded/visible.
   */
  showSettings: boolean;

  /**
   * Whether the store has been hydrated from persistence.
   * Use this to avoid overwriting persisted values with defaults.
   */
  _hasHydrated: boolean;

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
   * Toggle or set settings visibility.
   */
  setShowSettings: (show: boolean) => void;
  toggleSettings: () => void;

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
      showSettings: true,
      _hasHydrated: false,

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

      setShowSettings: (show) => set({ showSettings: show }),
      toggleSettings: () => set((prev) => ({ showSettings: !prev.showSettings })),

      reset: () => set({ params: {}, showSettings: true, _hasHydrated: true }),
    }),
    {
      name: STORAGE_KEY,
      storage: createBackendStorage('generationSettings'),
      partialize: (state) => ({
        params: state.params,
        showSettings: state.showSettings,
        // Note: _hasHydrated is intentionally not persisted
      }),
      version: 2,
      migrate: (persisted: any, version: number) => {
        if (version < 2) {
          return { ...persisted, showSettings: true };
        }
        return persisted;
      },
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
    // Mark hydration complete so effects don't overwrite persisted values
    useGenerationSettingsStore.setState({ _hasHydrated: true });
    exposeStoreForDebugging(useGenerationSettingsStore, 'GenerationSettings');
  }, 50);
}
