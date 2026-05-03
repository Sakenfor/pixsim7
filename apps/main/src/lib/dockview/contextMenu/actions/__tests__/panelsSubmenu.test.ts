import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MenuActionContext } from "../../types";

const mockDeps = vi.hoisted(() => {
  const getDefaultScopePanelSubmenu = vi.fn();
  const buildRelatedPanelActions = vi.fn();
  const addPanelVisible = vi.fn();

  return {
    getDefaultScopePanelSubmenu,
    buildRelatedPanelActions,
    addPanelVisible,
    reset() {
      getDefaultScopePanelSubmenu.mockReset();
      buildRelatedPanelActions.mockReset();
      addPanelVisible.mockReset();
      getDefaultScopePanelSubmenu.mockReturnValue(null);
      buildRelatedPanelActions.mockReturnValue(null);
      addPanelVisible.mockReturnValue(true);
    },
  };
});

vi.mock("../../resolveCurrentDockview", () => ({
  resolveCurrentDockview: (ctx: MenuActionContext) => ({ api: ctx.api }),
}));

vi.mock("../../ContextMenuRegistry", () => ({
  contextMenuRegistry: {
    registerAll: vi.fn(),
    setContextCategoryPriority: vi.fn(),
    setHistoryProvider: vi.fn(),
  },
}));

vi.mock("@features/workspace/stores/contextMenuHistoryStore", () => ({
  useContextMenuHistoryStore: {
    getState: () => ({
      getRecentForContext: () => [],
      recordUsage: vi.fn(),
    }),
  },
}));

vi.mock("../addPanelActions", () => {
  const addPanelAction = {
    id: "panel:add",
    label: "Add Panel",
    icon: "plus-square",
    availableIn: ["background", "tab", "panel-content"] as const,
    visible: (ctx: MenuActionContext) => mockDeps.addPanelVisible(ctx),
    execute: () => {},
  };
  return {
    addPanelAction,
    addPanelActions: [addPanelAction],
    getDefaultScopePanelSubmenu: (ctx: MenuActionContext, api: unknown) =>
      mockDeps.getDefaultScopePanelSubmenu(ctx, api),
  };
});

vi.mock("../contextHubActions", () => ({
  contextHubActions: [],
  buildRelatedPanelActions: (ctx: MenuActionContext) =>
    mockDeps.buildRelatedPanelActions(ctx),
}));

vi.mock("../assetActions", () => ({
  assetActions: [],
}));

vi.mock("../cubeActions", () => ({
  cubeActions: [],
}));

vi.mock("../debugActions", () => ({
  debugActions: [],
}));

vi.mock("../devContextActions", () => ({
  devContextActions: [],
}));

vi.mock("../promptActions", () => ({
  promptActions: [],
}));

vi.mock("../layoutActions", () => {
  const splitRightAction = {
    id: "layout:split-right",
    label: "Split Right",
    execute: () => {},
  };
  const splitDownAction = {
    id: "layout:split-down",
    label: "Split Down",
    execute: () => {},
  };
  const moveToNewGroupAction = {
    id: "layout:move-to-new-group",
    label: "Move to New Group",
    execute: () => {},
  };
  const joinLeftGroupAction = {
    id: "layout:join-left-group",
    label: "Join Left Group",
    execute: () => {},
  };
  const joinRightGroupAction = {
    id: "layout:join-right-group",
    label: "Join Right Group",
    execute: () => {},
  };
  const splitPanelAction = {
    id: "layout:split",
    label: "Split Panel",
    visible: () => false,
    execute: () => {},
  };
  const movePanelAction = {
    id: "layout:move",
    label: "Move Panel",
    visible: () => false,
    execute: () => {},
  };
  return {
    splitRightAction,
    splitDownAction,
    moveToNewGroupAction,
    joinLeftGroupAction,
    joinRightGroupAction,
    splitPanelAction,
    movePanelAction,
    layoutActions: [splitPanelAction, movePanelAction],
  };
});

vi.mock("../panelActions", () => {
  const closePanelAction = {
    id: "panel:close",
    label: "Close Panel",
    execute: () => {},
  };
  const maximizePanelAction = {
    id: "panel:maximize",
    label: "Maximize Panel",
    execute: () => {},
  };
  const restorePanelAction = {
    id: "panel:restore",
    label: "Restore Panel",
    execute: () => {},
  };
  const floatPanelAction = {
    id: "panel:float",
    label: "Float Panel",
    execute: () => {},
  };
  const pinTabAction = {
    id: "panel:pin-tab",
    label: "Pin Tab",
    execute: () => {},
  };
  const unpinTabAction = {
    id: "panel:unpin-tab",
    label: "Unpin Tab",
    execute: () => {},
  };
  const focusPanelAction = {
    id: "panel:focus",
    label: "Focus Panel",
    visible: (ctx: MenuActionContext) => !!ctx.api,
    execute: () => {},
  };
  const propertiesAction = {
    id: "panel:properties",
    label: "Properties",
    execute: () => {},
  };
  const closeOtherPanelsAction = {
    id: "panel:close-others",
    label: "Close Other Tabs",
    execute: () => {},
  };
  const closeAllInGroupAction = {
    id: "panel:close-all-in-group",
    label: "Close All in Group",
    execute: () => {},
  };

  return {
    closePanelAction,
    maximizePanelAction,
    restorePanelAction,
    floatPanelAction,
    pinTabAction,
    unpinTabAction,
    focusPanelAction,
    propertiesAction,
    panelPropertiesAction: propertiesAction,
    closeOtherPanelsAction,
    closeAllInGroupAction,
    panelActionDefinitions: [],
    registerPanelActionCapabilities: vi.fn(),
    panelActions: [floatPanelAction, pinTabAction, unpinTabAction, focusPanelAction],
  };
});

