/**
 * Core capability types - pure TypeScript, no React/DOM dependencies.
 * These types define the fundamental capability system that can be used
 * by both UI (React) and non-UI code.
 */

/**
 * Capability key identifier.
 * Uses string for flexibility; consumers can use branded types or constants.
 */
export type CapabilityKey = string;

/**
 * Scope for capability provision.
 * - "local": Only available within the current scope/host
 * - "parent": Registered on the parent scope/host
 * - "root": Registered on the root scope/host
 * - Custom string: For extensibility (plugins can define their own scopes)
 */
export type CapabilityScope = "local" | "parent" | "root" | (string & {});

/**
 * A capability provider that can supply a value of type T.
 */
export interface CapabilityProvider<T = unknown> {
  /** Unique identifier for this provider */
  id?: string;
  /** Human-readable label */
  label?: string;
  /** Description of what this provider offers */
  description?: string;
  /** Priority for provider selection (higher wins) */
  priority?: number;
  /** Whether to expose this provider in context menus */
  exposeToContextMenu?: boolean;
  /** Optional availability check - if returns false, provider is skipped */
  isAvailable?: () => boolean;
  /** Get the current value from this provider */
  getValue: () => T;
}

/**
 * Result of querying a capability - includes both the provider and its value.
 */
export interface CapabilitySnapshot<T = unknown> {
  value: T | null;
  provider: CapabilityProvider<T> | null;
}

/**
 * Tracks a capability consumption: which scope consumed which capability from which provider.
 * Used for debugging and visualization.
 */
export interface CapabilityConsumption {
  key: CapabilityKey;
  consumerScopeId: string;
  providerId: string;
  providerLabel?: string;
  lastSeenAt: number;
}

/**
 * Core capability registry interface.
 * This is the main API for providing and consuming capabilities.
 */
export interface CapabilityRegistry {
  /**
   * Register a capability provider.
   * @returns Unsubscribe function to remove the provider
   */
  register<T>(key: CapabilityKey, provider: CapabilityProvider<T>): () => void;

  /**
   * Get the best available provider for a capability.
   * Selection is based on priority (higher wins) and availability.
   */
  getBest<T>(key: CapabilityKey): CapabilityProvider<T> | null;

  /**
   * Get all providers for a capability.
   */
  getAll<T>(key: CapabilityKey): CapabilityProvider<T>[];

  /**
   * Get all registered capability keys.
   */
  getKeys(): CapabilityKey[];

  /**
   * Get all capability keys that are exposed to context menu.
   */
  getExposedKeys(): CapabilityKey[];

  /**
   * Subscribe to registry changes.
   * @returns Unsubscribe function
   */
  subscribe(listener: () => void): () => void;

  // Consumption tracking (for debugging/visualization)

  /**
   * Record that a scope consumed a capability from a provider.
   * Only id and label are used for tracking.
   */
  recordConsumption(
    key: CapabilityKey,
    consumerScopeId: string,
    provider: Pick<CapabilityProvider, "id" | "label"> | null
  ): void;

  /**
   * Get all consumers of a specific capability.
   */
  getConsumers(key: CapabilityKey): CapabilityConsumption[];

  /**
   * Get all capabilities consumed by a specific scope.
   */
  getConsumptionForScope(scopeId: string): CapabilityConsumption[];

  /**
   * Get all consumption records.
   */
  getAllConsumption(): CapabilityConsumption[];

  /**
   * Clear consumption records for a scope (cleanup on unmount).
   */
  clearConsumptionForScope(scopeId: string): void;
}

/**
 * Options for creating a capability registry.
 */
export interface CapabilityRegistryOptions {
  /**
   * Throttle interval for consumption recording (ms).
   * Set to 0 to disable throttling.
   * @default 500
   */
  consumptionThrottleMs?: number;
}
