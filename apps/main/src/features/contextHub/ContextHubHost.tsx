import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef } from "react";
import { createCapabilityRegistry } from "./registry";
import type { CapabilityRegistry } from "./types";

export interface ContextHubState {
  registry: CapabilityRegistry;
  parent: ContextHubState | null;
  hostId?: string;
}

const ContextHubContext = createContext<ContextHubState | null>(null);

export interface ContextHubHostProps {
  children: ReactNode;
  hostId?: string;
}

export function ContextHubHost({ children, hostId }: ContextHubHostProps) {
  const parent = useContext(ContextHubContext);
  const registryRef = useRef<CapabilityRegistry | null>(null);

  if (!registryRef.current) {
    registryRef.current = createCapabilityRegistry();
  }

  // Clean up consumption records when this host unmounts
  useEffect(() => {
    if (!hostId || !parent) return;
    return () => {
      // Consumption is recorded at root level, so clear from there
      let root = parent;
      while (root.parent) {
        root = root.parent;
      }
      root.registry.clearConsumptionForHost(hostId);
    };
  }, [hostId, parent]);

  const state: ContextHubState = {
    registry: registryRef.current,
    parent,
    hostId,
  };

  return (
    <ContextHubContext.Provider value={state}>
      {children}
    </ContextHubContext.Provider>
  );
}

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
