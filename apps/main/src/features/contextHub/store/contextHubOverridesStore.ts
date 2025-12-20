import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CapabilityKey } from "../types";

interface CapabilityOverride {
  preferredProviderId?: string;
}

interface ContextHubOverridesState {
  overrides: Record<CapabilityKey, CapabilityOverride | undefined>;
  setPreferredProvider: (key: CapabilityKey, providerId?: string) => void;
  clearOverride: (key: CapabilityKey) => void;
}

export const useContextHubOverridesStore = create<ContextHubOverridesState>()(
  persist(
    (set) => ({
      overrides: {},
      setPreferredProvider: (key, providerId) =>
        set((state) => ({
          overrides: {
            ...state.overrides,
            [key]: providerId ? { preferredProviderId: providerId } : undefined,
          },
        })),
      clearOverride: (key) =>
        set((state) => {
          const next = { ...state.overrides };
          delete next[key];
          return { overrides: next };
        }),
    }),
    {
      name: "context_hub_overrides_v1",
    },
  ),
);
