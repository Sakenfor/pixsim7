import { describe, expect, it } from "vitest";

import { resolveScopedOutOfLayoutPanelIds, type PanelLookupSource } from "../panelHostDockScope";

function createSource(): PanelLookupSource {
  const allIds = [
    "media-preview",
    "quickGenerate",
    "info",
    "quickgen-prompt",
    "inspector",
    "logs",
  ];
  const scopeMap: Record<string, string[]> = {
    "asset-viewer": ["media-preview", "quickGenerate", "info"],
    workspace: ["inspector", "logs", "quickgen-prompt"],
  };
  const categoryMap: Record<string, string | undefined> = {
    "media-preview": "tools",
    quickGenerate: "generation",
    info: "tools",
    "quickgen-prompt": "generation",
    inspector: "tools",
    logs: "dev",
  };

  return {
    getIdsForScope(scope: string): string[] {
      return scopeMap[scope] ? [...scopeMap[scope]] : [];
    },
    getIds(): string[] {
      return [...allIds];
    },
    get(id: string) {
      return id in categoryMap ? { category: categoryMap[id] } : undefined;
    },
  };
}

describe("resolveScopedOutOfLayoutPanelIds", () => {
  it("returns empty when dock scope is not used", () => {
    const source = createSource();
    expect(resolveScopedOutOfLayoutPanelIds(source, {})).toEqual([]);
    expect(
      resolveScopedOutOfLayoutPanelIds(source, {
        dockId: "asset-viewer",
        panels: ["media-preview", "info"],
      })
    ).toEqual([]);
  });

  it("returns out-of-scope panel IDs for a scoped dock host", () => {
    const source = createSource();
    expect(
      resolveScopedOutOfLayoutPanelIds(source, {
        dockId: "asset-viewer",
      })
    ).toEqual(["quickgen-prompt", "inspector", "logs"]);
  });

  it("respects exclude/allow filters when computing pruned IDs", () => {
    const source = createSource();
    expect(
      resolveScopedOutOfLayoutPanelIds(source, {
        dockId: "asset-viewer",
        excludePanels: ["info"],
      })
    ).toEqual(["info", "quickgen-prompt", "inspector", "logs"]);

    expect(
      resolveScopedOutOfLayoutPanelIds(source, {
        dockId: "asset-viewer",
        allowedPanels: ["quickGenerate", "info"],
      })
    ).toEqual(["media-preview", "quickgen-prompt", "inspector", "logs"]);

    expect(
      resolveScopedOutOfLayoutPanelIds(source, {
        dockId: "asset-viewer",
        allowedCategories: ["tools"],
      })
    ).toEqual(["quickGenerate", "quickgen-prompt", "inspector", "logs"]);
  });
});
