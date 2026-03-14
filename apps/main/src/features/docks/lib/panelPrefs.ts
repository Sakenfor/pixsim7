import type { PanelDefinition } from '@features/panels/lib/panelRegistry';

export function isPanelEnabledByPrefs(
  panel: Pick<PanelDefinition, 'id' | 'enabledByDefault'>,
  prefs?: Record<string, boolean>,
): boolean {
  if (!prefs || Object.keys(prefs).length === 0) {
    return panel.enabledByDefault !== false;
  }

  if (panel.id in prefs) {
    return prefs[panel.id];
  }

  return panel.enabledByDefault !== false;
}

export function filterPanelsByPrefs<T extends Pick<PanelDefinition, 'id' | 'enabledByDefault'>>(
  panels: readonly T[],
  prefs?: Record<string, boolean>,
): T[] {
  return panels.filter((panel) => isPanelEnabledByPrefs(panel, prefs));
}
