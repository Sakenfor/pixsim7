import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PanelHostMobile } from "../PanelHostMobile";

function PanelBody({ id }: { id: string }) {
  return <div data-testid={`panel-${id}`}>{id}</div>;
}

vi.mock("@lib/plugins/catalogSelectors", () => {
  const definitions = {
    "media-preview": {
      id: "media-preview",
      title: "Preview",
      category: "tools",
      component: () => <PanelBody id="media-preview" />,
    },
    quickGenerate: {
      id: "quickGenerate",
      title: "Generate",
      category: "generation",
      component: () => <PanelBody id="quickGenerate" />,
    },
    info: {
      id: "info",
      title: "Metadata",
      category: "tools",
      component: () => <PanelBody id="info" />,
    },
  } as const;

  const getIds = () => Object.keys(definitions);

  return {
    panelSelectors: {
      getIdsForScope: () => getIds(),
      getIds,
      get: (id: string) => definitions[id as keyof typeof definitions],
    },
  };
});

describe("PanelHostMobile", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("keeps configured non-active panels mounted", () => {
    render(
      <PanelHostMobile
        panels={["media-preview", "quickGenerate", "info"]}
        storageKey="mobile-test-keep-mounted"
        keepMountedPanels={["quickGenerate"]}
      />,
    );

    // Active panel is mounted.
    expect(screen.getByTestId("panel-media-preview")).toBeTruthy();
    // Kept-mounted panel is also mounted while inactive.
    expect(screen.getByTestId("panel-quickGenerate")).toBeTruthy();
    // Non-kept panel is not mounted yet.
    expect(screen.queryByTestId("panel-info")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Metadata" }));

    // After switching, active panel mounts and kept-mounted panel remains.
    expect(screen.getByTestId("panel-info")).toBeTruthy();
    expect(screen.getByTestId("panel-quickGenerate")).toBeTruthy();
  });

  it("unmounts inactive panels by default", () => {
    render(
      <PanelHostMobile
        panels={["media-preview", "quickGenerate", "info"]}
        storageKey="mobile-test-default-unmount"
      />,
    );

    // QuickGenerate is inactive and unmounted initially.
    expect(screen.queryByTestId("panel-quickGenerate")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Generate" }));
    expect(screen.getByTestId("panel-quickGenerate")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Metadata" }));
    // Switched away again -> unmounted.
    expect(screen.queryByTestId("panel-quickGenerate")).toBeNull();
  });
});

