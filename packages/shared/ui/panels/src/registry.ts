import type { BasePanelDefinition } from "./panelTypes";

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
