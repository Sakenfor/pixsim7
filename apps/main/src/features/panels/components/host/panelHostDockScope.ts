export interface PanelCategoryLookup {
  category?: string;
  scopeDiscoverable?: boolean;
  orchestration?: {
    type?: string;
  };
}

export interface PanelLookupSource {
  getIdsForScope(scope: string): string[];
  getIds(): string[];
  get(id: string): PanelCategoryLookup | undefined;
  /** Return settingScopes for a panel definition (if available). */
  getSettingScopes?(id: string): string[] | undefined;
  /** Return consumesCapabilities keys for a panel definition (if available). */
  getConsumedCapabilityKeys?(id: string): string[] | undefined;
}

export interface ScopedOutOfLayoutOptions {
  dockId?: string;
  panels?: readonly string[];
  excludePanels?: string[];
  allowedPanels?: string[];
  allowedCategories?: string[];
  /** Setting scopes of the host panel. Panels sharing a scope are auto-included. */
  hostSettingScopes?: string[];
  /** Capability keys the host provides. Panels whose consumesCapabilities are all satisfied are eligible. */
  hostCapabilityKeys?: string[];
}

function applyScopedFilters(
  source: PanelLookupSource,
  panelIds: readonly string[],
  options: ScopedOutOfLayoutOptions,
): string[] {
  const {
    excludePanels,
    allowedPanels,
    allowedCategories,
  } = options;

  let resolvedPanelIds = [...panelIds];

  if (excludePanels && excludePanels.length > 0) {
    const excludedSet = new Set(excludePanels);
    resolvedPanelIds = resolvedPanelIds.filter((panelId) => !excludedSet.has(panelId));
  }

  if (allowedPanels && allowedPanels.length > 0) {
    const allowedSet = new Set(allowedPanels);
    resolvedPanelIds = resolvedPanelIds.filter((panelId) => allowedSet.has(panelId));
  }

  if (allowedCategories && allowedCategories.length > 0) {
    const allowedCategorySet = new Set(allowedCategories);
    resolvedPanelIds = resolvedPanelIds.filter((panelId) => {
      const panel = source.get(panelId);
      return !!(panel?.category && allowedCategorySet.has(panel.category));
    });
  }

  return resolvedPanelIds;
}

/**
 * Resolve panel definition IDs that should exist in this dock host's layout.
 * Does NOT include scope-auto-discovered panels — those go in the context
 * menu only (see resolveScopeDiscoveredPanelIds).
 */
export function resolveScopedPanelIds(
  source: PanelLookupSource,
  options: ScopedOutOfLayoutOptions
): string[] {
  const { dockId, panels } = options;

  let basePanelIds: readonly string[];

  if (panels && panels.length > 0) {
    basePanelIds = panels;
  } else if (dockId) {
    basePanelIds = source.getIdsForScope(dockId);
  } else {
    basePanelIds = [];
  }

  return applyScopedFilters(source, basePanelIds, options);
}

/**
 * Resolve extra panel IDs that should appear in the context menu
 * because they share a settingScope with the host OR because their
 * consumesCapabilities are satisfied by the host's providesCapabilities.
 *
 * These panels are addable via right-click but NOT auto-added to the layout.
 */
export function resolveScopeDiscoveredPanelIds(
  source: PanelLookupSource,
  options: ScopedOutOfLayoutOptions
): string[] {
  const { hostSettingScopes, hostCapabilityKeys, dockId } = options;
  const hasScopeDiscovery = hostSettingScopes?.length && source.getSettingScopes;
  const hasCapabilityDiscovery = hostCapabilityKeys?.length && source.getConsumedCapabilityKeys;
  if (!hasScopeDiscovery && !hasCapabilityDiscovery) return [];

  const basePanelIds = resolveScopedPanelIds(source, options);
  const baseSet = new Set(basePanelIds);
  const hostScopeSet = hostSettingScopes ? new Set(hostSettingScopes) : new Set<string>();
  const hostCapSet = hostCapabilityKeys ? new Set(hostCapabilityKeys) : new Set<string>();
  const extras: string[] = [];

  for (const panelId of source.getIds()) {
    if (baseSet.has(panelId)) continue;
    if (dockId && panelId === dockId) continue;

    const panel = source.get(panelId);
    if (panel?.scopeDiscoverable === false) continue;
    if (panel?.orchestration?.type === 'dockview-container') continue;

    // Match by shared settingScopes (existing behavior)
    let matched = false;
    if (hasScopeDiscovery) {
      const panelScopes = source.getSettingScopes!(panelId);
      if (panelScopes?.some((s) => hostScopeSet.has(s))) {
        matched = true;
      }
    }

    // Match by capability negotiation: panel's consumesCapabilities all satisfied by host
    if (!matched && hasCapabilityDiscovery) {
      const needs = source.getConsumedCapabilityKeys!(panelId);
      if (needs && needs.length > 0 && needs.every((cap) => hostCapSet.has(cap))) {
        matched = true;
      }
    }

    if (matched) {
      extras.push(panelId);
    }
  }

  return applyScopedFilters(source, extras, options);
}

/**
 * For scoped dock hosts, returns panel definition IDs that should never remain
 * in persisted layout payloads because they are out of scope for this host.
 */
export function resolveScopedOutOfLayoutPanelIds(
  source: PanelLookupSource,
  options: ScopedOutOfLayoutOptions
): string[] {
  const { dockId, panels } = options;

  // Explicit `panels` mode does not use scope-driven filtering.
  if (!dockId || (panels && panels.length > 0)) {
    return [];
  }

  const allowedSet = new Set(resolveScopedPanelIds(source, options));
  return source.getIds().filter((panelId) => !allowedSet.has(panelId));
}
