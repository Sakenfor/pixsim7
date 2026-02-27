import { describe, expect, it } from "vitest";

import { resolveRuntimeSource } from "./runtimeResolution";

describe("resolveRuntimeSource", () => {
  it("returns the first enabled candidate by explicit priority", () => {
    const result = resolveRuntimeSource(
      [
        { source: "params", enabled: true, value: "params-value" },
        { source: "context", enabled: true, value: "context-value" },
        { source: "selection", enabled: true, value: "selection-value" },
      ] as const,
      ["context", "params", "selection"] as const,
    );

    expect(result).toEqual({
      source: "context",
      enabled: true,
      value: "context-value",
    });
  });

  it("skips disabled candidates even if they appear earlier in priority", () => {
    const result = resolveRuntimeSource(
      [
        { source: "context", enabled: false, value: "context-value" },
        { source: "params", enabled: true, value: "params-value" },
      ] as const,
      ["context", "params"] as const,
    );

    expect(result?.source).toBe("params");
    expect(result?.value).toBe("params-value");
  });

  it("returns undefined when no prioritized candidate is enabled", () => {
    const result = resolveRuntimeSource(
      [
        { source: "context", enabled: false, value: "context-value" },
        { source: "params", enabled: false, value: "params-value" },
      ] as const,
      ["context", "params"] as const,
    );

    expect(result).toBeUndefined();
  });
});
