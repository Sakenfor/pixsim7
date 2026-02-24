/**
 * Layout Recipes
 *
 * Declarative panel placement descriptions that can be applied
 * to a DockviewApi to build a layout without serialized JSON.
 */

import type { DockviewApi } from "dockview-core";

import { getDockviewPanels } from "@lib/dockview";
import { panelSelectors } from "@lib/plugins/catalogSelectors";

export type PanelPosition = {
  direction: "left" | "right" | "below" | "above" | "within";
  referencePanel?: string;
};

export interface PanelPlacement {
  id: string;
  position?: PanelPosition;
  initialWidth?: number;
  initialHeight?: number;
}

export interface LayoutRecipe {
  panels: PanelPlacement[];
}

/**
 * Clear all panels from a dockview instance.
 */
export function clearDockview(api: DockviewApi) {
  const panels = getDockviewPanels(api);
  for (const panel of panels) {
    api.removePanel(panel);
  }
}

/**
 * Build a layout from a recipe by adding panels sequentially.
 *
 * Skips panels that are not registered in the panel catalog or
 * are currently open as floating panels.
 */
export function buildLayoutFromRecipe(
  api: DockviewApi,
  recipe: LayoutRecipe,
  floatingPanelIds?: ReadonlySet<string>,
) {
  for (const placement of recipe.panels) {
    const meta = panelSelectors.get(placement.id);
    if (!meta) continue;
    if (floatingPanelIds?.has(placement.id)) continue;

    const title = meta.title ?? placement.id;

    api.addPanel({
      id: placement.id,
      component: placement.id,
      title,
      position: placement.position,
      initialWidth: placement.initialWidth,
      initialHeight: placement.initialHeight,
    });
  }
}
