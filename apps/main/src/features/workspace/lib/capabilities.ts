/**
 * Workspace Capability Registration
 *
 * Registers workspace actions and state capabilities with the capability registry
 * so plugins can discover and interact with workspace features.
 */

import { useCapabilityStore } from "@lib/capabilities";
import { ROUTES, navigateTo } from "@lib/capabilities/routeConstants";

import { useWorkspaceStore } from "../stores/workspaceStore";

/**
 * Workspace/Scene Builder Actions
 */
export function registerWorkspaceActions() {
  const store = useCapabilityStore.getState();

  store.registerAction({
    id: "workspace.open",
    name: "Open Workspace",
    icon: "dYZĒ",
    shortcut: "Ctrl+Shift+W",
    featureId: "workspace",
    execute: () => {
      navigateTo(ROUTES.WORKSPACE);
    },
  });
  store.registerAction({
    id: "workspace.save",
    name: "Save Scene",
    icon: "dY'_",
    shortcut: "Ctrl+S",
    featureId: "workspace",
    execute: async () => {
      // TODO: Save current scene
      console.log("Save scene");
    },
  });
  store.registerAction({
    id: "workspace.open-panel",
    name: "Open Panel",
    description: "Open a floating panel",
    featureId: "workspace",
    execute: (panelId: string) => {
      useWorkspaceStore.getState().openFloatingPanel(panelId);
    },
  });

  store.registerState({
    id: "workspace.panels",
    name: "Open Panels",
    getValue: () => {
      return useWorkspaceStore.getState().floatingPanels;
    },
    subscribe: (callback) => {
      return useWorkspaceStore.subscribe(
        (state) => state.floatingPanels,
        callback,
      );
    },
    readonly: true,
  });
}
