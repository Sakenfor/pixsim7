/**
 * Register all gizmo surfaces
 *
 * This module registers all existing gizmo overlays and debug dashboards
 * as "surfaces" in the plugin catalog.
 *
 * Note: Surface definitions now live in `features/gizmos/plugins/` following
 * the standard plugin pattern. See docs/PLUGIN_ARCHITECTURE.md.
 */

import { gizmoSurfaceSelectors } from '@lib/plugins/catalogSelectors';
import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';

import { builtInGizmoSurfaces } from '../../plugins';

/**
 * Register all core gizmo surfaces
 * Called on app startup to populate the registry
 */
export async function registerGizmoSurfaces(): Promise<void> {
  // Register built-in surfaces from the plugins folder
  for (const surface of builtInGizmoSurfaces) {
    if (!gizmoSurfaceSelectors.get(surface.id)) {
      await registerPluginDefinition({
        id: surface.id,
        family: 'gizmo-surface',
        origin: 'builtin',
        source: 'source',
        plugin: surface,
        canDisable: false,
      });
    }
  }

  console.log(
    `[GizmoSurfaces] Registered ${builtInGizmoSurfaces.length} gizmo surfaces:`,
    builtInGizmoSurfaces.map(s => s.id)
  );
}

/**
 * Get all scene gizmo surfaces (for Game2D, scene editor, etc.)
 */
export function getSceneGizmoSurfaces() {
  return gizmoSurfaceSelectors.getByCategory('scene');
}

/**
 * Get all debug panel surfaces (for workspace/dev tools)
 */
export function getDebugPanelSurfaces() {
  return [
    ...gizmoSurfaceSelectors.getByCategory('npc'),
    ...gizmoSurfaceSelectors.getByCategory('world'),
    ...gizmoSurfaceSelectors.getByCategory('debug'),
  ];
}

/**
 * Get gizmo surfaces available for a specific context
 */
export function getGizmoSurfacesForContext(
  context: 'scene-editor' | 'game-2d' | 'game-3d' | 'playground' | 'workspace' | 'hud'
) {
  return gizmoSurfaceSelectors.getByContext(context);
}
