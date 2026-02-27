import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TestPanel = { id: string; defId?: string; params?: Record<string, unknown> };

const trackingMocks = vi.hoisted(() => {
  const workspaceListeners = new Set<(state: any) => void>();
  const registryListeners = new Set<() => void>();

  const workspaceState = {
    floatingPanels: [] as Array<{ id: string }>,
  };

  function createApi(panels: TestPanel[]) {
    const addListeners = new Set<() => void>();
    const removeListeners = new Set<() => void>();
    const layoutListeners = new Set<() => void>();
    return {
      __panels: panels,
      onDidAddPanel(cb: () => void) {
        addListeners.add(cb);
        return { dispose: () => addListeners.delete(cb) };
      },
      onDidRemovePanel(cb: () => void) {
        removeListeners.add(cb);
        return { dispose: () => removeListeners.delete(cb) };
      },
      onDidLayoutFromJSON(cb: () => void) {
        layoutListeners.add(cb);
        return { dispose: () => layoutListeners.delete(cb) };
      },
      __emitAdd() {
        for (const cb of addListeners) cb();
      },
      __emitRemove() {
        for (const cb of removeListeners) cb();
      },
      __emitLayout() {
        for (const cb of layoutListeners) cb();
      },
    };
  }

  const dockviewHosts: Array<any> = [];

  return {
    workspaceListeners,
    registryListeners,
    workspaceState,
    dockviewHosts,
    createApi,
    setFloatingPanels(ids: string[]) {
      workspaceState.floatingPanels = ids.map((id) => ({ id }));
      for (const cb of workspaceListeners) cb(workspaceState);
    },
    setHosts(hosts: any[]) {
      dockviewHosts.splice(0, dockviewHosts.length, ...hosts);
    },
    emitRegistryChange() {
      for (const cb of registryListeners) cb();
    },
    reset() {
      workspaceListeners.clear();
      registryListeners.clear();
      workspaceState.floatingPanels = [];
      dockviewHosts.splice(0, dockviewHosts.length);
    },
  };
});

vi.mock("../../stores/workspaceStore", () => ({
  useWorkspaceStore: {
    getState: () => trackingMocks.workspaceState,
    subscribe: (listener: (state: any) => void) => {
      trackingMocks.workspaceListeners.add(listener);
      return () => trackingMocks.workspaceListeners.delete(listener);
    },
  },
}));

vi.mock("@pixsim7/shared.ui.dockview", () => ({
  getAllDockviewHosts: () => trackingMocks.dockviewHosts,
  subscribeToDockviewRegistry: (listener: () => void) => {
    trackingMocks.registryListeners.add(listener);
    return () => trackingMocks.registryListeners.delete(listener);
  },
  getDockviewPanels: (api: any) => api?.__panels ?? [],
  resolvePanelDefinitionId: (panel: any) =>
    panel?.defId ??
    (typeof panel?.params?.panelId === "string" ? panel.params.panelId : undefined) ??
    (typeof panel?.component === "string" ? panel.component : undefined) ??
    (typeof panel?.id === "string" ? panel.id : undefined),
}));

describe("panelPlacementTracking", () => {
  let tracking: typeof import("../panelPlacementTracking") | null = null;

  beforeEach(() => {
    vi.resetModules();
    trackingMocks.reset();
  });

  afterEach(() => {
    tracking?.resetPanelPlacementTrackingForTests();
    tracking = null;
  });

  it("normalizes floating instance IDs and applies floating-win exclusions", async () => {
    trackingMocks.setFloatingPanels(["quickGenerate::1", "info"]);
    tracking = await import("../panelPlacementTracking");

    expect(tracking.getFloatingPanelDefinitionIds()).toEqual(["quickGenerate", "info"]);
    expect(tracking.getFloatingPanelDefinitionIdSet().has("quickGenerate")).toBe(true);
    expect(
      tracking.getDockPlacementExclusions("workspace", ["quickGenerate", "inspector", "info"]),
    ).toEqual(["quickGenerate", "info"]);
  });

  it("reports placements across floating and docked dockviews", async () => {
    trackingMocks.setFloatingPanels(["info::1"]);
    trackingMocks.setHosts([
      {
        dockviewId: "workspace",
        api: trackingMocks.createApi([
          { id: "w1", defId: "info" },
          { id: "w2", defId: "quickGenerate" },
        ]),
      },
      {
        dockviewId: "asset-viewer",
        api: trackingMocks.createApi([{ id: "a1", params: { panelId: "media-preview" } }]),
      },
    ]);

    tracking = await import("../panelPlacementTracking");

    expect(tracking.getPanelPlacements("info")).toEqual([
      { kind: "floating" },
      { kind: "docked", dockviewId: "workspace" },
    ]);
    expect(tracking.getPanelPlacements("media-preview")).toEqual([
      { kind: "docked", dockviewId: "asset-viewer" },
    ]);
  });

  it("updates floating snapshot via workspace store subscription", async () => {
    tracking = await import("../panelPlacementTracking");

    expect(tracking.getFloatingPanelDefinitionIds()).toEqual([]);

    trackingMocks.setFloatingPanels(["quickGenerate::2"]);

    expect(tracking.getFloatingPanelDefinitionIds()).toEqual(["quickGenerate"]);
    expect(tracking.isFloatingPanel("quickGenerate")).toBe(true);
  });

  it("computes diagnostics for floating-and-docked and multi-docked panels", async () => {
    trackingMocks.setFloatingPanels(["info"]);
    trackingMocks.setHosts([
      {
        dockviewId: "workspace",
        api: trackingMocks.createApi([
          { id: "w-info", defId: "info" },
          { id: "w-inspector", defId: "inspector" },
        ]),
      },
      {
        dockviewId: "asset-viewer",
        api: trackingMocks.createApi([{ id: "a-info", defId: "info" }]),
      },
      {
        dockviewId: "control-center",
        api: trackingMocks.createApi([{ id: "c-inspector", defId: "inspector" }]),
      },
    ]);

    tracking = await import("../panelPlacementTracking");
    const diagnostics = tracking
      .getPanelPlacementDiagnostics()
      .map((d) => ({ ...d, dockviewIds: d.dockviewIds?.slice().sort() }))
      .sort((a, b) => `${a.panelId}:${a.kind}`.localeCompare(`${b.panelId}:${b.kind}`));

    expect(diagnostics).toEqual([
      {
        kind: "floating-and-docked",
        panelId: "info",
        dockviewIds: ["asset-viewer", "workspace"],
      },
      {
        kind: "multi-docked",
        panelId: "info",
        dockviewIds: ["asset-viewer", "workspace"],
      },
      {
        kind: "multi-docked",
        panelId: "inspector",
        dockviewIds: ["control-center", "workspace"],
      },
    ]);
    expect(tracking.hasPanelPlacementConflicts()).toBe(true);
  });

  it("syncs dockview trackers when the dockview registry changes", async () => {
    tracking = await import("../panelPlacementTracking");

    expect(tracking.getDockedPanelDefinitionIds("workspace")).toEqual([]);

    trackingMocks.setHosts([
      {
        dockviewId: "workspace",
        api: trackingMocks.createApi([{ id: "w1", defId: "quickGenerate" }]),
      },
    ]);
    trackingMocks.emitRegistryChange();

    expect(tracking.getDockedPanelDefinitionIds("workspace")).toEqual(["quickGenerate"]);
    expect(tracking.isPanelDockedIn("workspace", "quickGenerate")).toBe(true);
  });
});
