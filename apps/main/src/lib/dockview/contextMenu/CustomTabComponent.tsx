/**
 * Custom Tab Component with Context Menu Support
 *
 * Wraps dockview's default tab component to add right-click context menu.
 */

import { DockviewDefaultTab } from 'dockview';
import type { IDockviewPanelHeaderProps } from 'dockview-core';

import { useContextHubState } from '@features/contextHub';

import { buildDockviewContext } from './buildDockviewContext';
import { useDockviewContext } from './DockviewIdContext';
import { useContextMenuOptional } from './useContextMenu';

/**
 * Custom tab component that adds context menu support
 *
 * Wraps the default dockview tab and intercepts right-click events
 * to show panel-specific context menu actions.
 */
export function CustomTabComponent(props: IDockviewPanelHeaderProps) {
  const contextMenu = useContextMenuOptional();
  const { dockviewId: currentDockviewId, panelRegistry, dockviewApi } = useDockviewContext();
  const contextHubState = useContextHubState();

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!contextMenu) return;
    if (e.ctrlKey || e.metaKey) return;

    e.preventDefault();
    e.stopPropagation();

    const panelId = props.api.id;
    const groupId = props.api.group.id;
    const instanceId = currentDockviewId ? `${currentDockviewId}:${panelId}` : panelId;

    const baseContext = {
      currentDockviewId,
      panelRegistry,
      api: props.containerApi ?? dockviewApi,
      contextHubState,
    };

    contextMenu.showContextMenu(
      buildDockviewContext(baseContext, {
        contextType: 'tab',
        panelId,
        instanceId,
        groupId,
        position: { x: e.clientX, y: e.clientY },
        data: (props.api as any)?.params,
      }),
    );
  };

  return (
    <div onContextMenu={handleContextMenu} className="h-full">
      <DockviewDefaultTab {...props} tabLocation="header" />
    </div>
  );
}
