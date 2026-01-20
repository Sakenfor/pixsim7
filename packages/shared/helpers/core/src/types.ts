/**
 * Core helper types - pure TypeScript, no React/DOM dependencies.
 *
 * These types define the fundamental helper registry pattern that can be used
 * by different domains (stats, assets, etc.) to create typed adapter registries.
 */

/**
 * Options for creating a registry.
 */
export interface RegistryOptions<V> {
  /**
   * Whether to warn when overwriting an existing entry.
   * @default true
   */
  warnOnOverwrite?: boolean;

  /**
   * Whether to throw when overwriting an existing entry.
   * Takes precedence over warnOnOverwrite.
   * @default false
   */
  strictMode?: boolean;

  /**
   * Optional callback when a duplicate entry is registered.
   */
  onDuplicate?: (incoming: V, existing: V) => void;

  /**
   * Optional label used in log messages.
   */
  label?: string;
}

/**
 * Listener for registry changes.
 */
export type RegistryChangeListener<K extends string, V> = (
  event: RegistryChangeEvent<K, V>
) => void;

/**
 * Event emitted when registry changes.
 */
export interface RegistryChangeEvent<K extends string, V> {
  type: 'register' | 'unregister';
  key: K;
  value: V;
}

/**
 * Generic registry interface.
 *
 * Provides typed registration and lookup of entries by key.
 *
 * @typeParam K - Key type (typically a string union of valid keys)
 * @typeParam V - Value type
 */
export interface Registry<K extends string, V> {
  /**
   * Register a value for a key.
   * @param key - The key to register under
   * @param value - The value to register
   * @returns Unsubscribe function to remove the entry
   */
  register(key: K, value: V): () => void;

  /**
   * Get the value for a key.
   * @param key - The key to look up
   */
  get(key: K): V | undefined;

  /**
   * Check if a value is registered for a key.
   * @param key - The key to check
   */
  has(key: K): boolean;

  /**
   * Get all registered entries.
   */
  getAll(): Map<K, V>;

  /**
   * Get all registered keys.
   */
  keys(): K[];

  /**
   * Remove an entry by key.
   * @param key - The key to remove
   * @returns true if removed, false if not found
   */
  unregister(key: K): boolean;

  /**
   * Subscribe to registry changes.
   * @param listener - Callback when registry changes
   * @returns Unsubscribe function
   */
  subscribe(listener: RegistryChangeListener<K, V>): () => void;

  /**
   * Remove all entries from the registry.
   */
  clear(): void;
}

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
export interface HelperRegistry<K extends string, A extends HelperAdapter> extends Registry<K, A> {}

/**
 * Options for creating a helper registry.
 */
export type HelperRegistryOptions<A extends HelperAdapter = HelperAdapter> = RegistryOptions<A>;
