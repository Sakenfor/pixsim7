/**
 * Dock Widget Registry
 *
 * Defines dockview-based widgets (panel containers) such as Workspace,
 * Control Center, and Asset Viewer. These widgets provide stable IDs
 * for layout presets, panel scopes, and future shareable UI presets.
 */

import { BaseRegistry } from "@lib/core/BaseRegistry";
import type { PresetScope } from "@features/workspace/stores/workspaceStore";
import { getPanelsForScope } from "./panelRegistry";

export interface DockWidgetDefinition {
  /** Stable widget ID (used for presets and settings) */
  id: string;
  /** Human-friendly label */
  label: string;
  /** Dockview ID (panelManagerId / currentDockviewId) */
  dockviewId: string;
  /** Preset scope to use for layout presets */
  presetScope: PresetScope;
  /** Panel scope for auto-filtering panels (panelRegistry.availableIn) */
  panelScope?: string;
  /** Optional explicit allowlist of panels */
  allowedPanels?: string[];
  /** Optional default panels for initial layouts */
  defaultPanels?: string[];
  /** Optional storage key for layout persistence */
  storageKey?: string;
  /** Optional description */
  description?: string;
}

export class DockWidgetRegistry extends BaseRegistry<DockWidgetDefinition> {}

export const dockWidgetRegistry = new DockWidgetRegistry();

export function registerDockWidget(definition: DockWidgetDefinition): void {
  dockWidgetRegistry.register(definition);
}

export function getDockWidget(id: string): DockWidgetDefinition | undefined {
  return dockWidgetRegistry.get(id);
}

export function getDockWidgetByDockviewId(
  dockviewId: string | undefined,
): DockWidgetDefinition | undefined {
  if (!dockviewId) return undefined;
  return dockWidgetRegistry.getAll().find((def) => def.dockviewId === dockviewId);
}

export function resolvePresetScope(dockviewId: string | undefined): PresetScope {
  const widget = getDockWidgetByDockviewId(dockviewId);
  if (widget?.presetScope) {
    return widget.presetScope;
  }
  return "workspace";
}

export function getDockWidgetPanelIds(
  dockviewId: string | undefined,
): string[] {
  const widget = getDockWidgetByDockviewId(dockviewId);
  if (!widget) return [];

  if (widget.allowedPanels && widget.allowedPanels.length > 0) {
    return widget.allowedPanels;
  }

  if (widget.panelScope) {
    return getPanelsForScope(widget.panelScope).map((panel) => panel.id);
  }

  return [];
}

const DEFAULT_DOCK_WIDGETS: DockWidgetDefinition[] = [
  {
    id: "workspace",
    label: "Workspace",
    dockviewId: "workspace",
    presetScope: "workspace",
    panelScope: "workspace",
    storageKey: "dockview:workspace:v4",
    description: "Primary workspace dockview container.",
  },
  {
    id: "control-center",
    label: "Control Center",
    dockviewId: "controlCenter",
    presetScope: "control-center",
    panelScope: "control-center",
    storageKey: "dockview:control-center:v5",
    description: "Bottom dockview container for quick tools and generation.",
  },
  {
    id: "asset-viewer",
    label: "Asset Viewer",
    dockviewId: "assetViewer",
    presetScope: "asset-viewer",
    panelScope: "asset-viewer",
    storageKey: "dockview:asset-viewer:v5",
    description: "Side dockview container for the media viewer.",
  },
];

DEFAULT_DOCK_WIDGETS.forEach((def) => registerDockWidget(def));
