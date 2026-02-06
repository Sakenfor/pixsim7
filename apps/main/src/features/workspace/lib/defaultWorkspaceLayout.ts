import type { DockviewReadyEvent } from "dockview-core";

import { getDockviewPanels } from "@lib/dockview";
import { panelSelectors } from "@lib/plugins/catalogSelectors";

import { type PanelDefinition } from "@features/panels";

const defaultWorkspacePanels: string[] = ["gallery", "health", "graph", "inspector", "game"];

function resolveTitle(panelId: string, panelDefs?: PanelDefinition[]) {
  const fromResolved = panelDefs?.find((p) => p.id === panelId)?.title;
  if (fromResolved) return fromResolved;
  return panelSelectors.get(panelId)?.title ?? panelId;
}

export function createDefaultLayout(
  api: DockviewReadyEvent["api"],
  panelDefs: PanelDefinition[] = [],
  floatingPanelIds?: Set<string>
) {
  const addPanel = (
    id: string,
    position?: { direction: "left" | "right" | "below" | "above"; referencePanel?: string }
  ) => {
    if (!panelSelectors.get(id)) return;
    if (floatingPanelIds?.has(id)) return; // Skip panels that are currently floating
    api.addPanel({
      id,
      component: id,
      title: resolveTitle(id, panelDefs),
      position,
    });
  };

  // Gallery stack on the left
  addPanel("gallery", { direction: "left" });
  addPanel("health", { direction: "below", referencePanel: "gallery" });

  // Graph + inspector on the right
  addPanel("graph", { direction: "right" });
  addPanel("inspector", { direction: "right", referencePanel: "graph" });
  addPanel("game", { direction: "below", referencePanel: "inspector" });

  // If any of the default panels are missing, add remaining known defaults as tabs
  defaultWorkspacePanels.forEach((panelId) => {
    if (getDockviewPanels(api).some((panel) => panel?.id === panelId)) return;
    addPanel(panelId, { direction: "right", referencePanel: "graph" });
  });
}
