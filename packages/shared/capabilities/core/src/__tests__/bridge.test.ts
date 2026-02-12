import { describe, it, expect } from "vitest";
import {
  APP_ACTION_KEY_PREFIX,
  APP_STATE_KEY_PREFIX,
  getAppActionCapabilityKey,
  getAppStateCapabilityKey,
} from "../bridge";

describe("Bridge utilities", () => {
  it("APP_ACTION_KEY_PREFIX is correct", () => {
    expect(APP_ACTION_KEY_PREFIX).toBe("app:action:");
  });

  it("APP_STATE_KEY_PREFIX is correct", () => {
    expect(APP_STATE_KEY_PREFIX).toBe("app:state:");
  });

  it("getAppActionCapabilityKey generates correct key", () => {
    expect(getAppActionCapabilityKey("toggleDarkMode")).toBe("app:action:toggleDarkMode");
    expect(getAppActionCapabilityKey("save")).toBe("app:action:save");
  });

  it("getAppStateCapabilityKey generates correct key", () => {
    expect(getAppStateCapabilityKey("theme")).toBe("app:state:theme");
    expect(getAppStateCapabilityKey("user.preferences")).toBe("app:state:user.preferences");
  });
});
