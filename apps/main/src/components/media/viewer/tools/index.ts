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
export * from './builtins';
