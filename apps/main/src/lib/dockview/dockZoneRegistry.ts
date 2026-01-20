/**
 * Dock Zone Registry
 *
 * Defines dock zone metadata (preset scopes, panel scopes, storage keys).
 * A "dock zone" is a dockview container area like workspace, control-center, asset-viewer.
 *
 * Previously named "dockview widgets" - renamed to avoid confusion with
 * the new unified Widget system for header/toolbar action widgets.
 *
 * Design principles:
 * - Lazy registration: defaults are not auto-registered at module load
 * - Override support: later registrations replace earlier ones
 * - Configurable fallback: preset scope fallback is not hardcoded
 */

import type { DockZoneDefinition, PresetScope } from '@pixsim7/shared.panels';

import { BaseRegistry } from '@lib/core/BaseRegistry';

export type { DockZoneDefinition, PresetScope } from '@pixsim7/shared.panels';

/**
 * Registry for dock zone definitions.
 */
class DockZoneRegistry extends BaseRegistry<DockZoneDefinition> {
  private dockviewIdIndex = new Map<string, string>();

  override register(item: DockZoneDefinition): void {
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
   * Get zone definition by dockview ID (O(1) lookup).
   */
  getByDockviewId(dockviewId: string): DockZoneDefinition | undefined {
    const zoneId = this.dockviewIdIndex.get(dockviewId);
    return zoneId ? this.get(zoneId) : undefined;
  }
}

/** Global dock zone registry */
export const dockZoneRegistry = new DockZoneRegistry();

/**
 * Register a dock zone definition.
 */
export function registerDockZone(definition: DockZoneDefinition): void {
  dockZoneRegistry.register(definition);
}

/**
 * Unregister a dock zone definition.
 */
export function unregisterDockZone(id: string): void {
  dockZoneRegistry.unregister(id);
}

/**
 * Get a zone definition by ID.
 */
export function getDockZone(id: string): DockZoneDefinition | undefined {
  return dockZoneRegistry.get(id);
}

/**
 * Get a zone definition by dockview ID.
 */
export function getDockZoneByDockviewId(
  dockviewId: string | undefined,
): DockZoneDefinition | undefined {
  if (!dockviewId) return undefined;
  return dockZoneRegistry.getByDockviewId(dockviewId);
}

// ============================================================================
// Preset Scope Resolution
// ============================================================================

/** Default fallback scope when zone is not registered */
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
 * 1. Registered zone's presetScope
 * 2. Configurable default fallback (defaults to 'workspace')
 *
 * @param dockviewId - The dockview ID to resolve scope for
 * @param fallback - Optional override for the default fallback
 */
export function resolvePresetScope(
  dockviewId: string | undefined,
  fallback?: PresetScope,
): PresetScope {
  const zone = getDockZoneByDockviewId(dockviewId);
  if (zone?.presetScope) {
    return zone.presetScope;
  }
  return fallback ?? defaultPresetScope;
}

// ============================================================================
// Default Dock Zone Definitions (Lazy Registration)
// ============================================================================

/**
 * Default dock zone definitions.
 * These are NOT auto-registered - call registerDefaultDockZones() explicitly.
 */
export const DEFAULT_DOCK_ZONES: DockZoneDefinition[] = [
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
 * Register default dock zones.
 * Call this during app initialization. Safe to call multiple times.
 *
 * @param override - If true, re-register even if already registered
 */
export function registerDefaultDockZones(override = false): void {
  if (defaultsRegistered && !override) return;

  for (const zone of DEFAULT_DOCK_ZONES) {
    // Only register if not already registered (unless override)
    if (override || !dockZoneRegistry.has(zone.id)) {
      registerDockZone(zone);
    }
  }

  defaultsRegistered = true;
}

/**
 * Check if defaults have been registered.
 */
export function areDefaultZonesRegistered(): boolean {
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
 * panelSelectors.getPanelsForScope() helper (catalog-backed).
 */
export function getDockZonePanelIds(
  dockviewId: string | undefined,
): string[] {
  const zone = getDockZoneByDockviewId(dockviewId);
  if (!zone) return [];

  if (zone.allowedPanels && zone.allowedPanels.length > 0) {
    return zone.allowedPanels;
  }

  // Scope-based filtering requires panel registry - return empty here
  // Callers needing scope-based filtering should use panels feature
  return [];
}

// Legacy backward compat aliases removed - use the new names directly
