import { useMemo } from "react";
import {
  CAP_GENERATION_SCOPE,
  type GenerationScopeContext,
  useCapability,
  useProvideCapability,
} from "@features/contextHub";
import { useScopeInstanceId } from "@features/panels";
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

export interface GenerationScopeStores extends GenerationScopeContext {
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

export function useGenerationScopeStores(): GenerationScopeStores {
  const { value, provider } = useCapability<GenerationScopeContext>(CAP_GENERATION_SCOPE);
  const scopeInstanceId = useScopeInstanceId("generation");

  // If no capability yet but we know the scope instance ID, synthesize scoped stores.
  // This prevents falling back to global during the first render in scoped panels.
  const fallbackScoped = useMemo<GenerationScopeStores | null>(() => {
    if (!scopeInstanceId || scopeInstanceId === "global") return null;
    return {
      id: scopeInstanceId,
      label: "Generation Settings",
      useSessionStore: getGenerationSessionStore(scopeInstanceId),
      useSettingsStore: getGenerationSettingsStore(scopeInstanceId),
      useQueueStore: getGenerationQueueStore(scopeInstanceId),
    };
  }, [scopeInstanceId]);

  const result = (value as GenerationScopeStores) ?? fallbackScoped ?? GLOBAL_SCOPE;

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
  // Check if parent scope already set an instanceId - use that to preserve outer scope
  // This prevents nested dockviews from overriding the outer scope
  const parentScopeId = useScopeInstanceId("generation");
  const effectiveScopeId = parentScopeId ?? scopeId;

  const scopeStores = useMemo<GenerationScopeStores>(() => {
    if (process.env.NODE_ENV === "development") {
      console.debug(`[GenerationScopeProvider] Creating scoped stores for: ${effectiveScopeId}${parentScopeId ? ` (preserved from parent, prop was: ${scopeId})` : ""}`);
    }
    if (effectiveScopeId === "global") {
      return {
        ...GLOBAL_SCOPE,
        label: label ?? GLOBAL_SCOPE.label,
      };
    }

    return {
      id: effectiveScopeId,
      label: label ?? "Local Generation",
      useSessionStore: getGenerationSessionStore(effectiveScopeId),
      useSettingsStore: getGenerationSettingsStore(effectiveScopeId),
      useQueueStore: getGenerationQueueStore(effectiveScopeId),
    };
  }, [effectiveScopeId, label]);

  useProvideCapability<GenerationScopeContext>(
    CAP_GENERATION_SCOPE,
    {
      id: `generation-scope:${effectiveScopeId}`,
      label: label ?? "Generation Scope",
      priority: 70,
      exposeToContextMenu: true,
      getValue: () => scopeStores,
    },
    [scopeStores],
    { scope: "root" },
  );

  return <>{children}</>;
}
