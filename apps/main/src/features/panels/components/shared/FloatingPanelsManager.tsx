import { IconButton } from "@pixsim7/shared.ui";
import { memo, useCallback, useState, useRef } from "react";
import { Rnd } from "react-rnd";

import { readFloatingOriginMeta, stripFloatingOriginMeta } from "@lib/dockview/floatingPanelInterop";
import { PanelErrorBoundary } from "@lib/dockview/PanelErrorBoundary";
import { Icon } from "@lib/icons";
import { devToolSelectors, panelSelectors } from "@lib/plugins/catalogSelectors";
import { hmrSingleton } from "@lib/utils/hmrSafe";

import { ContextHubHost, useProvideCapability, CAP_PANEL_CONTEXT } from "@features/contextHub";
import { useWorkspaceStore, type FloatingPanelState } from "@features/workspace";
import { getFloatingDefinitionId } from "@features/workspace/lib/floatingPanelUtils";
import { panelPlacementCoordinator } from "@features/workspace/lib/panelPlacementCoordinator";

import { DevToolDynamicPanel } from "@/components/dev/DevToolDynamicPanel";

import { useDragToDock, type DropZone, type DragToDockTarget } from "../../hooks/useDragToDock";

import { DropZoneOverlay } from "./DropZoneOverlay";

// ── HMR-resilient component cache ──────────────────────────────────
// Same pattern as SmartDockview: implRef (mutable) → proxy (stable).
// On HMR, only implRef.current is updated — proxy identity never changes,
// so React doesn't unmount/remount the floating panel content.
// Cached on globalThis via hmrSingleton so the maps themselves survive re-evaluation.
const _floatingImplRefs = hmrSingleton(
  'floatingPanel:implRefs',
  () => ({} as Record<string, { current: React.ComponentType<any> }>),
);
const _floatingProxyCache = hmrSingleton(
  'floatingPanel:proxyCache',
  () => ({} as Record<string, React.ComponentType<any>>),
);

function getStableComponent(
  definitionId: string,
  component: React.ComponentType<any>,
): React.ComponentType<any> {
  if (!_floatingProxyCache[definitionId]) {
    const implRef = { current: component };
    _floatingImplRefs[definitionId] = implRef;

    const FloatingProxy = (props: any) => {
      const Impl = implRef.current;
      return Impl ? <Impl {...props} /> : null;
    };
    FloatingProxy.displayName = `FloatingProxy(${definitionId})`;
    _floatingProxyCache[definitionId] = FloatingProxy;
  } else {
    // HMR path: update the ref, keep the proxy identity stable
    _floatingImplRefs[definitionId].current = component;
  }
  return _floatingProxyCache[definitionId];
}

function formatDockviewOriginLabel(dockviewId: string | null | undefined): string | null {
  if (!dockviewId) return null;
  const known: Record<string, string> = {
    workspace: "Workspace",
    "asset-viewer": "Asset Viewer",
    assetViewer: "Asset Viewer",
    "control-center": "Control Center",
    controlCenter: "Control Center",
  };
  return known[dockviewId] ?? dockviewId;
}

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
  onDragStateChange: (panelId: string, isDragging: boolean, zone: DropZone | null, target: DragToDockTarget | null) => void;
}

