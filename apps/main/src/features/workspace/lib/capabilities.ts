/**
 * Workspace Feature Capability Registration
 *
 * Registers workspace capabilities with the capability registry
 * so plugins can discover and interact with workspace features.
 */

import { registerCompleteFeature } from "@lib/capabilities";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { ROUTES, navigateTo } from "@lib/capabilities/routeConstants";

/**
 * Workspace/Scene Builder Feature
 */
export function registerWorkspaceFeature() {
  registerCompleteFeature({
    feature: {
      id: "workspace",
      name: "Workspace",
      description: "Scene building and timeline editing",
      icon: "🎬",
      category: "editing",
      priority: 95,
    },
    routes: [
      {
        path: ROUTES.WORKSPACE,
        name: "Workspace",
        description: "Main editing workspace",
        icon: "🎬",
        protected: true,
        showInNav: true,
      },
    ],
    actions: [
      {
        id: "workspace.open",
        name: "Open Workspace",
        icon: "🎬",
        shortcut: "Ctrl+Shift+W",
        execute: () => {
          navigateTo(ROUTES.WORKSPACE);
        },
      },
      {
        id: "workspace.save",
        name: "Save Scene",
        icon: "💾",
        shortcut: "Ctrl+S",
        execute: async () => {
          // TODO: Save current scene
          console.log("Save scene");
        },
      },
      {
        id: "workspace.open-panel",
        name: "Open Panel",
        description: "Open a floating panel",
        execute: (panelId: string) => {
          useWorkspaceStore.getState().openFloatingPanel(panelId);
        },
      },
    ],
    states: [
      {
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
      },
    ],
  });
}
