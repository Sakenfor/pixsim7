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

export interface CapabilityRegistry {
  register<T>(key: CapabilityKey, provider: CapabilityProvider<T>): () => void;
  getBest<T>(key: CapabilityKey): CapabilityProvider<T> | null;
  getAll<T>(key: CapabilityKey): CapabilityProvider<T>[];
  getKeys(): CapabilityKey[];
  getExposedKeys(): CapabilityKey[];
  subscribe(listener: () => void): () => void;
}
