/**
 * Workspace Panel Registry
 *
 * Local panel registry for the main workspace dockview.
 * Uses a single generic "panel" entry that wraps any workspace panel
 * via PanelHostLite, with the actual panel determined by params.panelId.
 */

import type { IDockviewPanelProps, DockviewApi } from "dockview-core";
import { createLocalPanelRegistry } from "@lib/dockview";
import { panelRegistry, PanelHostLite } from "@features/panels";
import type { PanelId } from "../stores/workspaceStore";

/**
 * Panel wrapper component for workspace panels.
 * Renders the appropriate panel based on params.panelId.
 */
export function WorkspacePanelWrapper(props: IDockviewPanelProps<{ panelId: PanelId }>) {
  const { params } = props;
  const panelId = params?.panelId;

  if (!panelId) {
    return <div className="p-4 text-red-500">Error: No panel ID</div>;
  }

  if (!panelRegistry.get(panelId)) {
    return <div className="p-4 text-red-500">Unknown panel: {panelId}</div>;
  }

  return (
    <PanelHostLite
      panelId={panelId}
      className="h-full w-full"
      variant="dockview"
    />
  );
}

/** Get panel title from registry, with id as fallback */
export const getPanelTitle = (id: PanelId): string =>
  panelRegistry.get(id)?.title ?? id;

/**
 * Create the default workspace layout.
 * Adds the 5 default panels: gallery, health, graph, inspector, game.
 */
export function createDefaultLayout(api: DockviewApi) {
  api.addPanel({
    id: "gallery-panel",
    component: "panel",
    params: { panelId: "gallery" as PanelId },
    title: getPanelTitle("gallery"),
    position: { direction: "left" },
  });

  api.addPanel({
    id: "health-panel",
    component: "panel",
    params: { panelId: "health" as PanelId },
    title: getPanelTitle("health"),
    position: { direction: "below", referencePanel: "gallery-panel" },
  });

  api.addPanel({
    id: "graph-panel",
    component: "panel",
    params: { panelId: "graph" as PanelId },
    title: getPanelTitle("graph"),
    position: { direction: "right" },
  });

  api.addPanel({
    id: "inspector-panel",
    component: "panel",
    params: { panelId: "inspector" as PanelId },
    title: getPanelTitle("inspector"),
    position: { direction: "right", referencePanel: "graph-panel" },
  });

  api.addPanel({
    id: "game-panel",
    component: "panel",
    params: { panelId: "game" as PanelId },
    title: getPanelTitle("game"),
    position: { direction: "below", referencePanel: "inspector-panel" },
  });
}

/**
 * Create the workspace panel registry.
 * Uses a single "panel" entry that delegates to PanelHostLite.
 */
function createWorkspacePanelRegistry() {
  const registry = createLocalPanelRegistry<"panel">();

  registry.register({
    id: "panel",
    title: "Panel",
    component: WorkspacePanelWrapper,
    isInternal: true,
  });

  return registry;
}

/** Singleton registry instance */
export const workspacePanelRegistry = createWorkspacePanelRegistry();
