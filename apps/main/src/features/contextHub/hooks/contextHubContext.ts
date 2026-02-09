import { createContext, useContext } from "react";

import type { CapabilityRegistry } from "../types";

export interface ContextHubState {
  registry: CapabilityRegistry;
  parent: ContextHubState | null;
  hostId?: string;
}

export const ContextHubContext = createContext<ContextHubState | null>(null);

export function useContextHubState(): ContextHubState | null {
  return useContext(ContextHubContext);
}

/**
 * Returns the hostId of the nearest ContextHubHost.
 * Used for consumption tracking.
 */
export function useContextHubHostId(): string | undefined {
  const state = useContext(ContextHubContext);
  return state?.hostId;
}

/**
 * Walk the parent chain and collect all registries (nearest first).
 */
export function getRegistryChain(root: ContextHubState | null): CapabilityRegistry[] {
  const registries: CapabilityRegistry[] = [];
  let current = root;
  while (current) {
    registries.push(current.registry);
    current = current.parent;
  }
  return registries;
}

/**
 * Walk to the root of the context hub hierarchy.
 * Returns null if the starting state is null.
 */
export function getRootHub(state: ContextHubState | null): ContextHubState | null {
  let current = state;
  while (current?.parent) {
    current = current.parent;
  }
  return current;
}
