/**
 * useDetachableSidebar
 *
 * App-level hook that orchestrates popping a sidebar out into a dockview panel
 * and docking it back. Works with the shared UI detachable sidebar store.
 *
 * Usage:
 * ```tsx
 * const sidebar = useDetachableSidebar({
 *   sidebarId: 'scene-management-sidebar',
 *   companionPanelId: 'scene-management-nav',
 *   dockviewId: 'workspace',
 * });
 *
 * <SidebarContentLayout detachable={sidebar.detachableProps} ... />
 * ```
 */

import { useDetachableSidebarStore, type SidebarPaneShellProps } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { addDockviewPanel, getDockviewApi } from '@lib/dockview';

export interface UseDetachableSidebarOptions {
  /** Stable sidebar id (matches the useDetachableSidebarNav sidebarId). */
  sidebarId: string;
  /** Panel id of the companion dockview panel (registered via definePanel). */
  companionPanelId: string;
  /** Dockview host id where the companion panel opens. */
  dockviewId: string;
}

export interface UseDetachableSidebarReturn {
  detached: boolean;
  handleDetach: () => void;
  handleDockBack: () => void;
  /** Spread onto SidebarPaneShell or SidebarContentLayout. */
  detachableProps: SidebarPaneShellProps['detachable'];
}

export function useDetachableSidebar({
  sidebarId,
  companionPanelId,
  dockviewId,
}: UseDetachableSidebarOptions): UseDetachableSidebarReturn {
  const store = useDetachableSidebarStore();
  const detached = store.sidebars[sidebarId]?.detached ?? false;
  const cleanedUpRef = useRef(false);

  const handleDetach = useCallback(() => {
    const api = getDockviewApi(dockviewId);
    if (!api) {
      console.warn(`[useDetachableSidebar] Dockview "${dockviewId}" not available`);
      return;
    }
    store.detach(sidebarId);
    addDockviewPanel(api, companionPanelId);
  }, [sidebarId, companionPanelId, dockviewId, store]);

  const handleDockBack = useCallback(() => {
    store.dockBack(sidebarId);
    const api = getDockviewApi(dockviewId);
    if (api) {
      const panel = api.getPanel(companionPanelId);
      if (panel) {
        api.removePanel(panel);
      }
    }
  }, [sidebarId, companionPanelId, dockviewId, store]);

  // Cleanup on unmount: close companion panel if detached
  useEffect(() => {
    cleanedUpRef.current = false;
    return () => {
      cleanedUpRef.current = true;
      const entry = useDetachableSidebarStore.getState().sidebars[sidebarId];
      if (entry?.detached) {
        useDetachableSidebarStore.getState().dockBack(sidebarId);
        const api = getDockviewApi(dockviewId);
        if (api) {
          const panel = api.getPanel(companionPanelId);
          if (panel) {
            api.removePanel(panel);
          }
        }
      }
    };
  }, [sidebarId, companionPanelId, dockviewId]);

  const detachableProps = useMemo(
    () => ({
      detached,
      onDetach: handleDetach,
      onDockBack: handleDockBack,
    }),
    [detached, handleDetach, handleDockBack],
  );

  return { detached, handleDetach, handleDockBack, detachableProps };
}
