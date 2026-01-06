/**
 * Workspace Feature Module
 *
 * Public API for the workspace feature.
 * Exports components, stores, hooks, and utilities for workspace management.
 */

// Components
export { DockviewWorkspace } from "./components/DockviewWorkspace";
export { WorkspaceToolbar } from "./components/WorkspaceToolbar";
export { QuickPanelSwitcher } from "./components/QuickPanelSwitcher";

// Workspace Toolbar Components
export { PresetsDropdown } from "./components/workspace-toolbar/PresetsDropdown";
export { AddPanelDropdown } from "./components/workspace-toolbar/AddPanelDropdown";
export { RestoreClosedPanelsMenu } from "./components/workspace-toolbar/RestoreClosedPanelsMenu";
export { SavePresetDialog } from "./components/workspace-toolbar/SavePresetDialog";

// Route
export { WorkspaceRoute } from "./routes/Workspace";

// Store
export {
  useWorkspaceStore,
  type PanelId,
  type PresetScope,
  type DockviewLayout,
  type LayoutPreset,
  type FloatingPanelState,
  type WorkspacePreset,
  type WorkspaceState,
  type WorkspaceActions,
} from "./stores/workspaceStore";

// Hooks
export { useWorkspacePresets } from "./hooks/useWorkspacePresets";

// Console Module
export { workspaceModule as workspaceConsoleModule } from "@lib/dev/console/modules/workspace";
export { workspaceManifest } from "./lib/consoleManifest";

// Capability Registration
export { registerWorkspaceActions } from "./lib/capabilities";
