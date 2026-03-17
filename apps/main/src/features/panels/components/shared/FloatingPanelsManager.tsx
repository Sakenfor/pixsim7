import { IconButton, Z } from "@pixsim7/shared.ui";
import { memo, useCallback, useState, useRef, useEffect } from "react";
import { Rnd } from "react-rnd";

import { readFloatingOriginMeta, stripFloatingOriginMeta } from "@lib/dockview/floatingPanelInterop";
import { PanelErrorBoundary } from "@lib/dockview/PanelErrorBoundary";
import { Icon } from "@lib/icons";
import { devToolSelectors, panelSelectors } from "@lib/plugins/catalogSelectors";
import { hmrSingleton } from "@lib/utils/hmrSafe";

import { ContextHubHost, useProvideCapability, CAP_PANEL_CONTEXT } from "@features/contextHub";
import { useCubeSettingsStore } from "@features/cubes/stores/cubeSettingsStore";
import { useCubeStore } from "@features/cubes/useCubeStore";
import { useProjectSessionStore } from "@features/scene";
import { useWorkspaceStore, type FloatingPanelState } from "@features/workspace";
import { getFloatingDefinitionId } from "@features/workspace/lib/floatingPanelUtils";
import { panelPlacementCoordinator } from "@features/workspace/lib/panelPlacementCoordinator";

import { DevToolDynamicPanel } from "@/components/dev/DevToolDynamicPanel";

import { useDragToDock, type DropZone, type DragToDockTarget } from "../../hooks/useDragToDock";
import { ScopeHost } from "../scope/ScopeHost";

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
const _missingPanelRecoveryState = hmrSingleton(
  'floatingPanel:missingPanelRecovery',
  () => ({
    inFlight: new Set<string>(),
    lastAttemptAt: new Map<string, number>(),
  }),
);

const MISSING_PANEL_RECOVERY_COOLDOWN_MS = 1200;

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

async function attemptMissingPanelRecovery(definitionId: string): Promise<void> {
  if (_missingPanelRecoveryState.inFlight.has(definitionId)) {
    return;
  }

  const now = Date.now();
  const lastAttempt = _missingPanelRecoveryState.lastAttemptAt.get(definitionId) ?? 0;
  if (now - lastAttempt < MISSING_PANEL_RECOVERY_COOLDOWN_MS) {
    return;
  }
  _missingPanelRecoveryState.lastAttemptAt.set(definitionId, now);
  _missingPanelRecoveryState.inFlight.add(definitionId);

  try {
    const [{ autoRegisterPanels }, { panelSelectors: refreshedSelectors }] = await Promise.all([
      import("@features/panels/lib/autoDiscovery"),
      import("@lib/plugins/catalogSelectors"),
    ]);
    await autoRegisterPanels({ panelIds: [definitionId] });

    if (!refreshedSelectors.has(definitionId)) {
      console.warn(
        `[FloatingPanelsManager] Unable to recover missing panel definition "${definitionId}"`,
      );
    }
  } catch (error) {
    console.warn(
      `[FloatingPanelsManager] Failed to recover missing panel definition "${definitionId}"`,
      error,
    );
  } finally {
    _missingPanelRecoveryState.inFlight.delete(definitionId);
  }
}

