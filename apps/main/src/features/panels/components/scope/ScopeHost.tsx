/**
 * ScopeHost - Unified auto + user-controlled scope wrapping.
 *
 * Applies scope providers to panels based on their declared scopes.
 * Reads scope definitions from panelSettingsScopeRegistry and applies
 * matching providers in priority order.
 *
 * This component is used by SmartDockview to wrap each panel with
 * appropriate scope providers (e.g., GenerationScopeProvider).
 */

import { useMemo, type ReactNode } from "react";

import {
  panelSettingsScopeRegistry,
  getScopeMode,
  resolveScopeInstanceId,
  type ScopeMatchContext,
  type PanelSettingsScopeMode,
} from "../../lib/panelSettingsScopes";
import { usePanelInstanceSettingsStore } from "../../stores/panelInstanceSettingsStore";

export interface ScopeHostProps {
  /** Panel type ID (e.g., "quickgen-prompt") */
  panelId: string;
  /** Unique instance ID (format: dockviewId:panelId) */
  instanceId: string;
  /** Parent dockview ID */
  dockviewId?: string;
  /** Scopes declared by the panel definition */
  declaredScopes?: string[];
  /** Fallback scopes if declaredScopes not provided */
  fallbackScopes?: string[];
  /** Panel tags for scope matching */
  tags?: string[];
  /** Panel category for scope matching */
  category?: string;
  /** Panel content to wrap */
  children: ReactNode;
}

// Stable empty object to avoid re-renders
const EMPTY_SCOPES: Record<string, PanelSettingsScopeMode> = {};

/**
 * ScopeHost wraps panel children with matching scope providers.
 *
 * For each registered scope that matches the panel (via shouldApply),
 * the scope's renderProvider is called to wrap the content.
 * Providers are applied in priority order (highest first).
 */
export function ScopeHost({
  panelId,
  instanceId,
  dockviewId,
  declaredScopes,
  fallbackScopes,
  tags,
  category,
  children,
}: ScopeHostProps) {
  // Get instance-specific scope mode overrides
  const instanceScopes = usePanelInstanceSettingsStore(
    (state) => state.instances[instanceId]?.scopes ?? EMPTY_SCOPES,
  );

  // Get all registered scope definitions
  const scopeDefinitions = useMemo(
    () => panelSettingsScopeRegistry.getAll(),
    [],
  );

  const effectiveScopes = declaredScopes?.length ? declaredScopes : fallbackScopes;

  // Build the match context for scope shouldApply checks
  const context: ScopeMatchContext = useMemo(
    () => ({
      panelId,
      instanceId,
      dockviewId,
      declaredScopes: effectiveScopes,
      tags,
      category,
    }),
    [panelId, instanceId, dockviewId, effectiveScopes, tags, category],
  );

  // Wrap children with matching scope providers
  const wrapped = useMemo(() => {
    if (!scopeDefinitions.length) return children;

    // Find scopes that apply to this panel, sorted by priority (descending)
    const matching = scopeDefinitions
      .filter((scope) => scope.shouldApply?.(context))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    if (matching.length === 0) return children;

    // Wrap content with each matching scope's provider (innermost first)
    return matching.reduceRight((content, scope) => {
      if (!scope.renderProvider) {
        return content;
      }

      const mode = getScopeMode(instanceScopes, scope);
      const scopeInstanceId = resolveScopeInstanceId(scope, mode, {
        instanceId,
        panelId,
        dockviewId,
      });

      if (import.meta.env.DEV) {
        console.debug(
          `[ScopeHost] Wrapping panel ${instanceId} (${mode}) with scope: ${scope.id}`,
        );
      }

      return scope.renderProvider(scopeInstanceId, content);
    }, children as ReactNode);
  }, [
    children,
    scopeDefinitions,
    context,
    instanceId,
    instanceScopes,
    panelId,
    dockviewId,
  ]);

  return <>{wrapped}</>;
}
