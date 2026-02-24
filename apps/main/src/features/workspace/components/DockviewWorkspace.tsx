import type { DockviewReadyEvent, DockviewApi } from "dockview-core";
import { useRef, useEffect, useCallback } from "react";

import { SmartDockview, getDockviewGroups } from "@lib/dockview";
import { SiblingPanelsDropdown } from "@lib/dockview/SiblingPanelsDropdown";
// Note: widgets auto-register on import via @lib/widgets/register

import { initializePanels } from "@features/panels";

import { useAppDockviewIntegration } from "../hooks/useAppDockviewIntegration";
import { createDefaultLayout } from "../lib/defaultWorkspaceLayout";
import { useWorkspaceStore } from "../stores/workspaceStore";

// Watermark component for empty workspace
function WorkspaceWatermark() {
  return (
    <div className="flex items-center justify-center h-full text-white/20 text-sm">
      Pixsim7 Workspace
    </div>
  );
}

export function DockviewWorkspace() {
  const apiRef = useRef<DockviewReadyEvent["api"] | null>(null);
  const isLocked = useWorkspaceStore((s) => s.isLocked);
  const {
    capabilities,
    floatingPanelDefinitionIdSet: floatingPanelIds,
  } = useAppDockviewIntegration("workspace");

  // Wrap createDefaultLayout to pass floating panel IDs
  const defaultLayoutWithFloatingCheck = useCallback(
    (api: DockviewApi) => {
      createDefaultLayout(api, [], floatingPanelIds);
    },
    [floatingPanelIds]
  );

  // Initialize panels on mount
  useEffect(() => {
    initializePanels().catch((error) => {
      console.error("Failed to initialize panels:", error);
    });
  }, []);

  const handleReady = (api: DockviewReadyEvent["api"]) => {
    apiRef.current = api;

    // Set locked state on initial load
    if (isLocked) {
      getDockviewGroups(api).forEach((group) => {
        group.locked = "no-drop-target";
      });
    }
  };

  // Update locked state when it changes
  useEffect(() => {
    if (!apiRef.current) return;

    getDockviewGroups(apiRef.current).forEach((group) => {
      if (isLocked) {
        group.locked = "no-drop-target";
      } else {
        group.locked = false;
      }
    });
  }, [isLocked]);

  return (
    <div className="h-full w-full">
      <SmartDockview
        scope="workspace"
        storageKey="dockview:workspace:v4"
        defaultLayout={defaultLayoutWithFloatingCheck}
        onReady={handleReady}
        enableContextMenu
        theme="dockview-theme-dark"
        watermarkComponent={WorkspaceWatermark}
        panelManagerId="workspace"
        capabilities={capabilities}
        rightHeaderActionsComponent={SiblingPanelsDropdown}
      />
    </div>
  );
}
