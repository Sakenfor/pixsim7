import {
  bringFloatingPanelDefinitionToFrontPlacement,
  bringFloatingPanelToFrontPlacement,
  closeFloatingPanelPlacement,
  closeFloatingPanelWithReturnToOrigin,
  dockFloatingPanelPlacement,
  openFloatingFromDockviewPanelPlacement,
  openFloatingPanelPlacement,
  type OpenFloatingFromDockviewPanelArgs,
  type PanelPlacementDockFloatingPosition,
  type PanelPlacementFloatingOpenOptions,
} from "./panelPlacementCommands";
import {
  getDockPlacementExclusions,
  getDockedPanelDefinitionIds,
  getDockedPanelDefinitionIdSet,
  getExcludedFloatingPanelIds,
  getFloatingPanelDefinitionIdSet,
  getFloatingPanelDefinitionIds,
  getPanelPlacementDiagnostics,
  getPanelPlacements,
  hasPanelPlacementConflicts,
  isFloatingPanel,
  isPanelDockedIn,
  resetPanelPlacementTrackingForTests,
  subscribePanelPlacement,
} from "./panelPlacementTracking";

export type { PanelPlacement, PlacementDiagnostic } from "./panelPlacementTracking";

/**
 * Public facade for panel placement selectors + commands.
 * Selectors/subscriptions are implemented in `panelPlacementTracking`.
 * Mutations/restore flows are implemented in `panelPlacementCommands`.
 */
export const panelPlacementCoordinator = {
  subscribe(listener: () => void): () => void {
    return subscribePanelPlacement(listener);
  },

  getFloatingPanelDefinitionIds(): string[] {
    return getFloatingPanelDefinitionIds();
  },

  getFloatingPanelDefinitionIdSet(): ReadonlySet<string> {
    return getFloatingPanelDefinitionIdSet();
  },

  getDockedPanelDefinitionIds(dockviewId: string): string[] {
    return getDockedPanelDefinitionIds(dockviewId);
  },

  getDockedPanelDefinitionIdSet(dockviewId: string): ReadonlySet<string> {
    return getDockedPanelDefinitionIdSet(dockviewId);
  },

  isFloating(panelId: string): boolean {
    return isFloatingPanel(panelId);
  },

  isDockedIn(dockviewId: string, panelId: string): boolean {
    return isPanelDockedIn(dockviewId, panelId);
  },

  getPlacements(panelId: string) {
    return getPanelPlacements(panelId);
  },

  /**
   * @deprecated Use `getDockExclusions(dockviewId, panelIds)` instead.
   * This ignores source-dockview scoping.
   */
  getExcludedPanelIds(panelIds: readonly string[]): string[] {
    return getExcludedFloatingPanelIds(panelIds);
  },

  getDockExclusions(dockviewId: string, panelIds: readonly string[]): string[] {
    return getDockPlacementExclusions(dockviewId, panelIds);
  },

  getDiagnostics() {
    return getPanelPlacementDiagnostics();
  },

  hasConflicts(): boolean {
    return hasPanelPlacementConflicts();
  },

  openFloatingPanel(panelId: string, options?: PanelPlacementFloatingOpenOptions): void {
    openFloatingPanelPlacement(panelId, options);
  },

  bringFloatingPanelToFront(floatingPanelId: string): void {
    bringFloatingPanelToFrontPlacement(floatingPanelId);
  },

  bringFloatingPanelDefinitionToFront(panelId: string): boolean {
    return bringFloatingPanelDefinitionToFrontPlacement(panelId);
  },

  dockFloatingPanel(panelId: string, position: PanelPlacementDockFloatingPosition): void {
    dockFloatingPanelPlacement(panelId, position);
  },

  closeFloatingPanel(panelId: string): void {
    closeFloatingPanelPlacement(panelId);
  },

  closeFloatingPanelWithReturn(panelId: string): boolean {
    return closeFloatingPanelWithReturnToOrigin(panelId);
  },

  openFloatingFromDockviewPanel(args: OpenFloatingFromDockviewPanelArgs): string | null {
    return openFloatingFromDockviewPanelPlacement(args);
  },

  /**
   * Test/dev utility for teardown. Not used in app flow.
   */
  _resetForTests(): void {
    resetPanelPlacementTrackingForTests();
  },
};
