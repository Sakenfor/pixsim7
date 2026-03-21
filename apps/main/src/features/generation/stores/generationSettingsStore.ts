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
  // ── Provider params ──
  params: Record<string, any>;
  paramsPerOperation: Partial<Record<OperationType, Record<string, any>>>;
  paramsPerProviderOp: Record<string, Record<string, any>>;
  paramsPerModel: Record<string, Record<string, any>>;

  // ── Session fields (merged from generationSessionStore) ──
  activeOperationType: OperationType;
  /** Alias for activeOperationType — session store consumers use this name */
  operationType: OperationType;
  prompt: string;
  promptMap: Record<string, string>;
  providerId?: string;
  generating: boolean;
  uiState: Record<string, any>;

  // ── UI ──
  showSettings: boolean;
  _hasHydrated: boolean;

  // ── Session actions ──
  setOperationType: (op: OperationType) => void;
  setPrompt: (value: string) => void;
  setProvider: (id?: string) => void;
  setGenerating: (value: boolean) => void;
  setUiState: (key: string, value: any) => void;

  // ── Params actions ──
  /** @deprecated Use setOperationType — kept as alias */
  setActiveOperationType: (operationType: OperationType) => void;
  onProviderChange: (oldProviderId: string | undefined, newProviderId: string | undefined) => void;
  setDynamicParams: (
    updater: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)
  ) => void;
  setParam: (name: string, value: any) => void;
  setShowSettings: (show: boolean) => void;
  toggleSettings: () => void;
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
        operationType: 'image_to_video' as OperationType,
        prompt: '',
        promptMap: {},
        providerId: undefined,
        generating: false,
        uiState: {},
        showSettings: true,
        _hasHydrated: false,

        // ── Session actions ──

        setOperationType: (operationType) => {
          const state = get();
          if (state.activeOperationType === operationType) return;

          // Save/restore prompt via promptMap
          const oldPK = providerOpKey(state.providerId, state.activeOperationType);
          const newPK = providerOpKey(state.providerId, operationType);
          const updatedPromptMap = { ...state.promptMap, [oldPK]: state.prompt };

          // Save/restore params via paramsPerOperation
          const globals = pickGlobalUiParams(state.params);
          const updatedParamsPerOp = {
            ...state.paramsPerOperation,
            [state.activeOperationType]: state.params,
          };
          const baseParams = updatedParamsPerOp[operationType] || {};
          const newParams = mergeMissingGlobalUiParams(baseParams, globals);
          if (!newParams.model && state.params.model) {
            newParams.model = state.params.model;
          }

          set({
            activeOperationType: operationType,
            operationType,
            prompt: updatedPromptMap[newPK] ?? '',
            promptMap: updatedPromptMap,
            params: newParams,
            paramsPerOperation: {
              ...updatedParamsPerOp,
              [operationType]: newParams,
            },
          });
        },

        setPrompt: (value) => {
          const state = get();
          if (state.prompt === value) return;
          const key = providerOpKey(state.providerId, state.activeOperationType);
          set({
            prompt: value,
            promptMap: { ...state.promptMap, [key]: value },
          });
        },

        setProvider: (id) => {
          const state = get();
          if (state.providerId === id) return;
          const op = state.activeOperationType;

          // Save/restore prompt via promptMap
          const oldPK = providerOpKey(state.providerId, op);
          const newPK = providerOpKey(id, op);
          const updatedPromptMap = { ...state.promptMap, [oldPK]: state.prompt };

          // Save/restore params via paramsPerProviderOp (was separate onProviderChange)
          const globals = pickGlobalUiParams(state.params);
          const oldParamKey = providerOpKey(state.providerId, op);
          const newParamKey = providerOpKey(id, op);
          const updatedProviderOp = {
            ...state.paramsPerProviderOp,
            [oldParamKey]: state.params,
          };
          const baseParams = updatedProviderOp[newParamKey] || {};
          const newParams = mergeMissingGlobalUiParams(baseParams, globals);

          set({
            providerId: id,
            prompt: updatedPromptMap[newPK] ?? state.prompt,
            promptMap: updatedPromptMap,
            params: newParams,
            paramsPerProviderOp: {
              ...updatedProviderOp,
              [newParamKey]: newParams,
            },
            paramsPerOperation: {
              ...state.paramsPerOperation,
              [op]: newParams,
            },
          });
        },

        setGenerating: (value) => {
          if (get().generating === value) return;
          set({ generating: value });
        },

        setUiState: (key, value) => {
          set({ uiState: { ...get().uiState, [key]: value } });
        },

        // ── Params actions ──

        /** @deprecated Use setProvider(newId) — it now handles param switching atomically */
        onProviderChange: (_oldProviderId, newProviderId) => {
          get().setProvider(newProviderId);
        },

        setActiveOperationType: (operationType) => get().setOperationType(operationType),

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
          prompt: '',
          promptMap: {},
          providerId: undefined,
          generating: false,
          uiState: {},
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
            // Session fields
            prompt: state.prompt,
            promptMap: state.promptMap,
            providerId: state.providerId,
            uiState: state.uiState,
            // Note: params is derived from paramsPerOperation; generating + _hasHydrated not persisted
          };
        },
        version: 2,
        migrate: (persistedState: any, version: number) => {
          if (version < 2) {
            // Absorb old session store data from localStorage
            const sessionKey = storageKey.replace('generation_settings', 'generation_session');
            try {
              const raw = localStorage.getItem(sessionKey);
              if (raw) {
                const parsed = JSON.parse(raw);
                const s = parsed?.state ?? {};
                if (s.prompt !== undefined) persistedState.prompt = s.prompt;
                if (s.promptMap) persistedState.promptMap = s.promptMap;
                if (s.providerId !== undefined) persistedState.providerId = s.providerId;
                if (s.uiState) persistedState.uiState = s.uiState;
                if (s.operationType) persistedState.activeOperationType = s.operationType;
              }
            } catch { /* best effort */ }
          }
          return persistedState;
        },
        onRehydrateStorage: () => (state) => {
          if (state) {
            const activeParams = state.paramsPerOperation[state.activeOperationType] || {};
            const globals = { ...pickGlobalUiParams(activeParams) };
            if (Object.keys(globals).length < GLOBAL_UI_PARAMS.size) {
              for (const params of Object.values(state.paramsPerOperation)) {
                if (!params) continue;
                Object.assign(globals, pickGlobalUiParams(params));
                if (Object.keys(globals).length >= GLOBAL_UI_PARAMS.size) break;
              }
            }
            const mergedActive = mergeMissingGlobalUiParams(activeParams, globals);
            state.paramsPerOperation[state.activeOperationType] = mergedActive;
            state.params = mergedActive;
            state.operationType = state.activeOperationType;
            state.promptMap = state.promptMap ?? {};
            state.uiState = state.uiState ?? {};
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

// Prune stale scoped generation stores from localStorage on startup.
// Runs once per day, removes orphaned scope keys beyond the retention limit.
hmrSingleton('generationScopes:prune', () => {
  if (typeof window !== 'undefined') {
    // Delay to avoid blocking startup
    setTimeout(() => {
      // Dynamic import to avoid circular dependency
      import('./generationScopeStores').then(({ pruneStaleGenerationStores }) => {
        const removed = pruneStaleGenerationStores();
        if (removed > 0) {
          console.debug(`[GenerationStores] Pruned ${removed} stale localStorage keys`);
        }
      });
    }, 2000);
  }
  return true;
});

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
      operationType: state.activeOperationType,
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
