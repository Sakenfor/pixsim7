/**
 * PanelHostDockview
 *
 * Generic embedded dockview host for panel IDs.
 * Wraps SmartDockview with a lightweight API and reset/ensure helpers.
 */

import type { DockviewApi } from "dockview-core";
import { useCallback, useEffect, useImperativeHandle, useState, forwardRef } from "react";

import { SmartDockview, createDockviewHost, ensurePanels } from "@lib/dockview";
import type { DockviewHost } from "@lib/dockview";

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
      className,
      defaultPanelScopes,
      dockId,
      excludePanels,
      allowedPanels,
      allowedCategories,
      resolvePanelTitle,
      resolvePanelPosition,
    },
    ref
  ) => {
    const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
    const [resetKey, setResetKey] = useState(0);
    const [dockviewHost, setDockviewHost] = useState<DockviewHost | null>(null);

    const ensureDockviewPanels = useCallback(
      (api: DockviewApi) => {
        if (!api) {
          return;
        }
        ensurePanels(api, panels ?? [], {
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
        });
      },
      [panels, resolvePanelPosition, resolvePanelTitle]
    );

    const handleReady = useCallback(
      (api: DockviewApi) => {
        setDockviewApi(api);
        setDockviewHost(createDockviewHost(panelManagerId ?? storageKey, api));
        ensureDockviewPanels(api);
        onReady?.(api);
      },
      [ensureDockviewPanels, onReady, panelManagerId, storageKey]
    );

    useEffect(() => {
      if (!dockviewApi) return;
      requestAnimationFrame(() => ensureDockviewPanels(dockviewApi));
    }, [dockviewApi, ensureDockviewPanels]);

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
        />
      </div>
    );
  }
);

PanelHostDockview.displayName = "PanelHostDockview";
