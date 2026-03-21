/* eslint-disable react-refresh/only-export-components */
import { useContext, useMemo } from "react";

import { createHmrSafeContext } from "@lib/utils";

import { useGenerationInputStore } from "../stores/generationInputStore";
import type { GenerationInputStoreHook } from "../stores/generationInputStore";
import {
  getGenerationSessionStore,
  getGenerationSettingsStore,
  getGenerationInputStore,
  type GenerationSettingsStoreHook,
} from "../stores/generationScopeStores";
import type { GenerationSessionStoreHook } from "../stores/generationSessionStore";
import { useGenerationSettingsStore } from "../stores/generationSettingsStore";

export interface GenerationScopeStores {
  id: string;
  label: string;
  useSessionStore: GenerationSessionStoreHook;
  useSettingsStore: GenerationSettingsStoreHook;
  useInputStore: GenerationInputStoreHook;
}

// Lazily resolve the global scope so it always references the HMR-stable
// store singletons (which are cached on globalThis via Symbol.for).
function getGlobalScope(): GenerationScopeStores {
  // Session store is now a shim over settings — both point to the same global singleton
  const globalSettings = useGenerationSettingsStore as unknown as GenerationSettingsStoreHook;
  return {
    id: "global",
    label: "Global",
    useSessionStore: globalSettings as unknown as GenerationSessionStoreHook,
    useSettingsStore: globalSettings,
    useInputStore: useGenerationInputStore as unknown as GenerationInputStoreHook,
  };
}

const GenerationScopeContext = createHmrSafeContext<GenerationScopeStores | null>('generationScope', null);

/**
 * Hook to access generation scope stores.
 * Returns scoped stores if inside a GenerationScopeProvider, otherwise global stores.
 */
export function useGenerationScopeStores(): GenerationScopeStores {
  const context = useContext(GenerationScopeContext);
  return context ?? getGlobalScope();
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
      const global = getGlobalScope();
      return {
        ...global,
        label: label ?? global.label,
      };
    }

    return {
      id: scopeId,
      label: label ?? "Local Generation",
      useSessionStore: getGenerationSessionStore(scopeId),
      useSettingsStore: getGenerationSettingsStore(scopeId),
      useInputStore: getGenerationInputStore(scopeId),
    };
  }, [scopeId, label, parentScope]);

  return (
    <GenerationScopeContext.Provider value={scopeStores}>
      {children}
    </GenerationScopeContext.Provider>
  );
}
