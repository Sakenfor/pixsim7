import { useRef, useEffect, useMemo } from "react";
import type { DockviewReadyEvent, IDockviewPanelProps } from "dockview-core";
import {
  useWorkspaceStore,
  type PanelId,
  type LayoutNode,
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

// Helper to convert tree layout to Dockview panels
function applyLayoutToDockview(
  api: DockviewReadyEvent["api"],
  layout: LayoutNode<PanelId> | null,
  titles: Record<PanelId, string>,
) {
  // Clear existing panels (defensively guard against stale/undefined ids)
  const existingPanels = api.panels.map((p) => p.id).filter(Boolean);
  existingPanels.forEach((id) => {
    try {
      api.removePanel(id);
    } catch (e) {
      // If Dockview already removed this panel or its group, ignore
      // to avoid hard failures when syncing layouts.
      // console.warn('Failed to remove panel', id, e);
    }
  });

  if (!layout) return;

  let panelCounter = 0;

  // Recursively build panels from LayoutNode tree
  const buildPanels = (
    node: LayoutNode<PanelId>,
    referencePanel?: string,
    direction?: "left" | "right" | "above" | "below",
  ): string => {
    if (typeof node === "string") {
      // Leaf node - create panel
      const baseId = `${node}-panel-${panelCounter++}`;
      // Ensure the id is unique in the current Dockview instance
      let panelId = baseId;
      let suffix = 1;
      while (api.panels.some((p) => p.id === panelId)) {
        panelId = `${baseId}-${suffix++}`;
      }
      api.addPanel({
        id: panelId,
        component: "panel",
        params: { panelId: node },
        title: titles[node],
        position: referencePanel
          ? { direction: direction!, referencePanel }
          : undefined,
      });
      return panelId;
    }

    // Branch node - recursively create children
    const firstPanelId = buildPanels(node.first, referencePanel, direction);

    // Determine direction for second panel
    const secondDirection = node.direction === "row" ? "right" : "below";
    const secondPanelId = buildPanels(
      node.second,
      firstPanelId,
      secondDirection,
    );

    return firstPanelId;
  };

  buildPanels(layout);
}

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
  const lastAppliedLayoutRef = useRef<LayoutNode<PanelId> | null>(null);

  const dockviewLayout = useWorkspaceStore((s) => s.dockviewLayout);
  const currentLayout = useWorkspaceStore((s) => s.currentLayout);
  const setDockviewLayout = useWorkspaceStore((s) => s.setDockviewLayout);
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
    // Create default layout similar to mosaic default
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
    if (dockviewLayout) {
      try {
        api.fromJSON(dockviewLayout);
      } catch (error) {
        console.error("Failed to load layout:", error);
        createDefaultLayout(api);
      }
    } else {
      createDefaultLayout(api);
    }

    // Set locked state
    if (isLocked) {
      api.groups.forEach((group) => {
        group.locked = "no-drop-target";
      });
    }

    // Subscribe to layout changes to save to store
    api.onDidLayoutChange(() => {
      if (apiRef.current) {
        const layout = apiRef.current.toJSON();
        setDockviewLayout(layout);
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

  // Handle preset loading and panel restoration from currentLayout
  useEffect(() => {
    if (!apiRef.current || !isReadyRef.current) return;
    if (!currentLayout) return;

    // Only apply if the layout actually changed
    if (currentLayout === lastAppliedLayoutRef.current) return;

    lastAppliedLayoutRef.current = currentLayout;

    // Build panel titles from registry
    const panelTitles: Record<PanelId, string> = {} as any;
    panelRegistry.getAll().forEach((panel) => {
      panelTitles[panel.id] = panel.title;
    });

    applyLayoutToDockview(apiRef.current, currentLayout, panelTitles);
  }, [currentLayout]);

  return (
    <div className="h-full w-full">
      <SmartDockview
        components={components}
        onReady={handleReady}
        enableContextMenu
        theme="dockview-theme-dark"
        watermarkComponent={WorkspaceWatermark}
        panelManagerId="workspace"
      />
    </div>
  );
}
