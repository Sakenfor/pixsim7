export function normalizePanelCatalogBootstrapValues(values?: readonly string[]): string[] {
  if (!values || values.length === 0) {
    return [];
  }
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  ).sort();
}

export function buildPanelCatalogBootstrapInit(
  contexts?: readonly string[],
  panelIds?: readonly string[],
): {
  normalizedContexts: string[];
  normalizedPanelIds: string[];
  initKey: string;
} {
  const normalizedContexts = normalizePanelCatalogBootstrapValues(contexts);
  const normalizedPanelIds = normalizePanelCatalogBootstrapValues(panelIds);
  const initKey = `contexts:${normalizedContexts.join(',')}|panels:${normalizedPanelIds.join(',')}`;

  return {
    normalizedContexts,
    normalizedPanelIds,
    initKey,
  };
}
