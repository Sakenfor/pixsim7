import { useRef, useEffect, useMemo } from "react";
import type { DockviewReadyEvent, IDockviewPanelProps } from "dockview-core";
import {
  useWorkspaceStore,
  type PanelId,
  type DockviewLayout,
} from "../stores/workspaceStore";
import { panelRegistry, initializePanels, PanelHostLite } from "@features/panels";
import { initializeWidgets } from "@lib/ui/composer";
import { SmartDockview } from "@lib/dockview";

// Wrapper for panels to provide data-panel-id and a common header
function PanelWrapper(props: IDockviewPanelProps<{ panelId: PanelId }>) {
  const { params } = props;
  const panelId = params?.panelId;

  if (!panelId) {
    return <div className="p-4 text-red-500">Error: No panel ID</div>;
  }

  if (!panelRegistry.get(panelId)) {
    return <div className="p-4 text-red-500">Unknown panel: {panelId}</div>;
  }

  return (
    <PanelHostLite
      panelId={panelId}
      className="h-full w-full"
      variant="dockview"
    />
  );
}

/** Get panel title from registry, with id as fallback */
const getPanelTitle = (id: PanelId): string =>
  panelRegistry.get(id)?.title ?? id;

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
  const isReadyRef = useRef(false);
  const isApplyingLayoutRef = useRef(false);

  const savedLayout = useWorkspaceStore((s) => s.getLayout("workspace"));
  const setLayout = useWorkspaceStore((s) => s.setLayout);
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

  // Components map for SmartDockview
  const components = useMemo(() => ({
    panel: PanelWrapper,
  }), []);

  const createDefaultLayout = (api: DockviewReadyEvent["api"]) => {
    // Create default layout
    api.addPanel({
      id: "gallery-panel",
      component: "panel",
      params: { panelId: "gallery" as PanelId },
      title: getPanelTitle("gallery"),
      position: { direction: "left" },
    });

    api.addPanel({
      id: "health-panel",
      component: "panel",
      params: { panelId: "health" as PanelId },
      title: getPanelTitle("health"),
      position: { direction: "below", referencePanel: "gallery-panel" },
    });

    api.addPanel({
      id: "graph-panel",
      component: "panel",
      params: { panelId: "graph" as PanelId },
      title: getPanelTitle("graph"),
      position: { direction: "right" },
    });

    api.addPanel({
      id: "inspector-panel",
      component: "panel",
      params: { panelId: "inspector" as PanelId },
      title: getPanelTitle("inspector"),
      position: { direction: "right", referencePanel: "graph-panel" },
    });

    api.addPanel({
      id: "game-panel",
      component: "panel",
      params: { panelId: "game" as PanelId },
      title: getPanelTitle("game"),
      position: { direction: "below", referencePanel: "inspector-panel" },
    });
  };

  const handleReady = (api: DockviewReadyEvent["api"]) => {
    apiRef.current = api;
    isReadyRef.current = true;

    // Load saved layout or create default
    // Set flag to prevent initial layout from triggering a save
    isApplyingLayoutRef.current = true;
    try {
      if (savedLayout) {
        try {
          api.fromJSON(savedLayout);
        } catch (error) {
          console.error("Failed to load layout:", error);
          createDefaultLayout(api);
        }
      } else {
        createDefaultLayout(api);
      }
    } finally {
      // Clear flag after layout is applied
      setTimeout(() => {
        isApplyingLayoutRef.current = false;
      }, 100);
    }

    // Set locked state
    if (isLocked) {
      api.groups.forEach((group) => {
        group.locked = "no-drop-target";
      });
    }

    // Subscribe to layout changes to save to store
    api.onDidLayoutChange(() => {
      // Skip saving if we're currently applying a layout from the store
      // to prevent feedback loops
      if (isApplyingLayoutRef.current) {
        return;
      }

      if (apiRef.current) {
        const layout = apiRef.current.toJSON() as DockviewLayout;
        setLayout("workspace", layout);
      }
    });
  };

  // Update locked state
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

  // Handle layout changes from store (e.g., preset loading)
  useEffect(() => {
    if (!apiRef.current || !isReadyRef.current) return;

    // If layout in store changed (e.g., preset loaded), apply it
    if (savedLayout) {
      try {
        // Set flag to prevent feedback loop
        isApplyingLayoutRef.current = true;
        apiRef.current.fromJSON(savedLayout);
      } catch (error) {
        console.error("Failed to apply layout from store:", error);
      } finally {
        // Clear flag after a short delay to allow layout changes to settle
        setTimeout(() => {
          isApplyingLayoutRef.current = false;
        }, 100);
      }
    }
  }, [savedLayout]);

  return (
    <div className="h-full w-full">
      <SmartDockview
        components={components}
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
