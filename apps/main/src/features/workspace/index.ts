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
export { RestoreClosedPanelsMenu } from "./components/workspace-toolbar/RestoreClosedPanelsMenu";
export { SavePresetDialog } from "./components/workspace-toolbar/SavePresetDialog";

// Route
export { WorkspaceRoute } from "./routes/Workspace";

// Store
export {
  useWorkspaceStore,
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
export { useAppDockviewIntegration, type AppDockviewIntegration } from "./hooks/useAppDockviewIntegration";
export {
  useFloatingPanelDefinitionIds,
  useFloatingPanelDefinitionIdSet,
  useFloatingExcludedPanelIds,
  useDockPlacementExclusions,
  useDockviewDockedPanelDefinitionIds,
  usePanelPlacements,
  usePanelPlacementDiagnostics,
} from "./hooks/useFloatingPanelPlacement";

// Console Module
export { workspaceManifest } from "./lib/consoleManifest";
export {
  panelPlacementCoordinator,
  type PlacementDiagnostic,
  type PanelPlacement,
} from "./lib/panelPlacementCoordinator";

// Dockview helpers
export { resolveWorkspaceDockview } from "./lib/resolveWorkspaceDockview";
export { openWorkspacePanel, openFloatingWorkspacePanel } from "./lib/openPanel";
