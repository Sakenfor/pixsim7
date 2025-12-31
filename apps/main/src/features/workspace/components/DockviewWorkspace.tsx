import { useRef, useEffect, useMemo } from "react";
import type { DockviewReadyEvent } from "dockview-core";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { initializePanels, panelRegistry, type PanelDefinition } from "@features/panels";
import { registerAllWidgets } from "@lib/widgets";
import { SmartDockview } from "@lib/dockview";
import { resolvePanelDefinitionId } from "@lib/dockview/panelAdd";

// Watermark component for empty workspace
function WorkspaceWatermark() {
  return (
    <div className="flex items-center justify-center h-full text-white/20 text-sm">
      Pixsim7 Workspace
    </div>
  );
}

const defaultWorkspacePanels: string[] = ["gallery", "health", "graph", "inspector", "game"];

function resolveTitle(panelId: string, panelDefs?: PanelDefinition[]) {
  const fromResolved = panelDefs?.find((p) => p.id === panelId)?.title;
  if (fromResolved) return fromResolved;
  return panelRegistry.get(panelId)?.title ?? panelId;
}

export function createDefaultLayout(api: DockviewReadyEvent["api"], panelDefs: PanelDefinition[] = []) {
  const addPanel = (
    id: string,
    position?: { direction: "left" | "right" | "below" | "above"; referencePanel?: string }
  ) => {
    if (!panelRegistry.get(id)) return;
    api.addPanel({
      id,
      component: id,
      title: resolveTitle(id, panelDefs),
      position,
    });
  };

  // Gallery stack on the left
  addPanel("gallery", { direction: "left" });
  addPanel("health", { direction: "below", referencePanel: "gallery" });

  // Graph + inspector on the right
  addPanel("graph", { direction: "right" });
  addPanel("inspector", { direction: "right", referencePanel: "graph" });
  addPanel("game", { direction: "below", referencePanel: "inspector" });

  // If any of the default panels are missing, add remaining known defaults as tabs
  defaultWorkspacePanels.forEach((panelId) => {
    if (api.panels.find((p) => p.id === panelId)) return;
    addPanel(panelId, { direction: "right", referencePanel: "graph" });
  });
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
          useWorkspaceStore.getState().openFloatingPanel(workspacePanelId, options);
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
