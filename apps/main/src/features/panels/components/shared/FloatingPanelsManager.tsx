import { useState, useRef } from "react";
import { Rnd } from "react-rnd";

import { devToolSelectors, panelSelectors } from "@lib/plugins/catalogSelectors";

import { ContextHubHost, useProvideCapability, CAP_PANEL_CONTEXT } from "@features/contextHub";
import { useWorkspaceStore, type FloatingPanelState } from "@features/workspace";

import { DevToolDynamicPanel } from "@/components/dev/DevToolDynamicPanel";

import { useDragToDock, type DropZone } from "../../hooks/useDragToDock";
import { ScopeHost } from "../scope/ScopeHost";

import { DropZoneOverlay } from "./DropZoneOverlay";

/**
 * Provides panel context as a capability for floating panels,
 * matching SmartDockview's pattern.
 */
function FloatingPanelContextProvider({
  context,
  instanceId,
  children,
}: {
  context: any;
  instanceId: string;
  children: React.ReactNode;
}) {
  useProvideCapability(
    CAP_PANEL_CONTEXT,
    {
      id: `panel-context:${instanceId}`,
      label: "Panel Context",
      getValue: () => context,
    },
    [context],
  );
  return <>{children}</>;
}

interface FloatingPanelProps {
  panel: FloatingPanelState;
  onDragStateChange: (panelId: string, isDragging: boolean, zone: DropZone | null, rect: DOMRect | null) => void;
}

function FloatingPanel({ panel, onDragStateChange }: FloatingPanelProps) {
  const closeFloatingPanel = useWorkspaceStore((s) => s.closeFloatingPanel);
  const updateFloatingPanelPosition = useWorkspaceStore(
    (s) => s.updateFloatingPanelPosition
  );
  const updateFloatingPanelSize = useWorkspaceStore(
    (s) => s.updateFloatingPanelSize
  );
  const bringFloatingPanelToFront = useWorkspaceStore(
    (s) => s.bringFloatingPanelToFront
  );
  const dockFloatingPanel = useWorkspaceStore((s) => s.dockFloatingPanel);

  const {
    activeDropZone,
    workspaceRect,
    onDragStart,
    onDrag,
    onDragStop,
  } = useDragToDock({ panelId: panel.id });

  const rndRef = useRef<Rnd | null>(null);

  // Check if this is a dev-tool panel (format: "dev-tool:toolId")
  const isDevToolPanel =
    typeof panel.id === "string" && panel.id.startsWith("dev-tool:");

  let Component: React.ComponentType<any>;
  let title: string;
  let declaredScopes: string[] | undefined;
  let panelTags: string[] | undefined;
  let panelCategory: string | undefined;

  // For dev-tool panels, extract toolId from panel ID and ensure it's in context
  let panelContext = panel.context || {};

  if (isDevToolPanel) {
    // Extract tool ID from panel ID
    const toolId = panel.id.slice("dev-tool:".length);
    const devTool = devToolSelectors.get(toolId);

    Component = DevToolDynamicPanel;
    title = devTool?.label || toolId;

    // Ensure toolId is in context (critical for persistence/restore)
    panelContext = { ...panelContext, toolId };
  } else {
    // Regular panel from catalog
    const panelDef = panelSelectors.get(panel.id);
    if (!panelDef) return null;

    Component = panelDef.component;
    title = panelDef.title;
    declaredScopes = panelDef.settingScopes;
    panelTags = panelDef.tags;
    panelCategory = panelDef.category;
  }

  const handleDragStart = () => {
    onDragStart();
    onDragStateChange(panel.id, true, null, workspaceRect);
  };

  const handleDrag = () => {
    // Get current panel position from the dragging element
    const element = rndRef.current?.getSelfElement();
    if (element) {
      const rect = element.getBoundingClientRect();
      onDrag(rect);
      onDragStateChange(panel.id, true, activeDropZone, workspaceRect);
    }
  };

  const handleDragStop = (_e: unknown, d: { x: number; y: number }) => {
    const result = onDragStop();
    onDragStateChange(panel.id, false, null, null);

    if (result.shouldDock && result.zone) {
      // Dock the panel at the detected zone
      dockFloatingPanel(panel.id, {
        direction: result.zone === "center" ? "within" : result.zone,
      });
    } else {
      // Just update position
      updateFloatingPanelPosition(panel.id, d.x, d.y);
    }
  };

  return (
    <Rnd
      ref={rndRef}
      key={panel.id}
      position={{ x: panel.x, y: panel.y }}
      size={{ width: panel.width, height: panel.height }}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragStop={handleDragStop}
      onResizeStop={(e, direction, ref, delta, position) => {
        updateFloatingPanelSize(
          panel.id,
          parseInt(ref.style.width),
          parseInt(ref.style.height)
        );
        updateFloatingPanelPosition(panel.id, position.x, position.y);
      }}
      onMouseDown={() => bringFloatingPanelToFront(panel.id)}
      minWidth={300}
      minHeight={200}
      bounds="window"
      dragHandleClassName="floating-panel-header"
      style={{ zIndex: 10100 + panel.zIndex }}
      className="floating-panel"
    >
      <div className="h-full flex flex-col bg-white dark:bg-neutral-900 rounded-lg shadow-2xl border border-neutral-300 dark:border-neutral-700 overflow-hidden">
        {/* Header */}
        <div className="floating-panel-header flex items-center justify-between px-3 py-2 bg-neutral-100 dark:bg-neutral-800 border-b dark:border-neutral-700 cursor-move">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              {title}
            </span>
            <span className="px-1.5 py-0.5 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded font-medium">
              FLOATING
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => closeFloatingPanel(panel.id)}
              className="text-neutral-600 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              title="Close floating panel"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <ContextHubHost hostId={`floating:${panel.id}`}>
            <ScopeHost
              panelId={panel.id}
              instanceId={`floating:${panel.id}`}
              declaredScopes={declaredScopes}
              tags={panelTags}
              category={panelCategory}
            >
              <FloatingPanelContextProvider
                context={panelContext}
                instanceId={`floating:${panel.id}`}
              >
                {isDevToolPanel ? (
                  <Component context={panelContext} />
                ) : (
                  <Component {...panelContext} />
                )}
              </FloatingPanelContextProvider>
            </ScopeHost>
          </ContextHubHost>
        </div>
      </div>
    </Rnd>
  );
}

export function FloatingPanelsManager() {
  const floatingPanels = useWorkspaceStore((s) => s.floatingPanels);

  // Track drag state across all panels to show the overlay
  const [dragState, setDragState] = useState<{
    panelId: string | null;
    isDragging: boolean;
    activeZone: DropZone | null;
    workspaceRect: DOMRect | null;
  }>({ panelId: null, isDragging: false, activeZone: null, workspaceRect: null });

  const handleDragStateChange = (
    panelId: string,
    isDragging: boolean,
    zone: DropZone | null,
    rect: DOMRect | null
  ) => {
    setDragState({
      panelId: isDragging ? panelId : null,
      isDragging,
      activeZone: zone,
      workspaceRect: rect,
    });
  };

  return (
    <>
      {floatingPanels.map((panel) => (
        <FloatingPanel
          key={panel.id}
          panel={panel}
          onDragStateChange={handleDragStateChange}
        />
      ))}
      <DropZoneOverlay
        isDragging={dragState.isDragging}
        activeZone={dragState.activeZone}
        workspaceRect={dragState.workspaceRect}
      />
    </>
  );
}
