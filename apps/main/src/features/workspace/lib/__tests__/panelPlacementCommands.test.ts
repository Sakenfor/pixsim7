import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const commandMocks = vi.hoisted(() => {
  const storeState: any = {
    floatingPanels: [],
    openFloatingPanel: vi.fn(),
    closeFloatingPanel: vi.fn(),
    restoreFloatingPanel: vi.fn(),
    bringFloatingPanelToFront: vi.fn(),
    dockFloatingPanel: vi.fn(),
  };

  const hostsById = new Map<string, any>();
  const schedulePanelPlacementTask = vi.fn((fn: () => void) => fn());

  return {
    storeState,
    hostsById,
    schedulePanelPlacementTask,
    reset() {
      storeState.floatingPanels = [];
      storeState.openFloatingPanel.mockReset();
      storeState.closeFloatingPanel.mockReset();
      storeState.restoreFloatingPanel.mockReset();
      storeState.bringFloatingPanelToFront.mockReset();
      storeState.dockFloatingPanel.mockReset();
      hostsById.clear();
      schedulePanelPlacementTask.mockClear();
      schedulePanelPlacementTask.mockImplementation((fn: () => void) => fn());
    },
  };
});

vi.mock("../../stores/workspaceStore", () => ({
  useWorkspaceStore: {
    getState: () => commandMocks.storeState,
  },
}));

vi.mock("../panelPlacementTracking", () => ({
  schedulePanelPlacementTask: (fn: () => void) => commandMocks.schedulePanelPlacementTask(fn),
}));

vi.mock("@pixsim7/shared.ui.dockview", () => ({
  getDockviewHost: (dockviewId: string) => commandMocks.hostsById.get(dockviewId) ?? null,
  getDockviewPanels: (api: any) => api?.__panels ?? [],
  resolvePanelDefinitionId: (panel: any) =>
    panel?.defId ??
    (typeof panel?.params?.panelId === "string" ? panel.params.panelId : undefined) ??
    (typeof panel?.id === "string" ? panel.id : undefined),
}));

