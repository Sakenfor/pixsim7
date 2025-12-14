/**
 * Register all gizmo surfaces
 *
 * This module registers all existing gizmo overlays and debug dashboards
 * as "surfaces" in the gizmo surface registry.
 *
 * Note: Surface definitions now live in `features/gizmos/plugins/` following
 * the standard plugin pattern. See docs/PLUGIN_ARCHITECTURE.md.
 */

import { gizmoSurfaceRegistry } from './surfaceRegistry';
import { builtInGizmoSurfaces } from '../../plugins';

/**
 * Register all core gizmo surfaces
 * Called on app startup to populate the registry
 */
export function registerGizmoSurfaces(): void {
  // Register built-in surfaces from the plugins folder
  builtInGizmoSurfaces.forEach(surface => {
    if (!gizmoSurfaceRegistry.get(surface.id)) {
      gizmoSurfaceRegistry.register(surface);
    }
  });

  console.log(
    `[GizmoSurfaces] Registered ${builtInGizmoSurfaces.length} gizmo surfaces:`,
    builtInGizmoSurfaces.map(s => s.id)
  );
}

/**
 * Get all scene gizmo surfaces (for Game2D, scene editor, etc.)
 */
export function getSceneGizmoSurfaces() {
  return gizmoSurfaceRegistry.getByCategory('scene');
}

/**
 * Get all debug panel surfaces (for workspace/dev tools)
 */
export function getDebugPanelSurfaces() {
  return [
    ...gizmoSurfaceRegistry.getByCategory('npc'),
    ...gizmoSurfaceRegistry.getByCategory('world'),
    ...gizmoSurfaceRegistry.getByCategory('debug'),
  ];
}

/**
 * Get gizmo surfaces available for a specific context
 */
export function getGizmoSurfacesForContext(
  context: 'scene-editor' | 'game-2d' | 'game-3d' | 'playground' | 'workspace' | 'hud'
) {
  return gizmoSurfaceRegistry.getByContext(context);
}
