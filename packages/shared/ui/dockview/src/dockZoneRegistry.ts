/**
 * Dock Zone Registry (shared, app-agnostic)
 *
 * Defines dock zone metadata (preset scopes, panel scopes, storage keys).
 */

import type { DockZoneDefinition, PresetScope } from '@pixsim7/shared.ui.panels';
import { BaseRegistry } from '@pixsim7/shared.ui.panels';

export type { DockZoneDefinition, PresetScope } from '@pixsim7/shared.ui.panels';

class DockZoneRegistry extends BaseRegistry<DockZoneDefinition> {
  private dockviewIdIndex = new Map<string, string>();

  override register(item: DockZoneDefinition): boolean {
    const registered = super.register(item);
    this.dockviewIdIndex.set(item.dockviewId, item.id);
    return registered;
  }

  override unregister(id: string): boolean {
    const item = this.get(id);
    if (item) {
      this.dockviewIdIndex.delete(item.dockviewId);
    }
    return super.unregister(id);
  }

  getByDockviewId(dockviewId: string): DockZoneDefinition | undefined {
    const zoneId = this.dockviewIdIndex.get(dockviewId);
    return zoneId ? this.get(zoneId) : undefined;
  }
}

export const dockZoneRegistry = new DockZoneRegistry();

export function registerDockZone(definition: DockZoneDefinition): void {
  dockZoneRegistry.register(definition);
}

export function unregisterDockZone(id: string): void {
  dockZoneRegistry.unregister(id);
}

export function getDockZone(id: string): DockZoneDefinition | undefined {
  return dockZoneRegistry.get(id);
}

export function getDockZoneByDockviewId(
  dockviewId: string | undefined,
): DockZoneDefinition | undefined {
  if (!dockviewId) return undefined;
  return dockZoneRegistry.getByDockviewId(dockviewId);
}

// Preset Scope Resolution

let defaultPresetScope: PresetScope = 'workspace';

export function setDefaultPresetScope(scope: PresetScope): void {
  defaultPresetScope = scope;
}

export function getDefaultPresetScope(): PresetScope {
  return defaultPresetScope;
}

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

// Default Dock Zone Definitions (Lazy Registration)

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

export function registerDefaultDockZones(override = false): void {
  if (defaultsRegistered && !override) return;

  for (const zone of DEFAULT_DOCK_ZONES) {
    if (override || !dockZoneRegistry.has(zone.id)) {
      registerDockZone(zone);
    }
  }

  defaultsRegistered = true;
}

export function areDefaultZonesRegistered(): boolean {
  return defaultsRegistered;
}

// Panel ID Helpers

export function getDockZonePanelIds(
  dockviewId: string | undefined,
): string[] {
  const zone = getDockZoneByDockviewId(dockviewId);
  if (!zone) return [];

  if (zone.allowedPanels && zone.allowedPanels.length > 0) {
    return zone.allowedPanels;
  }

  return [];
}
