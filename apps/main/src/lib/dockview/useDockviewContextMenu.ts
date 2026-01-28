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
  } = options;

  // Handler for right-click on empty dockview area
  const handleBackgroundContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!contextMenuActive || !contextMenuRef.current) return;
      e.preventDefault();
      const baseContext = {
        currentDockviewId: dockviewId,
        panelRegistry: getDockviewPanelRegistry(),
        resetDockviewLayout,
      };

      contextMenuRef.current.showContextMenu(
        buildDockviewContext(baseContext, {
          contextType: 'background',
          position: { x: e.clientX, y: e.clientY },
        }),
      );
    },
    [contextMenuActive, contextMenuRef, dockviewId, getDockviewPanelRegistry, resetDockviewLayout],
  );

  // Use custom tab component with context menu support when active
  const defaultTabComponent = contextMenuActive ? CustomTabComponent : undefined;

  return {
    handleBackgroundContextMenu,
    defaultTabComponent,
  };
}
