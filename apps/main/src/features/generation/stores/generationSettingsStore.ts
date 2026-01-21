import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

import { createBackendStorage, manuallyRehydrateStore, exposeStoreForDebugging, debugFlags } from '@lib/utils';

import type { OperationType } from '@/types/operations';

// Params that are persisted per-model (quality, resolution-related)
const PER_MODEL_PARAMS = new Set(['quality', 'resolution', 'output_resolution']);

export interface GenerationSettingsState {
  /**
   * Current dynamic generation parameters shared across UIs
   * (e.g., model, quality, duration, aspect_ratio, advanced flags).
   * This is the "active" params object, derived from paramsPerOperation.
   */
  params: Record<string, any>;

  /**
   * Per-operation-type parameter storage.
   * Each operation type has its own params that persist independently.
   */
  paramsPerOperation: Partial<Record<OperationType, Record<string, any>>>;

  /**
   * Per-model parameter storage for quality/resolution settings.
   * Key is model name, value is { quality, resolution, output_resolution }.
   */
  paramsPerModel: Record<string, Record<string, any>>;

  /**
   * Currently active operation type for params resolution.
   */
  activeOperationType: OperationType;

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
   * Set the active operation type and switch to its params.
   */
  setActiveOperationType: (operationType: OperationType) => void;

  /**
   * React-style setter for params. Accepts either a new object or an updater
   * function that receives the previous value and returns the next one.
   * Updates both params and paramsPerOperation for the active operation.
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

const STORAGE_KEY = 'generation_settings_v4';

export function createGenerationSettingsStore(
  storageKey: string,
  storage: StateStorage,
) {
  return create<GenerationSettingsState>()(
    persist(
      (set, get) => ({
        params: {},
        paramsPerOperation: {},
        paramsPerModel: {},
        activeOperationType: 'image_to_video' as OperationType,
        showSettings: true,
        _hasHydrated: false,

        setActiveOperationType: (operationType) => {
          const state = get();
          // Save current params to the current operation before switching
          const updatedParamsPerOp = {
            ...state.paramsPerOperation,
            [state.activeOperationType]: state.params,
          };
          // Load params for the new operation (or empty if none saved)
          const newParams = updatedParamsPerOp[operationType] || {};
          set({
            activeOperationType: operationType,
            paramsPerOperation: updatedParamsPerOp,
            params: newParams,
          });
        },

        setDynamicParams: (updater) =>
          set((prev) => {
            const newParams = typeof updater === 'function'
              ? (updater as (p: Record<string, any>) => Record<string, any>)(prev.params)
              : updater;

          // Check if model changed - if so, load per-model params
          const prevModel = prev.params.model;
          const newModel = newParams.model;
          let finalParams = newParams;
          let updatedParamsPerModel = prev.paramsPerModel;

          if (newModel && prevModel !== newModel) {
            // Save per-model params for the old model
            if (prevModel) {
              const perModelToSave: Record<string, any> = {};
              for (const key of PER_MODEL_PARAMS) {
                if (prev.params[key] !== undefined) {
                  perModelToSave[key] = prev.params[key];
                }
              }
              if (Object.keys(perModelToSave).length > 0) {
                updatedParamsPerModel = {
                  ...updatedParamsPerModel,
                  [prevModel]: perModelToSave,
                };
              }
            }

            // Load per-model params for the new model
            const savedModelParams = updatedParamsPerModel[newModel];
            if (savedModelParams) {
              finalParams = { ...newParams };
              for (const key of PER_MODEL_PARAMS) {
                if (savedModelParams[key] !== undefined) {
                  finalParams[key] = savedModelParams[key];
                }
              }
            }
          }

          // Also save per-model params when quality/resolution changes
          if (finalParams.model) {
            const perModelToSave: Record<string, any> = {};
            for (const key of PER_MODEL_PARAMS) {
              if (finalParams[key] !== undefined) {
                perModelToSave[key] = finalParams[key];
              }
            }
            if (Object.keys(perModelToSave).length > 0) {
              updatedParamsPerModel = {
                ...updatedParamsPerModel,
                [finalParams.model]: perModelToSave,
              };
            }
          }

            return {
              params: finalParams,
              paramsPerOperation: {
                ...prev.paramsPerOperation,
                [prev.activeOperationType]: finalParams,
              },
              paramsPerModel: updatedParamsPerModel,
            };
          }),

        setParam: (name, value) =>
          set((prev) => {
            const newParams = { ...prev.params, [name]: value };
            let updatedParamsPerModel = prev.paramsPerModel;

          // If model is changing, handle per-model param save/load
          if (name === 'model' && value && value !== prev.params.model) {
            // Save per-model params for the old model
            if (prev.params.model) {
              const perModelToSave: Record<string, any> = {};
              for (const key of PER_MODEL_PARAMS) {
                if (prev.params[key] !== undefined) {
                  perModelToSave[key] = prev.params[key];
                }
              }
              if (Object.keys(perModelToSave).length > 0) {
                updatedParamsPerModel = {
                  ...updatedParamsPerModel,
                  [prev.params.model]: perModelToSave,
                };
              }
            }

            // Load per-model params for the new model
            const savedModelParams = updatedParamsPerModel[value];
            if (savedModelParams) {
              for (const key of PER_MODEL_PARAMS) {
                if (savedModelParams[key] !== undefined) {
                  newParams[key] = savedModelParams[key];
                }
              }
            }
          }

          // Save per-model params when quality/resolution changes
          if (PER_MODEL_PARAMS.has(name) && newParams.model) {
            const perModelToSave: Record<string, any> = {};
            for (const key of PER_MODEL_PARAMS) {
              if (newParams[key] !== undefined) {
                perModelToSave[key] = newParams[key];
              }
            }
            updatedParamsPerModel = {
              ...updatedParamsPerModel,
              [newParams.model]: perModelToSave,
            };
          }

            return {
              params: newParams,
              paramsPerOperation: {
                ...prev.paramsPerOperation,
                [prev.activeOperationType]: newParams,
              },
              paramsPerModel: updatedParamsPerModel,
            };
          }),

        setShowSettings: (show) => set({ showSettings: show }),
        toggleSettings: () => set((prev) => ({ showSettings: !prev.showSettings })),

        reset: () => set({
          params: {},
          paramsPerOperation: {},
          paramsPerModel: {},
          showSettings: true,
          _hasHydrated: true,
        }),
      }),
      {
        name: storageKey,
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({
          paramsPerOperation: state.paramsPerOperation,
          paramsPerModel: state.paramsPerModel,
          activeOperationType: state.activeOperationType,
          showSettings: state.showSettings,
          // Note: params is derived from paramsPerOperation, _hasHydrated is not persisted
        }),
        version: 1,
        onRehydrateStorage: () => (state) => {
          // After rehydration, set params from paramsPerOperation for active operation
          if (state) {
            const activeParams = state.paramsPerOperation[state.activeOperationType] || {};
            state.params = activeParams;
          }
        },
      }
    )
  );
}

export const useGenerationSettingsStore = createGenerationSettingsStore(
  STORAGE_KEY,
  createBackendStorage('generationSettings'),
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
    // After rehydration, derive params from paramsPerOperation
    const state = useGenerationSettingsStore.getState();
    const activeParams = state.paramsPerOperation[state.activeOperationType] || {};
    useGenerationSettingsStore.setState({
      params: activeParams,
      _hasHydrated: true,
    });
    exposeStoreForDebugging(useGenerationSettingsStore, 'GenerationSettings');
  }, 50);
}
