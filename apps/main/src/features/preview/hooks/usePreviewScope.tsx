import { createContext, useContext, useMemo } from "react";
import type { PreviewSettingsStoreHook } from "../stores/previewSettingsStore";
import { getPreviewSettingsStore } from "../stores/previewScopeStores";

export interface PreviewScopeStores {
  id: string;
  label: string;
  useSettingsStore: PreviewSettingsStoreHook;
}

// Global fallback store for when not in a scoped context
const GLOBAL_SCOPE: PreviewScopeStores = {
  id: "global",
  label: "Global",
  useSettingsStore: getPreviewSettingsStore("global"),
};

const PreviewScopeContext = createContext<PreviewScopeStores | null>(null);

/**
 * Hook to access preview scope stores.
 * Returns scoped stores if inside a PreviewScopeProvider, otherwise global stores.
 */
export function usePreviewScopeStores(): PreviewScopeStores {
  const context = useContext(PreviewScopeContext);
  return context ?? GLOBAL_SCOPE;
}

interface PreviewScopeProviderProps {
  scopeId: string;
  label?: string;
  children: React.ReactNode;
}

/**
 * Provider that creates isolated preview stores for a specific scope.
 */
export function PreviewScopeProvider({
  scopeId,
  label,
  children,
}: PreviewScopeProviderProps) {
  const parentScope = useContext(PreviewScopeContext);

  const scopeStores = useMemo<PreviewScopeStores>(() => {
    // Preserve parent scope if exists
    if (parentScope) {
      return parentScope;
    }

    if (scopeId === "global") {
      return {
        ...GLOBAL_SCOPE,
        label: label ?? GLOBAL_SCOPE.label,
      };
    }

    return {
      id: scopeId,
      label: label ?? "Local Preview",
      useSettingsStore: getPreviewSettingsStore(scopeId),
    };
  }, [scopeId, label, parentScope]);

  return (
    <PreviewScopeContext.Provider value={scopeStores}>
      {children}
    </PreviewScopeContext.Provider>
  );
}
