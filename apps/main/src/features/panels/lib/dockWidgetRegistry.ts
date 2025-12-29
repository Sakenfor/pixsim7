/**
 * Dock Widget Registry (Feature Facade)
 *
 * Re-exports from @lib/dockview/widgetRegistry with panel-specific extensions.
 * This provides backward compatibility and adds scope-based panel filtering
 * which requires access to the panel registry.
 *
 * For new code, prefer importing directly from @lib/dockview when possible.
 */

import { getPanelsForScope } from "./panelRegistry";

// Re-export everything from the lib
export {
  dockviewWidgetRegistry,
  registerDockviewWidget as registerDockWidget,
  unregisterDockviewWidget as unregisterDockWidget,
  getDockviewWidget as getDockWidget,
  getDockviewWidgetByDockviewId as getDockWidgetByDockviewId,
  resolvePresetScope,
  setDefaultPresetScope,
  getDefaultPresetScope,
  getDockviewWidgetPanelIds,
  registerDefaultDockviewWidgets,
  areDefaultWidgetsRegistered,
  DEFAULT_DOCKVIEW_WIDGETS,
} from "@lib/dockview/widgetRegistry";

// Re-export types with backward-compatible names
export type {
  DockviewWidgetDefinition as DockWidgetDefinition,
  PresetScope,
} from "@lib/dockview/widgetRegistry";

// For backward compatibility, also export DockWidgetRegistry class
// Note: This is deprecated - use dockviewWidgetRegistry directly
export { dockviewWidgetRegistry as dockWidgetRegistry } from "@lib/dockview/widgetRegistry";

/**
 * Get panel IDs for a dockview with scope-based filtering.
 *
 * This extends the lib's getDockviewWidgetPanelIds by adding
 * support for panelScope-based filtering using the panel registry.
 *
 * @param dockviewId - The dockview ID to get panels for
 * @returns Array of panel IDs
 */
import {
  getDockviewWidgetByDockviewId,
  getDockviewWidgetPanelIds as libGetPanelIds,
} from "@lib/dockview/widgetRegistry";

export function getDockWidgetPanelIds(dockviewId: string | undefined): string[] {
  const widget = getDockviewWidgetByDockviewId(dockviewId);
  if (!widget) return [];

  // First try allowedPanels (explicit allowlist)
  if (widget.allowedPanels && widget.allowedPanels.length > 0) {
    return widget.allowedPanels;
  }

  // Then try scope-based filtering (requires panel registry)
  if (widget.panelScope) {
    return getPanelsForScope(widget.panelScope).map((panel) => panel.id);
  }

  // Fall back to lib implementation
  return libGetPanelIds(dockviewId);
}

// ============================================================================
// Backward Compatibility: Auto-register defaults
// ============================================================================

import { registerDefaultDockviewWidgets } from "@lib/dockview/widgetRegistry";

/**
 * Auto-register defaults for backward compatibility.
 * New code should call registerDefaultDockviewWidgets() explicitly.
 *
 * @deprecated Import and call registerDefaultDockviewWidgets() explicitly
 */
registerDefaultDockviewWidgets();
