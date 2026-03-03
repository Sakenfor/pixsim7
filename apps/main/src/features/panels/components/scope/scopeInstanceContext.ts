import { useContext } from "react";

import { createHmrSafeContext } from "@lib/utils";

type ScopeInstanceMap = Record<string, string>;

/**
 * Context for scoped instance IDs keyed by scopeId.
 * This supports multiple active scopes without collisions.
 */
export const ScopeInstanceContext = createHmrSafeContext<ScopeInstanceMap | undefined>('scopeInstance', undefined);

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

  if (import.meta.env.DEV) {
    console.warn(
      "[ScopeInstanceProvider] useScopeInstanceId called without scopeId while multiple scopes are active."
    );
  }

  return undefined;
}
