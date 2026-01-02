import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { CapabilityKey } from "../types";

interface CapabilityOverride {
  preferredProviderId?: string;
}

interface ContextHubOverridesState {
  overrides: Record<CapabilityKey, CapabilityOverride | undefined>;
  hostOverrides: Record<string, Record<CapabilityKey, CapabilityOverride | undefined>>;
  setPreferredProvider: (key: CapabilityKey, providerId?: string, hostId?: string) => void;
  clearOverride: (key: CapabilityKey, hostId?: string) => void;
  getPreferredProviderId: (key: CapabilityKey, hostId?: string) => string | undefined;
}

type PersistedOverridesState = {
  overrides?: Record<string, CapabilityOverride | undefined>;
  hostOverrides?: Record<string, Record<string, CapabilityOverride | undefined>>;
};

export const useContextHubOverridesStore = create<ContextHubOverridesState>()(
  persist(
    (set, get) => ({
      overrides: {},
      hostOverrides: {},
      setPreferredProvider: (key, providerId, hostId) =>
        set((state) => {
          if (!hostId) {
            return {
              overrides: {
                ...state.overrides,
                [key]: providerId ? { preferredProviderId: providerId } : undefined,
              },
            };
          }

          const currentHost = state.hostOverrides[hostId] ?? {};
          const nextHost: Record<CapabilityKey, CapabilityOverride | undefined> = {
            ...currentHost,
          };
          if (providerId) {
            nextHost[key] = { preferredProviderId: providerId };
          } else {
            delete nextHost[key];
          }

          const hasOverrides = Object.values(nextHost).some(Boolean);
          const nextHostOverrides = { ...state.hostOverrides };
          if (hasOverrides) {
            nextHostOverrides[hostId] = nextHost;
          } else {
            delete nextHostOverrides[hostId];
          }

          return { hostOverrides: nextHostOverrides };
        }),
      clearOverride: (key, hostId) =>
        set((state) => {
          if (!hostId) {
            const next = { ...state.overrides };
            delete next[key];
            return { overrides: next };
          }

          const currentHost = state.hostOverrides[hostId];
          if (!currentHost || !(key in currentHost)) {
            return state;
          }

          const rest = { ...currentHost };
          delete rest[key];
          const hasOverrides = Object.values(rest).some(Boolean);
          const nextHostOverrides = { ...state.hostOverrides };
          if (hasOverrides) {
            nextHostOverrides[hostId] = rest;
          } else {
            delete nextHostOverrides[hostId];
          }

          return { hostOverrides: nextHostOverrides };
        }),
      getPreferredProviderId: (key, hostId) => {
        const state = get();
        if (hostId) {
          const hostOverride = state.hostOverrides?.[hostId];
          const hostPreferred = hostOverride?.[key]?.preferredProviderId;
          if (hostPreferred) {
            return hostPreferred;
          }
        }
        return state.overrides[key]?.preferredProviderId;
      },
    }),
    {
      name: "context_hub_overrides_v1",
      version: 2,
      migrate: (state: unknown) => {
        if (!state || typeof state !== "object") return state;
        const persisted = state as PersistedOverridesState;
        return {
          overrides: persisted.overrides ?? {},
          hostOverrides: persisted.hostOverrides ?? {},
        };
      },
    },
  ),
);
