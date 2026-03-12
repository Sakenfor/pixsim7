import { describe, expect, it } from "vitest";

import {
  buildPanelCatalogBootstrapInit,
  normalizePanelCatalogBootstrapValues,
} from "../panelCatalogBootstrapUtils";

describe("usePanelCatalogBootstrap", () => {
  it("normalizes values by trimming, deduplicating, and sorting", () => {
    expect(
      normalizePanelCatalogBootstrapValues([
        " asset-viewer ",
        "workspace",
        "asset-viewer",
        "",
      ]),
    ).toEqual(["asset-viewer", "workspace"]);
  });

  it("builds a stable init key from normalized contexts and panel IDs", () => {
    const a = buildPanelCatalogBootstrapInit(
      ["workspace", "asset-viewer", "workspace"],
      ["quickGenerate", "info", "quickGenerate"],
    );
    const b = buildPanelCatalogBootstrapInit(
      [" asset-viewer ", "workspace"],
      ["info", "quickGenerate"],
    );

    expect(a.normalizedContexts).toEqual(["asset-viewer", "workspace"]);
    expect(a.normalizedPanelIds).toEqual(["info", "quickGenerate"]);
    expect(a.initKey).toBe("contexts:asset-viewer,workspace|panels:info,quickGenerate");
    expect(a.initKey).toBe(b.initKey);
  });

  it("returns empty normalized values when inputs are absent", () => {
    expect(buildPanelCatalogBootstrapInit()).toEqual({
      normalizedContexts: [],
      normalizedPanelIds: [],
      initKey: "contexts:|panels:",
    });
  });
});
