import { describe, expect, it } from "vitest";

import {
  resolveScopeDiscoveredPanelIds,
  resolveScopedOutOfLayoutPanelIds,
  resolveScopedPanelIds,
  type PanelLookupSource,
} from "../panelHostDockScope";

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

describe("resolveScopedPanelIds", () => {
  it("returns explicit panels when provided", () => {
    const source = createSource();
    expect(
      resolveScopedPanelIds(source, {
        panels: ["media-preview", "info"],
      })
    ).toEqual(["media-preview", "info"]);
  });

  it("returns scoped panel IDs when dockId is provided", () => {
    const source = createSource();
    expect(
      resolveScopedPanelIds(source, {
        dockId: "asset-viewer",
      })
    ).toEqual(["media-preview", "quickGenerate", "info"]);
  });

  it("applies filters in scoped mode", () => {
    const source = createSource();
    expect(
      resolveScopedPanelIds(source, {
        dockId: "asset-viewer",
        excludePanels: ["info"],
      })
    ).toEqual(["media-preview", "quickGenerate"]);

    expect(
      resolveScopedPanelIds(source, {
        dockId: "asset-viewer",
        allowedPanels: ["quickGenerate", "info"],
      })
    ).toEqual(["quickGenerate", "info"]);

    expect(
      resolveScopedPanelIds(source, {
        dockId: "asset-viewer",
        allowedCategories: ["tools"],
      })
    ).toEqual(["media-preview", "info"]);
  });

  it("returns empty list when neither dockId nor panels are set", () => {
    const source = createSource();
    expect(resolveScopedPanelIds(source, {})).toEqual([]);
  });
});

describe("resolveScopeDiscoveredPanelIds", () => {
  function createCapabilitySource(): PanelLookupSource {
    const allIds = [
      "media-preview",
      "quickGenerate",
      "info",
      "prompt-box",
      "inspector",
    ];
    const scopeMap: Record<string, string[]> = {
      "asset-viewer": ["media-preview", "quickGenerate", "info"],
    };
    const consumesMap: Record<string, string[] | undefined> = {
      "prompt-box": ["assetSelection"],
      inspector: ["assetSelection"],
    };
    const categoryMap: Record<string, string | undefined> = {
      "media-preview": "tools",
      quickGenerate: "generation",
      info: "tools",
      "prompt-box": "workspace",
      inspector: "tools",
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
      getConsumedCapabilityKeys(id: string): string[] | undefined {
        return consumesMap[id];
      },
    };
  }

  it("surfaces capability-matched panels even when not in layout allowedPanels", () => {
    const source = createCapabilitySource();
    // Mirrors the Media Viewer wiring: allowedPanels is the layout-only set,
    // hostCapabilityKeys provides 'assetSelection'.
    expect(
      resolveScopeDiscoveredPanelIds(source, {
        dockId: "asset-viewer",
        allowedPanels: ["media-preview", "quickGenerate", "info"],
        hostCapabilityKeys: ["assetSelection"],
      })
    ).toEqual(["prompt-box", "inspector"]);
  });

  it("still honors excludePanels in discovery", () => {
    const source = createCapabilitySource();
    expect(
      resolveScopeDiscoveredPanelIds(source, {
        dockId: "asset-viewer",
        allowedPanels: ["media-preview"],
        excludePanels: ["inspector"],
        hostCapabilityKeys: ["assetSelection"],
      })
    ).toEqual(["prompt-box"]);
  });

  it("still honors allowedCategories in discovery", () => {
    const source = createCapabilitySource();
    expect(
      resolveScopeDiscoveredPanelIds(source, {
        dockId: "asset-viewer",
        allowedPanels: ["media-preview"],
        allowedCategories: ["workspace"],
        hostCapabilityKeys: ["assetSelection"],
      })
    ).toEqual(["prompt-box"]);
  });

  it("returns empty when host declares no scopes or capabilities", () => {
    const source = createCapabilitySource();
    expect(
      resolveScopeDiscoveredPanelIds(source, {
        dockId: "asset-viewer",
        allowedPanels: ["media-preview"],
      })
    ).toEqual([]);
  });

  it("scope-discovered panels are NOT pruned from layout", () => {
    // The reconcile loop in PanelHostDockview removes panels whose id is in
    // `resolveScopedOutOfLayoutPanelIds`. Scope-discovered panels (e.g. prompt-box
    // for an assetSelection-providing host) must not appear in that set —
    // otherwise clicking "Add Panel" removes them immediately after add.
    const source = createCapabilitySource();
    const outOfLayout = resolveScopedOutOfLayoutPanelIds(source, {
      dockId: "asset-viewer",
      allowedPanels: ["media-preview", "quickGenerate", "info"],
      hostCapabilityKeys: ["assetSelection"],
    });
    expect(outOfLayout).not.toContain("prompt-box");
    expect(outOfLayout).not.toContain("inspector");
  });
});
