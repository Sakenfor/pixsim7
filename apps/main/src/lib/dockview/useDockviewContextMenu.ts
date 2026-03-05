/**
 * Hook for managing dockview background context menu and tab component.
 *
 * Encapsulates:
 * - Background context menu handler (right-click on empty dockview area)
 * - Default tab component selection (with or without context menu support)
 *
 * Note: contextMenu and contextMenuActive must be computed externally because
 * contextMenuActive is needed early in the component for baseWrapOptions.
 */

import type { IDockviewPanelHeaderProps } from 'dockview-core';
import { useCallback } from 'react';

import { getDockviewApi } from './hostRegistry';
import { getDockviewGroups } from './panelAdd';
import { CustomTabComponent, useContextMenuOptional } from './contextMenu';
import { buildDockviewContext } from './contextMenu/buildDockviewContext';

export interface UseDockviewContextMenuOptions {
  /** Whether context menu features are active (enabled + provider exists) */
  contextMenuActive: boolean;
  /** Ref to the context menu instance */
  contextMenuRef: React.MutableRefObject<ReturnType<typeof useContextMenuOptional>>;
  /** The dockview's public ID */
  dockviewId: string;
  /** Getter for the panel registry (for "Add Panel" menu) */
  getDockviewPanelRegistry: () => any;
  /** Callback to reset the dockview layout */
  resetDockviewLayout: () => void;
  /** Panel IDs this dockview was configured with (for "Default Panels" submenu) */
  scopedPanelIds?: string[];
}

export interface UseDockviewContextMenuResult {
  /** Handler for background right-click (empty dockview area) */
  handleBackgroundContextMenu: (e: React.MouseEvent) => void;
  /** Default tab component (CustomTabComponent if context menu active, undefined otherwise) */
  defaultTabComponent: React.ComponentType<IDockviewPanelHeaderProps> | undefined;
}

/**
 * Creates background context menu handler and selects appropriate tab component.
 */
export function useDockviewContextMenu(
  options: UseDockviewContextMenuOptions,
): UseDockviewContextMenuResult {
  const {
    contextMenuActive,
    contextMenuRef,
    dockviewId,
    getDockviewPanelRegistry,
    resetDockviewLayout,
    scopedPanelIds,
  } = options;

  // Handler for right-click on empty dockview area
  const handleBackgroundContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!contextMenuActive || !contextMenuRef.current) return;
      if (e.ctrlKey || e.metaKey) return;

      // Ignore events originating from nested dockviews.
      // Each dockview should handle its own background context menu.
      const targetElement = e.target instanceof HTMLElement ? e.target : null;
      const nestedDockview = targetElement?.closest?.('[data-smart-dockview]') as HTMLElement | null;
      const thisDockview = (e.currentTarget as HTMLElement).closest('[data-smart-dockview]');
      if (nestedDockview && nestedDockview !== thisDockview) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const groupElement = targetElement?.closest?.('.dv-groupview') as HTMLElement | null;
      const api = getDockviewApi(dockviewId);
      const matchedGroup =
        api && groupElement
          ? getDockviewGroups(api).find((group: any) => (group as any)?.element === groupElement)
          : undefined;
      const resolvedGroupId = typeof (matchedGroup as any)?.id === 'string'
        ? (matchedGroup as any).id
        : undefined;

      const targetClassName =
        typeof targetElement?.className === 'string' ? targetElement.className : null;
      const groupClassName =
        typeof groupElement?.className === 'string' ? groupElement.className : null;
      const backgroundTarget = {
        targetTag: targetElement?.tagName?.toLowerCase() ?? null,
        targetClassName,
        groupClassName,
        groupId: resolvedGroupId ?? null,
        tabsHidden: !!groupElement?.classList?.contains('dv-tabs-hidden'),
        hasWatermark: !!groupElement?.querySelector?.('.dv-watermark'),
      };

      const baseContext = {
        currentDockviewId: dockviewId,
        panelRegistry: getDockviewPanelRegistry(),
        resetDockviewLayout,
        scopedPanelIds,
      };

      contextMenuRef.current.showContextMenu(
        buildDockviewContext(baseContext, {
          contextType: 'background',
          position: { x: e.clientX, y: e.clientY },
          groupId: resolvedGroupId,
          data: {
            dockviewBackgroundTarget: backgroundTarget,
          },
        }),
      );
    },
    [contextMenuActive, contextMenuRef, dockviewId, getDockviewPanelRegistry, resetDockviewLayout, scopedPanelIds],
  );

  // Use custom tab component with context menu support when active
  const defaultTabComponent = contextMenuActive ? CustomTabComponent : undefined;

  return {
    handleBackgroundContextMenu,
    defaultTabComponent,
  };
}
