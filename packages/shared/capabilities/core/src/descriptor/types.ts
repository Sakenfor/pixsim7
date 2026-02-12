import type { CapabilityKey } from "../provider";

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
