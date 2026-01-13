import type { CapabilityKey } from "@pixsim7/shared.capabilities-core";

/**
 * Kind of capability descriptor.
 * - "context": Provides contextual data (read-only state)
 * - "action": Provides executable actions
 * - "state": Provides mutable state
 * - "data": Provides data entities
 * - Custom string: For extensibility (plugins can define their own kinds)
 */
export type CapabilityDescriptorKind = "context" | "action" | "state" | "data" | (string & {});

/**
 * Source of the capability.
 * - "contextHub": Native contextHub capability
 * - "app": Bridged from app actions/state
 * - Custom string: For extensibility (plugins can define their own sources)
 */
export type CapabilityDescriptorSource = "contextHub" | "app" | (string & {});

export interface CapabilityDescriptor {
  key: CapabilityKey;
  label: string;
  description?: string;
  kind?: CapabilityDescriptorKind;
  source?: CapabilityDescriptorSource;
}

// ============================================================================
// Descriptor Registry
// ============================================================================

const descriptors = new Map<CapabilityKey, CapabilityDescriptor>();
let warnOnOverwrite = false; // Default to false for backward compatibility

/**
 * Register a capability descriptor.
 * @param descriptor - The descriptor to register
 * @param options - Optional flags (silent to suppress overwrite warning)
 */
export function registerCapabilityDescriptor(
  descriptor: CapabilityDescriptor,
  options?: { silent?: boolean }
): void {
  if (warnOnOverwrite && descriptors.has(descriptor.key) && !options?.silent) {
    console.warn(
      `[CapabilityDescriptor] Overwriting existing descriptor for '${descriptor.key}'. ` +
      `Use unregisterCapabilityDescriptor() first or pass { silent: true } to suppress this warning.`
    );
  }
  descriptors.set(descriptor.key, descriptor);
}

/**
 * Unregister a capability descriptor.
 * @returns true if the descriptor existed and was removed
 */
export function unregisterCapabilityDescriptor(key: CapabilityKey): boolean {
  return descriptors.delete(key);
}

export function getCapabilityDescriptor(key: CapabilityKey): CapabilityDescriptor | undefined {
  return descriptors.get(key);
}

export function getCapabilityDescriptors(): CapabilityDescriptor[] {
  return Array.from(descriptors.values());
}

/**
 * Check if a descriptor is registered for a key.
 */
export function hasCapabilityDescriptor(key: CapabilityKey): boolean {
  return descriptors.has(key);
}

/**
 * Get all registered descriptor keys.
 */
export function getCapabilityDescriptorKeys(): CapabilityKey[] {
  return Array.from(descriptors.keys());
}

/**
 * Clear all registered descriptors (useful for testing).
 */
export function clearCapabilityDescriptors(): void {
  descriptors.clear();
}

/**
 * Configure warning behavior on overwrite.
 * @param warn - Whether to warn when overwriting existing descriptors
 */
export function setDescriptorWarnOnOverwrite(warn: boolean): void {
  warnOnOverwrite = warn;
}
