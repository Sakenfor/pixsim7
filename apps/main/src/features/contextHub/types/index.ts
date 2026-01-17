/**
 * UI-specific capability types for contextHub.
 *
 * Core types (CapabilityKey, CapabilityProvider, etc.) should be imported
 * directly from @pixsim7/shared.capabilities.core.
 *
 * This module contains only UI-specific extensions and the UI registry interface.
 */
import type {
  CapabilityRegistry as CoreCapabilityRegistry,
  CapabilityConsumption as CoreCapabilityConsumption,
  CapabilityProvider,
} from "@pixsim7/shared.capabilities.core";
import type { EntityRef } from "@pixsim7/shared.types";

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
 * Capability consumption record (UI version).
 * Uses "hostId" naming for backwards compatibility with existing UI code.
 */
export interface CapabilityConsumption extends Omit<CoreCapabilityConsumption, "consumerScopeId"> {
  consumerHostId: string;
}

/**
 * UI capability registry interface.
 *
 * This extends the core registry with UI-specific naming ("host" instead of "scope").
 * Use createCapabilityRegistry() from ../domain/registry.ts to create instances.
 *
 * For non-UI code, import directly from @pixsim7/shared.capabilities.core instead.
 */
export interface CapabilityRegistry extends Omit<
  CoreCapabilityRegistry,
  "getConsumptionForScope" | "clearConsumptionForScope" | "recordConsumption" | "getConsumers" | "getAllConsumption"
> {
  recordConsumption(key: string, consumerHostId: string, provider: Pick<CapabilityProvider, "id" | "label"> | null): void;
  getConsumers(key: string): CapabilityConsumption[];
  getConsumptionForHost(hostId: string): CapabilityConsumption[];
  getAllConsumption(): CapabilityConsumption[];
  clearConsumptionForHost(hostId: string): void;
  // Throttle control is inherited from CoreCapabilityRegistry:
  // setConsumptionThrottleMs(ms: number): void;
  // getConsumptionThrottleMs(): number;
}