describe("panelPlacementCommands", () => {
  let commands: typeof import("../panelPlacementCommands") | null = null;
  let warnSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    vi.resetModules();
    commandMocks.reset();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy?.mockRestore();
    warnSpy = null;
    commands = null;
  });

  it("openFloatingFromDockviewPanelPlacement merges host payload and origin metadata", async () => {
    commands = await import("../panelPlacementCommands");

    const panel = {
      id: "workspace:quickGenerate",
      defId: "quickGenerate",
      params: { foo: 1, context: { sourceLabel: "Quick Generate" } },
      __pixsimFloatingContextPayload: { currentAssetId: "asset-1", generationScopeId: "controlCenter:quickGenerate" },
    };

    const result = commands.openFloatingFromDockviewPanelPlacement({
      panel,
      dockPanelId: "workspace:quickGenerate",
      sourceDockviewId: "workspace",
      sourceGroupId: "group-1",
      options: {
        width: 700,
        context: {
          customFlag: true,
          __floatingMeta: {
            sourceGroupRestoreHint: {
              referenceGroupId: "bottom-group",
              direction: "above",
            },
          },
        },
      },
    });

    expect(result).toBe("quickGenerate");
    expect(commandMocks.storeState.openFloatingPanel).toHaveBeenCalledTimes(1);
    expect(commandMocks.storeState.openFloatingPanel).toHaveBeenCalledWith(
      "quickGenerate",
      expect.objectContaining({
        width: 700,
        context: expect.objectContaining({
          foo: 1,
          context: {
            sourceLabel: "Quick Generate",
            currentAssetId: "asset-1",
            generationScopeId: "controlCenter:quickGenerate",
          },
          customFlag: true,
          __floatingMeta: {
            sourceDockviewId: "workspace",
            sourceGroupId: "group-1",
            sourceInstanceId: "workspace:quickGenerate",
            sourceDefinitionId: "quickGenerate",
            sourceGroupRestoreHint: {
              referenceGroupId: "bottom-group",
              direction: "above",
            },
          },
        }),
      }),
    );
  });

  it("closeFloatingPanelWithReturnToOrigin falls back to close when no origin metadata exists", async () => {
    commands = await import("../panelPlacementCommands");
    commandMocks.storeState.floatingPanels = [{ id: "info", context: { foo: 1 } }];

    const result = commands.closeFloatingPanelWithReturnToOrigin("info");

    expect(result).toBe(false);
    expect(commandMocks.storeState.closeFloatingPanel).toHaveBeenCalledWith("info");
    expect(commandMocks.storeState.restoreFloatingPanel).not.toHaveBeenCalled();
  });

  it("closeFloatingPanelWithReturnToOrigin returns panel by focusing existing docked panel first", async () => {
    commands = await import("../panelPlacementCommands");

    const focusPanel = vi.fn(() => true);
    const addPanel = vi.fn();
    commandMocks.hostsById.set("workspace", {
      dockviewId: "workspace",
      api: { __panels: [], addPanel },
      focusPanel,
      addPanel,
    });
    commandMocks.storeState.floatingPanels = [
      {
        id: "quickGenerate::1",
        context: {
          __floatingMeta: {
            sourceDockviewId: "workspace",
            sourceInstanceId: "workspace:quickGenerate",
            sourceDefinitionId: "quickGenerate",
          },
        },
      },
    ];

    const result = commands.closeFloatingPanelWithReturnToOrigin("quickGenerate::1");

    expect(result).toBe(true);
    expect(focusPanel).toHaveBeenCalledWith("quickGenerate");
    expect(commandMocks.storeState.closeFloatingPanel).toHaveBeenCalledWith("quickGenerate::1");
    expect(addPanel).not.toHaveBeenCalled();
  });

  it("closeFloatingPanelWithReturnToOrigin restores floating panel if dock restore fails", async () => {
    commands = await import("../panelPlacementCommands");

    const floatingPanel = {
      id: "dev-tool:console::1",
      context: {
        foo: 1,
        __floatingMeta: {
          sourceDockviewId: "workspace",
          sourceInstanceId: "workspace:dev-tool:console::1",
          sourceDefinitionId: "dev-tool:console",
        },
      },
    };

    const focusPanel = vi.fn(() => false);
    const addPanel = vi.fn(() => {
      throw new Error("restore failed");
    });
    commandMocks.hostsById.set("workspace", {
      dockviewId: "workspace",
      api: {
        __panels: [{ id: "workspace:dev-tool:console::1" }],
        addPanel,
      },
      focusPanel,
      addPanel,
    });
    commandMocks.storeState.floatingPanels = [floatingPanel];

    const result = commands.closeFloatingPanelWithReturnToOrigin("dev-tool:console::1");

    expect(result).toBe(true);
    expect(commandMocks.schedulePanelPlacementTask).toHaveBeenCalledTimes(1);
    expect(addPanel).toHaveBeenCalledTimes(1);
    expect(addPanel.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        allowMultiple: true,
        instanceId: "workspace:dev-tool:console::1",
        params: { foo: 1 },
        position: { direction: "within", referencePanel: "workspace:dev-tool:console::1" },
      }),
    );
    expect(commandMocks.storeState.closeFloatingPanel).toHaveBeenCalledWith("dev-tool:console::1");
    expect(commandMocks.storeState.restoreFloatingPanel).toHaveBeenCalledWith(floatingPanel);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("closeFloatingPanelWithReturnToOrigin uses stored group restore hint when original group is gone", async () => {
    commands = await import("../panelPlacementCommands");

    const hintedGroup = { id: "bottom-group" };
    const getGroup = vi.fn((id: string) => (id === "bottom-group" ? hintedGroup : undefined));
    const focusPanel = vi.fn(() => false);
    const addPanel = vi.fn();
    commandMocks.hostsById.set("asset-viewer", {
      dockviewId: "asset-viewer",
      api: {
        __panels: [],
        getGroup,
      },
      focusPanel,
      addPanel,
    });
    commandMocks.storeState.floatingPanels = [
      {
        id: "media-preview",
        context: {
          __floatingMeta: {
            sourceDockviewId: "asset-viewer",
            sourceGroupId: "removed-top-group",
            sourceDefinitionId: "media-preview",
            sourceGroupRestoreHint: {
              referenceGroupId: "bottom-group",
              direction: "above",
            },
          },
        },
      },
    ];

    const result = commands.closeFloatingPanelWithReturnToOrigin("media-preview");

    expect(result).toBe(true);
    expect(addPanel).toHaveBeenCalledTimes(1);
    expect(addPanel.mock.calls[0][0]).toBe("media-preview");
    expect(addPanel.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        allowMultiple: false,
        position: {
          direction: "above",
          referenceGroup: hintedGroup,
        },
      }),
    );
  });

  it("bringFloatingPanelDefinitionToFrontPlacement resolves base definition IDs", async () => {
    commands = await import("../panelPlacementCommands");
    commandMocks.storeState.floatingPanels = [
      { id: "quickGenerate::2" },
      { id: "info" },
    ];

    const found = commands.bringFloatingPanelDefinitionToFrontPlacement("quickGenerate");
    const missing = commands.bringFloatingPanelDefinitionToFrontPlacement("inspector");

    expect(found).toBe(true);
    expect(missing).toBe(false);
    expect(commandMocks.storeState.bringFloatingPanelToFront).toHaveBeenCalledWith("quickGenerate::2");
  });
});
