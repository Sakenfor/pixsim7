import type { CapabilityKey } from "./types";

export type CapabilityDescriptorKind = "context" | "action" | "state" | "data";

export interface CapabilityDescriptor {
  key: CapabilityKey;
  label: string;
  description?: string;
  kind?: CapabilityDescriptorKind;
  source?: "contextHub" | "app";
}

const descriptors = new Map<CapabilityKey, CapabilityDescriptor>();

export function registerCapabilityDescriptor(descriptor: CapabilityDescriptor): void {
  descriptors.set(descriptor.key, descriptor);
}

export function unregisterCapabilityDescriptor(key: CapabilityKey): void {
  descriptors.delete(key);
}

export function getCapabilityDescriptor(key: CapabilityKey): CapabilityDescriptor | undefined {
  return descriptors.get(key);
}

export function getCapabilityDescriptors(): CapabilityDescriptor[] {
  return Array.from(descriptors.values());
}
