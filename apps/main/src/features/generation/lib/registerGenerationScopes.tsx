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
 * Panels declaring `settingScopes: ["generation"]` will be automatically
 * wrapped with GenerationScopeProvider, giving them isolated generation stores.
 *
 * Scope modes:
 * - "global": All panels share the same generation stores
 * - "local": Each panel instance has its own isolated stores
 */
export function registerGenerationScopes() {
  if (registered) return;
  registered = true;

  panelSettingsScopeRegistry.register({
    id: "generation",
    label: "Generation Settings",
    description: "Provider, prompt, model, and parameter defaults for this panel instance.",
    defaultMode: "local",
    resolveScopeId: ({ mode, instanceId }) => {
      return mode === "global" ? "global" : instanceId;
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
}
