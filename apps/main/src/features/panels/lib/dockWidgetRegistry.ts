/**
 * Dock Widget Catalog Facade
 *
 * Provides dock widget helpers backed by the unified plugin catalog.
 */

import type { DockZoneDefinition, PresetScope } from '@lib/dockview/dockZoneRegistry';
import { DEFAULT_DOCK_ZONES } from '@lib/dockview/dockZoneRegistry';

import { dockWidgetSelectors } from '@lib/plugins/catalogSelectors';
import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';

export type { DockZoneDefinition, PresetScope } from '@lib/dockview/dockZoneRegistry';
export { DEFAULT_DOCK_ZONES } from '@lib/dockview/dockZoneRegistry';
export type DockWidgetDefinition = DockZoneDefinition;

export { dockWidgetSelectors };

// @deprecated - use dockWidgetSelectors directly
// Lazy proxy avoids TDZ errors during catalog selector initialization.
export const dockWidgetRegistry: typeof dockWidgetSelectors = new Proxy(
  {} as typeof dockWidgetSelectors,
  {
    get: (_target, prop) => (dockWidgetSelectors as any)[prop],
    has: (_target, prop) => prop in dockWidgetSelectors,
    ownKeys: () => Reflect.ownKeys(dockWidgetSelectors),
    getOwnPropertyDescriptor: (_target, prop) =>
      Object.getOwnPropertyDescriptor(dockWidgetSelectors as any, prop as any),
  }
);

/**
 * Register a dock widget definition.
 */
export async function registerDockWidget(
  definition: DockZoneDefinition,
): Promise<void> {
  await registerPluginDefinition({
    id: definition.id,
    family: 'dock-widget',
    origin: 'builtin',
    source: 'source',
    plugin: definition,
    canDisable: false,
  });
}

/**
 * Register default dock widgets (workspace, control center, asset viewer).
 */
export async function registerDefaultDockWidgets(
  override = false,
): Promise<void> {
  for (const zone of DEFAULT_DOCK_ZONES) {
    if (override || !dockWidgetSelectors.has(zone.id)) {
      await registerDockWidget(zone);
    }
  }
}

/**
 * Get a dock widget by ID.
 */
export function getDockWidget(id: string): DockZoneDefinition | undefined {
  return dockWidgetSelectors.get(id);
}

/**
 * Get a dock widget by dockview ID.
 */
export function getDockWidgetByDockviewId(
  dockviewId: string | undefined,
): DockZoneDefinition | undefined {
  if (!dockviewId) return undefined;
  return dockWidgetSelectors.getByDockviewId(dockviewId);
}

/**
 * Get panel IDs for a dockview with scope-based filtering.
 */
export function getDockWidgetPanelIds(
  dockviewId: string | undefined,
): string[] {
  return dockWidgetSelectors.getPanelIds(dockviewId);
}

/**
 * Set the default preset scope fallback.
 */
export function setDefaultPresetScope(scope: PresetScope): void {
  dockWidgetSelectors.setDefaultPresetScope(scope);
}

/**
 * Get the default preset scope fallback.
 */
export function getDefaultPresetScope(): PresetScope {
  return dockWidgetSelectors.getDefaultPresetScope();
}

/**
 * Resolve preset scope for a dockview ID.
 */
export function resolvePresetScope(
  dockviewId: string | undefined,
  fallback?: PresetScope,
): PresetScope {
  return dockWidgetSelectors.resolvePresetScope(dockviewId, fallback);
}
