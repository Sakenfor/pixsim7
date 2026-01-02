/**
 * Workspace Console Module
 *
 * Registers workspace and selection operations.
 */

import type { ConsoleModule } from "@lib/dev/console/moduleRegistry";
import { opsRegistry } from "@lib/dev/console/opsRegistry";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSelectionStore } from "@features/graph";
import { getWorkspaceDockviewApi } from "./getWorkspaceDockviewApi";

/** Storage key for workspace layout (must match DockviewWorkspace) */
const WORKSPACE_STORAGE_KEY = "dockview:workspace:v4";

/** Get the workspace dockview API */
function getWorkspaceApi() {
  return getWorkspaceDockviewApi();
}

function registerWorkspaceOps(): void {
  opsRegistry.registerCategory(
    "workspace",
    "Workspace",
    "Workspace layout and preset operations",
  );

  opsRegistry.register("workspace", {
    id: "loadPreset",
    name: "Load Preset",
    description: "Load a workspace preset by ID",
    execute: (presetId: unknown) => {
      if (typeof presetId !== "string")
        throw new Error("presetId must be a string");

      const api = getWorkspaceApi();
      if (!api) throw new Error("Workspace dockview not available");

      const store = useWorkspaceStore.getState();
      const layout = store.getPresetLayout(presetId);

      if (layout) {
        api.fromJSON(layout);
      } else {
        // Null layout means use default - would need to reset
        localStorage.removeItem(WORKSPACE_STORAGE_KEY);
        throw new Error("Preset has null layout - please reload the page");
      }

      store.setActivePreset("workspace", presetId);
      return `Loaded preset: ${presetId}`;
    },
    params: [
      {
        name: "presetId",
        type: "string",
        required: true,
        description: "Preset ID to load",
      },
    ],
  });

  opsRegistry.register("workspace", {
    id: "savePreset",
    name: "Save Preset",
    description: "Save current layout as a new preset",
    execute: (name: unknown) => {
      if (typeof name !== "string") throw new Error("name must be a string");

      const api = getWorkspaceApi();
      if (!api) throw new Error("Workspace dockview not available");

      const layout = api.toJSON();
      useWorkspaceStore.getState().savePreset(name, "workspace", layout);
      return `Saved preset: ${name}`;
    },
    params: [
      {
        name: "name",
        type: "string",
        required: true,
        description: "Name for the new preset",
      },
    ],
  });

  opsRegistry.register("workspace", {
    id: "listPresets",
    name: "List Presets",
    description: "List all available workspace presets",
    execute: () => {
      const presets = useWorkspaceStore.getState().presets;
      return presets.map((p) => ({ id: p.id, name: p.name, icon: p.icon }));
    },
  });

  opsRegistry.register("workspace", {
    id: "toggleLock",
    name: "Toggle Lock",
    description: "Toggle workspace layout lock",
    execute: () => {
      useWorkspaceStore.getState().toggleLock();
      const isLocked = useWorkspaceStore.getState().isLocked;
      return `Workspace ${isLocked ? "locked" : "unlocked"}`;
    },
  });

  opsRegistry.register("workspace", {
    id: "reset",
    name: "Reset",
    description: "Reset workspace to default",
    execute: () => {
      useWorkspaceStore.getState().reset();
      return "Workspace reset to default";
    },
  });
}

function registerSelectionOps(): void {
  opsRegistry.registerCategory(
    "selection",
    "Selection",
    "Node selection operations",
  );

  opsRegistry.register("selection", {
    id: "clear",
    name: "Clear Selection",
    description: "Clear all selected nodes",
    execute: () => {
      useSelectionStore.getState().clearSelection();
      return "Selection cleared";
    },
  });

  opsRegistry.register("selection", {
    id: "select",
    name: "Select Nodes",
    description: "Select nodes by ID",
    execute: (nodeIds: unknown) => {
      if (!Array.isArray(nodeIds)) throw new Error("nodeIds must be an array");
      useSelectionStore.getState().selectNodes(nodeIds as string[]);
      return `Selected ${nodeIds.length} nodes`;
    },
    params: [
      {
        name: "nodeIds",
        type: "string[]",
        required: true,
        description: "Array of node IDs",
      },
    ],
  });

  opsRegistry.register("selection", {
    id: "list",
    name: "List Selected",
    description: "Get currently selected node IDs",
    execute: () => {
      return useSelectionStore.getState().selectedNodeIds;
    },
  });
}

export const workspaceModule: ConsoleModule = {
  id: "workspace",
  name: "Workspace",
  description: "Workspace layout and selection operations",
  dependencies: ["core"],
  register: () => {
    registerWorkspaceOps();
    registerSelectionOps();
  },
};
