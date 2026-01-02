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
