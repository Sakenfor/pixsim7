/**
 * Region Drawer System
 *
 * Extensible system for drawing region annotations on assets.
 *
 * Named "RegionDrawer" to avoid confusion with:
 * - InteractiveTool (scene gizmos)
 * - ToolPlugin (UI tool plugins)
 * - DrawToolConfig (brush settings)
 *
 * @example Creating a custom drawer
 * ```ts
 * import { regionDrawerRegistry, type RegionDrawer } from '@/components/media/viewer/tools';
 *
 * const myDrawer: RegionDrawer<MyDataType> = {
 *   id: 'my-drawer',
 *   name: 'My Drawer',
 *   // ... implement interface
 * };
 *
 * regionDrawerRegistry.register({ drawer: myDrawer });
 * ```
 *
 * @example Using drawers in a component
 * ```tsx
 * import { useRegionDrawerRegistry, useRegionDrawer } from '@/components/media/viewer/tools';
 *
 * function DrawerSelector() {
 *   const { drawers, getByCategory } = useRegionDrawerRegistry();
 *   const shapeDrawers = getByCategory('shape');
 *   // ...
 * }
 * ```
 */

// Types
export type {
  // Base types
  BaseAnnotationElement,
  RectElementData,
  PolygonElementData,
  PathElementData,
  Box3DElementData,
  PointElementData,
  // Drawing
  DrawingContext,
  DrawingResult,
  // Drawer interface
  RegionDrawer,
  RenderOptions,
  RegionDrawerEditorProps,
  ElementTransform,
  // Registry
  RegionDrawerRegistration,
  IRegionDrawerRegistry,
} from './types';

// Registry
export { regionDrawerRegistry, useRegionDrawerRegistry, useRegionDrawer } from './registry';

// Built-in drawers (import to register)
export { rectDrawer, pathDrawer, box3dDrawer } from './builtins';

// Viewer Tool Presets — generation-input-producing tools (masks, edits, etc.)
export type {
  ToolSource,
  ToolCategory,
  ToolOutputKind,
  ToolOutputMapping,
  ToolExecutionState,
  ViewerToolExecution,
  PresetAvailability,
  ViewerToolPreset,
  MaskToolOption,
} from './viewerToolPresets';

export {
  PRESET_MANUAL_DRAW,
  PRESET_MANUAL_POLYGON,
  PRESET_AUTO_SEGMENT,
  PRESET_REMOVE_OBJECT,
  BUILTIN_PRESETS,
  isMaskPreset,
  getPresetsByCategory,
  resolvePresetAvailability,
} from './viewerToolPresets';

// Analyzer → Preset bridge
export type { AnalyzerCatalogEntry } from './analyzerPresetBridge';
export { analyzerToPreset, analyzersToPresets } from './analyzerPresetBridge';

// Hook for consuming presets in viewer components
export type { ResolvedPreset, ViewerToolPresetsResult, ViewerToolPresetsContext } from './useViewerToolPresets';
export { useViewerToolPresets } from './useViewerToolPresets';
