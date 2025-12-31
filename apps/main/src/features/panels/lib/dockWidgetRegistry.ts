/**
 * Dock Zone Registry (Feature Facade)
 *
 * Re-exports from @lib/dockview with panel-specific extensions.
 * Adds scope-based panel filtering which requires access to the panel registry.
 */

import { getPanelsForScope } from "./panelRegistry";

// Re-export from lib
export {
  dockZoneRegistry,
  registerDockZone,
  unregisterDockZone,
  getDockZone,
  getDockZoneByDockviewId,
  resolvePresetScope,
  setDefaultPresetScope,
  getDefaultPresetScope,
  getDockZonePanelIds,
  registerDefaultDockZones,
  areDefaultZonesRegistered,
  DEFAULT_DOCK_ZONES,
} from "@lib/dockview";

export type { DockZoneDefinition, PresetScope } from "@lib/dockview";

// @deprecated - Use dockZoneRegistry instead
export { dockZoneRegistry as dockWidgetRegistry } from "@lib/dockview";

/**
 * Get panel IDs for a dockview with scope-based filtering.
 *
 * This extends the lib's getDockZonePanelIds by adding
 * support for panelScope-based filtering using the panel registry.
 */
import {
  getDockZoneByDockviewId as libGetZone,
  getDockZonePanelIds as libGetPanelIds,
  registerDefaultDockZones,
} from "@lib/dockview";

export function getDockWidgetPanelIds(dockviewId: string | undefined): string[] {
  const zone = libGetZone(dockviewId);
  if (!zone) return [];

  // First try allowedPanels (explicit allowlist)
  if (zone.allowedPanels && zone.allowedPanels.length > 0) {
    return zone.allowedPanels;
  }

  // Then try scope-based filtering (requires panel registry)
  if (zone.panelScope) {
    return getPanelsForScope(zone.panelScope).map((panel) => panel.id);
  }

  // Fall back to lib implementation
  return libGetPanelIds(dockviewId);
}

// Auto-register defaults on module load
registerDefaultDockZones();