function MissingPanelContent({ panelId }: { panelId?: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 p-6">
      <div className="max-w-sm w-full text-center space-y-3">
        <div className="text-xl">Recovering panel</div>
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Panel definition for{' '}
          <span className="font-mono bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded">
            {panelId ?? 'unknown'}
          </span>{' '}
          was not found. Retrying registration.
        </p>
        {panelId && (
          <button
            type="button"
            onClick={() => {
              void attemptMissingPanelRecovery(panelId);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Retry now
          </button>
        )}
      </div>
    </div>
  );
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

function normalizeDockviewId(value: string | null | undefined): string {
  return (value ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function dockviewIdMatches(a: string, b: string): boolean {
  return normalizeDockviewId(a) === normalizeDockviewId(b);
}

function readGenerationScopeIdFromContext(
  context: Record<string, unknown> | undefined,
): string | null {
  if (!context) return null;

  const direct = context.generationScopeId;
  if (typeof direct === "string" && direct.length > 0) {
    return direct;
  }

  const nested = context.context;
  if (nested && typeof nested === "object") {
    const nestedScopeId = (nested as Record<string, unknown>).generationScopeId;
    if (typeof nestedScopeId === "string" && nestedScopeId.length > 0) {
      return nestedScopeId;
    }
  }

  return null;
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
  catalogVersion: number;
}

const FloatingPanel = memo(function FloatingPanel({ panel, onDragStateChange, catalogVersion }: FloatingPanelProps) {
  void catalogVersion;
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
  const minimizePanelToCube = useCubeStore((s) => s.minimizePanelToCube);
  const cubesVisible = useCubeSettingsStore((s) => s.visible);
  const setCubesVisible = useCubeSettingsStore((s) => s.setVisible);
  const cubeDockPosition = useCubeSettingsStore((s) => s.dockPosition);
  const activeProjectId = useProjectSessionStore((s) => s.currentProjectId);
  const activeProjectName = useProjectSessionStore((s) => s.currentProjectName);

  const handleMinimizeToCube = useCallback(() => {
    // Only send to cube when it's free-floating (undocked).
    // When docked, just close the panel normally.
    if (cubeDockPosition !== 'floating') {
      closeFloatingPanel(panel.id);
      return;
    }
    minimizePanelToCube(
      panel.id,
      { x: panel.x, y: panel.y },
      { width: panel.width, height: panel.height },
      panel.context,
    );
    closeFloatingPanel(panel.id);
    if (!cubesVisible) setCubesVisible(true);
  }, [panel.id, panel.x, panel.y, panel.width, panel.height, panel.context, minimizePanelToCube, closeFloatingPanel, cubesVisible, setCubesVisible, cubeDockPosition]);

  // Resolve definition ID (strips ::N suffix for multi-instance floating panels)
  const definitionId = getFloatingDefinitionId(panel.id);

  // Build canDockInto filter from panel's availableIn
  const canDockInto = useCallback((dockviewId: string) => {
    const isDevTool = typeof definitionId === "string" && definitionId.startsWith("dev-tool:");
    if (isDevTool) return true; // dev tools can dock anywhere
    const panelDef = panelSelectors.get(definitionId);
    if (!panelDef) return false;
    if (panelDef.isInternal && (!panelDef.availableIn || panelDef.availableIn.length === 0)) {
      return false; // floating-only/internal panels without dock scopes are not dock targets
    }
    if (!panelDef.availableIn || panelDef.availableIn.length === 0) return true; // no restriction
    return panelDef.availableIn.some((scope) => dockviewIdMatches(scope, dockviewId));
  }, [definitionId]);

  const rndRef = useRef<Rnd | null>(null);
  const dragElRef = useRef<HTMLElement | null>(null);

  const {
    activeDropZone,
    activeTarget,
    onDragStart,
    onDrag,
    onDragStop,
  } = useDragToDock({
    panelId: panel.id,
    canDockInto,
    holdDelayMs: 520,
    activationInsetPx: 24,
    dragElementRef: dragElRef,
  });

  // Keep activeDropZone/activeTarget in refs so handleDrag always reads the latest value
  const activeDropZoneRef = useRef<DropZone | null>(null);
  activeDropZoneRef.current = activeDropZone;
  const activeTargetRef = useRef<DragToDockTarget | null>(null);
  activeTargetRef.current = activeTarget;

  const isDevToolPanel =
    typeof definitionId === "string" && definitionId.startsWith("dev-tool:");

  let Component: React.ComponentType<any>;
  let title: string;
  let panelCategoryBadge: string | null = null;
  let panelContextSummary: string | null = null;

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
    if (!panelDef) {
      void attemptMissingPanelRecovery(definitionId);
      Component = getStableComponent(
        `missing-panel:${definitionId}`,
        MissingPanelContent,
      );
      title = definitionId;
      panelCategoryBadge = "RECOVERING";
      panelContextSummary = "Panel definition missing; trying HMR re-registration";
      panelContext = { ...panelContext, panelId: definitionId };
    } else {
      Component = getStableComponent(definitionId, panelDef.component);
      title = panelDef.title;
      panelCategoryBadge =
        typeof panelDef.category === "string" && panelDef.category.length > 0
          ? panelDef.category.toUpperCase()
          : null;

      if (definitionId === "project") {
        if (typeof activeProjectName === "string" && activeProjectName.trim().length > 0) {
          panelContextSummary = `Active project: ${activeProjectName}`;
        } else if (typeof activeProjectId === "number") {
          panelContextSummary = `Active project: #${activeProjectId}`;
        } else {
          panelContextSummary = "Active project: none";
        }
      }
    }

  }

  const originLabel = floatingOriginMeta?.sourceDefinitionId
    ? (panelSelectors.get(floatingOriginMeta.sourceDefinitionId)?.title ?? floatingOriginMeta.sourceDefinitionId)
    : formatDockviewOriginLabel(floatingOriginMeta?.sourceDockviewId);
  const canReturnToOrigin =
    !!floatingOriginMeta?.sourceDockviewId && !!floatingOriginMeta?.sourceDefinitionId;
  const sourceInstanceId =
    typeof floatingOriginMeta?.sourceInstanceId === "string" &&
    floatingOriginMeta.sourceInstanceId.length > 0
      ? floatingOriginMeta.sourceInstanceId
      : null;
  const sourceGenerationScopeId = readGenerationScopeIdFromContext(basePanelContext);
  const floatingInstanceId = `floating:${panel.id}`;
  const scopeInstanceId = sourceGenerationScopeId ?? sourceInstanceId ?? floatingInstanceId;
  const scopeDockviewId = floatingOriginMeta?.sourceDockviewId ?? "floating";
  const panelDefForScope = !isDevToolPanel ? panelSelectors.get(definitionId) : null;

  const renderPanelContent = () => {
    if (isDevToolPanel) {
      return <Component context={panelContext} />;
    }

    const rendered = <Component {...panelContext} />;
    if (!panelDefForScope) return rendered;

    return (
      <ScopeHost
        panelId={definitionId}
        instanceId={scopeInstanceId}
        dockviewId={scopeDockviewId}
        declaredScopes={panelDefForScope.settingScopes}
        tags={panelDefForScope.tags}
        category={panelDefForScope.category}
      >
        {rendered}
      </ScopeHost>
    );
  };

  const handleDragStart = () => {
    // Sync the drag element ref so useDragToDock can exclude child dockviews
    dragElRef.current = rndRef.current?.getSelfElement() ?? null;
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
    // Read the component's state-synced ref BEFORE onDragStop resets everything.
    // This ref only becomes non-null after React renders the drop zone overlay,
    // so it guards against docking when the user never saw the highlight.
    const wasHighlightRendered = activeDropZoneRef.current !== null;
    const result = onDragStop();
    onDragStateChange(panel.id, false, null, null);

    if (result.shouldDock && result.zone && wasHighlightRendered) {
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
      minWidth={200}
      minHeight={200}
      bounds="window"
      dragHandleClassName="floating-panel-header"
      style={{ zIndex: Z.floatPanel + panel.zIndex }}
      className="floating-panel"
    >
      <div className="h-full flex flex-col bg-white dark:bg-neutral-900 shadow-2xl border border-neutral-300 dark:border-neutral-700 overflow-hidden rounded-lg">
        {/* Header */}
        <div
          className="floating-panel-header flex items-center justify-between cursor-move select-none px-3 py-2 bg-neutral-100 dark:bg-neutral-800 border-b dark:border-neutral-700"
          onDoubleClick={handleMinimizeToCube}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-neutral-800 dark:text-neutral-200 truncate text-sm">
              {title}
            </span>
            {panelCategoryBadge && (
              <span className="shrink-0 px-1.5 py-0.5 text-[10px] bg-neutral-200/70 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded font-medium uppercase tracking-wide">
                {panelCategoryBadge}
              </span>
            )}
            <span className="shrink-0 px-1.5 py-0.5 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded font-medium">
              FLOATING
            </span>
            {panelContextSummary && (
              <span className="shrink-0 text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                {panelContextSummary}
              </span>
            )}
            {originLabel && (
              <span className="shrink-0 text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                From {originLabel}
              </span>
            )}
          </div>
          <div className="flex items-center shrink-0">
            <IconButton
              size="md"
              rounded="md"
              icon={<Icon name="minus" size={12} />}
              onClick={handleMinimizeToCube}
              className="text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              title="Minimize to cube"
            />
            {canReturnToOrigin && (
              <IconButton
                size="md"
                rounded="md"
                icon={<Icon name="log-in" size={12} />}
                onClick={() => {
                  panelPlacementCoordinator.closeFloatingPanelWithReturn(panel.id);
                }}
                className="text-neutral-500 dark:text-neutral-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-400"
                title={originLabel ? `Return to ${originLabel}` : "Return to original dock"}
              />
            )}
            <IconButton
              size="md"
              rounded="md"
              icon={<Icon name="x" size={12} />}
              onClick={() => {
                panelPlacementCoordinator.closeFloatingPanel(panel.id);
              }}
              className="text-neutral-500 dark:text-neutral-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400"
              title="Close floating panel"
            />
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-auto">
          <ContextHubHost hostId={floatingInstanceId}>
            <FloatingPanelContextProvider
              context={panelContext}
              instanceId={floatingInstanceId}
            >
              <PanelErrorBoundary panelId={definitionId}>
                {renderPanelContent()}
              </PanelErrorBoundary>
            </FloatingPanelContextProvider>
          </ContextHubHost>
        </div>
      </div>
    </Rnd>
  );
});

export function FloatingPanelsManager() {
  const floatingPanels = useWorkspaceStore((s) => s.floatingPanels);
  const [catalogVersion, setCatalogVersion] = useState(0);

  // Defer rendering persisted floating panels until the panel catalog has
  // been populated.  Without this guard, panels mount before definitions are
  // registered, render empty/recovery UI, and even after definitions arrive
  // the component content can stay in a broken state.
  const [catalogReady, setCatalogReady] = useState(() => panelSelectors.size > 0);

  // HMR resilience: force memoized FloatingPanel instances to re-render when
  // panel definitions are re-registered in the plugin catalog.
  useEffect(() => {
    return panelSelectors.subscribe(() => {
      if (!catalogReady) setCatalogReady(true);
      setCatalogVersion((v) => v + 1);
    });
  }, [catalogReady]);

  // Safety fallback: if the catalog never fires (edge case), render after 3s
  useEffect(() => {
    if (catalogReady) return;
    const timer = setTimeout(() => setCatalogReady(true), 3000);
    return () => clearTimeout(timer);
  }, [catalogReady]);

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

  // Don't render floating panels until panel definitions are available.
  // The DropZoneOverlay is always safe to render.
  return (
    <>
      {catalogReady &&
        floatingPanels.map((panel) => (
          <FloatingPanel
            key={panel.id}
            panel={panel}
            onDragStateChange={handleDragStateChange}
            catalogVersion={catalogVersion}
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
