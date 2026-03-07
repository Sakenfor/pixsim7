import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { OperationType } from "@/types/operations";

/**
 * Core generation session fields - shared between GenerationSessionStore and ControlCenterStore.
 * This interface defines the minimal contract for generation session state.
 *
 * Both stores implement this interface:
 * - GenerationSessionStore: Scoped stores for embedded generation panels
 * - ControlCenterStore: Global store (extends with UI state like dockPosition, mode, etc.)
 *
 * useGenerationScopeStores() provides unified access via this interface.
 */
export interface GenerationSessionFields {
  operationType: OperationType;
  /** Current active prompt */
  prompt: string;
  /** Per provider+operation prompt storage — composite key `${providerId}::${operationType}` */
  promptMap?: Record<string, string>;
  providerId?: string;
  generating: boolean;
  /** Generic bag for persisted UI state (burst count, combination strategy, etc.) */
  uiState: Record<string, any>;
}

/**
 * Actions for generation session state.
 */
export interface GenerationSessionActions {
  setOperationType: (op: OperationType) => void;
  setPrompt: (value: string) => void;
  setProvider: (id?: string) => void;
  setGenerating: (value: boolean) => void;
  setUiState: (key: string, value: any) => void;
  reset: () => void;
}

/**
 * Full generation session state (fields + actions).
 */
export interface GenerationSessionState extends GenerationSessionFields, GenerationSessionActions {
  /** Whether the store has been hydrated from persistence. */
  _hasHydrated: boolean;
}

/**
 * Default values for generation session fields.
 * Exported for reuse by ControlCenterStore and other stores that implement GenerationSessionFields.
 */
export const DEFAULT_SESSION_FIELDS: GenerationSessionFields = {
  operationType: "image_to_video",
  prompt: "",
  promptMap: {},
  providerId: undefined,
  generating: false,
  uiState: {},
};

export type GenerationSessionStoreHook = (<T>(
  selector: (state: GenerationSessionState) => T
) => T) & {
  getState: () => GenerationSessionState;
  setState: (
    partial: GenerationSessionState | Partial<GenerationSessionState> | ((state: GenerationSessionState) => GenerationSessionState | Partial<GenerationSessionState>),
    replace?: boolean,
  ) => void;
};

function promptKey(providerId: string | undefined, operationType: OperationType): string {
  return `${providerId ?? '_auto'}::${operationType}`;
}

export function createGenerationSessionStore(storageKey: string): GenerationSessionStoreHook {
  return create<GenerationSessionState>()(
    persist(
      (set, get) => ({
        ...DEFAULT_SESSION_FIELDS,
        _hasHydrated: false,
        setOperationType: (operationType) => {
          const state = get();
          if (state.operationType === operationType) return;

          const oldKey = promptKey(state.providerId, state.operationType);
          const newKey = promptKey(state.providerId, operationType);
          const updatedMap = { ...state.promptMap, [oldKey]: state.prompt };

          set({
            operationType,
            promptMap: updatedMap,
            prompt: updatedMap[newKey] ?? "",
          });
        },
        setPrompt: (value) => {
          const state = get();
          if (state.prompt === value) return;

          const key = promptKey(state.providerId, state.operationType);
          set({
            prompt: value,
            promptMap: { ...state.promptMap, [key]: value },
          });
        },
        setProvider: (id) => {
          const state = get();
          if (state.providerId === id) return;

          const oldKey = promptKey(state.providerId, state.operationType);
          const newKey = promptKey(id, state.operationType);
          const updatedMap = { ...state.promptMap, [oldKey]: state.prompt };

          set({
            providerId: id,
            promptMap: updatedMap,
            prompt: updatedMap[newKey] ?? state.prompt,
          });
        },
        setGenerating: (value) => {
          if (get().generating === value) return;
          set({ generating: value });
        },
        setUiState: (key, value) => {
          set({ uiState: { ...get().uiState, [key]: value } });
        },
        reset: () => set({ ...DEFAULT_SESSION_FIELDS }),
      }),
      {
        name: storageKey,
        storage: createJSONStorage(() => localStorage),
        version: 6,
        partialize: (state) => {
          return {
            operationType: state.operationType,
            prompt: state.prompt,
            promptMap: state.promptMap,
            providerId: state.providerId,
            uiState: state.uiState,
          };
        },
        onRehydrateStorage: () => (state) => {
          if (state) {
            state._hasHydrated = true;
          }
        },
        migrate: (persistedState: any, version: number) => {
          const migrated = { ...persistedState };

          // Migrate from version 1 to 2: add promptPerOperation
          if (version < 2) {
            migrated.promptPerOperation = migrated.promptPerOperation || {};
            // Initialize current operation's prompt in promptPerOperation
            if (migrated.prompt && migrated.operationType) {
              migrated.promptPerOperation[migrated.operationType] = migrated.prompt;
            }
          }

          // Migrate to version 4: remove defunct preset fields
          if (version < 4) {
            delete migrated.presetId;
            delete migrated.presetParams;
          }

          // Migrate to version 5: add uiState bag
          if (version < 5) {
            migrated.uiState = migrated.uiState ?? {};
          }

          // Migrate to version 6: collapse promptPerOperation into composite promptMap
          if (version < 6) {
            const promptMap: Record<string, string> = {};
            const pid = migrated.providerId ?? '_auto';
            if (migrated.promptPerOperation) {
              for (const [op, prompt] of Object.entries(migrated.promptPerOperation)) {
                if (typeof prompt === 'string') {
                  promptMap[`${pid}::${op}`] = prompt;
                }
              }
            }
            migrated.promptMap = promptMap;
            delete migrated.promptPerOperation;
            delete migrated.promptPerProvider;
          }

          return migrated;
        },
      },
    ),
  );
}
