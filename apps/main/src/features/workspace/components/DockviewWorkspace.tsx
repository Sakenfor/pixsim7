import type { DockviewReadyEvent, DockviewApi } from "dockview-core";
import { useRef, useEffect, useMemo, useCallback } from "react";


import { SmartDockview, getDockviewGroups, resolvePanelDefinitionId } from "@lib/dockview";
// Note: widgets auto-register on import via @lib/widgets/register

import { initializePanels } from "@features/panels";

import { createDefaultLayout } from "../lib/defaultWorkspaceLayout";
import { useWorkspaceStore } from "../stores/workspaceStore";
import type { PanelId } from "../stores/workspaceStore";

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
  const floatingPanelIds = useWorkspaceStore((s) =>
    new Set(s.floatingPanels.map((p) => p.id))
  );

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

  // Memoize capabilities to prevent handleReady from being recreated on every render
  const capabilities = useMemo(
    () => ({
      floatPanelHandler: (dockviewPanelId: string, panel: any, options?: any) => {
        const workspacePanelId = resolvePanelDefinitionId(panel);
        if (workspacePanelId) {
          useWorkspaceStore.getState().openFloatingPanel(workspacePanelId as PanelId, options);
        }
      },
    }),
    []
  );

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
      />
    </div>
  );
}
