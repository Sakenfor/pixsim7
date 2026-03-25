import { UiStudioPanel } from "@features/panels/components/tools/UiStudioPanel";

import { definePanelWithMeta } from "../../../lib/definePanel";

export default definePanelWithMeta({
  id: "ui-studio",
  title: "UI Studio",
  updatedAt: "2026-03-11T00:00:00Z",
  changeNote: "Unified surface workbench, HUD designer, and panel-group runtime tools in one panel.",
  featureHighlights: [
    "Tab-based workspace for surfaces, HUD, and panel groups.",
    "Shared authoring-context snapshot across studio tools.",
    "Direct panel-group preset application to active dock widgets.",
  ],
  component: UiStudioPanel,
  category: "tools",
  tags: ["ui", "studio", "surfaces", "hud", "panel-groups", "widgets", "authoring"],
  icon: "columns",
  description: "Unified authoring panel for surfaces, HUD layout editing, and panel-group runtime controls.",
  availableIn: ["workspace"],
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  providesCapabilities: ["uiStudioTarget", "uiStudioActions"],
});
