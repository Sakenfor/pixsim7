/**
 * Widget System
 *
 * Unified widget system for small, placeable action/status elements.
 * Widgets can be rendered in header, statusbar, panel-composer, etc.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { defineWidget, registerWidget } from '@lib/widgets';
 *
 * // Define a widget
 * const myWidget = defineWidget({
 *   id: 'my-widget',
 *   title: 'My Widget',
 *   category: 'status',
 *   surfaces: ['header'],
 *   surfaceConfig: {
 *     header: { area: 'right', size: 'small' },
 *   },
 *   component: MyWidgetComponent,
 * });
 *
 * // Register it
 * registerWidget(myWidget);
 * ```
 */

// Types
export type {
  WidgetSurface,
  WidgetSize,
  HeaderArea,
  HeaderSurfaceConfig,
  PanelComposerSurfaceConfig,
  StatusbarSurfaceConfig,
  OverlaySurfaceConfig,
  HudSurfaceConfig,
  WidgetSurfaceConfig,
  WidgetCategory,
  WidgetDomain,
  WidgetComponentProps,
  WidgetFactoryOptions,
  WidgetFactory,
  WidgetDefinition,
  WidgetPlacement,
  WidgetInstance,
  WidgetPlacementState,
  // Re-exported from editing-core
  UnifiedPosition,
  UnifiedVisibility,
  UnifiedStyle,
  UnifiedDataBinding,
  UnifiedWidgetConfig,
} from './types';

// Placement utilities
export {
  placementToOverlayPosition,
  placementToUnifiedConfig,
  overlayPositionToPlacement,
  createDefaultPlacement,
} from './placementUtils';

// Define helper
export { defineWidget } from './defineWidget';

// Registry
export {
  widgetRegistry,
  registerWidget,
  unregisterWidget,
  getWidget,
  getWidgetsForSurface,
  getWidgetMenuItems,
  canRenderOnSurface,
} from './widgetRegistry';

// Views (preferred - no adapters needed)
export {
  overlayWidgets,
  hudWidgets,
  blockWidgets,
  chromeWidgets,
  createSurfaceView,
} from './views';

// Widget Registration (NEW - preferred way)
export {
  registerAllWidgets,
  registerOverlayWidgets,
  registerBlockWidgets,
  overlayWidgetDefinitions,
  blockWidgetDefinitions,
  // Individual overlay widgets
  badgeWidget,
  panelWidget,
  uploadWidget,
  buttonWidget,
  menuWidget,
  tooltipWidget,
  videoScrubWidget,
  progressWidget,
  sceneViewWidget,
  // Individual block widgets
  textBlockWidget,
  metricBlockWidget,
  listBlockWidget,
  galleryGridBlockWidget,
} from './register';

// Legacy adapters removed - use registerAllWidgets() instead

// Placement Store
export {
  useWidgetPlacementStore,
  useWidgetInstances,
} from './widgetPlacementStore';

// Built-in Chrome Widgets
export {
  clockWidget,
  deviceStatusWidget,
  builtInWidgets,
  registerBuiltInWidgets,
} from './builtIn';

// Components
export { HeaderWidgetArea, HeaderWidgetBar } from './components';
