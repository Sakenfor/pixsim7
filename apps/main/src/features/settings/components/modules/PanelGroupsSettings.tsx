/**
 * Panel Groups Settings Module
 *
 * Workspace settings wrapper around the panel-groups runtime workbench.
 */

import { PanelGroupsWorkbench } from "@features/panels/components/tools/PanelGroupsWorkbench";

export function PanelGroupsSettings() {
  return <PanelGroupsWorkbench mode="settings" />;
}

