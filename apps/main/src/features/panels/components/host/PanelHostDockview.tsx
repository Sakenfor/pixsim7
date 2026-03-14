/**
 * PanelHostDockview
 *
 * Generic embedded dockview host for panel IDs.
 * Wraps SmartDockview with a lightweight API and reset/ensure helpers.
 */

import type { DockviewApi } from "dockview-core";
import { useCallback, useEffect, useImperativeHandle, useMemo, useState, forwardRef } from "react";

import {
  SmartDockview,
  createDockviewHost,
  ensurePanels,
  getDockviewPanels,
  resolvePanelDefinitionId,
} from "@lib/dockview";
import type { DockviewHost } from "@lib/dockview";
import { panelSelectors } from "@lib/plugins/catalogSelectors";

import { usePanelCatalogBootstrap } from "../../hooks/usePanelCatalogBootstrap";

import { resolveScopedOutOfLayoutPanelIds, resolveScopedPanelIds } from "./panelHostDockScope";

type DockviewPanelPosition = Parameters<DockviewApi["addPanel"]>[0]["position"];

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
   * appear in any generationCapable host). Derived from the host panel
   * definition's settingScopes if not provided.
   */
  hostSettingScopes?: string[];
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
      if (!dockId) return undefined;
      const hostDef = panelSelectors.get(dockId);
      return (hostDef as any)?.settingScopes ?? undefined;
    }, [hostSettingScopesProp, dockId]);

    const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
    const [resetKey, setResetKey] = useState(0);
    const [dockviewHost, setDockviewHost] = useState<DockviewHost | null>(null);
    const scopedPanelIds = useMemo(() => {
      return resolveScopedPanelIds(panelSelectors, {
        dockId,
        panels,
        excludePanels,
        allowedPanels,
        allowedCategories,
        hostSettingScopes,
      });
    }, [dockId, panels, excludePanels, allowedPanels, allowedCategories, hostSettingScopes]);
    const scopedOutOfLayoutPanelIds = useMemo(() => {
      return resolveScopedOutOfLayoutPanelIds(panelSelectors, {
        dockId,
        panels,
        excludePanels,
        allowedPanels,
        allowedCategories,
      });
    }, [dockId, panels, excludePanels, allowedPanels, allowedCategories]);
    const excludedFromLayoutSet = useMemo(
      () => new Set([...(excludeFromLayout ?? []), ...scopedOutOfLayoutPanelIds]),
      [excludeFromLayout, scopedOutOfLayoutPanelIds]
    );

    const reconcileDockviewPanels = useCallback(
      (api: DockviewApi) => {
        if (!api) {
          return;
        }

        if (excludedFromLayoutSet.size > 0) {
          for (const panel of getDockviewPanels(api)) {
            const panelId = typeof (panel as any)?.id === "string" ? (panel as any).id : undefined;
            const resolvedId = resolvePanelDefinitionId(panel as any) ?? panelId;
            if (
              (panelId && excludedFromLayoutSet.has(panelId)) ||
              (resolvedId && excludedFromLayoutSet.has(resolvedId))
            ) {
              api.removePanel(panel);
            }
          }
        }

        const panelsToAdd = scopedPanelIds.filter(
          (panelId) => !excludedFromLayoutSet.has(panelId),
        );
        // Add panels individually so one failure doesn't block the rest
        for (const panelId of panelsToAdd) {
          if (api.getPanel(panelId)) continue;
          try {
            const position = resolvePanelPosition?.(panelId, api);
            const safePosition =
              position && 'referencePanel' in position && position.referencePanel
                ? api.getPanel(position.referencePanel) ? position : undefined
                : position;
            ensurePanels(api, [panelId], {
              resolveOptions: () => ({
                title: effectiveResolvePanelTitle(panelId),
                position: safePosition,
              }),
            });
          } catch (error) {
            console.warn(`[PanelHostDockview] Failed to add panel "${panelId}" to dock "${dockId ?? storageKey}":`, error);
          }
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps -- dockId/storageKey used only in warning message
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
          allowedPanels={resolvedPanels ? undefined : allowedPanels}
          allowedCategories={resolvedPanels ? undefined : allowedCategories}
          storageKey={storageKey}
          context={context}
          defaultPanelScopes={defaultPanelScopes}
          panelManagerId={panelManagerId}
          defaultLayout={defaultLayout}
          minPanelsForTabs={minPanelsForTabs}
          onReady={handleReady}
          enableContextMenu={enableContextMenu}
          capabilities={capabilities}
        />
      </div>
    );
  }
);

PanelHostDockview.displayName = "PanelHostDockview";
