/**
 * Dockview Context Menu Types
 *
 * Type definitions for the extensible dockview context menu system.
 */

import type { DockviewApi } from 'dockview-core';
import type { PanelRegistry } from '@features/panels';
import type { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

/**
 * Context types for different areas where context menu can appear
 *
 * Extensible to support any clickable item type across the application.
 */
export type ContextMenuContext =
  // Dockview contexts
  | 'tab'           // Right-click on a panel tab
  | 'group'         // Right-click on empty group area
  | 'panel-content' // Right-click inside panel content area
  | 'background'    // Right-click on dockview background
  // Asset contexts
  | 'asset'         // Right-click on an asset/media item
  | 'asset-card'    // Right-click on asset card in gallery
  // Graph contexts
  | 'node'          // Right-click on a graph node
  | 'edge'          // Right-click on a graph edge
  | 'canvas'        // Right-click on graph canvas
  // Generic contexts
  | 'item'          // Generic right-clickable item
  | 'list-item'     // Item in a list
  | string;         // Allow custom context types from plugins

/**
 * Context passed to menu actions when executed
 *
 * Generic context that supports dockview, assets, nodes, and any custom items.
 */
export interface MenuActionContext {
  /** Type of element that was right-clicked */
  contextType: ContextMenuContext;

  /** Mouse position for menu placement */
  position: { x: number; y: number };

  /** Generic data payload for the clicked item */
  data?: any;

  // Multi-dockview support
  /** ID of the dockview where context menu was triggered (if applicable) */
  currentDockviewId?: string;

  /** Get any registered dockview's API by ID */
  getDockviewApi?: (id: string) => DockviewApi | undefined;

  // Dockview-specific fields (optional)
  /** Dockview API instance for the current dockview (convenience shortcut) */
  api?: DockviewApi;

  /** Panel ID if context is tab/panel-content */
  panelId?: string;

  /** Group ID if applicable */
  groupId?: string;

  /** Reference to workspace store for preset operations */
  workspaceStore?: typeof useWorkspaceStore;

  /** Reference to panel registry for querying available panels */
  panelRegistry?: PanelRegistry;

  // Asset-specific fields (optional)
  /** Asset ID if context is asset/asset-card */
  assetId?: string;

  // Graph-specific fields (optional)
  /** Node ID if context is node */
  nodeId?: string;

  /** Edge ID if context is edge */
  edgeId?: string;

  // Allow custom fields from plugins
  [key: string]: any;
}

/**
 * Menu action definition for the context menu registry
 */
export interface MenuAction {
  /** Unique action ID */
  id: string;

  /** Display label */
  label: string;

  /** Icon name (lucide-react icon name) */
  icon?: string;

  /** Icon color class */
  iconColor?: string;

  /** Category for grouping (affects sort order) */
  category?: string;

  /** Action variant (affects styling) */
  variant?: 'default' | 'danger' | 'success';

  /** Keyboard shortcut hint (display only) */
  shortcut?: string;

  /** Show divider after this item */
  divider?: boolean;

  /** Contexts where this action is available */
  availableIn: ContextMenuContext[];

  /** Additional visibility condition */
  visible?: (ctx: MenuActionContext) => boolean;

  /** Disabled condition */
  disabled?: (ctx: MenuActionContext) => boolean | string;

  /** Sub-actions for nested menus */
  children?: MenuAction[] | ((ctx: MenuActionContext) => MenuAction[]);

  /** Execute the action */
  execute: (ctx: MenuActionContext) => void | Promise<void>;
}

/**
 * Menu item format for MenuWidget component
 */
export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  iconColor?: string;
  variant?: 'default' | 'danger' | 'success';
  shortcut?: string;
  divider?: boolean;
  disabled?: boolean | string;
  children?: MenuItem[];
  onClick?: () => void;
}
