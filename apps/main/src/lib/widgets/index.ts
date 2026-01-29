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
  // Widget settings schema types
  WidgetSettingFieldType,
  WidgetSettingField,
  WidgetSettingToggle,
  WidgetSettingSelect,
  WidgetSettingNumber,
  WidgetSettingText,
  WidgetSettingRange,
  WidgetSettingsGroup,
  WidgetSettingsSchema,
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
  // Capability-based filtering
  canRenderOnSurface,
  getWidgetSurfaces,
  canWidgetRenderOnSurface,
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
  // Overlay widget settings types
  type BadgeWidgetSettings,
  type PanelWidgetSettings,
  type UploadWidgetSettings,
  type ButtonWidgetSettings,
  type MenuWidgetSettings,
  type TooltipWidgetSettings,
  type VideoScrubWidgetSettings,
  type ProgressWidgetSettings,
  type SceneViewWidgetSettings,
} from './register';

// Legacy adapters removed - use registerAllWidgets() instead

// Placement Store
export {
  useWidgetPlacementStore,
  useWidgetInstances,
} from './widgetPlacementStore';

// Overlay Widget Settings Store
export {
  useOverlayWidgetSettingsStore,
  useOverlayWidgetSettings,
  getOverlayWidgetSettings,
  updateOverlayWidgetSettings,
  type WidgetSettings,
} from './overlayWidgetSettingsStore';

// Data binding (re-exported for convenience)
export {
  useWidgetData,
  createWidgetBindings,
  type DataSourceBinding,
} from '@lib/dataBinding';

// Built-in Chrome Widgets
export {
  clockWidget,
  deviceStatusWidget,
  builtInWidgets,
  registerBuiltInWidgets,
} from './builtIn';

// Components
export { HeaderWidgetArea, HeaderWidgetBar } from './components';

// Storage
export {
  type WidgetSurfaceType as StorageSurfaceType,
  type WidgetBuilderConfig,
  type WidgetBuilderStorage,
  type StorageType,
  LocalStorageWidgetBuilderStorage,
  IndexedDBWidgetBuilderStorage,
  APIWidgetBuilderStorage,
  createWidgetBuilderStorage,
  widgetBuilderStorage,
} from './storage';
