/**
 * Utility to list and inspect registered gizmo surfaces
 * Useful for debugging and testing
 */

import { gizmoSurfaceSelectors } from '@lib/plugins/catalogSelectors';

/**
 * Print all registered gizmo surfaces to console
 */
export function listGizmoSurfaces(): void {
  const all = gizmoSurfaceSelectors.getAll();

  console.group('📋 Registered Gizmo Surfaces');
  console.log(`Total: ${all.length} surfaces\n`);

  const byCategory = {
    scene: gizmoSurfaceSelectors.getByCategory('scene'),
    world: gizmoSurfaceSelectors.getByCategory('world'),
    npc: gizmoSurfaceSelectors.getByCategory('npc'),
    debug: gizmoSurfaceSelectors.getByCategory('debug'),
    custom: gizmoSurfaceSelectors.getByCategory('custom'),
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
  const all = gizmoSurfaceSelectors.getAll();
  const byCategory = {
    scene: gizmoSurfaceSelectors.getByCategory('scene').length,
    world: gizmoSurfaceSelectors.getByCategory('world').length,
    npc: gizmoSurfaceSelectors.getByCategory('npc').length,
    debug: gizmoSurfaceSelectors.getByCategory('debug').length,
    custom: gizmoSurfaceSelectors.getByCategory('custom').length,
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
  (window as any).gizmoSurfaceSelectors = gizmoSurfaceSelectors;
}
