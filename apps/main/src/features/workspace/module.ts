import type { ActionDefinition } from "@pixsim7/shared.types";
import { lazy } from "react";

import { registerState } from "@lib/capabilities";
import { ROUTES, navigateTo } from "@lib/capabilities/routeConstants";

import { createLazyPanelComponent } from "@app/modules/lazyPanelComponent";
import { defineModule } from "@app/modules/types";

const workspaceControlCenterPanel = createLazyPanelComponent("cc-workspace", async () => {
  const moduleValue = await import("@features/controlCenter/components/modules/WorkspaceModule");
  return moduleValue.WorkspaceModule;
}, {
  initializeModuleId: "workspace",
});

// === Workspace Actions ===

const openWorkspaceAction: ActionDefinition = {
  id: "workspace.open",
  featureId: "workspace",
  title: "Open Workspace",
  description: "Open the scene builder workspace",
  icon: "palette",
  shortcut: "Ctrl+Shift+W",
  route: ROUTES.WORKSPACE,
  contexts: ["background"],
  category: "quick-add",
  execute: () => {
    navigateTo(ROUTES.WORKSPACE);
  },
};

const saveSceneAction: ActionDefinition = {
  id: "workspace.save",
  featureId: "workspace",
  title: "Save Scene",
  description: "Save the current scene",
  icon: "save",
  shortcut: "Ctrl+S",
  execute: async () => {
    // TODO: Save current scene
    console.log("Save scene");
  },
};

const openPanelAction: ActionDefinition = {
  id: "workspace.open-panel",
  featureId: "workspace",
  title: "Open Panel",
  description: "Open a floating panel",
  icon: "layout",
  visibility: "hidden", // Programmatic-only action
  execute: async (ctx) => {
    const panelId =
      (typeof ctx === "string" ? ctx : ctx?.target) as string | undefined;
    if (panelId) {
      const { useWorkspaceStore } = await import("./stores/workspaceStore");
      useWorkspaceStore.getState().openFloatingPanel(panelId);
    }
  },
};

/**
 * Register workspace state capabilities.
 * States are not part of ActionDefinition and must be registered separately.
 */
async function registerWorkspaceState() {
  const { useWorkspaceStore } = await import("./stores/workspaceStore");

  registerState({
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

/**
 * Workspace Module
 *
 * Manages scene building and timeline editing capabilities.
 * Actions are registered automatically via page.actions.
 */
export const workspaceModule = defineModule({
  id: "workspace",
  name: "Scene Builder",
  updatedAt: "2026-03-10T00:00:00Z",
  changeNote: "Added module metadata baseline for workspace feature module.",
  featureHighlights: ["Workspace module now participates in shared latest-update metadata."],
  dependsOn: ["graph-system"],

  async initialize() {
    // Register workspace state capabilities
    const [{ initializePanels }] = await Promise.all([
      import("@features/panels/lib/initializePanels"),
      registerWorkspaceState(),
    ]);

    // Ensure core panels (panel registry + auto-discovery) are initialized
    // even if the workspace route hasn't been visited yet. This allows
    // features like the Control Center to open workspace panels (e.g. providers)
    // as floating windows from anywhere.
    await initializePanels();
  },

  // Auto-register Control Center panel
  controlCenterPanels: [
    {
      id: "cc-workspace",
      title: "Workspace",
      icon: "🏗️",
      component: workspaceControlCenterPanel,
      category: "tools",
      order: 60,
      enabledByDefault: true,
      description: "Workspace management and presets",
      tags: ["workspace", "layout", "presets"],
    },
  ],

  page: {
    route: "/workspace",
    icon: "palette",
    description: "Create and edit scenes with timeline",
    category: "creation",
    capabilityCategory: "editing",
    featureId: "workspace",
    featured: true,
    component: lazy(() => import("./routes/Workspace").then((m) => ({ default: m.WorkspaceRoute }))),
    actions: [openWorkspaceAction, saveSceneAction, openPanelAction],
    appMap: {
      docs: ["docs/architecture/README.md"],
      frontend: [
        "apps/main/src/features/workspace/",
        "apps/main/src/lib/dockview/",
      ],
    },
  },
});
