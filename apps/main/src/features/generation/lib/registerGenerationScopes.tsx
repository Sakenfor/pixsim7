import {
  panelSettingsScopeRegistry,
  scopeProviderRegistry,
  createScopeMatcher,
  ScopeInstanceProvider,
} from "@features/panels";
import { GenerationScopeProvider } from "../hooks/useGenerationScope";

let registered = false;

/**
 * Register generation scope providers.
 *
 * This sets up two things:
 * 1. panelSettingsScopeRegistry: UI toggle for Local/Global mode in panel properties
 * 2. scopeProviderRegistry: Automatic wrapping for panels that declare scopes: ["generation"]
 *
 * The automatic wrapping ensures that any panel declaring the "generation" scope
 * gets wrapped with GenerationScopeProvider, giving it isolated generation stores.
 * ScopeInstanceProvider exposes the instanceId to children for settings resolution.
 */
export function registerGenerationScopes() {
  if (registered) return;
  registered = true;

  // Register UI toggle for Local/Global mode (existing behavior)
  panelSettingsScopeRegistry.register({
    id: "generation",
    label: "Generation Settings",
    description: "Provider, prompt, model, and parameter defaults for this panel instance.",
    defaultMode: "global",
    renderProvider: (scopeId, children) => (
      <ScopeInstanceProvider instanceId={scopeId}>
        <GenerationScopeProvider scopeId={scopeId} label="Generation Settings">
          {children}
        </GenerationScopeProvider>
      </ScopeInstanceProvider>
    ),
  });

  // Register automatic scope provider for panels declaring scopes: ["generation"]
  scopeProviderRegistry.register({
    id: "generation",
    label: "Generation Scope",
    description: "Automatic generation scope for panels using generation stores",
    priority: 100, // High priority = outermost wrapper
    shouldWrap: createScopeMatcher("generation"),
    wrap: (instanceId, children) => (
      // ScopeInstanceProvider exposes instanceId to children via useScopeInstanceId()
      <ScopeInstanceProvider instanceId={instanceId}>
        <GenerationScopeProvider scopeId={instanceId} label="Auto Generation Scope">
          {children}
        </GenerationScopeProvider>
      </ScopeInstanceProvider>
    ),
  });

  if (process.env.NODE_ENV === "development") {
    console.debug("[registerGenerationScopes] Registered generation scope providers");
  }
}
