import { useMemo, useSyncExternalStore } from "react";

import {
  panelPlacementCoordinator,
  type PanelPlacement,
  type PlacementDiagnostic,
} from "../lib/panelPlacementCoordinator";

/**
 * Normalized floating panel definition IDs (e.g. `quickGenerate::1` -> `quickGenerate`).
 */
export function useFloatingPanelDefinitionIds(): string[] {
  return useSyncExternalStore(
    panelPlacementCoordinator.subscribe,
    panelPlacementCoordinator.getFloatingPanelDefinitionIds,
    panelPlacementCoordinator.getFloatingPanelDefinitionIds
  );
}

/**
 * Set form of normalized floating panel definition IDs for fast membership checks.
 */
export function useFloatingPanelDefinitionIdSet(): Set<string> {
  const set = useSyncExternalStore(
    panelPlacementCoordinator.subscribe,
    panelPlacementCoordinator.getFloatingPanelDefinitionIdSet,
    panelPlacementCoordinator.getFloatingPanelDefinitionIdSet
  );
  return useMemo(() => new Set(set), [set]);
}

/**
 * Returns the subset of `panelIds` currently open as floating panels.
 */
export function useFloatingExcludedPanelIds(panelIds: readonly string[]): string[] {
  const floatingIds = useSyncExternalStore(
    panelPlacementCoordinator.subscribe,
    panelPlacementCoordinator.getFloatingPanelDefinitionIdSet,
    panelPlacementCoordinator.getFloatingPanelDefinitionIdSet
  );
  return useMemo(
    () => panelIds.filter((panelId) => floatingIds.has(panelId)),
    [panelIds, floatingIds]
  );
}

/**
 * Panel IDs excluded from a dockview according to placement policy.
 * Today this is "floating wins", but callers should prefer this over encoding policy.
 */
export function useDockPlacementExclusions(
  dockviewId: string | undefined,
  panelIds: readonly string[]
): string[] {
  const floatingIds = useSyncExternalStore(
    panelPlacementCoordinator.subscribe,
    panelPlacementCoordinator.getFloatingPanelDefinitionIdSet,
    panelPlacementCoordinator.getFloatingPanelDefinitionIdSet
  );

  return useMemo(() => {
    if (!dockviewId) {
      return panelIds.filter((panelId) => floatingIds.has(panelId));
    }
    return panelPlacementCoordinator.getDockExclusions(dockviewId, panelIds);
  }, [dockviewId, panelIds, floatingIds]);
}

/**
 * Docked panel definition IDs currently present in a dockview host.
 */
export function useDockviewDockedPanelDefinitionIds(dockviewId: string): string[] {
  return useSyncExternalStore(
    panelPlacementCoordinator.subscribe,
    () => panelPlacementCoordinator.getDockedPanelDefinitionIds(dockviewId),
    () => panelPlacementCoordinator.getDockedPanelDefinitionIds(dockviewId)
  );
}

/**
 * Full placement list for a panel across floating + all registered dockviews.
 */
export function usePanelPlacements(panelId: string): PanelPlacement[] {
  return useSyncExternalStore(
    panelPlacementCoordinator.subscribe,
    () => panelPlacementCoordinator.getPlacements(panelId),
    () => panelPlacementCoordinator.getPlacements(panelId)
  );
}

/**
 * Placement diagnostics across floating + docked panels.
 */
export function usePanelPlacementDiagnostics(): PlacementDiagnostic[] {
  return useSyncExternalStore(
    panelPlacementCoordinator.subscribe,
    panelPlacementCoordinator.getDiagnostics,
    panelPlacementCoordinator.getDiagnostics
  );
}
