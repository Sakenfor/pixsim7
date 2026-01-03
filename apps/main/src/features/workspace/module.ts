import { lazy } from "react";
import type { Module } from "@app/modules/types";
import { registerWorkspaceFeature } from "./lib/capabilities";
import { initializePanels } from "@features/panels";
import { WorkspaceModule as WorkspaceModuleComponent } from "@features/controlCenter/components/modules/WorkspaceModule";

/**
 * Workspace Module
 *
 * Manages scene building and timeline editing capabilities.
 * Registers workspace feature capabilities with the capability registry.
 */
export const workspaceModule: Module = {
  id: "workspace",
  name: "Scene Builder",

  async initialize() {
    // Register workspace capabilities (hotspots, scene builder, etc.)
    registerWorkspaceFeature();

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
      component: WorkspaceModuleComponent,
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
    featured: true,
    component: lazy(() => import("./routes/Workspace").then(m => ({ default: m.WorkspaceRoute }))),
  },
};
