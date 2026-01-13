import type { CapabilityScope } from "@pixsim7/shared.capabilities-core";
import type { ReactNode } from "react";

import { BaseRegistry } from "@lib/core/BaseRegistry";

export type PanelSettingsScopeMode = "global" | "local";

export interface ScopeMatchContext {
  panelId: string;
  instanceId: string;
  dockviewId?: string;
  declaredScopes?: string[];
  tags?: string[];
  category?: string;
}

export interface PanelSettingsScopeDefinition {
  id: string;
  label: string;
  description?: string;
  defaultMode?: PanelSettingsScopeMode;
  priority?: number;
  shouldApply?: (context: ScopeMatchContext) => boolean;
  resolveScopeId?: (context: {
    scopeId: string;
    mode: PanelSettingsScopeMode;
    instanceId: string;
    panelId: string;
    dockviewId?: string;
  }) => string;
  /**
   * Optional provider wrapper for enabling scope-specific overrides.
   * Used to apply local scope behavior without hard-coding panel types.
   */
  renderProvider?: (scopeId: string, children: ReactNode) => ReactNode;
}

export class PanelSettingsScopeRegistry extends BaseRegistry<PanelSettingsScopeDefinition> {}

export const panelSettingsScopeRegistry = new PanelSettingsScopeRegistry();

export function createScopeMatcher(scopeId: string): PanelSettingsScopeDefinition["shouldApply"] {
  return (context) => {
    return context.declaredScopes?.includes(scopeId) ?? false;
  };
}

export function getScopeMode(
  instanceScopes: Record<string, PanelSettingsScopeMode> | undefined,
  scope: Pick<PanelSettingsScopeDefinition, "id" | "defaultMode">,
  fallback: PanelSettingsScopeMode = "global",
): PanelSettingsScopeMode {
  return (instanceScopes?.[scope.id] ?? scope.defaultMode ?? fallback) as PanelSettingsScopeMode;
}

export interface ScopeResolveContext {
  instanceId: string;
  panelId: string;
  dockviewId?: string;
}

export function resolveScopeInstanceId(
  scope: Pick<PanelSettingsScopeDefinition, "id" | "resolveScopeId">,
  mode: PanelSettingsScopeMode,
  context: ScopeResolveContext,
): string {
  if (scope.resolveScopeId) {
    return scope.resolveScopeId({
      scopeId: scope.id,
      mode,
      instanceId: context.instanceId,
      panelId: context.panelId,
      dockviewId: context.dockviewId,
    });
  }

  if (mode === "local") return context.instanceId;
  return "global";
}

/**
 * Map a resolved scope instance ID to a capability scope.
 */
export function resolveCapabilityScopeFromScopeInstanceId(
  scopeInstanceId: string | undefined,
  fallback: CapabilityScope = "parent",
): CapabilityScope {
  if (!scopeInstanceId) return fallback;
  if (scopeInstanceId === "global") return "root";
  return "local";
}
