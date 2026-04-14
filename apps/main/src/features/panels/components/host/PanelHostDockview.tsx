/**
 * PanelHostDockview
 *
 * Generic embedded dockview host for panel IDs.
 * Wraps SmartDockview with a lightweight API and reset/ensure helpers.
 */

import type { DockviewApi } from "dockview-core";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";

import {
  SmartDockview,
  createDockviewHost,
  ensurePanels,
  getDockviewPanels,
  resolvePanelDefinitionId,
} from "@lib/dockview";
import type { DockviewHost } from "@lib/dockview";
import { panelSelectors } from "@lib/plugins/catalogSelectors";

import { useWorkspaceStore } from "../../../workspace/stores/workspaceStore";
import { usePanelCatalogBootstrap } from "../../hooks/usePanelCatalogBootstrap";

import { reconcileScopedDockviewPanels } from "./panelHostDockReconcile";
import { resolveScopeDiscoveredPanelIds, resolveScopedOutOfLayoutPanelIds, resolveScopedPanelIds } from "./panelHostDockScope";

type DockviewPanelPosition = Parameters<DockviewApi["addPanel"]>[0]["position"];

// Stable empty array so useWorkspaceStore selector returns a referentially
// equal value when a dock has no dismissed panels (avoids render thrash).
const EMPTY_DISMISSED: readonly string[] = [];

/**
 * Declarative layout entry.
 * Panels are added in order; each can position relative to a previous panel.
 */
export interface LayoutSpecEntry {
  /** Panel definition ID. */
  id: string;
  /** Direction relative to `ref`. Omit for the first panel. */
  direction?: 'right' | 'left' | 'above' | 'below' | 'within';
  /** ID of the reference panel to position against. */
  ref?: string;
}

/** Convert a layout spec to a defaultLayout function. */
function layoutSpecToDefaultLayout(spec: readonly LayoutSpecEntry[]): (api: DockviewApi) => void {
  return (api) => {
    for (const entry of spec) {
      if (api.getPanel(entry.id)) continue;
      const title = panelSelectors.get(entry.id)?.title ?? entry.id;
      const position: DockviewPanelPosition | undefined =
        entry.direction && entry.ref && api.getPanel(entry.ref)
          ? { direction: entry.direction, referencePanel: entry.ref }
          : undefined;
      try {
        api.addPanel({ id: entry.id, component: entry.id, title, position });
      } catch {
        // Fallback: add without position if layout placement fails
        if (position) {
          api.addPanel({ id: entry.id, component: entry.id, title });
        }
      }
    }
  };
}

export interface PanelHostDockviewProps {
  /** Panel IDs to include (registry-backed). */
  panels?: readonly string[];
  /** Dockview scope ID (filters panels by availableIn). */
  dockId?: string;
  /** Panel IDs to exclude when using dockId. */
  excludePanels?: string[];
  /** Optional allowlist of panels to include. */
  allowedPanels?: string[];
  /** Optional allowlist of panel categories to include. */
  allowedCategories?: string[];
  /**
   * Setting scopes of the host panel. Panels sharing a scope are
   * auto-included in the context menu (e.g. generation settings panels
   * appear in any generation-capable host). Derived from the host panel
   * definition's settingScopes if not provided and the host is in dockId mode.
   */
  hostSettingScopes?: string[];
  /**
   * Capability keys the host provides. Panels whose consumesCapabilities
   * are all satisfied by these keys become discoverable in the context menu.
   * Auto-derived from the host panel definition's providesCapabilities if not
   * provided and the host is in dockId mode.
   */
  hostCapabilityKeys?: string[];
  /** Panel IDs that should not exist in the persisted/embedded layout. */
  excludeFromLayout?: readonly string[];
  /** Storage key for persisting layout. */
  storageKey: string;
  /**
   * Panel manager ID for settings resolution and dockview registry.
   * When provided, this becomes the public dockviewId used in host registry lookups.
   */
  panelManagerId?: string;
  /** Context object passed to panels via SmartDockview. */
  context?: unknown;
  /** Custom default layout function. */
  defaultLayout?: (api: DockviewApi) => void;
  /**
   * Declarative layout spec. Converted to a defaultLayout function internally.
   * Ignored if `defaultLayout` is also provided.
   */
  layoutSpec?: readonly LayoutSpecEntry[];
  /** Callback when dockview is ready. */
  onReady?: (api: DockviewApi) => void;
  /** Minimum panels before showing tabs (default: 1). */
  minPanelsForTabs?: number;
  /** Enable context menu (default: true). */
  enableContextMenu?: boolean;
  /** Optional dock capabilities (e.g. floatPanelHandler). */
  capabilities?: {
    floatPanelHandler?: (dockviewPanelId: string, panel: any, options?: any) => void;
  };
  /** CSS class for the container. */
  className?: string;
  /** Default scopes to apply to panels without explicit scopes. */
  defaultPanelScopes?: string[];
  /** Optional panel title resolver. */
  resolvePanelTitle?: (panelId: string) => string;
  /** Optional position resolver when adding missing panels. */
  resolvePanelPosition?: (
    panelId: string,
    api: DockviewApi
  ) => DockviewPanelPosition;
}

