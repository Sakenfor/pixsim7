import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerCapabilityDescriptor,
  unregisterCapabilityDescriptor,
  getCapabilityDescriptor,
  getCapabilityDescriptors,
  getCapabilityDescriptorKeys,
  hasCapabilityDescriptor,
  clearCapabilityDescriptors,
  setDescriptorWarnOnOverwrite,
} from "../descriptor";
import type { CapabilityDescriptor } from "../descriptor";

const makeDescriptor = (key: string, label?: string): CapabilityDescriptor => ({
  key,
  label: label ?? key,
  kind: "context",
  source: "contextHub",
});

describe("Descriptor Registry", () => {
  beforeEach(() => {
    clearCapabilityDescriptors();
    setDescriptorWarnOnOverwrite(false);
  });

  it("registers and retrieves a descriptor", () => {
    const d = makeDescriptor("cap:foo", "Foo");
    registerCapabilityDescriptor(d);
    expect(getCapabilityDescriptor("cap:foo")).toEqual(d);
  });

  it("returns undefined for unregistered key", () => {
    expect(getCapabilityDescriptor("cap:missing")).toBeUndefined();
  });

  it("lists all descriptors", () => {
    registerCapabilityDescriptor(makeDescriptor("a"));
    registerCapabilityDescriptor(makeDescriptor("b"));
    expect(getCapabilityDescriptors()).toHaveLength(2);
  });

  it("lists all keys", () => {
    registerCapabilityDescriptor(makeDescriptor("x"));
    registerCapabilityDescriptor(makeDescriptor("y"));
    expect(getCapabilityDescriptorKeys()).toEqual(["x", "y"]);
  });

  it("has() returns true for registered keys", () => {
    registerCapabilityDescriptor(makeDescriptor("cap:exists"));
    expect(hasCapabilityDescriptor("cap:exists")).toBe(true);
    expect(hasCapabilityDescriptor("cap:nope")).toBe(false);
  });

  it("unregisters a descriptor", () => {
    registerCapabilityDescriptor(makeDescriptor("cap:rm"));
    expect(unregisterCapabilityDescriptor("cap:rm")).toBe(true);
    expect(getCapabilityDescriptor("cap:rm")).toBeUndefined();
  });

  it("unregister returns false for missing key", () => {
    expect(unregisterCapabilityDescriptor("cap:ghost")).toBe(false);
  });

  it("clears all descriptors", () => {
    registerCapabilityDescriptor(makeDescriptor("a"));
    registerCapabilityDescriptor(makeDescriptor("b"));
    clearCapabilityDescriptors();
    expect(getCapabilityDescriptors()).toHaveLength(0);
  });

  it("re-registering identical descriptor is idempotent (no warning)", () => {
    setDescriptorWarnOnOverwrite(true);
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const d = makeDescriptor("cap:same", "Same");
    registerCapabilityDescriptor(d);
    registerCapabilityDescriptor(d);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("warns when overwriting with different descriptor in dev mode", () => {
    setDescriptorWarnOnOverwrite(true);
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    registerCapabilityDescriptor(makeDescriptor("cap:ow", "Original"));
    registerCapabilityDescriptor(makeDescriptor("cap:ow", "Changed"));

    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("suppresses warning with silent option", () => {
    setDescriptorWarnOnOverwrite(true);
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    registerCapabilityDescriptor(makeDescriptor("cap:s", "A"));
    registerCapabilityDescriptor(makeDescriptor("cap:s", "B"), { silent: true });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
