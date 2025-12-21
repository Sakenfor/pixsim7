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
  /** Hide from add-panel menus (still available in layouts) */
  isInternal?: boolean;
  /** Allow multiple instances of this panel in the same dockview */
  supportsMultipleInstances?: boolean;
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
