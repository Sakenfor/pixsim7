/**
 * Gizmo Component Renderers
 * Centralized mapping of gizmo IDs to React components
 * Single source of truth for gizmo rendering
 */

import { lazy, type ComponentType } from 'react';
import type { GizmoComponentProps } from '@pixsim7/scene-gizmos';

// Lazy load gizmo components for code splitting
const gizmoRenderers: Record<string, ComponentType<GizmoComponentProps>> = {
  orb: lazy(() =>
    import('../../../../../frontend/src/components/gizmos/OrbGizmo').then(m => ({
      default: m.OrbGizmo,
    }))
  ),
  constellation: lazy(() =>
    import('../../../../../frontend/src/components/gizmos/ConstellationGizmo').then(m => ({
      default: m.ConstellationGizmo,
    }))
  ),
  rings: lazy(() =>
    import('../../../../../frontend/src/components/gizmos/RingsGizmo').then(m => ({
      default: m.RingsGizmo,
    }))
  ),
  // Add more gizmo renderers here as they're created
  // helix: lazy(() => import('...').then(m => ({ default: m.HelixGizmo }))),
};

/**
 * Get the React component renderer for a given gizmo ID
 */
export function getGizmoRenderer(
  id: string
): ComponentType<GizmoComponentProps> | undefined {
  return gizmoRenderers[id];
}

/**
 * Check if a gizmo renderer exists for the given ID
 */
export function hasGizmoRenderer(id: string): boolean {
  return id in gizmoRenderers;
}

/**
 * Get all registered gizmo renderer IDs
 */
export function getGizmoRendererIds(): string[] {
  return Object.keys(gizmoRenderers);
}
