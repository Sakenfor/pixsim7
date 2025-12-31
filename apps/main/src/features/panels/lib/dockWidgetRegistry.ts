/**
 * Dock Zone Registry (Feature Facade)
 *
 * Re-exports from @lib/dockview/dockZoneRegistry with panel-specific extensions.
 * This provides backward compatibility and adds scope-based panel filtering
 * which requires access to the panel registry.
 *
 * For new code, prefer importing directly from @lib/dockview when possible.
 */

import { getPanelsForScope } from "./panelRegistry";

// Re-export everything from the lib (new names)
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
} from "@lib/dockview/dockZoneRegistry";

// Re-export backward compatibility aliases
export {
  dockviewWidgetRegistry,
  registerDockviewWidget as registerDockWidget,
  unregisterDockviewWidget as unregisterDockWidget,
  getDockviewWidget as getDockWidget,
  getDockviewWidgetByDockviewId as getDockWidgetByDockviewId,
  getDockviewWidgetPanelIds,
  registerDefaultDockviewWidgets,
  areDefaultWidgetsRegistered,
  DEFAULT_DOCKVIEW_WIDGETS,
} from "@lib/dockview/dockZoneRegistry";

// Re-export types
export type {
  DockZoneDefinition,
  PresetScope,
  // Backward compatibility
  DockviewWidgetDefinition as DockWidgetDefinition,
} from "@lib/dockview/dockZoneRegistry";

// For backward compatibility, also export with old class name
export { dockZoneRegistry as dockWidgetRegistry } from "@lib/dockview/dockZoneRegistry";

/**
 * Get panel IDs for a dockview with scope-based filtering.
 *
 * This extends the lib's getDockZonePanelIds by adding
 * support for panelScope-based filtering using the panel registry.
 *
 * @param dockviewId - The dockview ID to get panels for
 * @returns Array of panel IDs
 */
import {
  getDockZoneByDockviewId,
  getDockZonePanelIds as libGetPanelIds,
} from "@lib/dockview/dockZoneRegistry";

export function getDockWidgetPanelIds(dockviewId: string | undefined): string[] {
  const zone = getDockZoneByDockviewId(dockviewId);
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

// ============================================================================
// Backward Compatibility: Auto-register defaults
// ============================================================================

import { registerDefaultDockZones } from "@lib/dockview/dockZoneRegistry";

/**
 * Auto-register defaults for backward compatibility.
 * New code should call registerDefaultDockZones() explicitly.
 *
 * @deprecated Import and call registerDefaultDockZones() explicitly
 */
registerDefaultDockZones();
