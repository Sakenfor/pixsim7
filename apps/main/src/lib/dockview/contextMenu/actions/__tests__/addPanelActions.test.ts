import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MenuActionContext } from "../../types";

type PanelEntry = {
  id: string;
  title: string;
  icon?: string;
  category?: string;
  supportsMultipleInstances?: boolean;
};

const mockDeps = vi.hoisted(() => {
  const getDockWidgetByDockviewId = vi.fn();
  const getDockWidgetPanelIds = vi.fn();
  const panelSelectorsGet = vi.fn();
  const isPanelOpenInCurrentDockview = vi.fn();
  const isPanelOpenAnywhere = vi.fn();
  const addPanelInCurrentDockview = vi.fn();

  return {
    getDockWidgetByDockviewId,
    getDockWidgetPanelIds,
    panelSelectorsGet,
    isPanelOpenInCurrentDockview,
    isPanelOpenAnywhere,
    addPanelInCurrentDockview,
    reset() {
      getDockWidgetByDockviewId.mockReset();
      getDockWidgetPanelIds.mockReset();
      panelSelectorsGet.mockReset();
      isPanelOpenInCurrentDockview.mockReset();
      isPanelOpenAnywhere.mockReset();
      addPanelInCurrentDockview.mockReset();
      getDockWidgetByDockviewId.mockReturnValue(undefined);
      getDockWidgetPanelIds.mockReturnValue([]);
      panelSelectorsGet.mockReturnValue(undefined);
      isPanelOpenInCurrentDockview.mockReturnValue(false);
      isPanelOpenAnywhere.mockReturnValue(false);
      addPanelInCurrentDockview.mockReturnValue(null);
    },
  };
});

vi.mock("@lib/plugins/catalogSelectors", () => ({
  panelSelectors: {
    get: (panelId: string) => mockDeps.panelSelectorsGet(panelId),
  },
}));

vi.mock("@features/panels", () => ({
  getDockWidgetByDockviewId: (dockviewId: string) =>
    mockDeps.getDockWidgetByDockviewId(dockviewId),
  getDockWidgetPanelIds: (dockviewId: string) =>
    mockDeps.getDockWidgetPanelIds(dockviewId),
}));

vi.mock("../panelOpenUtils", () => ({
  addPanelInCurrentDockview: (...args: unknown[]) =>
    mockDeps.addPanelInCurrentDockview(...args),
  isPanelOpenInCurrentDockview: (...args: unknown[]) =>
    mockDeps.isPanelOpenInCurrentDockview(...args),
  isPanelOpenAnywhere: (...args: unknown[]) => mockDeps.isPanelOpenAnywhere(...args),
}));

import {
  addPanelAction,
  getDefaultScopePanelSubmenu,
} from "../addPanelActions";

function createPanelRegistry(panels: PanelEntry[]) {
  return {
    getAll: () => panels,
    getPublicPanels: () => panels,
  };
}

function createCtx(
  overrides: Partial<MenuActionContext> = {},
): MenuActionContext {
  return {
    contextType: "background",
    position: { x: 0, y: 0 },
    currentDockviewId: "asset-viewer",
    panelRegistry: createPanelRegistry([]),
    scopedPanelIds: [],
    contextHubState: null,
    ...overrides,
  } as MenuActionContext;
}

function getDefaultScopeChildDisabledResult(
  options: {
    panel: PanelEntry;
    api?: unknown;
    ctxOverrides?: Partial<MenuActionContext>;
  },
) {
  const { panel, api, ctxOverrides } = options;
  const ctx = createCtx({
    panelRegistry: createPanelRegistry([panel]),
    scopedPanelIds: [panel.id],
    ...ctxOverrides,
  });
  const submenu = getDefaultScopePanelSubmenu(ctx, api as any);
  expect(submenu).not.toBeNull();
  const children = submenu?.children;
  expect(Array.isArray(children)).toBe(true);
  const first = (children as any[])[0];
  expect(first).toBeTruthy();
  return first.disabled();
}

