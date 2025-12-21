export type CapabilityKey = string;

export interface CapabilityProvider<T = unknown> {
  id?: string;
  label?: string;
  description?: string;
  priority?: number;
  exposeToContextMenu?: boolean;
  isAvailable?: () => boolean;
  getValue: () => T;
}

export type CapabilityScope = "local" | "parent" | "root";

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
