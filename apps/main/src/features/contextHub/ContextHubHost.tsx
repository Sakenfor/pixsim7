import type { ReactNode } from "react";
import { createContext, useContext, useRef } from "react";
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
