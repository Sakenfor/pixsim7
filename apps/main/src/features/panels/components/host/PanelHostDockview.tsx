/**
 * PanelHostDockview
 *
 * Generic embedded dockview host for panel IDs.
 * Wraps SmartDockview with a lightweight API and reset/ensure helpers.
 */

import type { DockviewApi } from "dockview-core";
import { useCallback, useEffect, useImperativeHandle, useState, forwardRef } from "react";

import { SmartDockview } from "@lib/dockview";

type DockviewPanelPosition = Parameters<DockviewApi["addPanel"]>[0]["position"];

export interface PanelHostDockviewProps {
  /** Panel IDs to include (registry-backed). */
  panels: readonly string[];
  /** Storage key for persisting layout. */
  storageKey: string;
  /** Panel manager ID for settings resolution and dockview registry. */
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
      resolvePanelTitle,
      resolvePanelPosition,
    },
    ref
  ) => {
    const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
    const [resetKey, setResetKey] = useState(0);

    const ensurePanels = useCallback(
      (api: DockviewApi) => {
        for (const panelId of panels) {
          if (!api.getPanel(panelId)) {
            const position = resolvePanelPosition?.(panelId, api);
            api.addPanel({
              id: panelId,
              component: panelId,
              title: resolvePanelTitle ? resolvePanelTitle(panelId) : panelId,
              position,
            });
          }
        }
      },
      [panels, resolvePanelPosition, resolvePanelTitle]
    );

    const handleReady = useCallback(
      (api: DockviewApi) => {
        setDockviewApi(api);
        ensurePanels(api);
        onReady?.(api);
      },
      [ensurePanels, onReady]
    );

    useEffect(() => {
      if (!dockviewApi) return;
      requestAnimationFrame(() => ensurePanels(dockviewApi));
    }, [dockviewApi, ensurePanels]);

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
      }),
      [resetLayout, dockviewApi]
    );

    return (
      <div className={className ?? "h-full w-full"}>
        <SmartDockview
          key={resetKey}
          panels={[...panels]}
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