vi.mock("../presetActions", () => {
  const savePresetAction = {
    id: "preset:save",
    label: "Save Layout",
    visible: () => false,
    execute: () => {},
  };
  const loadPresetAction = {
    id: "preset:load",
    label: "Load Layout",
    visible: () => false,
    execute: () => {},
  };
  const deletePresetAction = {
    id: "preset:delete",
    label: "Delete Layout",
    visible: () => false,
    execute: () => {},
  };
  const resetLayoutAction = {
    id: "preset:reset",
    label: "Reset Layout",
    visible: () => false,
    execute: () => {},
  };

  return {
    getScopeLabel: () => undefined,
    savePresetAction,
    loadPresetAction,
    deletePresetAction,
    resetLayoutAction,
    presetActionDefinitions: [],
    registerPresetActionCapabilities: vi.fn(),
    presetActions: [savePresetAction, loadPresetAction, deletePresetAction, resetLayoutAction],
  };
});

import { allActions } from "../index";

function createCtx(
  overrides: Partial<MenuActionContext> = {},
): MenuActionContext {
  return {
    contextType: "background",
    position: { x: 0, y: 0 },
    currentDockviewId: "asset-viewer",
    api: {} as any,
    contextHubState: null,
    ...overrides,
  } as MenuActionContext;
}

function getPanelsSubmenuChildren(ctx: MenuActionContext) {
  const action = allActions.find((item) => item.id === "composite:panels");
  expect(action).toBeTruthy();
  expect(action?.children).toBeTypeOf("function");
  return action?.children?.(ctx) as any[];
}

describe("panelsSubmenuAction.children", () => {
  beforeEach(() => {
    mockDeps.reset();
  });

  it("background, no scope: includes Add Panel then Layout only", () => {
    const ctx = createCtx({
      contextType: "background",
    });
    mockDeps.buildRelatedPanelActions.mockReturnValue([
      { id: "connect:related:foo", label: "Should Not Show", execute: () => {} },
    ]);

    const items = getPanelsSubmenuChildren(ctx);

    expect(items.map((item) => item.id)).toEqual(["panel:add", "panel:focus"]);
    expect(items.some((item) => item.id === "composite:panels:related")).toBe(false);
    expect(mockDeps.buildRelatedPanelActions).not.toHaveBeenCalled();
  });

  it("background, scoped defaults: Default Panels then Add Panel then Layout, with layout section divider on Add Panel", () => {
    const ctx = createCtx({
      contextType: "background",
    });
    mockDeps.getDefaultScopePanelSubmenu.mockReturnValue({
      id: "panel:add:defaults:asset-viewer",
      label: "Default Panels (Asset Viewer)",
      icon: "layout",
      availableIn: ["background", "tab", "panel-content"],
      children: [],
      execute: () => {},
    });

    const items = getPanelsSubmenuChildren(ctx);

    expect(items.map((item) => item.id)).toEqual([
      "panel:add:defaults:asset-viewer",
      "panel:add",
      "panel:focus",
    ]);
    expect(items[1].divider).toBe(true);
    expect(items[1].sectionLabel).toBe("Layout");
    expect(items[0].divider).toBeUndefined();
  });

  it("panel-content with related panels orders default, related, add, layout", () => {
    const ctx = createCtx({
      contextType: "panel-content",
    });
    mockDeps.getDefaultScopePanelSubmenu.mockReturnValue({
      id: "panel:add:defaults:asset-viewer",
      label: "Default Panels (Asset Viewer)",
      icon: "layout",
      availableIn: ["background", "tab", "panel-content"],
      children: [],
      execute: () => {},
    });
    mockDeps.buildRelatedPanelActions.mockReturnValue([
      {
        id: "connect:related:media-preview",
        label: "Media Preview",
        execute: () => {},
      },
    ]);

    const items = getPanelsSubmenuChildren(ctx);

    expect(items.map((item) => item.id)).toEqual([
      "panel:add:defaults:asset-viewer",
      "composite:panels:related",
      "panel:add",
      "panel:focus",
    ]);
    expect(items[1]).toEqual(
      expect.objectContaining({
        id: "composite:panels:related",
        icon: "plus-circle",
        availableIn: ["tab", "panel-content"],
      }),
    );
  });

  it("panel-content with no related and no defaults includes only Add Panel and Layout", () => {
    const ctx = createCtx({
      contextType: "panel-content",
    });
    mockDeps.getDefaultScopePanelSubmenu.mockReturnValue(null);
    mockDeps.buildRelatedPanelActions.mockReturnValue(null);

    const items = getPanelsSubmenuChildren(ctx);

    expect(items.map((item) => item.id)).toEqual(["panel:add", "panel:focus"]);
  });

  it("background never includes Related Panels even when related actions exist", () => {
    const ctx = createCtx({
      contextType: "background",
    });
    mockDeps.buildRelatedPanelActions.mockReturnValue([
      {
        id: "connect:related:inspector",
        label: "Inspector",
        execute: () => {},
      },
    ]);

    const items = getPanelsSubmenuChildren(ctx);

    expect(items.some((item) => item.id === "composite:panels:related")).toBe(false);
    expect(mockDeps.buildRelatedPanelActions).not.toHaveBeenCalled();
  });

  it("returns the empty fallback stub when no panel items are available", () => {
    const ctx = createCtx({
      contextType: "background",
      api: undefined,
    });
    mockDeps.getDefaultScopePanelSubmenu.mockReturnValue(null);
    mockDeps.addPanelVisible.mockReturnValue(false);

    const items = getPanelsSubmenuChildren(ctx);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("composite:panels:empty");
    expect(items[0].label).toBe("No panel actions available");
    expect(items[0].disabled()).toBe(true);
  });
});
