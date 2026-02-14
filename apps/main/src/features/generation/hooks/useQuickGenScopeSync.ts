import { useMemo, useEffect } from 'react';

import {
  getInstanceId,
  getScopeMode,
  panelSettingsScopeRegistry,
  resolveScopeInstanceId,
  usePanelInstanceSettingsStore,
  GENERATION_SCOPE_ID,
  type PanelSettingsScopeMode,
} from '@features/panels';

export interface UseQuickGenScopeSyncConfig {
  /** Dockview / panel-manager ID ('controlCenter' | 'viewerQuickGenerate') */
  panelManagerId: string;
  /** Panel IDs to keep in sync (e.g. quickgen-asset, quickgen-prompt, …) */
  panelIds: readonly string[];
  /** Panel ID used for the host scope instance (defaults to panelManagerId) */
  hostPanelId?: string;
}

export interface UseQuickGenScopeSyncResult {
  /** Resolved scope ID for GenerationScopeProvider */
  scopeInstanceId: string;
  /** Current active scope mode */
  scopeMode: PanelSettingsScopeMode;
  /** Human-readable label from the scope definition */
  scopeLabel: string;
}

/**
 * Keeps all quickgen panels in a host in scope-sync.
 *
 * When any panel's generation scope is changed via the Properties menu,
 * this hook detects the divergence and broadcasts the new mode to all
 * sibling panels (and the host entry), converging in a single render cycle.
 *
 * Returns a `scopeInstanceId` suitable for `<GenerationScopeProvider>`.
 */
export function useQuickGenScopeSync({
  panelManagerId,
  panelIds,
  hostPanelId,
}: UseQuickGenScopeSyncConfig): UseQuickGenScopeSyncResult {
  const resolvedHostPanelId = hostPanelId ?? panelManagerId;

  const hostInstanceId = useMemo(
    () => getInstanceId(panelManagerId, resolvedHostPanelId),
    [panelManagerId, resolvedHostPanelId],
  );

  const childInstances = useMemo(
    () =>
      panelIds.map((panelId) => ({
        panelId,
        instanceId: getInstanceId(panelManagerId, panelId),
      })),
    [panelManagerId, panelIds],
  );

  const SCOPE_FALLBACK = { id: GENERATION_SCOPE_ID, defaultMode: 'local' } as const;
  const generationScopeDefinition =
    panelSettingsScopeRegistry.get(GENERATION_SCOPE_ID) ?? SCOPE_FALLBACK;

  // Primitive selector → safe for useSyncExternalStore (no object identity churn)
  const activeMode = usePanelInstanceSettingsStore((state) => {
    const hostScopes = state.instances[hostInstanceId]?.scopes;
    const hostMode = getScopeMode(hostScopes, generationScopeDefinition, SCOPE_FALLBACK.defaultMode);

    // If any child diverges from host, it was just changed via Properties → adopt it
    for (const { instanceId } of childInstances) {
      const childScopes = state.instances[instanceId]?.scopes;
      const childMode = getScopeMode(childScopes, generationScopeDefinition, SCOPE_FALLBACK.defaultMode);
      if (childMode !== hostMode) {
        return childMode;
      }
    }

    return hostMode;
  });

  const setScope = usePanelInstanceSettingsStore((state) => state.setScope);

  // Detect whether any instance (host or child) disagrees with activeMode
  const needsScopeSync = usePanelInstanceSettingsStore((state) => {
    const hostScopes = state.instances[hostInstanceId]?.scopes;
    if (getScopeMode(hostScopes, generationScopeDefinition, SCOPE_FALLBACK.defaultMode) !== activeMode) {
      return true;
    }
    return childInstances.some(({ instanceId }) => {
      const scopes = state.instances[instanceId]?.scopes;
      return getScopeMode(scopes, generationScopeDefinition, SCOPE_FALLBACK.defaultMode) !== activeMode;
    });
  });

  // Broadcast activeMode to every instance that's out of sync.
  // All setScope calls are synchronous Zustand mutations → single batched re-render.
  useEffect(() => {
    if (!needsScopeSync) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setScope(hostInstanceId, resolvedHostPanelId as any, GENERATION_SCOPE_ID, activeMode);
    childInstances.forEach(({ instanceId, panelId }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setScope(instanceId, panelId as any, GENERATION_SCOPE_ID, activeMode);
    });
  }, [needsScopeSync, activeMode, hostInstanceId, resolvedHostPanelId, childInstances, setScope]);

  // Resolve the scope instance ID for GenerationScopeProvider
  const scopeInstanceId = useMemo(() => {
    if (generationScopeDefinition.resolveScopeId) {
      return resolveScopeInstanceId(generationScopeDefinition, activeMode, {
        instanceId: hostInstanceId,
        panelId: resolvedHostPanelId,
        dockviewId: panelManagerId,
      });
    }
    return activeMode === 'global' ? 'global' : hostInstanceId;
  }, [generationScopeDefinition, activeMode, hostInstanceId, resolvedHostPanelId, panelManagerId]);

  const scopeLabel = generationScopeDefinition.label ?? 'Generation Settings';

  return { scopeInstanceId, scopeMode: activeMode, scopeLabel };
}
