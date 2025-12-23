import {
  panelSettingsScopeRegistry,
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
 * 2. panelSettingsScopeRegistry: Automatic wrapping for panels that declare scopes: ["generation"]
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
    defaultMode: "dock",
    resolveScopeId: ({ mode, instanceId, dockviewId, scopeId }) => {
      if (mode === "global") return "global";
      if (mode === "dock") {
        return dockviewId ? `dock:${dockviewId}:${scopeId}` : instanceId;
      }
      return instanceId;
    },
    renderProvider: (resolvedScopeId, children) => (
      <ScopeInstanceProvider scopeId="generation" instanceId={resolvedScopeId}>
        <GenerationScopeProvider scopeId={resolvedScopeId} label="Generation Settings">
          {children}
        </GenerationScopeProvider>
      </ScopeInstanceProvider>
    ),
    shouldApply: createScopeMatcher("generation"),
    priority: 100,
  });

  if (process.env.NODE_ENV === "development") {
    console.debug("[registerGenerationScopes] Registered generation scope providers");
  }
}
