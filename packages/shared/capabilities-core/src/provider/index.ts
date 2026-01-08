/**
 * Provider capability registry.
 *
 * Used for ContextHub-style capability providers with priority and availability.
 */

export type {
  CapabilityKey,
  CapabilityScope,
  CapabilityProvider,
  CapabilitySnapshot,
  CapabilityConsumption,
  CapabilityRegistry,
  CapabilityRegistryOptions,
} from "./types";

export { createCapabilityRegistry } from "./registry";
