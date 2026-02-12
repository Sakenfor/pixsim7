/**
 * Capability contract registry.
 *
 * Contracts define compatibility checks between capability offers and requirements.
 */

export type {
  CapabilityCompatibilityResult,
  CapabilityContract,
} from "./types";

export {
  registerCapabilityContract,
  unregisterCapabilityContract,
  getCapabilityContract,
  getCapabilityContracts,
} from "./registry";
