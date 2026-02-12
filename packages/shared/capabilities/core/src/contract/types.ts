import type { CapabilityKey } from "../provider";

export interface CapabilityCompatibilityResult {
  ok: boolean;
  reason?: string;
}

export interface CapabilityContract<Offer = unknown, Requirement = unknown> {
  key: CapabilityKey;
  version: number;
  describeOffer?: (offer: Offer) => string;
  describeRequirement?: (requirement: Requirement) => string;
  isCompatible: (offer: Offer, requirement: Requirement) => CapabilityCompatibilityResult;
}
