import { IconButton, Z } from "@pixsim7/shared.ui";
import { runAnimation } from "@pixsim7/shared.ui";
import { memo, useCallback, useMemo, useState, useRef, useEffect, Suspense } from "react";
import { Rnd } from "react-rnd";

import { readFloatingOriginMeta, stripFloatingOriginMeta } from "@lib/dockview/floatingPanelInterop";
import { PanelErrorBoundary } from "@lib/dockview/PanelErrorBoundary";
import { Icon } from "@lib/icons";
import { devToolSelectors, dockWidgetSelectors, panelSelectors } from "@lib/plugins/catalogSelectors";
import { hmrSingleton } from "@lib/utils/hmrSafe";

import { ContextHubHost, useProvideCapability, CAP_PANEL_CONTEXT } from "@features/contextHub";
import { CubeHeaderChips } from "@features/cubes/components/CubeHeaderChips";
import { useCubeSettingsStore } from "@features/cubes/stores/cubeSettingsStore";
import { useCubeStore } from "@features/cubes/useCubeStore";
import { useWorkspaceStore, type FloatingPanelState } from "@features/workspace";
import { getFloatingDefinitionId } from "@features/workspace/lib/floatingPanelUtils";
import { panelPlacementCoordinator } from "@features/workspace/lib/panelPlacementCoordinator";

import { DevToolDynamicPanel } from "@/components/dev/DevToolDynamicPanel";
import { useSharedProjectSelection } from "@/hooks";

import { useDragToDock, type DropZone, type DragToDockTarget } from "../../hooks/useDragToDock";
import { ScopeHost } from "../scope/ScopeHost";

import { DropZoneOverlay } from "./DropZoneOverlay";

// ── Fly-away helpers ───────────────────────────────────────────────

/** Resolve the on-screen center of a cube indicator widget (optionally by instance). */
function getCubeIndicatorPosition(instanceId?: string): { x: number; y: number } {
  const selector = instanceId
    ? `.floating-panel-cube-target[data-cube-instance="${instanceId}"]`
    : '.floating-panel-cube-target';
  const el = document.querySelector(selector);
  if (el) {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight - 40 };
}

