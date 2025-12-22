import { panelSettingsScopeRegistry, scopeProviderRegistry } from "@features/panels";
import { GenerationScopeProvider } from "../hooks/useGenerationScope";

let registered = false;

/**
 * Register generation scope providers.
 *
 * This sets up two things:
 * 1. panelSettingsScopeRegistry: UI toggle for Local/Global mode in panel properties
 * 2. scopeProviderRegistry: Automatic wrapping for panels with "generation" tag
 *
 * The automatic wrapping ensures that any panel/module tagged with "generation"
 * gets wrapped with GenerationScopeProvider, giving it isolated generation stores.
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
      <GenerationScopeProvider scopeId={scopeId} label="Generation Settings">
        {children}
      </GenerationScopeProvider>
    ),
  });

  // Register automatic scope provider for panels/modules with "generation" tag
  // No need for explicit scopes field - uses existing tags metadata
  scopeProviderRegistry.register({
    id: "generation",
    label: "Generation Scope",
    description: "Automatic generation scope for panels using generation stores",
    priority: 100,
    shouldWrap: (ctx) => ctx.tags?.includes("generation") ?? false,
    wrap: (instanceId, children) => (
      <GenerationScopeProvider scopeId={instanceId} label="Auto Generation Scope">
        {children}
      </GenerationScopeProvider>
    ),
  });

  if (process.env.NODE_ENV === "development") {
    console.debug("[registerGenerationScopes] Registered generation scope providers");
  }
}
