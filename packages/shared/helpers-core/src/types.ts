/**
 * Core helper types - pure TypeScript, no React/DOM dependencies.
 *
 * These types define the fundamental helper registry pattern that can be used
 * by different domains (stats, assets, etc.) to create typed adapter registries.
 */

/**
 * Base helper adapter interface.
 *
 * Adapters provide read/write operations for a specific data source.
 * Extend this interface for domain-specific adapters.
 *
 * @typeParam TRead - Return type of the get operation
 * @typeParam TWrite - Return type of the set operation (defaults to void)
 *
 * @example
 * ```ts
 * interface MyAdapter extends HelperAdapter<MyData> {
 *   customMethod: () => void;
 * }
 * ```
 */
export interface HelperAdapter<TRead = unknown, TWrite = unknown> {
  /** Unique identifier for this adapter */
  id: string;

  /** Human-readable label */
  label?: string;

  /** Description of what this adapter handles */
  description?: string;

  /**
   * Read data from the source
   * @param args - Source-specific arguments (e.g., session, entityId)
   */
  get: (...args: unknown[]) => TRead | null;

  /**
   * Write data to the source (optional - some sources are read-only)
   * @param args - Source-specific arguments
   */
  set?: (...args: unknown[]) => TWrite;

  /**
   * Additional metadata for the adapter
   * Can be used for UI hints, validation rules, etc.
   */
  meta?: Record<string, unknown>;
}

/**
 * Helper registry interface.
 *
 * Provides typed registration and lookup of adapters by key.
 *
 * @typeParam K - Key type (typically a string union of valid keys)
 * @typeParam A - Adapter type (extends HelperAdapter)
 *
 * @example
 * ```ts
 * type StatSource = 'session.relationships' | 'session.stats';
 * const registry = createHelperRegistry<StatSource, SessionStatAdapter>();
 * ```
 */
export interface HelperRegistry<K extends string, A extends HelperAdapter> {
  /**
   * Register an adapter for a key.
   * @param key - The key to register under
   * @param adapter - The adapter to register
   * @returns Unsubscribe function to remove the adapter
   */
  register(key: K, adapter: A): () => void;

  /**
   * Get the adapter for a key.
   * @param key - The key to look up
   */
  get(key: K): A | undefined;

  /**
   * Check if an adapter is registered for a key.
   * @param key - The key to check
   */
  has(key: K): boolean;

  /**
   * Get all registered adapters.
   */
  getAll(): Map<K, A>;

  /**
   * Get all registered keys.
   */
  keys(): K[];

  /**
   * Remove an adapter by key.
   * @param key - The key to remove
   * @returns true if removed, false if not found
   */
  unregister(key: K): boolean;

  /**
   * Subscribe to registry changes.
   * @param listener - Callback when registry changes
   * @returns Unsubscribe function
   */
  subscribe(listener: RegistryChangeListener<K, A>): () => void;
}

/**
 * Listener for registry changes.
 */
export type RegistryChangeListener<K extends string, A extends HelperAdapter> = (
  event: RegistryChangeEvent<K, A>
) => void;

/**
 * Event emitted when registry changes.
 */
export interface RegistryChangeEvent<K extends string, A extends HelperAdapter> {
  type: 'register' | 'unregister';
  key: K;
  adapter: A;
}

/**
 * Options for creating a helper registry.
 */
export interface HelperRegistryOptions {
  /**
   * Whether to warn when overwriting an existing adapter.
   * @default true
   */
  warnOnOverwrite?: boolean;

  /**
   * Whether to throw when overwriting an existing adapter.
   * Takes precedence over warnOnOverwrite.
   * @default false
   */
  strictMode?: boolean;
}
