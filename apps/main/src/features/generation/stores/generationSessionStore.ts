import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { OperationType } from "@/types/operations";

export interface GenerationSessionState {
  operationType: OperationType;
  prompt: string;
  providerId?: string;
  presetId?: string;
  presetParams: Record<string, any>;
  generating: boolean;

  setOperationType: (op: OperationType) => void;
  setPrompt: (value: string) => void;
  setProvider: (id?: string) => void;
  setPreset: (id?: string) => void;
  setPresetParams: (params: Record<string, any>) => void;
  setGenerating: (value: boolean) => void;
  reset: () => void;
}

const DEFAULT_STATE: Omit<
  GenerationSessionState,
  | "setOperationType"
  | "setPrompt"
  | "setProvider"
  | "setPreset"
  | "setPresetParams"
  | "setGenerating"
  | "reset"
> = {
  operationType: "text_to_video",
  prompt: "",
  providerId: undefined,
  presetId: undefined,
  presetParams: {},
  generating: false,
};

export type GenerationSessionStoreHook = <T>(
  selector: (state: GenerationSessionState) => T
) => T;

export function createGenerationSessionStore(storageKey: string): GenerationSessionStoreHook {
  return create<GenerationSessionState>()(
    persist(
      (set, get) => ({
        ...DEFAULT_STATE,
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
        reset: () => set({ ...DEFAULT_STATE }),
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
