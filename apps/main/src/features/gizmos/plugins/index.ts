/**
 * Gizmo Plugins Index
 *
 * Central place to import and export all gizmo surface plugins.
 * Register your custom gizmo surfaces here.
 *
 * Note: This module exports gizmo SURFACES (UI presentation plugins).
 * For gizmo PACKS (gizmo definitions with configs), see lib/core/registry-*.ts.
 */

import {
  ringsGizmoSurface,
  orbGizmoSurface,
  constellationGizmoSurface,
  bodyMapGizmoSurface,
  relationshipDebugSurface,
  worldToolsPanelSurface,
} from './surfaces';

// Export all surface definitions individually
export {
  ringsGizmoSurface,
  orbGizmoSurface,
  constellationGizmoSurface,
  bodyMapGizmoSurface,
  relationshipDebugSurface,
  worldToolsPanelSurface,
};

// Export array of built-in surfaces for bulk registration
export const builtInGizmoSurfaces = [
  ringsGizmoSurface,
  orbGizmoSurface,
  constellationGizmoSurface,
  bodyMapGizmoSurface,
  relationshipDebugSurface,
  worldToolsPanelSurface,
];
