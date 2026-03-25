import type { DockviewApi } from "dockview-core";
import { describe, expect, it, vi } from "vitest";

import { reconcileScopedDockviewPanels } from "../panelHostDockReconcile";

interface FakePanel {
  id: string;
  definitionId?: string;
}

function createApi(
  panels: FakePanel[],
  events?: string[],
): DockviewApi {
  const panelList = panels;
  return {
    getPanel: (id: string) => panelList.find((panel) => panel.id === id),
    removePanel: (panel: unknown) => {
      const panelId = (panel as FakePanel).id;
      if (events) {
        events.push(`remove:${panelId}`);
      }
      const index = panelList.findIndex((item) => item.id === panelId);
      if (index >= 0) {
        panelList.splice(index, 1);
      }
    },
  } as unknown as DockviewApi;
}

describe("reconcileScopedDockviewPanels", () => {
  it("adds required panels before pruning excluded ones", () => {
    const events: string[] = [];
    const panels: FakePanel[] = [{ id: "legacy" }];
    const api = createApi(panels, events);

    const ensurePanels = vi.fn((_api: DockviewApi, panelIds: Iterable<string>) => {
      const panelId = Array.from(panelIds)[0];
      events.push(`ensure:${panelId}`);
      panels.push({ id: panelId });
      return [panelId];
    });
    const getDockviewPanels = vi.fn(() => [...panels]);
    const resolvePanelDefinitionId = vi.fn((panel: unknown) => {
      const fakePanel = panel as FakePanel;
      return fakePanel.definitionId ?? fakePanel.id;
    });

    const failedCount = reconcileScopedDockviewPanels(
      {
        api,
        scopedPanelIds: ["panel-browser", "shortcuts"],
        excludedFromLayoutSet: new Set(["legacy"]),
        resolvePanelTitle: (panelId) => panelId,
        dockLabel: "control-center",
      },
      {
        ensurePanels,
        getDockviewPanels,
        resolvePanelDefinitionId,
      },
    );

    expect(failedCount).toBe(0);
    expect(events).toEqual([
      "ensure:panel-browser",
      "ensure:shortcuts",
      "remove:legacy",
    ]);
  });

  it("counts empty ensurePanels results as add failures", () => {
    const panels: FakePanel[] = [];
    const api = createApi(panels);

    const failedCount = reconcileScopedDockviewPanels(
      {
        api,
        scopedPanelIds: ["panel-browser", "shortcuts"],
        excludedFromLayoutSet: new Set<string>(),
        resolvePanelTitle: (panelId) => panelId,
        dockLabel: "control-center",
      },
      {
        ensurePanels: vi.fn(() => []),
        getDockviewPanels: vi.fn(() => []),
        resolvePanelDefinitionId: vi.fn((panel: unknown) => (panel as FakePanel).id),
      },
    );

    expect(failedCount).toBe(2);
  });

  it("drops position when reference panel does not exist", () => {
    const panels: FakePanel[] = [];
    const api = createApi(panels);
    let resolvedPosition: unknown = Symbol("unset");

    const ensurePanels = vi.fn(
      (
        currentApi: DockviewApi,
        panelIds: Iterable<string>,
        options?: {
          resolveOptions?: (
            panelId: string,
            api: DockviewApi,
          ) => { position?: unknown } | undefined;
        },
      ) => {
        const panelId = Array.from(panelIds)[0];
        const resolved = options?.resolveOptions?.(panelId, currentApi);
        resolvedPosition = resolved?.position;
        panels.push({ id: panelId });
        return [panelId];
      },
    );

    const failedCount = reconcileScopedDockviewPanels(
      {
        api,
        scopedPanelIds: ["panel-browser"],
        excludedFromLayoutSet: new Set<string>(),
        resolvePanelTitle: (panelId) => panelId,
        resolvePanelPosition: () => ({
          direction: "right",
          referencePanel: "missing-panel",
        }),
        dockLabel: "control-center",
      },
      {
        ensurePanels,
        getDockviewPanels: vi.fn(() => [...panels]),
        resolvePanelDefinitionId: vi.fn((panel: unknown) => (panel as FakePanel).id),
      },
    );

    expect(failedCount).toBe(0);
    expect(resolvedPosition).toBeUndefined();
  });
});
