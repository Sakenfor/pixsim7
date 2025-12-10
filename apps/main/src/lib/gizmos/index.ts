/**
 * Gizmo Library - Main exports
 *
 * This module manages gizmo surfaces (UI presentation layer) in the main app.
 * For core gizmo logic and types, see @pixsim7/scene.gizmos package.
 */

// Surface Registry - UI presentation layer for gizmos
export {
  GizmoSurfaceRegistry,
  gizmoSurfaceRegistry,
} from './surfaceRegistry';

export type {
  GizmoSurfaceId,
  GizmoSurfaceCategory,
  GizmoSurfaceContext,
  GizmoSurfaceDefinition,
} from './surfaceRegistry';

// Surface Registration - Register all gizmo surfaces
export {
  registerGizmoSurfaces,
  getSceneGizmoSurfaces,
  getDebugPanelSurfaces,
  getGizmoSurfacesForContext,
} from './registerGizmoSurfaces';

// Surface State Store
export { useGizmoSurfaceStore } from './gizmoSurfaceStore';

// Existing gizmo pack registries
export * from './registry';
export * from './registry-enhanced';
export * from './registry-rings';
export * from './registry-romance';
export * from './registry-water-banana';
export * from './renderers';
export * from './loadDefaultPacks';

// Tool override utilities for console integration
export {
  applyToolOverrides,
  getToolWithOverrides,
  createToolInstanceWithOverrides,
  useToolWithOverrides,
  useToolInstanceWithOverrides,
  useToolHasOverrides,
  useAllToolsWithOverrides,
} from './useToolWithOverrides';
