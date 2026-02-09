import type { ReactNode } from "react";
import { useContext, useEffect, useMemo, useRef } from "react";

import { createCapabilityRegistry } from "../domain/registry";
import { ContextHubContext, getRootHub, type ContextHubState } from "../hooks/contextHubContext";
import type { CapabilityRegistry } from "../types";

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
      const root = getRootHub(parent);
      root?.registry.clearConsumptionForHost(hostId);
    };
  }, [hostId, parent]);

  const state = useMemo<ContextHubState>(
    () => ({
      registry: registryRef.current!,
      parent,
      hostId,
    }),
    [parent, hostId],
  );

  return (
    <ContextHubContext.Provider value={state}>
      {children}
    </ContextHubContext.Provider>
  );
}
