import * as BodyMap from './lib/bodyMap/zones';

// Lib - Gizmos Core
export {
  ActiveGizmosIndicator,
  BodyMapGizmo,
  ConstellationGizmo,
  DEFAULT_STAT_CONFIGS,
  DEFAULT_TOOL_STATS,
  GizmoSurfaceRegistry,
  GizmoSurfaceRenderer,
  InteractiveTool,
  OrbGizmo,
  RingsGizmo,
  applyStatDecay,
  applyToolOverrides,
  bananaTool,
  bananaTools,
  bodyMapGizmo,
  calculateStatChanges,
  commonToolOps,
  constellationGizmo,
  createToolInstanceWithOverrides,
  defaultGizmos,
  defaultTools,
  energyTool,
  getActiveStats,
  getAllGizmos,
  getAllTools,
  getDebugPanelSurfaces,
  getDominantStat,
  getGizmo,
  getGizmoRenderer,
  getGizmoRendererIds,
  getGizmoSurfacesForContext,
  getGizmosByCategory,
  getSceneGizmoSurfaces,
  getStatReactionLevel,
  getTool,
  getToolWithOverrides,
  getToolsByType,
  getToolsWithConsoleOps,
  getZoneStatModifiers,
  gizmoSurfaceRegistry,
  gizmoSurfaceSelectors,
  hasGizmoRenderer,
  hasToolConsoleOps,
  orbGizmo,
  registerGizmo,
  registerGizmoConsoleSync,
  registerGizmoSurfaces,
  registerTool,
  registerToolConsoleOps,
  ringsGizmo,
  ringsGizmos,
  temperatureTool,
  touchTool,
  unregisterToolConsoleOps,
  useAllToolsWithOverrides,
  useEnabledGizmoSurfaces,
  useGizmoSurfaceStore,
  useIsSurfaceEnabled,
  useToggleSurface,
  useToolConsoleStore,
  useToolHasOverrides,
  useToolInstanceWithOverrides,
  useToolWithOverrides,
  waterBananaTools,
  waterTool,
  waterTools,
} from './lib/core';
export type {
  GizmoSurfaceCategory,
  GizmoSurfaceContext,
  GizmoSurfaceDefinition,
  GizmoSurfaceId,
  InteractiveToolWithOps,
  StatCalculationInput,
  StatCalculationResult,
  StatConfig,
  StatContribution,
  StatType,
  StatValues,
  ToolConsoleOp,
  ToolOpContext,
  ZoneStatModifiers,
  ZoneWithStats,
} from './lib/core';

// Lib - Body Map (from @pixsim7/shared.types)
export {
  ANATOMICAL_ZONES,
  mirrorZonesHorizontal,
  getFullAnatomicalZones,
} from './lib/bodyMap/zones';
export type {
  ZoneCoords,
  NpcBodyZone,
  VideoSegmentZones,
  ZoneTemplate,
  ZoneResponseModifier,
  ZoneInteractionContext,
  NpcZoneConfiguration,
  PointInZoneFn,
  CalculateEffectiveIntensityFn,
} from './lib/bodyMap/zones';
// Namespace export for body map types
export { BodyMap };

// Console Manifests (feature-owned)
export { statsManifest } from './lib/consoleStatsManifest';
export { toolsManifest } from './lib/consoleToolsManifest';

// Stores
export {
  useToolConfigStore,
  type ToolOverrides,
  type ToolPreset,
} from './stores/toolConfigStore';
export {
  useInteractionStatsStore,
  startStatDecay,
  stopStatDecay,
} from './stores/interactionStatsStore';