export interface PanelHostDockviewRef {
  /** Reset the layout to default (clears storage, remounts). */
  resetLayout: () => void;
  /** Get the dockview API (may be null before ready). */
  getApi: () => DockviewApi | null;
  /** Get a dockview host wrapper (may be null before ready). */
  getHost: () => DockviewHost | null;
}

export const PanelHostDockview = forwardRef<PanelHostDockviewRef, PanelHostDockviewProps>(
  (
    {
      panels,
      storageKey,
      panelManagerId,
      context,
      defaultLayout: defaultLayoutProp,
      layoutSpec,
      onReady,
      minPanelsForTabs = 1,
      enableContextMenu = true,
      capabilities,
      className,
      defaultPanelScopes,
      dockId,
      excludePanels,
      allowedPanels,
      allowedCategories,
      hostSettingScopes: hostSettingScopesProp,
      hostCapabilityKeys: hostCapabilityKeysProp,
      excludeFromLayout,
      resolvePanelTitle,
      resolvePanelPosition,
    },
    ref
  ) => {
    // Resolve layout: explicit function > layoutSpec > undefined
    const defaultLayout = defaultLayoutProp ?? (layoutSpec ? layoutSpecToDefaultLayout(layoutSpec) : undefined);
    // Default title resolver: use registry titles
    const effectiveResolvePanelTitle = resolvePanelTitle ?? ((id: string) => panelSelectors.get(id)?.title ?? id);

    // Bootstrap: ensure panel definitions are registered before rendering.
    // Derives panel IDs from explicit panels prop, layoutSpec, or dockId scope.
    const bootstrapPanelIds = useMemo(() => {
      if (panels && panels.length > 0) return panels;
      if (layoutSpec && layoutSpec.length > 0) return layoutSpec.map((e) => e.id);
      return undefined; // dockId-only mode — no explicit bootstrap needed
    }, [panels, layoutSpec]);
    const bootstrap = usePanelCatalogBootstrap({
      panelIds: bootstrapPanelIds,
      enabled: !!bootstrapPanelIds,
    });
    // Re-evaluated on each bootstrap catalogVersion bump (triggers re-render)
    const panelsReady = !bootstrapPanelIds
      || (bootstrap.catalogVersion >= 0 && bootstrapPanelIds.every((id) => panelSelectors.has(id)));

    // Auto-derive hostSettingScopes from the parent panel definition when not explicit
    const hostSettingScopes = useMemo(() => {
      if (hostSettingScopesProp) return hostSettingScopesProp;
      // Explicit panels mode should stay deterministic and not auto-discover
      // scope siblings unless the caller opts in via hostSettingScopes prop.
      if (panels && panels.length > 0) return undefined;
      if (!dockId) return undefined;
      const hostDef = panelSelectors.get(dockId);
      return (hostDef as any)?.settingScopes ?? undefined;
    }, [hostSettingScopesProp, panels, dockId, bootstrap.catalogVersion]);

    // Auto-derive hostCapabilityKeys from the parent panel definition when not explicit
    const hostCapabilityKeys = useMemo(() => {
      if (hostCapabilityKeysProp) return hostCapabilityKeysProp;
      if (panels && panels.length > 0) return undefined;
      if (!dockId) return undefined;
      const hostDef = panelSelectors.get(dockId);
      const caps = (hostDef as any)?.providesCapabilities as Array<string | { key: string }> | undefined;
      if (!caps?.length) return undefined;
      return caps.map((d: string | { key: string }) => (typeof d === 'string' ? d : d.key));
    }, [hostCapabilityKeysProp, panels, dockId, bootstrap.catalogVersion]);

    const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
    const [resetKey, setResetKey] = useState(0);
    const [dockviewHost, setDockviewHost] = useState<DockviewHost | null>(null);
    // Guard against infinite reset loops while still allowing one retry remount.
    const autoResetAttemptsRef = useRef(0);
    const scopeOptions = useMemo(() => ({
      dockId,
      panels,
      excludePanels,
      allowedPanels,
      allowedCategories,
      hostSettingScopes,
      hostCapabilityKeys,
    }), [dockId, panels, excludePanels, allowedPanels, allowedCategories, hostSettingScopes, hostCapabilityKeys]);

    // Panels that belong in the layout (explicit + availableIn)
    const scopedPanelIds = useMemo(() => {
      return resolveScopedPanelIds(panelSelectors, scopeOptions);
    }, [scopeOptions]);

    // Extra panels discoverable via shared scopes (context menu only, NOT added to layout)
    const scopeDiscoveredIds = useMemo(() => {
      return resolveScopeDiscoveredPanelIds(panelSelectors, scopeOptions);
    }, [scopeOptions]);
    const scopedOutOfLayoutPanelIds = useMemo(() => {
      return resolveScopedOutOfLayoutPanelIds(panelSelectors, {
        dockId,
        panels,
        excludePanels,
        allowedPanels,
        allowedCategories,
      });
    }, [dockId, panels, excludePanels, allowedPanels, allowedCategories]);
    // Identity used to key "dismissed" panels in the workspace store.
    // Prefer explicit dockId, fall back to panelManagerId/storageKey.
    const dismissKey = dockId ?? panelManagerId ?? storageKey;
    const dismissedForDock = useWorkspaceStore(
      (s) => s.dismissedPanels[dismissKey] ?? EMPTY_DISMISSED
    );
    const excludedFromLayoutSet = useMemo(
      () =>
        new Set([
          ...(excludeFromLayout ?? []),
          ...scopedOutOfLayoutPanelIds,
          ...dismissedForDock,
        ]),
      [excludeFromLayout, scopedOutOfLayoutPanelIds, dismissedForDock]
    );
    // Tracks programmatic removes (reconcile, layout swaps) so onDidRemovePanel
    // doesn't mistake them for a user-initiated close.
    const programmaticRemoveRef = useRef(false);

    const reconcileDockviewPanels = useCallback(
      (api: DockviewApi) => {
        if (!api) {
          return;
        }

        const reconcileArgs = {
          api,
          scopedPanelIds,
          excludedFromLayoutSet,
          resolvePanelTitle: effectiveResolvePanelTitle,
          resolvePanelPosition,
          dockLabel: dockId ?? storageKey,
        } as const;
        const reconcileDeps = {
          ensurePanels,
          getDockviewPanels,
          resolvePanelDefinitionId,
        } as const;

        programmaticRemoveRef.current = true;
        let failedCount = 0;
        try {
          failedCount = reconcileScopedDockviewPanels(reconcileArgs, reconcileDeps);
        } finally {
          programmaticRemoveRef.current = false;
        }
        if (failedCount === 0) {
          if (autoResetAttemptsRef.current > 0) {
            autoResetAttemptsRef.current = 0;
          }
          return;
        }

        // Self-heal: if panels failed to add, persisted layout and/or in-memory
        // dockview state is likely corrupted. Avoid mutating the current API
        // instance (clear/remove can throw on corrupt trees); force remount.
        if (storageKey && autoResetAttemptsRef.current < 2) {
          autoResetAttemptsRef.current += 1;
          console.warn(
            `[PanelHostDockview] ${failedCount} panel(s) failed to add � clearing corrupted layout "${storageKey}" and resetting.`,
          );
          localStorage.removeItem(storageKey);
          // Disconnect current references so follow-up effects do not reconcile
          // against the corrupted instance while remounting.
          setDockviewApi(null);
          setDockviewHost(null);
          queueMicrotask(() => {
            localStorage.removeItem(storageKey);
            setResetKey((k) => k + 1);
          });
          return;
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps -- dockId/storageKey used only in warning/self-heal
      [excludedFromLayoutSet, scopedPanelIds, resolvePanelPosition, effectiveResolvePanelTitle]
    );

    const handleReady = useCallback(
      (api: DockviewApi) => {
        setDockviewApi(api);
        setDockviewHost(createDockviewHost(panelManagerId ?? storageKey, api));
        reconcileDockviewPanels(api);
        onReady?.(api);
      },
      [reconcileDockviewPanels, onReady, panelManagerId, storageKey]
    );

    useEffect(() => {
      if (!dockviewApi) return;
      requestAnimationFrame(() => reconcileDockviewPanels(dockviewApi));
    }, [dockviewApi, reconcileDockviewPanels]);

    // Detect user-initiated panel close (tab X, context-menu close) and mark
    // the panel dismissed so the reconciler doesn't immediately re-add it.
    // Programmatic removes (reconcile prune, layout swap) set
    // programmaticRemoveRef and are ignored here.
    useEffect(() => {
      if (!dockviewApi) return;
      const removeDisposable = dockviewApi.onDidRemovePanel((panel: unknown) => {
        if (programmaticRemoveRef.current) return;
        const id = resolvePanelDefinitionId(panel) ?? (panel as { id?: unknown })?.id;
        if (typeof id !== "string" || !id) return;
        // Only dismiss panels that would otherwise be required in the layout.
        if (!scopedPanelIds.includes(id)) return;
        useWorkspaceStore.getState().dismissPanel(dismissKey, id);
      });
      // If a dismissed panel is added back (context menu, default layout,
      // preset swap), clear its dismissed flag so it behaves normally again.
      const addDisposable = dockviewApi.onDidAddPanel((panel: unknown) => {
        const id = resolvePanelDefinitionId(panel) ?? (panel as { id?: unknown })?.id;
        if (typeof id !== "string" || !id) return;
        useWorkspaceStore.getState().undismissPanel(dismissKey, id);
      });
      return () => {
        removeDisposable.dispose();
        addDisposable.dispose();
      };
    }, [dockviewApi, dismissKey, scopedPanelIds]);

    useEffect(() => {
      if (!dockviewApi || excludedFromLayoutSet.size === 0) {
        return;
      }

      const scheduleReconcile = () => {
        requestAnimationFrame(() => reconcileDockviewPanels(dockviewApi));
      };

      const addDisposable = dockviewApi.onDidAddPanel(scheduleReconcile);
      const layoutDisposable =
        typeof (dockviewApi as any).onDidLayoutFromJSON === "function"
          ? (dockviewApi as any).onDidLayoutFromJSON(scheduleReconcile)
          : null;

      return () => {
        addDisposable.dispose();
        layoutDisposable?.dispose?.();
      };
    }, [dockviewApi, excludedFromLayoutSet, reconcileDockviewPanels]);

    const resetLayout = useCallback(() => {
      if (storageKey) {
        localStorage.removeItem(storageKey);
      }
      setResetKey((k) => k + 1);
    }, [storageKey]);

    useImperativeHandle(
      ref,
      () => ({
        resetLayout,
        getApi: () => dockviewApi,
        getHost: () => dockviewHost,
      }),
      [resetLayout, dockviewApi, dockviewHost]
    );

    // Derive explicit panel list: prefer props, fall back to layoutSpec IDs
    const resolvedPanels = panels && panels.length > 0
      ? [...panels]
      : layoutSpec && layoutSpec.length > 0
        ? layoutSpec.map((entry) => entry.id)
        : undefined;

    // Wait for panel definitions to be registered before rendering dockview
    if (bootstrapPanelIds && !panelsReady) {
      return <div className={className ?? "h-full w-full"} />;
    }

    return (
      <div className={className ?? "h-full w-full"}>
        <SmartDockview
          key={resetKey}
          panels={resolvedPanels}
          dockId={resolvedPanels ? undefined : dockId}
          excludePanels={resolvedPanels ? undefined : excludePanels}
          allowedPanels={allowedPanels}
          allowedCategories={allowedCategories}
          storageKey={storageKey}
          context={context}
          defaultPanelScopes={defaultPanelScopes}
          panelManagerId={panelManagerId}
          defaultLayout={defaultLayout}
          minPanelsForTabs={minPanelsForTabs}
          onReady={handleReady}
          additionalContextMenuPanels={scopeDiscoveredIds.length > 0 ? scopeDiscoveredIds : undefined}
          enableContextMenu={enableContextMenu}
          capabilities={capabilities}
        />
      </div>
    );
  }
);

PanelHostDockview.displayName = "PanelHostDockview";

