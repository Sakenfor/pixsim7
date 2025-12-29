/**
 * Dockview Widget Registry
 *
 * Defines dockview widget metadata (preset scopes, panel scopes, storage keys).
 * This is decoupled from the panels feature to allow context menu and preset
 * actions to work without depending on panel-specific code.
 *
 * Design principles:
 * - Lazy registration: defaults are not auto-registered at module load
 * - Override support: later registrations replace earlier ones
 * - Configurable fallback: preset scope fallback is not hardcoded
 */

import { BaseRegistry } from '@lib/core/BaseRegistry';

/**
 * Preset scope type - can be extended by features
 */
export type PresetScope = string;

/**
 * Widget definition for dockview containers.
 * Describes a dockview's metadata for presets and panel filtering.
 */
export interface DockviewWidgetDefinition {
  /** Stable widget ID (used for presets and settings) */
  id: string;
  /** Human-friendly label */
  label: string;
  /** Dockview ID (panelManagerId / currentDockviewId) */
  dockviewId: string;
  /** Preset scope to use for layout presets */
  presetScope: PresetScope;
  /** Panel scope for auto-filtering panels */
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

/**
 * Registry for dockview widget definitions.
 */
class DockviewWidgetRegistry extends BaseRegistry<DockviewWidgetDefinition> {
  private dockviewIdIndex = new Map<string, string>();

  override register(item: DockviewWidgetDefinition): void {
    super.register(item);
    this.dockviewIdIndex.set(item.dockviewId, item.id);
  }

  override unregister(id: string): void {
    const item = this.get(id);
    if (item) {
      this.dockviewIdIndex.delete(item.dockviewId);
    }
    super.unregister(id);
  }

  /**
   * Get widget definition by dockview ID (O(1) lookup).
   */
  getByDockviewId(dockviewId: string): DockviewWidgetDefinition | undefined {
    const widgetId = this.dockviewIdIndex.get(dockviewId);
    return widgetId ? this.get(widgetId) : undefined;
  }
}

/** Global widget registry */
export const dockviewWidgetRegistry = new DockviewWidgetRegistry();

/**
 * Register a dockview widget definition.
 */
export function registerDockviewWidget(definition: DockviewWidgetDefinition): void {
  dockviewWidgetRegistry.register(definition);
}

/**
 * Unregister a dockview widget definition.
 */
export function unregisterDockviewWidget(id: string): void {
  dockviewWidgetRegistry.unregister(id);
}

/**
 * Get a widget definition by ID.
 */
export function getDockviewWidget(id: string): DockviewWidgetDefinition | undefined {
  return dockviewWidgetRegistry.get(id);
}

/**
 * Get a widget definition by dockview ID.
 */
export function getDockviewWidgetByDockviewId(
  dockviewId: string | undefined,
): DockviewWidgetDefinition | undefined {
  if (!dockviewId) return undefined;
  return dockviewWidgetRegistry.getByDockviewId(dockviewId);
}

// ============================================================================
// Preset Scope Resolution
// ============================================================================

/** Default fallback scope when widget is not registered */
let defaultPresetScope: PresetScope = 'workspace';

/**
 * Set the default preset scope fallback.
 * Called during app initialization to configure behavior.
 */
export function setDefaultPresetScope(scope: PresetScope): void {
  defaultPresetScope = scope;
}

/**
 * Get the default preset scope fallback.
 */
export function getDefaultPresetScope(): PresetScope {
  return defaultPresetScope;
}

/**
 * Resolve preset scope for a dockview ID.
 *
 * Resolution order:
 * 1. Registered widget's presetScope
 * 2. Configurable default fallback (defaults to 'workspace')
 *
 * @param dockviewId - The dockview ID to resolve scope for
 * @param fallback - Optional override for the default fallback
 */
export function resolvePresetScope(
  dockviewId: string | undefined,
  fallback?: PresetScope,
): PresetScope {
  const widget = getDockviewWidgetByDockviewId(dockviewId);
  if (widget?.presetScope) {
    return widget.presetScope;
  }
  return fallback ?? defaultPresetScope;
}

// ============================================================================
// Default Widget Definitions (Lazy Registration)
// ============================================================================

/**
 * Default widget definitions.
 * These are NOT auto-registered - call registerDefaultDockviewWidgets() explicitly.
 */
export const DEFAULT_DOCKVIEW_WIDGETS: DockviewWidgetDefinition[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    dockviewId: 'workspace',
    presetScope: 'workspace',
    panelScope: 'workspace',
    storageKey: 'dockview:workspace:v4',
    description: 'Primary workspace dockview container.',
  },
  {
    id: 'control-center',
    label: 'Control Center',
    dockviewId: 'controlCenter',
    presetScope: 'control-center',
    panelScope: 'control-center',
    storageKey: 'dockview:control-center:v5',
    description: 'Bottom dockview container for quick tools and generation.',
  },
  {
    id: 'asset-viewer',
    label: 'Asset Viewer',
    dockviewId: 'assetViewer',
    presetScope: 'asset-viewer',
    panelScope: 'asset-viewer',
    storageKey: 'dockview:asset-viewer:v5',
    description: 'Side dockview container for the media viewer.',
  },
];

let defaultsRegistered = false;

/**
 * Register default dockview widgets.
 * Call this during app initialization. Safe to call multiple times.
 *
 * @param override - If true, re-register even if already registered
 */
export function registerDefaultDockviewWidgets(override = false): void {
  if (defaultsRegistered && !override) return;

  for (const widget of DEFAULT_DOCKVIEW_WIDGETS) {
    // Only register if not already registered (unless override)
    if (override || !dockviewWidgetRegistry.has(widget.id)) {
      registerDockviewWidget(widget);
    }
  }

  defaultsRegistered = true;
}

/**
 * Check if defaults have been registered.
 */
export function areDefaultWidgetsRegistered(): boolean {
  return defaultsRegistered;
}

// ============================================================================
// Panel ID Helpers
// ============================================================================

/**
 * Get panel IDs for a dockview.
 * Returns allowedPanels if defined, otherwise returns empty array.
 *
 * Note: For scope-based panel filtering, use the panels feature's
 * getPanelsForScope() function which has access to the panel registry.
 */
export function getDockviewWidgetPanelIds(
  dockviewId: string | undefined,
): string[] {
  const widget = getDockviewWidgetByDockviewId(dockviewId);
  if (!widget) return [];

  if (widget.allowedPanels && widget.allowedPanels.length > 0) {
    return widget.allowedPanels;
  }

  // Scope-based filtering requires panel registry - return empty here
  // Callers needing scope-based filtering should use panels feature
  return [];
}
