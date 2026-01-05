/**
 * Re-export core capability types from @pixsim7/capabilities-core.
 * UI-specific types are defined below.
 */
import type {
  CapabilityRegistry as CoreCapabilityRegistry,
  CapabilityConsumption as CoreCapabilityConsumption,
} from "@pixsim7/capabilities-core";
import type { EntityRef } from "@pixsim7/shared.types";

// Re-export all core types
export type {
  CapabilityKey,
  CapabilityScope,
  CapabilityProvider,
  CapabilitySnapshot,
  CapabilityRegistryOptions,
} from "@pixsim7/capabilities-core";

// Re-export registry factory
export { createCapabilityRegistry } from "@pixsim7/capabilities-core";

/**
 * UI-specific: Entity-scoped capability that includes an optional entity reference.
 */
export type EntityScopedCapability<T, TRef extends EntityRef = EntityRef> = T & {
  ref?: TRef | null;
};

// Re-export panel-related capability types for convenience
export type {
  CapabilityDeclaration,
  CapabilityDeclarationObject,
} from "@features/panels/lib/panelTypes";

/**
 * Capability consumption record.
 * Extends core type with UI-specific naming for backwards compatibility.
 */
export interface CapabilityConsumption extends Omit<CoreCapabilityConsumption, "consumerScopeId"> {
  /** @deprecated Use consumerScopeId from core - kept for backwards compatibility */
  consumerHostId: string;
}

/**
 * Capability registry interface.
 * Extends core registry with UI-specific naming for backwards compatibility.
 */
export interface CapabilityRegistry extends Omit<
  CoreCapabilityRegistry,
  "getConsumptionForScope" | "clearConsumptionForScope" | "recordConsumption" | "getConsumers" | "getAllConsumption"
> {
  // Consumption tracking with UI-specific naming (backwards compatible)
  recordConsumption(key: string, consumerHostId: string, provider: { id?: string; label?: string } | null): void;
  getConsumers(key: string): CapabilityConsumption[];
  getConsumptionForHost(hostId: string): CapabilityConsumption[];
  getAllConsumption(): CapabilityConsumption[];
  clearConsumptionForHost(hostId: string): void;
}