describe("addPanelActions", () => {
  beforeEach(() => {
    mockDeps.reset();
  });

  describe("getDefaultScopePanelSubmenu", () => {
    it("returns null when currentDockviewId is missing", () => {
      const ctx = createCtx({ currentDockviewId: undefined });

      const result = getDefaultScopePanelSubmenu(ctx, {});

      expect(result).toBeNull();
    });

    it("returns null when panelRegistry is missing", () => {
      const ctx = createCtx({ panelRegistry: undefined });

      const result = getDefaultScopePanelSubmenu(ctx, {});

      expect(result).toBeNull();
    });

    it("prefers dock-widget panel ids over scopedPanelIds", () => {
      const ctx = createCtx({
        panelRegistry: createPanelRegistry([
          { id: "from-dock", title: "From Dock" },
          { id: "from-scope", title: "From Scope" },
        ]),
        scopedPanelIds: ["from-scope"],
      });
      mockDeps.getDockWidgetPanelIds.mockReturnValue(["from-dock"]);

      const submenu = getDefaultScopePanelSubmenu(ctx, {});

      expect(mockDeps.getDockWidgetPanelIds).toHaveBeenCalledWith("asset-viewer");
      expect(submenu?.children).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "panel:add:default-scope:from-dock",
          }),
        ]),
      );
      expect(submenu?.children).toHaveLength(1);
    });

    it("falls back to scopedPanelIds when dock-widget panel ids are empty", () => {
      const ctx = createCtx({
        panelRegistry: createPanelRegistry([
          { id: "from-scope", title: "From Scope" },
        ]),
        scopedPanelIds: ["from-scope"],
      });
      mockDeps.getDockWidgetPanelIds.mockReturnValue([]);

      const submenu = getDefaultScopePanelSubmenu(ctx, {});

      expect(submenu?.children).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "panel:add:default-scope:from-scope",
          }),
        ]),
      );
    });

    it("returns null when scoped ids are empty or exceed max", () => {
      const ctxEmpty = createCtx({
        panelRegistry: createPanelRegistry([]),
        scopedPanelIds: [],
      });
      mockDeps.getDockWidgetPanelIds.mockReturnValue([]);
      expect(getDefaultScopePanelSubmenu(ctxEmpty, {})).toBeNull();

      const overMax = Array.from({ length: 21 }, (_, i) => `panel-${i}`);
      const ctxOverMax = createCtx({
        panelRegistry: createPanelRegistry(
          overMax.map((id) => ({ id, title: id })),
        ),
      });
      mockDeps.getDockWidgetPanelIds.mockReturnValue(overMax);
      expect(getDefaultScopePanelSubmenu(ctxOverMax, {})).toBeNull();
    });

    it("excludes host panel id from default scope children", () => {
      const ctx = createCtx({
        panelRegistry: createPanelRegistry([
          { id: "asset-viewer", title: "Host" },
          { id: "media-preview", title: "Media Preview" },
        ]),
      });
      mockDeps.getDockWidgetPanelIds.mockReturnValue([
        "asset-viewer",
        "media-preview",
      ]);

      const submenu = getDefaultScopePanelSubmenu(ctx, {});

      const ids = (submenu?.children as any[]).map((child) => child.id);
      expect(ids).toEqual(["panel:add:default-scope:media-preview"]);
    });

    it("decorates default scope labels for open and open elsewhere panels", () => {
      const ctx = createCtx({
        panelRegistry: createPanelRegistry([
          { id: "open-here", title: "Open Here", icon: "target" },
          { id: "open-elsewhere", title: "Open Elsewhere", icon: "layout" },
          { id: "closed", title: "Closed", icon: "circle" },
        ]),
      });
      mockDeps.getDockWidgetPanelIds.mockReturnValue([
        "open-here",
        "open-elsewhere",
        "closed",
      ]);
      mockDeps.isPanelOpenInCurrentDockview.mockImplementation(
        (_ctx: unknown, panelId: string, allowMultiple: boolean) =>
          panelId === "open-here" && allowMultiple === false,
      );
      mockDeps.isPanelOpenAnywhere.mockImplementation(
        (_ctx: unknown, panelId: string) => panelId === "open-elsewhere",
      );

      const submenu = getDefaultScopePanelSubmenu(ctx, {});
      const children = submenu?.children as any[];
      const byId = new Map(children.map((child) => [child.id, child]));

      expect(byId.get("panel:add:default-scope:open-here")?.label).toMatch(/open$/);
      expect(byId.get("panel:add:default-scope:open-here")?.iconColor).toBe(
        "text-neutral-500",
      );
      expect(byId.get("panel:add:default-scope:open-elsewhere")?.label).toMatch(
        /open elsewhere$/,
      );
      expect(
        byId.get("panel:add:default-scope:open-elsewhere")?.iconColor,
      ).toBe("text-neutral-500");
      expect(byId.get("panel:add:default-scope:closed")?.label).toBe("Closed");
      expect(byId.get("panel:add:default-scope:closed")?.iconColor).toBeUndefined();
    });

    it("surfaces disabled reasons through children callbacks", () => {
      const single = { id: "single", title: "Single" };
      const multi = {
        id: "multi",
        title: "Multi",
        supportsMultipleInstances: true,
      };
      const candidate = { id: "candidate", title: "Candidate" };

      expect(
        getDefaultScopeChildDisabledResult({
          panel: single,
          api: undefined,
        }),
      ).toBe(false);

      mockDeps.isPanelOpenInCurrentDockview.mockImplementation(
        (_ctx: unknown, panelId: string, allowMultiple: boolean) =>
          panelId === "single" && allowMultiple === false,
      );
      expect(
        getDefaultScopeChildDisabledResult({
          panel: single,
          api: {},
        }),
      ).toBe("Already open");

      mockDeps.isPanelOpenInCurrentDockview.mockImplementation(
        (_ctx: unknown, panelId: string, allowMultiple: boolean) =>
          panelId === "multi" && allowMultiple === false,
      );
      mockDeps.isPanelOpenAnywhere.mockReturnValue(true);
      expect(
        getDefaultScopeChildDisabledResult({
          panel: multi,
          api: {},
        }),
      ).toBe(false);

      mockDeps.isPanelOpenInCurrentDockview.mockImplementation(
        (_ctx: unknown, panelId: string, allowMultiple: boolean) =>
          panelId === "equivalent" && allowMultiple === false,
      );
      mockDeps.isPanelOpenAnywhere.mockReturnValue(false);
      mockDeps.panelSelectorsGet.mockImplementation((panelId: string) => {
        if (panelId === "candidate") {
          return { addPanelEquivalentIds: ["equivalent"] };
        }
        return undefined;
      });
      expect(
        getDefaultScopeChildDisabledResult({
          panel: candidate,
          api: {},
        }),
      ).toBe("Already represented");

      mockDeps.panelSelectorsGet.mockImplementation((panelId: string) => {
        if (panelId === "open-peer") {
          return { addPanelEquivalentIds: ["candidate"] };
        }
        return undefined;
      });
      mockDeps.isPanelOpenInCurrentDockview.mockImplementation(
        (_ctx: unknown, panelId: string, allowMultiple: boolean) =>
          panelId === "open-peer" && allowMultiple === false,
      );
      expect(
        getDefaultScopeChildDisabledResult({
          panel: candidate,
          api: {},
          ctxOverrides: {
            panelRegistry: createPanelRegistry([candidate, { id: "open-peer", title: "Open Peer" }]),
          },
        }),
      ).toBe("Already represented");

      mockDeps.panelSelectorsGet.mockReturnValue(undefined);
      mockDeps.isPanelOpenInCurrentDockview.mockReturnValue(false);
      mockDeps.isPanelOpenAnywhere.mockImplementation(
        (_ctx: unknown, panelId: string) => panelId === "candidate",
      );
      expect(
        getDefaultScopeChildDisabledResult({
          panel: candidate,
          api: {},
        }),
      ).toBe("Already open elsewhere");
    });
  });

  describe("addPanelAction.children", () => {
    it("returns a Panels unavailable stub when panelRegistry is missing", () => {
      const ctx = createCtx({ panelRegistry: undefined });

      const children = addPanelAction.children?.(ctx) as any[];

      expect(children).toHaveLength(1);
      expect(children[0].id).toBe("panel:add:missing");
      expect(children[0].label).toBe("Panels unavailable");
      expect(children[0].disabled()).toBe(true);
    });

    it("returns a No panels available stub when category map is empty", () => {
      const ctx = createCtx({
        panelRegistry: createPanelRegistry([]),
      });

      const children = addPanelAction.children?.(ctx) as any[];

      expect(children).toHaveLength(1);
      expect(children[0].id).toBe("panel:add:empty");
      expect(children[0].label).toBe("No panels available");
      expect(children[0].disabled()).toBe(true);
    });

    it("keeps already-open entries listed with open labels and dimmed icons", () => {
      const ctx = createCtx({
        panelRegistry: createPanelRegistry([
          { id: "asset-viewer", title: "Host", category: "Core", icon: "app-window" },
          { id: "open-here", title: "Open Here", category: "Core", icon: "target" },
          { id: "open-elsewhere", title: "Open Elsewhere", category: "Core", icon: "layout" },
          { id: "closed", title: "Closed", category: "Core", icon: "circle" },
        ]),
      });
      mockDeps.isPanelOpenInCurrentDockview.mockImplementation(
        (_ctx: unknown, panelId: string, allowMultiple: boolean) =>
          panelId === "open-here" && allowMultiple === false,
      );
      mockDeps.isPanelOpenAnywhere.mockImplementation(
        (_ctx: unknown, panelId: string) => panelId === "open-elsewhere",
      );

      const categories = addPanelAction.children?.(ctx) as any[];
      expect(categories).toHaveLength(1);
      const panelEntries = categories[0].children as any[];
      const byId = new Map(panelEntries.map((entry) => [entry.id, entry]));

      expect(byId.has("panel:add:asset-viewer")).toBe(false);
      expect(byId.has("panel:add:open-here")).toBe(true);
      expect(byId.has("panel:add:open-elsewhere")).toBe(true);
      expect(byId.has("panel:add:closed")).toBe(true);

      expect(byId.get("panel:add:open-here")?.label).toMatch(/open$/);
      expect(byId.get("panel:add:open-here")?.iconColor).toBe("text-neutral-500");
      expect(byId.get("panel:add:open-elsewhere")?.label).toMatch(/open elsewhere$/);
      expect(byId.get("panel:add:open-elsewhere")?.iconColor).toBe("text-neutral-500");
      expect(byId.get("panel:add:closed")?.label).toBe("Closed");
      expect(byId.get("panel:add:closed")?.iconColor).toBeUndefined();
    });

    it("sorts categories with Core first, Other last, others alphabetically", () => {
      const ctx = createCtx({
        panelRegistry: createPanelRegistry([
          { id: "p-other", title: "Other", category: "Other" },
          { id: "p-core", title: "Core", category: "Core" },
          { id: "p-zeta", title: "Zeta", category: "zeta" },
          { id: "p-alpha", title: "Alpha", category: "alpha" },
        ]),
      });

      const categories = addPanelAction.children?.(ctx) as any[];
      const ids = categories.map((category) => category.id);

      expect(ids).toEqual([
        "panel:add:category:Core",
        "panel:add:category:alpha",
        "panel:add:category:zeta",
        "panel:add:category:Other",
      ]);
    });
  });
});
