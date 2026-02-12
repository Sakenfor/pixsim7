import { describe, it, expect, beforeEach } from "vitest";
import {
  registerCapabilityContract,
  unregisterCapabilityContract,
  getCapabilityContract,
  getCapabilityContracts,
} from "../contract";
import type { CapabilityContract } from "../contract";

// Reset between tests by unregistering all known keys
const testKeys: string[] = [];

function makeContract(key: string): CapabilityContract<number, number> {
  testKeys.push(key);
  return {
    key,
    version: 1,
    describeOffer: (o) => `offers ${o}`,
    describeRequirement: (r) => `requires ${r}`,
    isCompatible: (offer, requirement) => ({
      ok: offer >= requirement,
      reason: offer < requirement ? "offer too low" : undefined,
    }),
  };
}

describe("Contract Registry", () => {
  beforeEach(() => {
    for (const key of testKeys) {
      unregisterCapabilityContract(key);
    }
    testKeys.length = 0;
  });

  it("registers and retrieves a contract", () => {
    const c = makeContract("cap:c1");
    registerCapabilityContract(c);
    const retrieved = getCapabilityContract<number, number>("cap:c1");
    expect(retrieved).toBeDefined();
    expect(retrieved!.key).toBe("cap:c1");
    expect(retrieved!.version).toBe(1);
  });

  it("returns undefined for unregistered key", () => {
    expect(getCapabilityContract("cap:nope")).toBeUndefined();
  });

  it("lists all contracts", () => {
    registerCapabilityContract(makeContract("cap:a"));
    registerCapabilityContract(makeContract("cap:b"));
    expect(getCapabilityContracts()).toHaveLength(2);
  });

  it("unregisters a contract", () => {
    registerCapabilityContract(makeContract("cap:rm"));
    unregisterCapabilityContract("cap:rm");
    expect(getCapabilityContract("cap:rm")).toBeUndefined();
  });

  it("isCompatible works with typed generics", () => {
    const c = makeContract("cap:compat");
    registerCapabilityContract(c);

    const retrieved = getCapabilityContract<number, number>("cap:compat")!;
    expect(retrieved.isCompatible(10, 5)).toEqual({ ok: true });
    expect(retrieved.isCompatible(3, 5)).toEqual({ ok: false, reason: "offer too low" });
  });

  it("describeOffer and describeRequirement work", () => {
    const c = makeContract("cap:desc");
    registerCapabilityContract(c);

    const retrieved = getCapabilityContract<number, number>("cap:desc")!;
    expect(retrieved.describeOffer!(42)).toBe("offers 42");
    expect(retrieved.describeRequirement!(10)).toBe("requires 10");
  });
});