/** Resolve the on-screen center of a dockview host element. */
function getDockviewPosition(dockviewId: string): { x: number; y: number } | null {
  const el = document.querySelector(`[data-smart-dockview="${dockviewId}"]`);
  if (el) {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return null;
}

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

// ── Overlap detection ────────────────────────────────────────────────

/** Check whether two axis-aligned rects overlap (non-zero intersection). */
function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Compute which panels should be dimmed.
 *
 * A panel dims only when it overlaps the focused panel and is NOT the
 * focused panel itself.  Panels that sit on their own with no overlap
 * stay at full opacity regardless of focus state.
 */
function computeDimmedPanels(
  panels: FloatingPanelState[],
  focusedId: string | null,
): Set<string> {
  const dimmed = new Set<string>();
  if (!focusedId || panels.length < 2) return dimmed;

  const focused = panels.find((p) => p.id === focusedId);
  if (!focused) return dimmed;

  const focusedRect = {
    x: focused.x,
    y: focused.y,
    width: focused.width,
    height: focused.minimized ? 42 : focused.height,
  };

  for (const p of panels) {
    if (p.id === focusedId) continue;
    const pRect = {
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.minimized ? 42 : p.height,
    };
    if (rectsOverlap(focusedRect, pRect)) {
      dimmed.add(p.id);
    }
  }
  return dimmed;
}

interface FloatingPanelProps {
  panel: FloatingPanelState;
  dimmed: boolean;
  onDragStateChange: (panelId: string, isDragging: boolean, zone: DropZone | null, target: DragToDockTarget | null) => void;
  catalogVersion: number;
  activeProjectId: number | null;
  activeProjectName: string | null;
  activeProjectSource: "override" | "authoring-context" | "editor-runtime" | "fallback" | "none";
}

const FloatingPanel = memo(function FloatingPanel({
  panel,
  dimmed,
  onDragStateChange,
  catalogVersion,
  activeProjectId,
  activeProjectName,
  activeProjectSource,
}: FloatingPanelProps) {
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
  // cubeDockPosition removed — handleSendToCube flies to the target cube instance

  // ── Fly-away animation ──
  const [flyingAway, setFlyingAway] = useState(false);
  const flyAnimRef = useRef<Animation | null>(null);

  const flyToAndDo = useCallback((target: { x: number; y: number }, onComplete: () => void) => {
    const el = rndRef.current?.getSelfElement();
    if (!el) { onComplete(); return; }
    setFlyingAway(true);
    el.style.pointerEvents = 'none';
    const anim = runAnimation(el, 'flyTo', { targetX: target.x, targetY: target.y });
    flyAnimRef.current = anim;
    anim.finished.then(onComplete).catch(() => onComplete());
  }, []);

  const handleSendToCube = useCallback((instanceId: string) => {
    // Ensure cube is visible before animating so the target element exists in the DOM
    if (!cubesVisible) setCubesVisible(true);
    // Allow a microtask for React to render the cube widget, then read its position
    queueMicrotask(() => {
      const cubePos = getCubeIndicatorPosition(instanceId);
      flyToAndDo(cubePos, () => {
        const defId = getFloatingDefinitionId(panel.id);
        minimizePanelToCube(
          defId,
          { x: panel.x, y: panel.y },
          { width: panel.width, height: panel.height },
          panel.context,
          instanceId,
        );
        closeFloatingPanel(panel.id);
      });
    });
  }, [panel.id, panel.x, panel.y, panel.width, panel.height, panel.context, minimizePanelToCube, closeFloatingPanel, cubesVisible, setCubesVisible, flyToAndDo]);

  useEffect(() => () => { flyAnimRef.current?.cancel(); }, []);

  // Resolve definition ID (strips ::N suffix for multi-instance floating panels)
  const definitionId = getFloatingDefinitionId(panel.id);
  const floatingOriginMeta = readFloatingOriginMeta(panel.context);

  const knownDockTargets = useMemo(() => {
    // Recompute when plugin catalog changes, so newly registered dock widgets
    // become valid drag-to-dock targets without a reload.
    void catalogVersion;
    const known = new Set<string>();
    for (const widget of dockWidgetSelectors.getAll()) {
      known.add(normalizeDockviewId(widget.id));
      known.add(normalizeDockviewId(widget.dockviewId));
    }
    return known;
  }, [catalogVersion]);

  // Build canDockInto filter from panel's availableIn
  const canDockInto = useCallback((dockviewId: string) => {
    const normalizedTargetId = normalizeDockviewId(dockviewId);
    const sourceDockviewId = floatingOriginMeta?.sourceDockviewId;
    const canReturnToOrigin =
      typeof sourceDockviewId === "string" &&
      sourceDockviewId.length > 0 &&
      dockviewIdMatches(sourceDockviewId, dockviewId);
    const isKnownDockTarget = knownDockTargets.has(normalizedTargetId);
    if (!isKnownDockTarget && !canReturnToOrigin) {
      // Ignore nested/internal dockview hosts (e.g. embedded quickgen widgets)
      // unless this panel explicitly originated from that host.
      return false;
    }

    const isDevTool = typeof definitionId === "string" && definitionId.startsWith("dev-tool:");
    if (isDevTool) {
      // Dev-tool panels are currently floating-only.
      // Workspace store rejects docking for them, so treat them as non-dockable
      // here to keep normal drag-stop positioning behavior.
      return false;
    }
    const panelDef = panelSelectors.get(definitionId);
    if (!panelDef) return false;
    if (panelDef.isInternal && (!panelDef.availableIn || panelDef.availableIn.length === 0)) {
      return false; // floating-only/internal panels without dock scopes are not dock targets
    }
    // Check from the panel's perspective: does the panel allow this dock?
    if (panelDef.availableIn && panelDef.availableIn.length > 0) {
      if (!panelDef.availableIn.some((scope) => dockviewIdMatches(scope, dockviewId))) {
        return false;
      }
    }

    // Check from the target dock's perspective: does it accept this panel?
    // Mirrors getScopedDockPanelIds logic in workspaceStore.
    const targetWidget = dockWidgetSelectors.getAll().find(
      (w) =>
        normalizeDockviewId(w.dockviewId) === normalizedTargetId ||
        normalizeDockviewId(w.id) === normalizedTargetId,
    );
    if (targetWidget) {
      let scopedPanelIds: string[] = [];
      if (Array.isArray(targetWidget.allowedPanels) && targetWidget.allowedPanels.length > 0) {
        scopedPanelIds = targetWidget.allowedPanels;
      } else if (typeof targetWidget.panelScope === "string" && targetWidget.panelScope.length > 0) {
        scopedPanelIds = panelSelectors.getIdsForScope(targetWidget.panelScope);
      }
      if (scopedPanelIds.length > 0 && !scopedPanelIds.includes(definitionId)) {
        return false;
      }
    }

    return true;
  }, [definitionId, floatingOriginMeta?.sourceDockviewId, knownDockTargets]);

  const rndRef = useRef<Rnd | null>(null);
  const dragElRef = useRef<HTMLElement | null>(null);

  const {
    activeDropZoneRef,
    activeTargetRef,
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

  const isDevToolPanel =
    typeof definitionId === "string" && definitionId.startsWith("dev-tool:");

  let Component: React.ComponentType<any>;
  let title: string;
  let panelCategoryBadge: string | null = null;
  let panelContextSummary: string | null = null;

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
          panelContextSummary = `Active project: ${activeProjectName} (${activeProjectSource})`;
        } else if (typeof activeProjectId === "number") {
          panelContextSummary = `Active project: #${activeProjectId} (${activeProjectSource})`;
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
      const stillFloating = useWorkspaceStore
        .getState()
        .floatingPanels.some((floating) => floating.id === panel.id);
      if (stillFloating) {
        // Safety fallback: if docking was rejected/failed, preserve the dropped position
        // instead of snapping back to the previous floating coordinates.
        updateFloatingPanelPosition(panel.id, d.x, d.y);
      }
    } else {
      updateFloatingPanelPosition(panel.id, d.x, d.y);
    }
  };

  return (
    <Rnd
      ref={rndRef}
      key={panel.id}
      position={{ x: panel.x, y: panel.y }}
      size={panel.minimized ? { width: panel.width, height: 42 } : { width: panel.width, height: panel.height }}
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
      minHeight={panel.minimized ? 42 : 200}
      bounds="window"
      dragHandleClassName="floating-panel-header"
      style={{
        zIndex: Z.floatPanel + panel.zIndex,
        opacity: dimmed ? 0.45 : 1,
        transition: 'opacity 0.2s ease-out',
        pointerEvents: dimmed ? 'none' : undefined,
      }}
      className="floating-panel"
      disableDragging={flyingAway}
      enableResizing={!flyingAway && !panel.minimized}
    >
      <div className="h-full flex flex-col bg-white dark:bg-neutral-900 shadow-2xl border border-neutral-300 dark:border-neutral-700 overflow-hidden rounded-lg">
        {/* Header — stays interactive when unfocused so users can re-focus */}
        <div
          className="floating-panel-header flex items-center justify-between cursor-move select-none px-3 py-2 bg-neutral-100 dark:bg-neutral-800 border-b dark:border-neutral-700"
          style={dimmed ? { pointerEvents: 'auto' } : undefined}
          onMouseDown={() => bringFloatingPanelToFront(panel.id)}
          onDoubleClick={() => useWorkspaceStore.getState().minimizeFloatingPanel(panel.id)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-neutral-800 dark:text-neutral-200 truncate text-sm">
              {title}
            </span>
            {!panel.minimized && panelCategoryBadge && (
              <span className="shrink-0 px-1.5 py-0.5 text-[10px] bg-neutral-200/70 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded font-medium uppercase tracking-wide">
                {panelCategoryBadge}
              </span>
            )}
            {!panel.minimized && panelContextSummary && (
              <span className="shrink-0 text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                {panelContextSummary}
              </span>
            )}
            {!panel.minimized && originLabel && (
              <span className="shrink-0 text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                From {originLabel}
              </span>
            )}
          </div>
          <div className="flex items-center shrink-0">
            <CubeHeaderChips onSendToCube={handleSendToCube} />
            <div className="w-px h-4 bg-neutral-300 dark:bg-neutral-600 mx-1" />
            <IconButton
              size="md"
              rounded="md"
              icon={<Icon name="minus" size={12} />}
              onClick={() => useWorkspaceStore.getState().minimizeFloatingPanel(panel.id)}
              className="text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              title="Minimize"
            />
            {canReturnToOrigin && (
              <IconButton
                size="md"
                rounded="md"
                icon={<Icon name="log-in" size={12} />}
                onClick={() => {
                  const dockId = floatingOriginMeta?.sourceDockviewId;
                  const target = dockId ? getDockviewPosition(dockId) : null;
                  if (target) {
                    flyToAndDo(target, () => {
                      panelPlacementCoordinator.closeFloatingPanelWithReturn(panel.id);
                    });
                  } else {
                    panelPlacementCoordinator.closeFloatingPanelWithReturn(panel.id);
                  }
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
        {/* Content — hidden when minimized */}
        {!panel.minimized && (
          <div className="flex-1 overflow-auto">
            <ContextHubHost hostId={floatingInstanceId}>
              <FloatingPanelContextProvider
                context={panelContext}
                instanceId={floatingInstanceId}
              >
                <Suspense fallback={
                  <div className="h-full w-full flex items-center justify-center text-xs text-neutral-400">
                    Loading…
                  </div>
                }>
                  <PanelErrorBoundary panelId={definitionId}>
                    {renderPanelContent()}
                  </PanelErrorBoundary>
                </Suspense>
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
  const {
    selectedProjectId: activeProjectId,
    selectedProjectName: activeProjectName,
    selectedProjectSource: activeProjectSource,
  } = useSharedProjectSelection({ loadCatalog: false });
  const [catalogVersion, setCatalogVersion] = useState(0);

  // Clear focused floating panel only when all floating panels are closed.
  // We intentionally do NOT blur on every outside click — that caused
  // distracting opacity flicker whenever the user re-focused a dockview panel.
  // Instead, non-focused floating panels stay faded until the user clicks a
  // different floating panel (which updates focusedFloatingPanelId).
  useEffect(() => {
    if (floatingPanels.length === 0) {
      useWorkspaceStore.getState().blurFloatingPanels();
    }
  }, [floatingPanels.length]);

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

  // Compute which panels should dim based on overlap with the focused panel.
  const focusedId = useWorkspaceStore((s) => s.focusedFloatingPanelId);
  const dimmedIds = useMemo(
    () => computeDimmedPanels(floatingPanels, focusedId),
    [floatingPanels, focusedId],
  );

  // Don't render floating panels until panel definitions are available.
  // The DropZoneOverlay is always safe to render.
  return (
    <>
      {catalogReady &&
        floatingPanels.map((panel) => (
          <FloatingPanel
            key={panel.id}
            panel={panel}
            dimmed={dimmedIds.has(panel.id)}
            onDragStateChange={handleDragStateChange}
            catalogVersion={catalogVersion}
            activeProjectId={activeProjectId}
            activeProjectName={activeProjectName}
            activeProjectSource={activeProjectSource}
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
