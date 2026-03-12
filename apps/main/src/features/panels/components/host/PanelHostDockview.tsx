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

import { resolveScopedOutOfLayoutPanelIds } from "./panelHostDockScope";

type DockviewPanelPosition = Parameters<DockviewApi["addPanel"]>[0]["position"];

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
      defaultLayout,
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
      excludeFromLayout,
      resolvePanelTitle,
      resolvePanelPosition,
    },
    ref
  ) => {
    const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
    const [resetKey, setResetKey] = useState(0);
    const [dockviewHost, setDockviewHost] = useState<DockviewHost | null>(null);
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

        ensurePanels(
          api,
          (panels ?? []).filter((panelId) => !excludedFromLayoutSet.has(panelId)),
          {
            resolveOptions: (panelId, apiInstance) => {
              const position = resolvePanelPosition?.(panelId, apiInstance);
              if (resolvePanelTitle) {
                return {
                  title: resolvePanelTitle(panelId),
                  position,
                };
              }
              if (position) {
                return { position };
              }
              return undefined;
            },
          }
        );
      },
      [excludedFromLayoutSet, panels, resolvePanelPosition, resolvePanelTitle]
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

    const resolvedPanels = panels && panels.length > 0 ? [...panels] : undefined;

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
