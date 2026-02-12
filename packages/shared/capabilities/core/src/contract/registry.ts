import type { CapabilityKey } from "../provider";
import type { CapabilityContract } from "./types";

const contracts = new Map<CapabilityKey, CapabilityContract>();

export function registerCapabilityContract<Offer, Requirement>(
  contract: CapabilityContract<Offer, Requirement>,
): void {
  contracts.set(contract.key, contract as CapabilityContract);
}

export function unregisterCapabilityContract(key: CapabilityKey): void {
  contracts.delete(key);
}

export function getCapabilityContract<Offer, Requirement>(
  key: CapabilityKey,
): CapabilityContract<Offer, Requirement> | undefined {
  return contracts.get(key) as CapabilityContract<Offer, Requirement> | undefined;
}

export function getCapabilityContracts(): CapabilityContract[] {
  return Array.from(contracts.values());
}
