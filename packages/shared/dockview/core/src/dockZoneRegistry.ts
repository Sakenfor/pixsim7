/**
 * Dock Zone Registry (Framework-Agnostic)
 *
 * Defines dock zone metadata (preset scopes, panel scopes, storage keys).
 */

import type { DockZoneDefinition, PresetScope } from './types';

/**
 * Simple registry for dock zones
 */
class DockZoneRegistry {
  private items = new Map<string, DockZoneDefinition>();
  private dockviewIdIndex = new Map<string, string>();
  private listeners = new Set<() => void>();

  register(item: DockZoneDefinition): boolean {
    if (this.items.has(item.id)) {
      return false;
    }
    this.items.set(item.id, item);
    this.dockviewIdIndex.set(item.dockviewId, item.id);
    this.notifyListeners();
    return true;
  }

  forceRegister(item: DockZoneDefinition): void {
    this.items.set(item.id, item);
    this.dockviewIdIndex.set(item.dockviewId, item.id);
    this.notifyListeners();
  }

  unregister(id: string): boolean {
    const item = this.items.get(id);
    if (item) {
      this.dockviewIdIndex.delete(item.dockviewId);
      this.items.delete(id);
      this.notifyListeners();
      return true;
    }
    return false;
  }

  get(id: string): DockZoneDefinition | undefined {
    return this.items.get(id);
  }

  getByDockviewId(dockviewId: string): DockZoneDefinition | undefined {
    const zoneId = this.dockviewIdIndex.get(dockviewId);
    return zoneId ? this.items.get(zoneId) : undefined;
  }

  getAll(): DockZoneDefinition[] {
    return Array.from(this.items.values());
  }

  getIds(): string[] {
    return Array.from(this.items.keys());
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  get size(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
    this.dockviewIdIndex.clear();
    this.notifyListeners();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (e) {
        console.error('[DockZoneRegistry] Error in listener:', e);
      }
    });
  }
}

export const dockZoneRegistry = new DockZoneRegistry();

export function registerDockZone(definition: DockZoneDefinition): boolean {
  return dockZoneRegistry.register(definition);
}

export function unregisterDockZone(id: string): boolean {
  return dockZoneRegistry.unregister(id);
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

// Panel ID Helpers

export function getDockZonePanelIds(dockviewId: string | undefined): string[] {
  const zone = getDockZoneByDockviewId(dockviewId);
  if (!zone) return [];

  if (zone.allowedPanels && zone.allowedPanels.length > 0) {
    return zone.allowedPanels;
  }

  return [];
}

// Default Dock Zone Definitions

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
      dockZoneRegistry.forceRegister(zone);
    }
  }

  defaultsRegistered = true;
}

export function areDefaultZonesRegistered(): boolean {
  return defaultsRegistered;
}
