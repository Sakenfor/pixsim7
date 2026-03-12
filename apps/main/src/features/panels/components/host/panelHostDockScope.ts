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

/**
 * For scoped dock hosts, returns panel definition IDs that should never remain
 * in persisted layout payloads because they are out of scope for this host.
 */
export function resolveScopedOutOfLayoutPanelIds(
  source: PanelLookupSource,
  options: ScopedOutOfLayoutOptions
): string[] {
  const {
    dockId,
    panels,
    excludePanels,
    allowedPanels,
    allowedCategories,
  } = options;

  // Explicit `panels` mode does not use scope-driven filtering.
  if (!dockId || (panels && panels.length > 0)) {
    return [];
  }

  let panelIds = source.getIdsForScope(dockId);

  if (excludePanels && excludePanels.length > 0) {
    const excludedSet = new Set(excludePanels);
    panelIds = panelIds.filter((panelId) => !excludedSet.has(panelId));
  }

  if (allowedPanels && allowedPanels.length > 0) {
    const allowedSet = new Set(allowedPanels);
    panelIds = panelIds.filter((panelId) => allowedSet.has(panelId));
  }

  if (allowedCategories && allowedCategories.length > 0) {
    const allowedCategorySet = new Set(allowedCategories);
    panelIds = panelIds.filter((panelId) => {
      const panel = source.get(panelId);
      return !!(panel?.category && allowedCategorySet.has(panel.category));
    });
  }

  const allowedSet = new Set(panelIds);
  return source.getIds().filter((panelId) => !allowedSet.has(panelId));
}
