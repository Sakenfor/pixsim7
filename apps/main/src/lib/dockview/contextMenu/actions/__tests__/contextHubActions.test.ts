import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MenuActionContext } from "../../types";

const mockDeps = vi.hoisted(() => {
  const getCapabilityKeys = vi.fn();
  const panelSelectorsGet = vi.fn();
  const getCapabilityDescriptor = vi.fn();
  const getAllProviders = vi.fn();
  const hasLiveState = vi.fn();

  const overridesState = {
    getPreferredProviderId: vi.fn(),
    clearOverride: vi.fn(),
    setPreferredProvider: vi.fn(),
  };

  return {
    getCapabilityKeys,
    panelSelectorsGet,
    getCapabilityDescriptor,
    getAllProviders,
    hasLiveState,
    overridesState,
    reset() {
      getCapabilityKeys.mockReset();
      panelSelectorsGet.mockReset();
      getCapabilityDescriptor.mockReset();
      getAllProviders.mockReset();
      hasLiveState.mockReset();
      overridesState.getPreferredProviderId.mockReset();
      overridesState.clearOverride.mockReset();
      overridesState.setPreferredProvider.mockReset();

      getCapabilityKeys.mockImplementation((value: unknown) =>
        Array.isArray(value) ? value : [],
      );
      panelSelectorsGet.mockReturnValue(undefined);
      getCapabilityDescriptor.mockReturnValue(undefined);
      getAllProviders.mockReturnValue([]);
      hasLiveState.mockReturnValue(true);
      overridesState.getPreferredProviderId.mockReturnValue(undefined);
    },
  };
});

vi.mock("@pixsim7/shared.ui.panels", () => ({
  getCapabilityKeys: (value: unknown) => mockDeps.getCapabilityKeys(value),
}));

vi.mock("@lib/plugins/catalogSelectors", () => ({
  panelSelectors: {
    get: (id: string) => mockDeps.panelSelectorsGet(id),
    getPublicPanels: () => [],
  },
}));

vi.mock("@features/contextHub", () => ({
  getCapabilityDescriptor: (key: string) => mockDeps.getCapabilityDescriptor(key),
  useContextHubOverridesStore: {
    getState: () => mockDeps.overridesState,
  },
}));

vi.mock("@features/panels", () => ({
  getDockWidgetByDockviewId: () => undefined,
}));

vi.mock("@features/panels/lib/panelConstants", () => ({
  CATEGORY_LABELS: {},
}));

vi.mock("@features/panels/lib/siblingResolution", () => ({
  resolveSiblings: () => [],
}));

vi.mock("@features/workspace/lib/panelPlacementCoordinator", () => ({
  panelPlacementCoordinator: {
    getPlacements: () => [],
    bringFloatingPanelDefinitionToFront: vi.fn(),
  },
}));

vi.mock("../../capabilityHelpers", () => ({
  getRegistryChain: () => [],
  getAllProviders: (...args: unknown[]) => mockDeps.getAllProviders(...args),
  resolveProvider: () => null,
  hasLiveState: (ctx: MenuActionContext) => mockDeps.hasLiveState(ctx),
}));

vi.mock("../../resolveCurrentDockview", () => ({
  resolveCurrentDockview: () => ({ api: {} }),
}));

vi.mock("../panelOpenUtils", () => ({
  addPanelInCurrentDockview: vi.fn(),
  isPanelOpenInCurrentDockview: vi.fn(() => false),
}));

import { buildRelatedPanelActions, contextHubActions } from "../contextHubActions";

function createCtx(
  overrides: Partial<MenuActionContext> = {},
): MenuActionContext {
  return {
    contextType: "panel-content",
    position: { x: 0, y: 0 },
    panelId: "inspector",
    instanceId: "host:inspector",
    contextHubState: null,
    ...overrides,
  } as MenuActionContext;
}

function collectIds(items: any[]): string[] {
  const ids: string[] = [];
  for (const item of items) {
    ids.push(item.id);
    if (Array.isArray(item.children)) {
      ids.push(...collectIds(item.children));
    }
  }
  return ids;
}

describe("contextHubActions", () => {
  beforeEach(() => {
    mockDeps.reset();
  });

  it("exports buildRelatedPanelActions as a named function", () => {
    expect(typeof buildRelatedPanelActions).toBe("function");
  });

  it("Connect children do not include any Related Panels submenu entries", () => {
    const connectAction = contextHubActions[0];
    expect(connectAction.id).toBe("capability:connect");
    expect(connectAction.children).toBeTypeOf("function");

    const ctx = createCtx({
      contextHubState: {
        parent: null,
        registry: {
          getConsumptionForHost: () => [{ key: "capability:alpha" }],
        },
      } as any,
    });

    const items = connectAction.children?.(ctx) as any[];
    const ids = collectIds(items);

    expect(items.length).toBeGreaterThan(0);
    expect(ids).toContain("connect:capability:alpha");
    expect(ids.some((id) => id.startsWith("connect:related"))).toBe(false);
  });
});
