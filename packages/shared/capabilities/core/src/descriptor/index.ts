/**
 * Capability descriptor registry.
 *
 * Descriptors provide metadata (label, kind, source) for capability keys.
 */

export type {
  CapabilityDescriptor,
  CapabilityDescriptorKind,
  CapabilityDescriptorSource,
} from "./types";

export {
  registerCapabilityDescriptor,
  unregisterCapabilityDescriptor,
  getCapabilityDescriptor,
  getCapabilityDescriptors,
  getCapabilityDescriptorKeys,
  hasCapabilityDescriptor,
  clearCapabilityDescriptors,
  setDescriptorWarnOnOverwrite,
} from "./registry";
