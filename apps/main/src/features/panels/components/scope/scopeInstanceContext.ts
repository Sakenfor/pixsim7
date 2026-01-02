import { createContext, useContext } from "react";

type ScopeInstanceMap = Record<string, string>;

/**
 * Context for scoped instance IDs keyed by scopeId.
 * This supports multiple active scopes without collisions.
 */
export const ScopeInstanceContext = createContext<ScopeInstanceMap | undefined>(undefined);

/**
 * Hook to get the current scope's instanceId.
 * If no scopeId is provided and multiple scopes exist, returns undefined.
 */
export function useScopeInstanceId(scopeId?: string): string | undefined {
  const scopes = useContext(ScopeInstanceContext);
  if (!scopes) return undefined;

  if (scopeId) return scopes[scopeId];

  const ids = Object.values(scopes);
  if (ids.length === 1) return ids[0];

  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[ScopeInstanceProvider] useScopeInstanceId called without scopeId while multiple scopes are active."
    );
  }

  return undefined;
}
