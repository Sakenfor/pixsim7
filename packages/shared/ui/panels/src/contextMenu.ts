// Context Menu Contract Types

/**
 * Context types for different areas where context menu can appear
 *
 * Extensible to support any clickable item type across the application.
 */
export type ContextMenuContext =
  // Dockview contexts
  | "tab"           // Right-click on a panel tab
  | "group"         // Right-click on empty group area
  | "panel-content" // Right-click inside panel content area
  | "background"    // Right-click on dockview background
  // Asset contexts
  | "asset"         // Right-click on an asset/media item
  | "asset-card"    // Right-click on asset card in gallery
  // Graph contexts
  | "node"          // Right-click on a graph node
  | "edge"          // Right-click on a graph edge
  | "canvas"        // Right-click on graph canvas
  // Generic contexts
  | "item"          // Generic right-clickable item
  | "list-item"     // Item in a list
  | string;         // Allow custom context types from plugins

/**
 * Generic base context passed to menu actions when executed.
 *
 * Type parameters allow app-specific types for dockview, context hub, and stores.
 * Use the concrete MenuActionContext in apps/main for fully typed access.
 *
 * @typeParam TDockviewApi - Dockview API type (e.g., DockviewApi from dockview-core)
 * @typeParam TContextHubState - Context hub state type for capability access
 * @typeParam TWorkspaceStore - Workspace store type for preset operations
 * @typeParam TDockviewHost - Dockview host type for multi-dockview support
 * @typeParam TPanelRegistry - Panel registry type for querying available panels
 */
export interface MenuActionContextBase<
  TDockviewApi = unknown,
  TContextHubState = unknown,
  TWorkspaceStore = unknown,
  TDockviewHost = unknown,
  TPanelRegistry = unknown
> {
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
   */
  contextHubState?: TContextHubState | null;

  // Multi-dockview support
  /** ID of the dockview where context menu was triggered (if applicable) */
  currentDockviewId?: string;

  /** Get any registered dockview's API by ID */
  getDockviewApi?: (id: string) => TDockviewApi | undefined;
  /** Get all registered dockview IDs */
  getDockviewIds?: () => string[];
  /** Get any registered dockview host by ID */
  getDockviewHost?: (id: string) => TDockviewHost | undefined;
  /** Get all registered dockview host IDs */
  getDockviewHostIds?: () => string[];

  // Dockview-specific fields (optional)
  /** Dockview API instance for the current dockview (convenience shortcut) */
  api?: TDockviewApi;

  /** Panel ID if context is tab/panel-content */
  panelId?: string;
  /** Unique instance ID for this panel (scoped per dockview) */
  instanceId?: string;

  /** Group ID if applicable */
  groupId?: string;

  /** Reference to workspace store for preset operations */
  workspaceStore?: TWorkspaceStore;

  /** Reference to panel registry for querying available panels */
  panelRegistry?: TPanelRegistry;
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
 * Generic menu action definition for the context menu registry.
 *
 * @typeParam TContext - The menu action context type (defaults to base)
 */
export interface MenuActionBase<TContext = MenuActionContextBase> {
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
  variant?: "default" | "danger" | "success";

  /** Keyboard shortcut hint (display only) */
  shortcut?: string;

  /** Show divider after this item */
  divider?: boolean;

  /** Contexts where this action is available */
  availableIn: ContextMenuContext[];

  /** Additional visibility condition */
  visible?: (ctx: TContext) => boolean;

  /** Disabled condition */
  disabled?: (ctx: TContext) => boolean | string;

  /** Sub-actions for nested menus */
  children?: MenuActionBase<TContext>[] | ((ctx: TContext) => MenuActionBase<TContext>[]);

  /** Execute the action */
  execute: (ctx: TContext) => void | Promise<void>;
}

/**
 * Menu item format for MenuWidget component.
 *
 * This is a pure data structure with no callbacks that depend on app-specific types.
 */
export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  iconColor?: string;
  variant?: "default" | "danger" | "success";
  shortcut?: string;
  divider?: boolean;
  disabled?: boolean | string;
  children?: MenuItem[];
  onClick?: () => void;
}
