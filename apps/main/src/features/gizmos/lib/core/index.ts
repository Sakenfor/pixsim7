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

// Catalog selectors (preferred)
export { gizmoSurfaceSelectors } from '@lib/plugins/catalogSelectors';

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
export { useGizmoSurfaceStore } from '../../stores/gizmoSurfaceStore';

// Existing gizmo pack registries
export * from './registry';
export * from './registry-rings';
export * from './registry-romance';
export * from './registry-water-banana';
export * from './renderers';
export * from './loadDefaultPacks';

// Console integration - exports for external use
export { useToolConsoleStore, registerGizmoConsoleSync } from './console';

// Tool override utilities for console integration
export {
  applyToolOverrides,
  getToolWithOverrides,
  createToolInstanceWithOverrides,
} from './toolOverrides';
export {
  useToolWithOverrides,
  useToolInstanceWithOverrides,
  useToolHasOverrides,
  useAllToolsWithOverrides,
} from '../../hooks/useToolWithOverrides';

// Tool console operations extension
export {
  registerToolConsoleOps,
  unregisterToolConsoleOps,
  getToolsWithConsoleOps,
  hasToolConsoleOps,
  commonToolOps,
  type InteractiveToolWithOps,
  type ToolConsoleOp,
  type ToolOpContext,
} from './toolConsoleOps';

// Dynamic interaction stats system
export {
  DEFAULT_STAT_CONFIGS,
  DEFAULT_TOOL_STATS,
  calculateStatChanges,
  applyStatDecay,
  getZoneStatModifiers,
  getDominantStat,
  getActiveStats,
  getStatReactionLevel,
  type StatType,
  type StatContribution,
  type StatConfig,
  type StatValues,
  type ZoneStatModifiers,
  type ZoneWithStats,
  type StatCalculationInput,
  type StatCalculationResult,
} from './interactionStats';

// ============================================================================
// React Components (UI layer)
// ============================================================================

export { GizmoSurfaceRenderer } from './components/GizmoSurfaceRenderer';
export {
  useEnabledGizmoSurfaces,
  useIsSurfaceEnabled,
  useToggleSurface,
} from '../../hooks/gizmoSurfaceHooks';
export { ActiveGizmosIndicator } from './components/ActiveGizmosIndicator';
export { InteractiveTool } from './components/InteractiveTool';
export { BodyMapGizmo } from './components/BodyMapGizmo';
export { OrbGizmo } from './components/OrbGizmo';
export { ConstellationGizmo } from './components/ConstellationGizmo';
export { RingsGizmo } from './components/RingsGizmo';
