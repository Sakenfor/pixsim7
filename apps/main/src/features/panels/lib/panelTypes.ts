/**
 * Unified Panel Types
 *
 * Shared interfaces for panel definitions and registries.
 * Both LocalPanelRegistry and global PanelRegistry implement these interfaces.
 */

import type { ComponentType } from "react";

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
  /**
   * Scope IDs this panel participates in.
   * Panels declaring a scope will be automatically wrapped with the corresponding
   * scope provider (e.g., "generation" scope wraps with GenerationScopeProvider).
   *
   * This enables automatic per-instance scoping without manual wiring.
   *
   * @example scopes: ["generation"] - Panel uses generation stores
   */
  scopes?: string[];

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
