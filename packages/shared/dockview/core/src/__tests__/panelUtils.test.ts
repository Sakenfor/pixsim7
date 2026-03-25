import { describe, expect, it, vi } from "vitest";
import type { DockviewApi } from "dockview-core";

import { addPanel } from "../panelUtils";

describe("addPanel", () => {
  it("retries with an absolute position when add without position fails", () => {
    const addPanelMock = vi
      .fn()
      // Initial add attempt (no explicit position) fails.
      .mockImplementationOnce(() => {
        throw new Error("invalid location");
      })
      // Fallback add with absolute position succeeds.
      .mockImplementationOnce(() => ({}));

    const api = {
      addPanel: addPanelMock,
      getPanel: vi.fn(() => undefined),
      panels: [],
    } as unknown as DockviewApi;

    const added = addPanel(api, "panel-browser", {});

    expect(added).toBe("panel-browser");
    expect(addPanelMock).toHaveBeenCalledTimes(2);
    expect(addPanelMock.mock.calls[1][0]).toMatchObject({
      id: "panel-browser",
      component: "panel-browser",
      position: { direction: "right" },
    });
  });
});
