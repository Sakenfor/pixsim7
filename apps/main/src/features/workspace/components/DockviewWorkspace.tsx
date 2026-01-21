import type { DockviewReadyEvent } from "dockview-core";
import { useRef, useEffect, useMemo } from "react";


import { SmartDockview } from "@lib/dockview";
import { resolvePanelDefinitionId } from "@lib/dockview";
import { registerAllWidgets } from "@lib/widgets";

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

  // Initialize panels and widgets on mount
  useEffect(() => {
    Promise.all([
      initializePanels(),
      Promise.resolve(registerAllWidgets()),
    ]).catch((error) => {
      console.error("Failed to initialize:", error);
    });
  }, []);

  const handleReady = (api: DockviewReadyEvent["api"]) => {
    apiRef.current = api;

    // Set locked state on initial load
    if (isLocked) {
      api.groups.forEach((group) => {
        group.locked = "no-drop-target";
      });
    }
  };

  // Update locked state when it changes
  useEffect(() => {
    if (!apiRef.current) return;

    apiRef.current.groups.forEach((group) => {
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
        defaultLayout={createDefaultLayout}
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
