import {
  PluginCatalog,
  type ExtendedPluginMetadata,
} from "@pixsim7/shared.plugins";
import { afterEach, describe, expect, it, vi } from "vitest";


function createMetadata(
  overrides: Partial<ExtendedPluginMetadata> = {},
): ExtendedPluginMetadata {
  return {
    id: "asset-tags",
    name: "Asset Tags",
    family: "dev-tool",
    origin: "builtin",
    activationState: "active",
    canDisable: false,
    ...overrides,
  };
}

describe("PluginCatalog registration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("treats identical duplicate registrations as a no-op", () => {
    const catalog = new PluginCatalog();
    const listener = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    catalog.subscribe(listener);
    const metadata = createMetadata();
    catalog.register(metadata);
    expect(listener).toHaveBeenCalledTimes(1);

    listener.mockClear();
    warnSpy.mockClear();

    catalog.register({ ...metadata });

    expect(listener).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(catalog.getAll()).toHaveLength(1);
  });

  it("warns and notifies when duplicate registration changes metadata", () => {
    const catalog = new PluginCatalog();
    const listener = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    catalog.subscribe(listener);
    catalog.register(createMetadata());
    listener.mockClear();
    warnSpy.mockClear();

    catalog.register(
      createMetadata({
        origin: "plugin-dir",
      }),
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(catalog.get("asset-tags")?.origin).toBe("plugin-dir");
  });

  it("notifies when plugin object changes even if metadata is unchanged", () => {
    const catalog = new PluginCatalog();
    const listener = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    catalog.subscribe(listener);

    const firstPlugin = { version: 1 };
    const secondPlugin = { version: 2 };

    catalog.registerWithPlugin(createMetadata(), firstPlugin);
    listener.mockClear();
    warnSpy.mockClear();

    catalog.registerWithPlugin(createMetadata(), secondPlugin);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(catalog.getPlugin<typeof secondPlugin>("asset-tags")).toBe(secondPlugin);
  });
});
