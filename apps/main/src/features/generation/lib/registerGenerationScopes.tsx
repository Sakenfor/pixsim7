import { panelSettingsScopeRegistry } from "@features/panels";
import { GenerationScopeProvider } from "../hooks/useGenerationScope";

let registered = false;

export function registerGenerationScopes() {
  if (registered) return;
  registered = true;

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
}
