import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

import { createBackendStorage, manuallyRehydrateStore, exposeStoreForDebugging, debugFlags } from '@lib/utils';
import { hmrSingleton } from '@lib/utils';

import type { OperationType } from '@/types/operations';

// Params that are persisted per-model (quality, resolution-related)
const PER_MODEL_PARAMS = new Set(['quality', 'resolution', 'output_resolution']);

// Params that should behave like global UI preferences (not per-operation).
// These are stored inside the same params object today, but should not be
// accidentally dropped when switching operations or hydrating other operation scopes.
export const GLOBAL_UI_PARAMS = new Set([
  'autoSwitchOperationType',
  'autoRetryEnabled',
  'autoRetryMaxAttempts',
]);

function pickGlobalUiParams(params: Record<string, any>): Record<string, any> {
  const picked: Record<string, any> = {};
  for (const key of GLOBAL_UI_PARAMS) {
    if (params[key] !== undefined) {
      picked[key] = params[key];
    }
  }
  return picked;
}

function mergeMissingGlobalUiParams(
  base: Record<string, any>,
  globals: Record<string, any>,
): Record<string, any> {
  if (!globals || Object.keys(globals).length === 0) return base;
  let changed = false;
  const next = { ...base };
  for (const [key, value] of Object.entries(globals)) {
    if (next[key] === undefined) {
      next[key] = value;
      changed = true;
    }
  }
  return changed ? next : base;
}

/**
 * Composite key for provider+operation scoped params.
 * Mirrors the promptMap pattern in generationSessionStore.
 */
