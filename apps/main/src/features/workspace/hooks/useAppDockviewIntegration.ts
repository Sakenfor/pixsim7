import { useMemo } from "react";

import { readFloatingOriginMeta } from "@lib/dockview/floatingPanelInterop";

import { panelPlacementCoordinator } from "../lib/panelPlacementCoordinator";

import { useDockPlacementExclusions } from "./useFloatingPanelPlacement";

type FloatPanelHandler = (dockviewPanelId: string, panel: any, options?: any) => void;

export interface AppDockviewIntegration {
  capabilities: {
    floatPanelHandler: FloatPanelHandler;
  };
  placementExclusions: string[];
}

function readSourceGroupId(options: any): string | undefined {
  const groupId = readFloatingOriginMeta(options?.context)?.sourceGroupId;
  return typeof groupId === "string" ? groupId : undefined;
}

function readSourceDockviewId(options: any): string | undefined {
  const id = readFloatingOriginMeta(options?.context)?.sourceDockviewId;
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
  const placementExclusions = useDockPlacementExclusions(dockviewId, panelIds);

  const capabilities = useMemo(
    () => ({
      floatPanelHandler: (dockviewPanelId: string, panel: any, options?: any) => {
        const floatingDefinitionId = panelPlacementCoordinator.openFloatingFromDockviewPanel({
          panel,
          dockPanelId: dockviewPanelId,
          sourceDockviewId: dockviewId ?? readSourceDockviewId(options) ?? null,
          sourceGroupId: readSourceGroupId(options),
          options,
        });
        if (!floatingDefinitionId) {
          throw new Error("Failed to open floating panel: unresolved panel definition");
        }
      },
    }),
    [dockviewId]
  );

  return {
    capabilities,
    placementExclusions,
  };
}
