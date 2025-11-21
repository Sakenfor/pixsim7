import { cubeExpansionRegistry } from './cubeExpansionRegistry';
import { HealthCubeExpansion } from '../components/health/HealthCubeExpansion';
import { GalleryCubeExpansion } from '../components/assets/GalleryCubeExpansion';
import { GraphCubeExpansion } from '../components/graph/GraphCubeExpansion';

/**
 * Register all default cube expansion providers
 * Call this once during app initialization
 */
export function registerCubeExpansions() {
  // Health panel expansion
  cubeExpansionRegistry.register('health', {
    type: 'status',
    component: HealthCubeExpansion,
    showOnHover: true,
    hoverDelay: 400,
    width: 220,
    height: 280,
  });

  // Gallery panel expansion
  cubeExpansionRegistry.register('gallery', {
    type: 'preview',
    component: GalleryCubeExpansion,
    showOnHover: true,
    hoverDelay: 400,
    width: 220,
    height: 260,
  });

  // Graph panel expansion
  cubeExpansionRegistry.register('graph', {
    type: 'status',
    component: GraphCubeExpansion,
    showOnHover: true,
    hoverDelay: 400,
    width: 220,
    height: 220,
  });

  // Add more expansions here as they're created
  // cubeExpansionRegistry.register('graph', { ... });
  // cubeExpansionRegistry.register('providers', { ... });
}
