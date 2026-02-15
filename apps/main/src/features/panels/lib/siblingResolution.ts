/**
 * Sibling Resolution
 *
 * Resolves related ("sibling") panels for a given panel.
 * Used by the SiblingPanelsDropdown to show quick-add options.
 */

import type { PanelDefinition } from './panelRegistry';

export interface SiblingCandidate {
  id: string;
  title: string;
  icon?: string;
}

/**
 * Resolve sibling candidates for a panel.
 *
 * 1. If the panel declares explicit `siblings`, use those (filtered to existing non-internal panels).
 * 2. Fallback: panels sharing at least one tag within the same category (excluding internal panels).
 */
export function resolveSiblings(
  panelId: string,
  allPanels: PanelDefinition[],
): SiblingCandidate[] {
  const panel = allPanels.find((p) => p.id === panelId);
  if (!panel) return [];

  // Explicit siblings
  if (panel.siblings && panel.siblings.length > 0) {
    const panelMap = new Map(allPanels.map((p) => [p.id, p]));
    return panel.siblings
      .map((id) => panelMap.get(id))
      .filter((p): p is PanelDefinition => p !== undefined && !p.isInternal)
      .map(toCandidate);
  }

  // Fallback: same category + shared tag
  const panelTags = new Set(panel.tags);
  if (panelTags.size === 0) return [];

  return allPanels
    .filter(
      (p) =>
        p.id !== panelId &&
        !p.isInternal &&
        p.category === panel.category &&
        p.tags.some((t) => panelTags.has(t)),
    )
    .map(toCandidate);
}

/**
 * Filter out siblings that are already open (by panel definition ID).
 */
export function filterOpenSiblings(
  siblings: SiblingCandidate[],
  openPanelIds: Set<string>,
): SiblingCandidate[] {
  return siblings.filter((s) => !openPanelIds.has(s.id));
}

function toCandidate(p: PanelDefinition): SiblingCandidate {
  return { id: p.id, title: p.title, icon: p.icon };
}
