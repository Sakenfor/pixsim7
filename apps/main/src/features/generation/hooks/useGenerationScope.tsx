import { createContext, useContext, useMemo } from "react";
import { useControlCenterStore } from "@features/controlCenter/stores/controlCenterStore";
import { useGenerationSettingsStore } from "../stores/generationSettingsStore";
import { useGenerationQueueStore } from "../stores/generationQueueStore";
import type { GenerationSessionStoreHook } from "../stores/generationSessionStore";
import type { GenerationQueueStoreHook } from "../stores/generationQueueStore";
import {
  getGenerationSessionStore,
  getGenerationSettingsStore,
  getGenerationQueueStore,
  type GenerationSettingsStoreHook,
} from "../stores/generationScopeStores";

export interface GenerationScopeStores {
  id: string;
  label: string;
  useSessionStore: GenerationSessionStoreHook;
  useSettingsStore: GenerationSettingsStoreHook;
  useQueueStore: GenerationQueueStoreHook;
}

const GLOBAL_SCOPE: GenerationScopeStores = {
  id: "global",
  label: "Global",
  useSessionStore: useControlCenterStore as unknown as GenerationSessionStoreHook,
  useSettingsStore: useGenerationSettingsStore as unknown as GenerationSettingsStoreHook,
  useQueueStore: useGenerationQueueStore as unknown as GenerationQueueStoreHook,
};

/**
 * React context for generation scope stores.
 * Replaces the capability system with a simpler direct context approach.
 */
const GenerationScopeContext = createContext<GenerationScopeStores | null>(null);

/**
 * Hook to access generation scope stores.
 * Returns scoped stores if inside a GenerationScopeProvider, otherwise global stores.
 */
export function useGenerationScopeStores(): GenerationScopeStores {
  const context = useContext(GenerationScopeContext);
  return context ?? GLOBAL_SCOPE;
}

interface GenerationScopeProviderProps {
  scopeId: string;
  label?: string;
  children: React.ReactNode;
}

/**
 * Provider that creates isolated generation stores for a specific scope.
 * Wrap panels that need their own generation state with this provider.
 */
export function GenerationScopeProvider({
  scopeId,
  label,
  children,
}: GenerationScopeProviderProps) {
  // Check if already inside a scope - preserve parent scope to prevent nested overrides
  const parentScope = useContext(GenerationScopeContext);

  const scopeStores = useMemo<GenerationScopeStores>(() => {
    // If parent scope exists, preserve it (prevents nested dockviews from overriding)
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
      label: label ?? "Local Generation",
      useSessionStore: getGenerationSessionStore(scopeId),
      useSettingsStore: getGenerationSettingsStore(scopeId),
      useQueueStore: getGenerationQueueStore(scopeId),
    };
  }, [scopeId, label, parentScope]);

  return (
    <GenerationScopeContext.Provider value={scopeStores}>
      {children}
    </GenerationScopeContext.Provider>
  );
}
