import { create } from 'zustand';

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

export const useGenerationSettingsStore = create<GenerationSettingsState>((set) => ({
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
}));