function providerOpKey(providerId: string | undefined, operationType: OperationType): string {
  return `${providerId ?? '_auto'}::${operationType}`;
}

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
   * Per-provider+operation parameter storage.
   * Key is `${providerId}::${operationType}`, value is the params snapshot.
   * Used to save/restore params when switching providers within the same operation.
   */
  paramsPerProviderOp: Record<string, Record<string, any>>;

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
   * Save current params under old provider key, load from new provider key.
   * Call this when the user switches providers to prevent cross-provider
   * param leakage (model, account, quality, etc.).
   */
  onProviderChange: (oldProviderId: string | undefined, newProviderId: string | undefined) => void;

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
        paramsPerProviderOp: {},
        paramsPerModel: {},
        activeOperationType: 'image_to_video' as OperationType,
        showSettings: true,
        _hasHydrated: false,

        onProviderChange: (oldProviderId, newProviderId) => {
          const state = get();
          const globals = pickGlobalUiParams(state.params);
          const op = state.activeOperationType;

          // Save current params under old provider+operation key
          const oldKey = providerOpKey(oldProviderId, op);
          const updatedProviderOp = {
            ...state.paramsPerProviderOp,
            [oldKey]: state.params,
          };

          // Load params for new provider+operation (or empty → specs defaults will apply)
          const newKey = providerOpKey(newProviderId, op);
          const baseParams = updatedProviderOp[newKey] || {};
          const newParams = mergeMissingGlobalUiParams(baseParams, globals);

          set({
            params: newParams,
            paramsPerProviderOp: {
              ...updatedProviderOp,
              [newKey]: newParams,
            },
            paramsPerOperation: {
              ...state.paramsPerOperation,
              [op]: newParams,
            },
          });
        },

        setActiveOperationType: (operationType) => {
          const state = get();
          const globals = pickGlobalUiParams(state.params);
          // Save current params to the current operation before switching
          const updatedParamsPerOp = {
            ...state.paramsPerOperation,
            [state.activeOperationType]: state.params,
          };
          // Load params for the new operation (or empty if none saved)
          const baseParams = updatedParamsPerOp[operationType] || {};
          const newParams = mergeMissingGlobalUiParams(baseParams, globals);
          set({
            activeOperationType: operationType,
            paramsPerOperation: {
              ...updatedParamsPerOp,
              [operationType]: newParams,
            },
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

          // Preserve global UI params (these are not operation-specific)
          finalParams = mergeMissingGlobalUiParams(finalParams, pickGlobalUiParams(prev.params));

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
          paramsPerProviderOp: {},
          paramsPerModel: {},
          showSettings: true,
          _hasHydrated: true,
        }),
      }),
      {
        name: storageKey,
        storage: createJSONStorage(() => storage),
        partialize: (state) => {
          // Filter out transient params that should be derived from inputs, not persisted
          const TRANSIENT_PARAMS = [
            'source_asset_id',
            'source_asset_ids',
            'image_url',
            'image_urls',
            'video_url',
            'composition_assets',
          ];

          const filteredParamsPerOperation: typeof state.paramsPerOperation = {};
          for (const [opType, params] of Object.entries(state.paramsPerOperation)) {
            if (params) {
              const filtered = { ...params };
              for (const key of TRANSIENT_PARAMS) {
                delete filtered[key];
              }
              filteredParamsPerOperation[opType as keyof typeof filteredParamsPerOperation] = filtered;
            }
          }

          // Apply same transient filtering to paramsPerProviderOp
          const filteredParamsPerProviderOp: Record<string, Record<string, any>> = {};
          for (const [key, params] of Object.entries(state.paramsPerProviderOp)) {
            if (params) {
              const filtered = { ...params };
              for (const k of TRANSIENT_PARAMS) {
                delete filtered[k];
              }
              filteredParamsPerProviderOp[key] = filtered;
            }
          }

          return {
            paramsPerOperation: filteredParamsPerOperation,
            paramsPerProviderOp: filteredParamsPerProviderOp,
            paramsPerModel: state.paramsPerModel,
            activeOperationType: state.activeOperationType,
            showSettings: state.showSettings,
            // Note: params is derived from paramsPerOperation, _hasHydrated is not persisted
          };
        },
        version: 1,
        onRehydrateStorage: () => (state) => {
          // After rehydration, set params from paramsPerOperation for active operation
          if (state) {
            const activeParams = state.paramsPerOperation[state.activeOperationType] || {};
            // Backward-compat: if a global UI param exists in any other operation bucket,
            // merge it into the active operation params so feature toggles don't "flip back".
            const globals = { ...pickGlobalUiParams(activeParams) };
            if (Object.keys(globals).length < GLOBAL_UI_PARAMS.size) {
              for (const params of Object.values(state.paramsPerOperation)) {
                if (!params) continue;
                Object.assign(globals, pickGlobalUiParams(params));
                if (Object.keys(globals).length >= GLOBAL_UI_PARAMS.size) {
                  break;
                }
              }
            }

            const mergedActive = mergeMissingGlobalUiParams(activeParams, globals);
            state.paramsPerOperation[state.activeOperationType] = mergedActive;
            state.params = mergedActive;
            state._hasHydrated = true;
          }
        },
      }
    )
  );
}


export const useGenerationSettingsStore = hmrSingleton('generationSettingsStore', () =>
  createGenerationSettingsStore(STORAGE_KEY, createBackendStorage('generationSettings')),
);

// Manual rehydration workaround for async storage (see zustandPersistWorkaround.ts)
// hmrSingleton guard ensures this only runs once — not again on HMR re-evaluation.
hmrSingleton('generationSettingsStore:rehydration', () => {
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
    const globals = { ...pickGlobalUiParams(activeParams) };
    if (Object.keys(globals).length < GLOBAL_UI_PARAMS.size) {
      for (const params of Object.values(state.paramsPerOperation)) {
        if (!params) continue;
        Object.assign(globals, pickGlobalUiParams(params));
        if (Object.keys(globals).length >= GLOBAL_UI_PARAMS.size) {
          break;
        }
      }
    }
    const mergedActive = mergeMissingGlobalUiParams(activeParams, globals);
    useGenerationSettingsStore.setState({
      params: mergedActive,
      paramsPerOperation: {
        ...state.paramsPerOperation,
        [state.activeOperationType]: mergedActive,
      },
      _hasHydrated: true,
    });
    exposeStoreForDebugging(useGenerationSettingsStore, 'GenerationSettings');
    }, 50);
  }
  return true;
});