const FloatingPanel = memo(function FloatingPanel({ panel, onDragStateChange }: FloatingPanelProps) {
  const minimizeFloatingPanel = useWorkspaceStore((s) => s.minimizeFloatingPanel);
  const updateFloatingPanelPosition = useWorkspaceStore(
    (s) => s.updateFloatingPanelPosition
  );
  const updateFloatingPanelSize = useWorkspaceStore(
    (s) => s.updateFloatingPanelSize
  );
  const bringFloatingPanelToFront = useWorkspaceStore(
    (s) => s.bringFloatingPanelToFront
  );

  // Resolve definition ID (strips ::N suffix for multi-instance floating panels)
  const definitionId = getFloatingDefinitionId(panel.id);

  // Build canDockInto filter from panel's availableIn
  const canDockInto = useCallback((dockviewId: string) => {
    const isDevTool = typeof definitionId === "string" && definitionId.startsWith("dev-tool:");
    if (isDevTool) return true; // dev tools can dock anywhere
    const panelDef = panelSelectors.get(definitionId);
    if (!panelDef?.availableIn || panelDef.availableIn.length === 0) return true; // no restriction
    return panelDef.availableIn.includes(dockviewId);
  }, [definitionId]);

  const {
    activeDropZone,
    activeTarget,
    onDragStart,
    onDrag,
    onDragStop,
  } = useDragToDock({ panelId: panel.id, canDockInto });

  // Keep activeDropZone/activeTarget in refs so handleDrag always reads the latest value
  const activeDropZoneRef = useRef<DropZone | null>(null);
  activeDropZoneRef.current = activeDropZone;
  const activeTargetRef = useRef<DragToDockTarget | null>(null);
  activeTargetRef.current = activeTarget;

  const rndRef = useRef<Rnd | null>(null);

  const isDevToolPanel =
    typeof definitionId === "string" && definitionId.startsWith("dev-tool:");

  let Component: React.ComponentType<any>;
  let title: string;

  const floatingOriginMeta = readFloatingOriginMeta(panel.context);
  const basePanelContext = stripFloatingOriginMeta(panel.context) ?? {};

  // For dev-tool panels, extract toolId from definition ID and ensure it's in context
  let panelContext = basePanelContext;

  if (isDevToolPanel) {
    // Extract tool ID from definition ID
    const toolId = definitionId.slice("dev-tool:".length);
    const devTool = devToolSelectors.get(toolId);

    Component = getStableComponent(`dev-tool:${toolId}`, DevToolDynamicPanel);
    title = devTool?.label || toolId;

    // Ensure toolId is in context (critical for persistence/restore)
    panelContext = { ...panelContext, toolId };
  } else {
    // Regular panel from catalog — look up by definition ID
    const panelDef = panelSelectors.get(definitionId);
    if (!panelDef) return null;

    Component = getStableComponent(definitionId, panelDef.component);
    title = panelDef.title;
  }

  const originLabel = floatingOriginMeta?.sourcePanelId
    ? (panelSelectors.get(floatingOriginMeta.sourcePanelId)?.title ?? floatingOriginMeta.sourcePanelId)
    : formatDockviewOriginLabel(floatingOriginMeta?.sourceDockviewId);
  const canReturnToOrigin = !!floatingOriginMeta?.sourceDockviewId;

  const handleDragStart = () => {
    onDragStart();
    onDragStateChange(panel.id, true, null, null);
  };

  const handleDrag = () => {
    const element = rndRef.current?.getSelfElement();
    if (element) {
      const rect = element.getBoundingClientRect();
      onDrag(rect);
      onDragStateChange(panel.id, true, activeDropZoneRef.current, activeTargetRef.current);
    }
  };

  const handleDragStop = (_e: unknown, d: { x: number; y: number }) => {
    const result = onDragStop();
    onDragStateChange(panel.id, false, null, null);

    if (result.shouldDock && result.zone) {
      panelPlacementCoordinator.dockFloatingPanel(panel.id, {
        direction: result.zone === "center" ? "within" : result.zone,
        targetDockviewId: result.targetDockviewId ?? undefined,
      });
    } else {
      updateFloatingPanelPosition(panel.id, d.x, d.y);
    }
  };

  return (
    <Rnd
      ref={rndRef}
      key={panel.id}
      position={{ x: panel.x, y: panel.y }}
      size={panel.minimized
        ? { width: panel.width, height: 34 }
        : { width: panel.width, height: panel.height }
      }
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
      minWidth={panel.minimized ? 120 : 200}
      minHeight={panel.minimized ? 34 : 200}
      enableResizing={!panel.minimized}
      bounds="window"
      dragHandleClassName="floating-panel-header"
      style={{ zIndex: 10100 + panel.zIndex }}
      className="floating-panel"
    >
      <div className={`h-full flex flex-col bg-white dark:bg-neutral-900 shadow-2xl border border-neutral-300 dark:border-neutral-700 overflow-hidden ${panel.minimized ? "rounded-full" : "rounded-lg"}`}>
        {/* Header */}
        <div
          className={`floating-panel-header flex items-center justify-between cursor-move select-none ${
            panel.minimized
              ? "px-3 py-1 bg-neutral-800 dark:bg-neutral-800"
              : "px-3 py-2 bg-neutral-100 dark:bg-neutral-800 border-b dark:border-neutral-700"
          }`}
          onDoubleClick={() => minimizeFloatingPanel(panel.id)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`font-semibold text-neutral-800 dark:text-neutral-200 truncate ${panel.minimized ? "text-xs" : "text-sm"}`}>
              {title}
            </span>
            {!panel.minimized && (
              <span className="shrink-0 px-1.5 py-0.5 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded font-medium">
                FLOATING
              </span>
            )}
            {!panel.minimized && originLabel && (
              <span className="shrink-0 text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                From {originLabel}
              </span>
            )}
          </div>
          <div className="flex items-center shrink-0">
            <IconButton
              size={panel.minimized ? "sm" : "md"}
              rounded="md"
              icon={<Icon name={panel.minimized ? "maximize2" : "minus"} size={panel.minimized ? 10 : 12} />}
              onClick={() => minimizeFloatingPanel(panel.id)}
              className={
                panel.minimized
                  ? "text-neutral-300 hover:text-blue-400"
                  : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              }
              title={panel.minimized ? "Restore panel" : "Minimize panel"}
            />
            {canReturnToOrigin && (
              <IconButton
                size={panel.minimized ? "sm" : "md"}
                rounded="md"
                icon={<Icon name="log-in" size={panel.minimized ? 10 : 12} />}
                onClick={() => {
                  panelPlacementCoordinator.closeFloatingPanelWithReturn(panel.id);
                }}
                className={
                  panel.minimized
                    ? "text-neutral-300 hover:text-emerald-400"
                    : "text-neutral-500 dark:text-neutral-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-400"
                }
                title={originLabel ? `Return to ${originLabel}` : "Return to original dock"}
              />
            )}
            <IconButton
              size={panel.minimized ? "sm" : "md"}
              rounded="md"
              icon={<Icon name="x" size={panel.minimized ? 10 : 12} />}
              onClick={() => {
                panelPlacementCoordinator.closeFloatingPanel(panel.id);
              }}
              className={
                panel.minimized
                  ? "text-neutral-300 hover:text-red-400"
                  : "text-neutral-500 dark:text-neutral-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400"
              }
              title="Close floating panel"
            />
          </div>
        </div>
        {/* Content — hidden when minimized */}
        {!panel.minimized && (
          <div className="flex-1 overflow-auto">
            <ContextHubHost hostId={`floating:${panel.id}`}>
              <FloatingPanelContextProvider
                context={panelContext}
                instanceId={`floating:${panel.id}`}
              >
                <PanelErrorBoundary panelId={definitionId}>
                  {isDevToolPanel ? (
                    <Component context={panelContext} />
                  ) : (
                    <Component {...panelContext} />
                  )}
                </PanelErrorBoundary>
              </FloatingPanelContextProvider>
            </ContextHubHost>
          </div>
        )}
      </div>
    </Rnd>
  );
});

export function FloatingPanelsManager() {
  const floatingPanels = useWorkspaceStore((s) => s.floatingPanels);

  // Track drag state across all panels to show the overlay
  const [dragState, setDragState] = useState<{
    panelId: string | null;
    isDragging: boolean;
    activeZone: DropZone | null;
    targetRect: DOMRect | null;
    targetDockviewId: string | null;
  }>({ panelId: null, isDragging: false, activeZone: null, targetRect: null, targetDockviewId: null });

  const handleDragStateChange = useCallback((
    panelId: string,
    isDragging: boolean,
    zone: DropZone | null,
    target: DragToDockTarget | null,
  ) => {
    setDragState({
      panelId: isDragging ? panelId : null,
      isDragging,
      activeZone: zone,
      targetRect: target?.rect ?? null,
      targetDockviewId: target?.dockviewId ?? null,
    });
  }, []);

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
        workspaceRect={dragState.targetRect}
        targetLabel={formatDockviewOriginLabel(dragState.targetDockviewId)}
      />
    </>
  );
}
