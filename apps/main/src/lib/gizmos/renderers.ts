/**
 * Gizmo Component Renderers
 * Centralized mapping of gizmo IDs to React components
 * Single source of truth for gizmo rendering
 *
 * Architecture Note: This file lives in frontend (not game-ui) because:
 * - Gizmo implementations are application-specific
 * - game-ui should remain generic and reusable
 * - Keeps package boundaries clean (no packages importing from frontend)
 */

import { lazy, type ComponentType } from 'react';
import type { GizmoComponentProps } from '@pixsim7/scene.gizmos';

// Lazy load gizmo components for code splitting
const gizmoRenderers: Record<string, ComponentType<GizmoComponentProps>> = {
  orb: lazy(() =>
    import('../../components/gizmos/OrbGizmo').then(m => ({
      default: m.OrbGizmo,
    }))
  ),
  constellation: lazy(() =>
    import('../../components/gizmos/ConstellationGizmo').then(m => ({
      default: m.ConstellationGizmo,
    }))
  ),
  rings: lazy(() =>
    import('../../components/gizmos/RingsGizmo').then(m => ({
      default: m.RingsGizmo,
    }))
  ),
  'body-map': lazy(() =>
    import('../../components/gizmos/BodyMapGizmo').then(m => ({
      default: m.BodyMapGizmo,
    }))
  ),
  // Note: 'custom' style is used by BodyMapGizmo - map it to the same component
  custom: lazy(() =>
    import('../../components/gizmos/BodyMapGizmo').then(m => ({
      default: m.BodyMapGizmo,
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
