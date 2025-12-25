/**
 * Dockview Context Menu Types
 *
 * Type definitions for the extensible dockview context menu system.
 */

import type { DockviewApi } from 'dockview-core';
import type { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';
import type { ContextHubState } from '@features/contextHub';
import type { DockviewHost } from '../host';

// ─────────────────────────────────────────────────────────────────────────────
// Capability Access Patterns
// ─────────────────────────────────────────────────────────────────────────────
//
// There are TWO ways to access capabilities in menu actions:
//
// 1. SNAPSHOT (ctx.capabilities) - Pre-resolved values
//    - Built once when context menu opens
//    - Contains resolved values for all exposed capability keys
//    - Fast, stable, simple to use
//    - Use for: Simple value checks, reading capability data
//
//    Example:
//    ```ts
//    const genContext = ctx.capabilities?.generationContext as GenerationContextSummary | null;
//    if (genContext?.mode === 'quick') { ... }
//    ```
//
// 2. LIVE STATE (ctx.contextHubState) - Full registry chain
//    - Provides access to the actual ContextHubState
//    - Can walk parent chain, query all providers, check isAvailable()
//    - Use for: Introspection, multi-provider scenarios, debugging
//
//    Example:
//    ```ts
//    // Walk the scope chain
//    let current = ctx.contextHubState;
//    while (current) {
//      const providers = current.registry.getAll(key);
//      current = current.parent;
//    }
//    ```
//
// GUIDELINE: Prefer snapshot for most actions. Only use live state when you
// need to enumerate providers, check availability, or walk the scope chain.
// ─────────────────────────────────────────────────────────────────────────────

export interface PanelRegistryLike {
  getAll: () => Array<{
    id: string;
    title: string;
    icon?: string;
    category?: string;
    supportsMultipleInstances?: boolean;
  }>;
  getPublicPanels?: () => Array<{
    id: string;
    title: string;
    icon?: string;
    category?: string;
    supportsMultipleInstances?: boolean;
  }>;
}

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

  /**
   * Pre-resolved capability values (SNAPSHOT).
   *
   * Use for simple value access in most actions.
   * Values are resolved once when the context menu opens.
   *
   * @example
   * const genContext = ctx.capabilities?.generationContext as GenerationContextSummary | null;
   */
  capabilities?: Record<string, unknown>;

  /**
   * Live ContextHub state for advanced capability queries (LIVE STATE).
   *
   * Use only when you need to:
   * - Enumerate all providers for a capability key
   * - Check provider.isAvailable() status
   * - Walk the scope chain for debugging/introspection
   * - Support preferred provider selection
   *
   * For simple value access, prefer `ctx.capabilities` instead.
   *
   * @example
   * // Walk the scope chain
   * let current = ctx.contextHubState;
   * while (current) {
   *   const providers = current.registry.getAll(key);
   *   current = current.parent;
   * }
   */
  contextHubState?: ContextHubState | null;

  // Multi-dockview support
  /** ID of the dockview where context menu was triggered (if applicable) */
  currentDockviewId?: string;

  /** Get any registered dockview's API by ID */
  getDockviewApi?: (id: string) => DockviewApi | undefined;
  /** Get all registered dockview IDs */
  getDockviewIds?: () => string[];
  /** Get any registered dockview host by ID */
  getDockviewHost?: (id: string) => DockviewHost | undefined;
  /** Get all registered dockview host IDs */
  getDockviewHostIds?: () => string[];

  // Dockview-specific fields (optional)
  /** Dockview API instance for the current dockview (convenience shortcut) */
  api?: DockviewApi;

  /** Panel ID if context is tab/panel-content */
  panelId?: string;
  /** Unique instance ID for this panel (scoped per dockview) */
  instanceId?: string;

  /** Group ID if applicable */
  groupId?: string;

  /** Reference to workspace store for preset operations */
  workspaceStore?: typeof useWorkspaceStore;

  /** Reference to panel registry for querying available panels */
  panelRegistry?: PanelRegistryLike;
  /** Reset the current dockview layout (if available) */
  resetDockviewLayout?: () => void;

  /** Handler for floating panels (if dockview supports it) */
  floatPanelHandler?: (
    dockviewPanelId: string,
    panel: any,
    options?: { width?: number; height?: number }
  ) => void;

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
