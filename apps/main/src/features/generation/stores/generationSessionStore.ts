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
  /** Current active prompt (derived from promptPerOperation when available) */
  prompt: string;
  /** Per-operation prompt storage - prompts are preserved when switching operations */
  promptPerOperation?: Partial<Record<OperationType, string>>;
  providerId?: string;
  generating: boolean;
}

/**
 * Actions for generation session state.
 */
export interface GenerationSessionActions {
  setOperationType: (op: OperationType) => void;
  setPrompt: (value: string) => void;
  setProvider: (id?: string) => void;
  setGenerating: (value: boolean) => void;
  reset: () => void;
}

/**
 * Full generation session state (fields + actions).
 */
export interface GenerationSessionState extends GenerationSessionFields, GenerationSessionActions {}

/**
 * Default values for generation session fields.
 * Exported for reuse by ControlCenterStore and other stores that implement GenerationSessionFields.
 */
export const DEFAULT_SESSION_FIELDS: GenerationSessionFields = {
  operationType: "text_to_video",
  prompt: "",
  promptPerOperation: {},
  providerId: undefined,
  generating: false,
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

export function createGenerationSessionStore(storageKey: string): GenerationSessionStoreHook {
  return create<GenerationSessionState>()(
    persist(
      (set, get) => ({
        ...DEFAULT_SESSION_FIELDS,
        setOperationType: (operationType) => {
          const state = get();
          if (state.operationType === operationType) return;

          // Save current prompt to promptPerOperation before switching
          const updatedPromptPerOp = {
            ...state.promptPerOperation,
            [state.operationType]: state.prompt,
          };

          // Load prompt for the new operation (or empty if none saved)
          const newPrompt = updatedPromptPerOp[operationType] ?? "";

          set({
            operationType,
            promptPerOperation: updatedPromptPerOp,
            prompt: newPrompt,
          });
        },
        setPrompt: (value) => {
          const state = get();
          if (state.prompt === value) return;

          // Also update promptPerOperation for current operation
          set({
            prompt: value,
            promptPerOperation: {
              ...state.promptPerOperation,
              [state.operationType]: value,
            },
          });
        },
        setProvider: (id) => {
          if (get().providerId === id) return;
          set({ providerId: id });
        },
        setGenerating: (value) => {
          if (get().generating === value) return;
          set({ generating: value });
        },
        reset: () => set({ ...DEFAULT_SESSION_FIELDS }),
      }),
      {
        name: storageKey,
        storage: createJSONStorage(() => localStorage),
        version: 4,
        partialize: (state) => {
          return {
            operationType: state.operationType,
            prompt: state.prompt,
            promptPerOperation: state.promptPerOperation,
            providerId: state.providerId,
          };
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

          return migrated;
        },
      },
    ),
  );
}
