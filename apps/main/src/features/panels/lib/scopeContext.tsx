import { createContext, useContext, useMemo, type ReactNode } from "react";

type ScopeInstanceMap = Record<string, string>;

/**
 * Context for scoped instance IDs keyed by scopeId.
 * This supports multiple active scopes without collisions.
 */
const ScopeInstanceContext = createContext<ScopeInstanceMap | undefined>(undefined);

/**
 * Provider component to set the scope instanceId for a specific scope.
 * If a parent already provides this scopeId, it is preserved.
 */
export function ScopeInstanceProvider({
  scopeId,
  instanceId,
  children,
}: {
  scopeId: string;
  instanceId: string;
  children: ReactNode;
}) {
  const parentScopes = useContext(ScopeInstanceContext);

  const mergedScopes = useMemo(() => {
    if (!parentScopes) return { [scopeId]: instanceId };
    if (parentScopes[scopeId]) return parentScopes;
    return { ...parentScopes, [scopeId]: instanceId };
  }, [parentScopes, scopeId, instanceId]);

  return (
    <ScopeInstanceContext.Provider value={mergedScopes}>
      {children}
    </ScopeInstanceContext.Provider>
  );
}

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
