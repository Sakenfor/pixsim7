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
  prompt: string;
  providerId?: string;
  presetId?: string;
  presetParams: Record<string, any>;
  generating: boolean;
}

/**
 * Actions for generation session state.
 */
export interface GenerationSessionActions {
  setOperationType: (op: OperationType) => void;
  setPrompt: (value: string) => void;
  setProvider: (id?: string) => void;
  setPreset: (id?: string) => void;
  setPresetParams: (params: Record<string, any>) => void;
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
  providerId: undefined,
  presetId: undefined,
  presetParams: {},
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
          if (get().operationType === operationType) return;
          set({ operationType });
        },
        setPrompt: (value) => {
          if (get().prompt === value) return;
          set({ prompt: value });
        },
        setProvider: (id) => {
          if (get().providerId === id) return;
          set({ providerId: id });
        },
        setPreset: (id) => {
          if (get().presetId === id) return;
          set({ presetId: id });
        },
        setPresetParams: (params) => set({ presetParams: params }),
        setGenerating: (value) => {
          if (get().generating === value) return;
          set({ generating: value });
        },
        reset: () => set({ ...DEFAULT_SESSION_FIELDS }),
      }),
      {
        name: storageKey,
        storage: createJSONStorage(() => localStorage),
        version: 1,
        partialize: (state) => ({
          operationType: state.operationType,
          prompt: state.prompt,
          providerId: state.providerId,
          presetId: state.presetId,
          presetParams: state.presetParams,
        }),
      },
    ),
  );
}
