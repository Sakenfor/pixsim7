import type { EntityRef } from "@pixsim7/shared.types";

export type CapabilityKey = string;

export type EntityScopedCapability<T, TRef extends EntityRef = EntityRef> = T & {
  ref?: TRef | null;
};

export interface CapabilityProvider<T = unknown> {
  id?: string;
  label?: string;
  description?: string;
  priority?: number;
  exposeToContextMenu?: boolean;
  isAvailable?: () => boolean;
  getValue: () => T;
}

/**
 * Scope for capability provision.
 * - "local": Only available within the current ContextHubHost
 * - "parent": Registered on the parent ContextHubHost
 * - "root": Registered on the root ContextHubHost
 * - Custom string: For extensibility (plugins can define their own scopes)
 */
export type CapabilityScope = "local" | "parent" | "root" | (string & {});

export interface CapabilitySnapshot<T = unknown> {
  value: T | null;
  provider: CapabilityProvider<T> | null;
}

/**
 * Tracks a capability consumption: which host consumed which capability from which provider.
 * Used for debugging and Properties popup visualization.
 */
export interface CapabilityConsumption {
  key: CapabilityKey;
  consumerHostId: string;
  providerId: string;
  providerLabel?: string;
  lastSeenAt: number;
}

export interface CapabilityRegistry {
  register<T>(key: CapabilityKey, provider: CapabilityProvider<T>): () => void;
  getBest<T>(key: CapabilityKey): CapabilityProvider<T> | null;
  getAll<T>(key: CapabilityKey): CapabilityProvider<T>[];
  getKeys(): CapabilityKey[];
  getExposedKeys(): CapabilityKey[];
  subscribe(listener: () => void): () => void;

  // Consumption tracking (for debugging/visualization)
  recordConsumption(key: CapabilityKey, consumerHostId: string, provider: CapabilityProvider | null): void;
  getConsumers(key: CapabilityKey): CapabilityConsumption[];
  getConsumptionForHost(hostId: string): CapabilityConsumption[];
  getAllConsumption(): CapabilityConsumption[];
  clearConsumptionForHost(hostId: string): void;
}
