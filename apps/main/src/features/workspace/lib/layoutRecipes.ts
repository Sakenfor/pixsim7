/**
 * Layout Recipes
 *
 * Declarative panel placement descriptions that can be applied
 * to a DockviewApi to build a layout without serialized JSON.
 */

import type { DockviewApi } from "dockview-core";

import { getDockviewPanels } from "@lib/dockview";
import { panelSelectors } from "@lib/plugins/catalogSelectors";

import { useWorkspaceStore } from "../stores/workspaceStore";

import { getBuiltinPreset } from "./builtinPresets";
import { panelPlacementCoordinator } from "./panelPlacementCoordinator";
import { resolveWorkspaceDockview } from "./resolveWorkspaceDockview";

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
  /** Panels that must be present after placing the recipe. Missing ones are added as tabs in the first group. */
  ensurePanels?: string[];
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

  // Safety-net: ensure required panels are present (add missing ones as tabs in first group)
  if (recipe.ensurePanels) {
    for (const panelId of recipe.ensurePanels) {
      if (getDockviewPanels(api).some((p) => p?.id === panelId)) continue;
      const meta = panelSelectors.get(panelId);
      if (!meta) continue;
      if (floatingPanelIds?.has(panelId)) continue;

      api.addPanel({
        id: panelId,
        component: panelId,
        title: meta.title ?? panelId,
        position: { direction: "within" },
      });
    }
  }
}

/**
 * Apply a workspace preset by ID.
 *
 * Consolidates the duplicated preset-loading pattern:
 * 1. Try user preset layout → api.fromJSON()
 * 2. Try builtin recipe → clearDockview() + buildLayoutFromRecipe()
 * 3. Returns true if applied, false if preset not found
 */
export function applyPreset(
  api: DockviewApi,
  presetId: string,
  floatingPanelIds?: ReadonlySet<string>,
): boolean {
  // User preset — apply serialized layout directly
  const layout = useWorkspaceStore.getState().getPresetLayout(presetId);
  if (layout) {
    api.fromJSON(layout);
    return true;
  }

  // Built-in preset — apply recipe
  const builtin = getBuiltinPreset(presetId);
  if (builtin) {
    clearDockview(api);
    buildLayoutFromRecipe(api, builtin.recipe, floatingPanelIds);
    return true;
  }

  return false;
}

/**
 * Resolve floating panel IDs and apply a preset.
 * Convenience wrapper that auto-resolves the floating panel set.
 */
export function applyWorkspacePreset(presetId: string): boolean {
  const host = resolveWorkspaceDockview().host;
  const api = host?.api;
  if (!api) return false;

  return applyPreset(
    api,
    presetId,
    panelPlacementCoordinator.getFloatingPanelDefinitionIdSet(),
  );
}
