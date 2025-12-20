import { useRef, useEffect } from "react";
import type { DockviewReadyEvent } from "dockview-core";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { initializePanels } from "@features/panels";
import { initializeWidgets } from "@lib/ui/composer";
import { SmartDockview } from "@lib/dockview";
import {
  workspacePanelRegistry,
  createDefaultLayout,
} from "../lib/workspacePanelRegistry";

// Watermark component for empty workspace
function WorkspaceWatermark() {
  return (
    <div className="flex items-center justify-center h-full text-white/20 text-sm">
      Pixsim7 Workspace
    </div>
  );
}

/** Storage key for workspace layout persistence */
const WORKSPACE_STORAGE_KEY = "workspace-layout-v1";

export function DockviewWorkspace() {
  const apiRef = useRef<DockviewReadyEvent["api"] | null>(null);
  const isLocked = useWorkspaceStore((s) => s.isLocked);

  // Initialize panels and widgets on mount
  useEffect(() => {
    Promise.all([
      initializePanels(),
      Promise.resolve(initializeWidgets()),
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

  return (
    <div className="h-full w-full">
      <SmartDockview
        registry={workspacePanelRegistry}
        storageKey={WORKSPACE_STORAGE_KEY}
        defaultLayout={createDefaultLayout}
        onReady={handleReady}
        enableContextMenu
        theme="dockview-theme-dark"
        watermarkComponent={WorkspaceWatermark}
        panelManagerId="workspace"
        capabilities={{
          floatPanelHandler: (dockviewPanelId, panel, options) => {
            // Extract workspace PanelId from panel params
            const workspacePanelId = panel?.params?.panelId;
            if (workspacePanelId) {
              useWorkspaceStore.getState().openFloatingPanel(workspacePanelId, options);
            }
          },
        }}
      />
    </div>
  );
}
