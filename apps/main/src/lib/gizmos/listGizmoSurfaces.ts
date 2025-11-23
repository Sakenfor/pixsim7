/**
 * Utility to list and inspect registered gizmo surfaces
 * Useful for debugging and testing
 */

import { gizmoSurfaceRegistry } from './surfaceRegistry';

/**
 * Print all registered gizmo surfaces to console
 */
export function listGizmoSurfaces(): void {
  const all = gizmoSurfaceRegistry.getAll();

  console.group('📋 Registered Gizmo Surfaces');
  console.log(`Total: ${all.length} surfaces\n`);

  const byCategory = {
    scene: gizmoSurfaceRegistry.getByCategory('scene'),
    world: gizmoSurfaceRegistry.getByCategory('world'),
    npc: gizmoSurfaceRegistry.getByCategory('npc'),
    debug: gizmoSurfaceRegistry.getByCategory('debug'),
    custom: gizmoSurfaceRegistry.getByCategory('custom'),
  };

  Object.entries(byCategory).forEach(([category, surfaces]) => {
    if (surfaces.length > 0) {
      console.group(`${category.toUpperCase()} (${surfaces.length})`);
      surfaces.forEach(surface => {
        console.log(`  ${surface.icon || '•'} ${surface.label} (${surface.id})`);
        console.log(`    ${surface.description || 'No description'}`);
        console.log(`    Contexts: ${surface.supportsContexts?.join(', ') || 'none'}`);
        console.log(`    Priority: ${surface.priority ?? 0}`);
        console.log('');
      });
      console.groupEnd();
    }
  });

  console.groupEnd();
}

/**
 * Get summary of registered surfaces
 */
export function getGizmoSurfacesSummary() {
  const all = gizmoSurfaceRegistry.getAll();
  const byCategory = {
    scene: gizmoSurfaceRegistry.getByCategory('scene').length,
    world: gizmoSurfaceRegistry.getByCategory('world').length,
    npc: gizmoSurfaceRegistry.getByCategory('npc').length,
    debug: gizmoSurfaceRegistry.getByCategory('debug').length,
    custom: gizmoSurfaceRegistry.getByCategory('custom').length,
  };

  return {
    total: all.length,
    byCategory,
    surfaces: all.map(s => ({
      id: s.id,
      label: s.label,
      category: s.category,
      contexts: s.supportsContexts,
    })),
  };
}

// Make it available globally for debugging (only in dev mode)
if (import.meta.env.DEV) {
  (window as any).listGizmoSurfaces = listGizmoSurfaces;
  (window as any).getGizmoSurfacesSummary = getGizmoSurfacesSummary;
  (window as any).gizmoSurfaceRegistry = gizmoSurfaceRegistry;
}
