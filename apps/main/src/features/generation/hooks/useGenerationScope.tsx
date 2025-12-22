import { useMemo } from "react";
import {
  CAP_GENERATION_SCOPE,
  type GenerationScopeContext,
  useCapability,
  useProvideCapability,
} from "@features/contextHub";
import { useControlCenterStore } from "@features/controlCenter/stores/controlCenterStore";
import { useGenerationSettingsStore } from "../stores/generationSettingsStore";
import type { GenerationSessionStoreHook } from "../stores/generationSessionStore";
import {
  getGenerationSessionStore,
  getGenerationSettingsStore,
  type GenerationSettingsStoreHook,
} from "../stores/generationScopeStores";

export interface GenerationScopeStores extends GenerationScopeContext {
  useSessionStore: GenerationSessionStoreHook;
  useSettingsStore: GenerationSettingsStoreHook;
}

const GLOBAL_SCOPE: GenerationScopeStores = {
  id: "global",
  label: "Global",
  useSessionStore: useControlCenterStore as unknown as GenerationSessionStoreHook,
  useSettingsStore: useGenerationSettingsStore as unknown as GenerationSettingsStoreHook,
};

export function useGenerationScopeStores(): GenerationScopeStores {
  const { value, provider } = useCapability<GenerationScopeContext>(CAP_GENERATION_SCOPE);
  const result = (value as GenerationScopeStores) ?? GLOBAL_SCOPE;

  // Debug logging in development
  if (process.env.NODE_ENV === "development") {
    const isScoped = result.id !== "global";
    if (isScoped) {
      console.debug(
        `[GenerationScope] Using scoped stores: ${result.id} (provider: ${provider?.id})`
      );
    }
  }

  return result;
}

interface GenerationScopeProviderProps {
  scopeId: string;
  label?: string;
  children: React.ReactNode;
}

export function GenerationScopeProvider({
  scopeId,
  label,
  children,
}: GenerationScopeProviderProps) {
  const scopeStores = useMemo<GenerationScopeStores>(() => {
    if (process.env.NODE_ENV === "development") {
      console.debug(`[GenerationScopeProvider] Creating scoped stores for: ${scopeId}`);
    }
    return {
      id: scopeId,
      label: label ?? "Local Generation",
      useSessionStore: getGenerationSessionStore(scopeId),
      useSettingsStore: getGenerationSettingsStore(scopeId),
    };
  }, [scopeId, label]);

  useProvideCapability<GenerationScopeContext>(
    CAP_GENERATION_SCOPE,
    {
      id: `generation-scope:${scopeId}`,
      label: label ?? "Generation Scope",
      priority: 70,
      getValue: () => scopeStores,
    },
    [scopeStores],
  );

  return <>{children}</>;
}
