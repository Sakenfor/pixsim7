/**
 * Custom Tab Component with Context Menu Support
 *
 * Wraps dockview's default tab component to add right-click context menu.
 */

import { DockviewDefaultTab } from 'dockview';
import type { IDockviewPanelProps } from 'dockview-core';
import { useContextMenuOptional } from './ContextMenuProvider';
import { useDockviewId } from './DockviewIdContext';

/**
 * Custom tab component that adds context menu support
 *
 * Wraps the default dockview tab and intercepts right-click events
 * to show panel-specific context menu actions.
 */
export function CustomTabComponent(props: IDockviewPanelProps) {
  const contextMenu = useContextMenuOptional();
  const currentDockviewId = useDockviewId();

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!contextMenu) return;

    e.preventDefault();
    e.stopPropagation();

    const panelId = props.api.id;
    const groupId = props.api.group.id;

    console.log('[CustomTabComponent] Context menu on tab:', panelId, 'dockview:', currentDockviewId);

    contextMenu.showContextMenu({
      contextType: 'tab',
      panelId,
      groupId,
      position: { x: e.clientX, y: e.clientY },
      currentDockviewId,
    });
  };

  return (
    <div onContextMenu={handleContextMenu} className="h-full">
      <DockviewDefaultTab {...props} tabLocation="header" />
    </div>
  );
}
