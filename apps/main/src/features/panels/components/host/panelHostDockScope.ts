export interface PanelCategoryLookup {
  category?: string;
}

export interface PanelLookupSource {
  getIdsForScope(scope: string): string[];
  getIds(): string[];
  get(id: string): PanelCategoryLookup | undefined;
}

export interface ScopedOutOfLayoutOptions {
  dockId?: string;
  panels?: readonly string[];
  excludePanels?: string[];
  allowedPanels?: string[];
  allowedCategories?: string[];
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
 * Resolve panel definition IDs that should exist in this dock host.
 * Supports explicit panels mode and scoped dock host mode.
 */
export function resolveScopedPanelIds(
  source: PanelLookupSource,
  options: ScopedOutOfLayoutOptions
): string[] {
  const { dockId, panels } = options;

  if (panels && panels.length > 0) {
    return applyScopedFilters(source, panels, options);
  }

  if (!dockId) {
    return [];
  }

  return applyScopedFilters(source, source.getIdsForScope(dockId), options);
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
