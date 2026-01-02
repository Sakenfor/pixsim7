import { useContext, useMemo, type ReactNode } from "react";

import { ScopeInstanceContext } from "./scopeInstanceContext";

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
