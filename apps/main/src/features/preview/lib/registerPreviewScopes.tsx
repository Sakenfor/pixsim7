import {
  panelSettingsScopeRegistry,
  createScopeMatcher,
  ScopeInstanceProvider,
} from "@features/panels";
import { PreviewScopeProvider } from "../hooks/usePreviewScope";

let registered = false;

/**
 * Register preview scope providers.
 *
 * Panels declaring `settingScopes: ["preview"]` will be automatically
 * wrapped with PreviewScopeProvider, giving them isolated preview stores.
 *
 * Scope modes:
 * - "global": All panels share the same preview settings
 * - "local": Each panel instance has its own settings (zoom, background, etc.)
 */
export function registerPreviewScopes() {
  if (registered) return;
  registered = true;

  panelSettingsScopeRegistry.register({
    id: "preview",
    label: "Preview Settings",
    description: "Zoom, background, and display settings for this preview panel.",
    defaultMode: "local",
    resolveScopeId: ({ mode, instanceId }) => {
      return mode === "global" ? "global" : instanceId;
    },
    renderProvider: (resolvedScopeId, children) => (
      <ScopeInstanceProvider scopeId="preview" instanceId={resolvedScopeId}>
        <PreviewScopeProvider scopeId={resolvedScopeId} label="Preview Settings">
          {children}
        </PreviewScopeProvider>
      </ScopeInstanceProvider>
    ),
    shouldApply: createScopeMatcher("preview"),
    priority: 90,
  });
}
