import { resolveDockview } from "@lib/dockview";

import { panelManager } from "@features/panels/lib/PanelManager";

export function resolveWorkspaceDockview() {
  const dockview = panelManager.getPanelState("workspace")?.dockview;
  return resolveDockview("workspace", {
    host: dockview?.host,
    api: dockview?.api,
  });
}
