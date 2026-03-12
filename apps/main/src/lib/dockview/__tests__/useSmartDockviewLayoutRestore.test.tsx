import { analyzeLayoutComponentAvailability } from "@pixsim7/shared.ui.dockview";
import { describe, expect, it } from "vitest";


describe("analyzeLayoutComponentAvailability", () => {
  const layout = {
    groups: [
      {
        panels: [
          {
            id: "quickGenerate",
            component: "quickGenerate",
            title: "Generate",
          },
          {
            id: "info",
            component: "info",
            title: "Metadata",
          },
        ],
      },
    ],
  };

  it("detects missing components when some are unavailable", () => {
    const result = analyzeLayoutComponentAvailability(layout, ["quickGenerate"]);

    expect(result.hasInvalidComponentEntry).toBe(false);
    expect(result.hasMissingPanelComponent).toBe(false);
    expect(result.layoutComponentIds.sort()).toEqual(["info", "quickGenerate"]);
    expect(result.missingComponentIds).toEqual(["info"]);
    expect(result.availableComponentCount).toBe(1);
  });

  it("treats empty availability as temporary unregistered state", () => {
    const result = analyzeLayoutComponentAvailability(layout, []);

    expect(result.layoutComponentIds.sort()).toEqual(["info", "quickGenerate"]);
    expect(result.missingComponentIds).toEqual([]);
    expect(result.availableComponentCount).toBe(0);
  });

  it("reports no missing components when all are available", () => {
    const result = analyzeLayoutComponentAvailability(layout, [
      "quickGenerate",
      "info",
      "media-preview",
    ]);

    expect(result.missingComponentIds).toEqual([]);
    expect(result.availableComponentCount).toBe(3);
  });
});
