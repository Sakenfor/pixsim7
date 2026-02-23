import type { WorkspaceActions } from "../stores/workspaceStore";
import { useWorkspaceStore } from "../stores/workspaceStore";

type FloatingOpenOptions = Parameters<WorkspaceActions["openFloatingPanel"]>[1];

/**
 * Open/focus a panel in the workspace dockview.
 * Falls back to floating behavior via workspace store when dockview is unavailable.
 */
export function openWorkspacePanel(panelId: string): void {
  useWorkspaceStore.getState().restorePanel(panelId);
}

/**
 * Open a panel as a floating workspace window.
 */
export function openFloatingWorkspacePanel(
  panelId: string,
  options?: FloatingOpenOptions,
): void {
  useWorkspaceStore.getState().openFloatingPanel(panelId, options);
}
