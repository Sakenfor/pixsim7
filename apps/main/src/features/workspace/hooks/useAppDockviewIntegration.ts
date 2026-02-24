import { useMemo } from "react";

import { panelPlacementCoordinator } from "../lib/panelPlacementCoordinator";

import { useDockPlacementExclusions, useFloatingPanelDefinitionIdSet } from "./useFloatingPanelPlacement";

type FloatPanelHandler = (dockviewPanelId: string, panel: any, options?: any) => void;

export interface AppDockviewIntegration {
  capabilities: {
    floatPanelHandler: FloatPanelHandler;
  };
  floatingPanelDefinitionIdSet: Set<string>;
  placementExclusions: string[];
}

function readSourceGroupId(options: any): string | undefined {
  const groupId = options?.context?.__floatingMeta?.sourceGroupId;
  return typeof groupId === "string" ? groupId : undefined;
}

function readSourceDockviewId(options: any): string | undefined {
  const id = options?.context?.__floatingMeta?.sourceDockviewId;
  return typeof id === "string" ? id : undefined;
}

/**
 * App-level SmartDockview integration adapter.
 * Centralizes floating-panel orchestration + placement exclusions.
 */
export function useAppDockviewIntegration(
  dockviewId: string | undefined,
  panelIds: readonly string[] = []
): AppDockviewIntegration {
  const floatingPanelDefinitionIdSet = useFloatingPanelDefinitionIdSet();
  const placementExclusions = useDockPlacementExclusions(dockviewId, panelIds);

  const capabilities = useMemo(
    () => ({
      floatPanelHandler: (dockviewPanelId: string, panel: any, options?: any) => {
        panelPlacementCoordinator.openFloatingFromDockviewPanel({
          panel,
          dockPanelId: dockviewPanelId,
          sourceDockviewId: dockviewId ?? readSourceDockviewId(options) ?? null,
          sourceGroupId: readSourceGroupId(options),
          options,
        });
      },
    }),
    [dockviewId]
  );

  return {
    capabilities,
    floatingPanelDefinitionIdSet,
    placementExclusions,
  };
}
