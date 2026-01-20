/**
 * Unified Panel Types
 *
 * Shared interfaces for panel definitions and registries.
 * Both LocalPanelRegistry and global PanelRegistry implement these interfaces.
 */

import type { ComponentType } from "react";

export type PanelInstancePolicy = "single" | "multiple" | { max: number };

/**
 * Entity ref type for capability scoping.
 * Matches the entity ref types from @pixsim7/shared.types.
 * Extensible via (string & {}) pattern.
 */
export type CapabilityRefType =
  | "asset"
  | "generation"
  | "scene"
  | "location"
  | "npc"
  | "world"
  | "session"
  | (string & {});

/**
 * Structured capability declaration with optional ref type.
 */
export interface CapabilityDeclarationObject {
  /** Capability key (e.g., "asset:selection", "generation:context") */
  key: string;
  /** Entity ref type this capability is scoped to */
  refType?: CapabilityRefType;
  /** Optional description for tooling */
  description?: string;
}

/**
 * Capability declaration - either a simple string key or a structured object.
 * String form is shorthand for { key: string }.
 */
export type CapabilityDeclaration = string | CapabilityDeclarationObject;

/**
 * Normalize a capability declaration to its object form.
 */
export function normalizeCapabilityDeclaration(
  decl: CapabilityDeclaration
): CapabilityDeclarationObject {
  return typeof decl === "string" ? { key: decl } : decl;
}

/**
 * Extract capability keys from an array of declarations.
 */
export function getCapabilityKeys(
  declarations: CapabilityDeclaration[] | undefined
): string[] {
  if (!declarations) return [];
  return declarations.map((d) =>
    typeof d === "string" ? d : d.key
  );
}

export interface PanelAvailabilityPolicy {
  /** Dockview scopes where this panel is available (e.g., "workspace", "control-center") */
  docks?: string[];
}

/**
 * Base panel definition - common fields between local and global panels.
 */
export interface BasePanelDefinition<TParams = any> {
  /** Unique panel ID */
  id: string;
  /** Display title (shown in tabs) */
  title: string;
  /** React component to render */
  component: ComponentType<TParams>;
  /** Icon name for tab/header */
  icon?: string;
  /** Category for grouping in menus (e.g., 'core', 'tools', 'system') */
  category?: string;
  /** Tags for search/filtering */
  tags?: string[];
  /** Short description */
  description?: string;
  /** Display order (lower = earlier) */
  order?: number;
  /** Whether panel is enabled by default */
  enabledByDefault?: boolean;
  /** Hide from add-panel menus (still available in layouts) */
  isInternal?: boolean;
  /** Allow multiple instances of this panel in the same dockview */
  supportsMultipleInstances?: boolean;
  /** Optional instance policy (preferred over supportsMultipleInstances) */
  instances?: PanelInstancePolicy;
  /** Optional instance cap (for future enforcement) */
  maxInstances?: number;
  /**
   * Setting scope IDs this panel participates in.
   * Panels declaring a setting scope will be automatically wrapped with the corresponding
   * scope provider (e.g., "generation" scope wraps with GenerationScopeProvider).
   *
   * This enables automatic per-instance scoping without manual wiring.
   *
   * @example settingScopes: ["generation"] - Panel uses generation stores
   */
  settingScopes?: string[];

  /**
   * @deprecated Use `settingScopes` instead. Will be removed in a future version.
   * Alias for `settingScopes` - scope IDs this panel participates in.
   */
  scopes?: string[];

  /**
   * Optional declarative hint for capabilities this panel consumes.
   * Used by UI tooling (e.g., "Connect" context menu) when runtime
   * consumption has not been recorded yet.
   *
   * Supports both string keys and structured declarations with ref types:
   * @example consumesCapabilities: ["asset:selection"]
   * @example consumesCapabilities: [{ key: "asset:selection", refType: "asset" }]
   */
  consumesCapabilities?: CapabilityDeclaration[];

  /**
   * Optional declarative hint for capabilities this panel provides.
   * Used by UI tooling to show what a panel offers and for
   * dependency validation (ensuring required capabilities have providers).
   *
   * Supports both string keys and structured declarations with ref types:
   * @example providesCapabilities: ["generation:context"]
   * @example providesCapabilities: [{ key: "generation:context", refType: "generation" }]
   */
  providesCapabilities?: CapabilityDeclaration[];

  /**
   * Dockview scope IDs where this panel can appear.
   * Used by SmartDockview's `scope` prop to filter available panels.
   *
   * Common scopes:
   * - "workspace": Main workspace dockview
   * - "control-center": Bottom control center dock
   * - "asset-viewer": Asset viewer side panel
   *
   * If not specified, panel is only available when explicitly listed via `panels` prop.
   *
   * @example availableIn: ["workspace", "control-center"] - Panel shows in workspace and control center
   */
  availableIn?: string[];
  /** Optional availability policy (preferred over availableIn) */
  availability?: PanelAvailabilityPolicy;
}

/**
 * Interface that both LocalPanelRegistry and PanelRegistry implement.
 * Allows SmartDockview to work with either registry type.
 */
export interface PanelRegistryLike<T extends BasePanelDefinition = BasePanelDefinition> {
  /** Get a panel definition by ID */
  get(id: string): T | undefined;
  /** Check if a panel is registered */
  has(id: string): boolean;
  /** Get all registered panels */
  getAll(): T[];
  /** Get all panel IDs */
  getIds(): string[];
  /** Number of registered panels */
  readonly size: number;
}

/**
 * Extended registry interface with mutation methods.
 */
export interface MutablePanelRegistryLike<T extends BasePanelDefinition = BasePanelDefinition>
  extends PanelRegistryLike<T> {
  /** Register a panel definition */
  register(definition: T): this;
  /** Unregister a panel */
  unregister(id: string): boolean;
  /** Clear all panels */
  clear(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context Menu Contract Types
// ─────────────────────────────────────────────────────────────────────────────

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
  variant?: 'default' | 'danger' | 'success';

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
  variant?: 'default' | 'danger' | 'success';
  shortcut?: string;
  divider?: boolean;
  disabled?: boolean | string;
  children?: MenuItem[];
  onClick?: () => void;
}
