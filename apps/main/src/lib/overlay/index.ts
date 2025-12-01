/**
 * Generic Overlay Positioning System
 *
 * A reusable, type-safe system for positioning UI elements (badges, controls,
 * overlays, widgets) on container components throughout the application.
 *
 * @example
 * ```tsx
 * import { OverlayContainer, createBadgeWidget } from '@/lib/overlay';
 *
 * const config: OverlayConfiguration = {
 *   id: 'my-overlay',
 *   name: 'My Overlay',
 *   widgets: [
 *     createBadgeWidget({
 *       id: 'status',
 *       position: { anchor: 'top-right', offset: { x: -8, y: 8 } },
 *       visibility: { trigger: 'always' },
 *       variant: 'icon',
 *       icon: 'check',
 *       color: 'success',
 *     }),
 *   ],
 * };
 *
 * <OverlayContainer configuration={config} data={myData}>
 *   <img src="..." />
 * </OverlayContainer>
 * ```
 */

// Core types
export type {
  OverlayAnchor,
  OverlayPosition,
  CustomPosition,
  WidgetPosition,
  VisibilityTrigger,
  VisibilityConfig,
  WidgetSize,
  WidgetStyle,
  WidgetContext,
  OverlayWidget,
  WidgetSpacing,
  OverlayConfiguration,
  PresetCategory,
  OverlayPreset,
  ValidationError,
  ValidationResult,
  ComputedPosition,
  WidgetBounds,
} from './types';

export {
  isOverlayPosition,
  isCustomPosition,
  SPACING_VALUES,
  SIZE_VALUES,
  WIDGET_Z_INDEX_RANGE,
  TRANSITION_DURATIONS,
} from './types';

// Components
export { OverlayContainer } from './OverlayContainer';
export type { OverlayContainerProps } from './OverlayContainer';

export { OverlayWidget as OverlayWidgetRenderer } from './OverlayWidget';
export type { OverlayWidgetProps } from './OverlayWidget';

// Built-in widgets
export {
  createBadgeWidget,
  BadgePresets,
  createButtonWidget,
  createPanelWidget,
  createMenuWidget,
  createVideoScrubWidget,
  createProgressWidget,
  createUploadWidget,
  createTooltipWidget,
} from './widgets';

export type {
  BadgeWidgetConfig,
  ButtonWidgetConfig,
  PanelWidgetConfig,
  MenuWidgetConfig,
  MenuItem,
  VideoScrubWidgetConfig,
  ProgressWidgetConfig,
  UploadWidgetConfig,
  UploadState,
  TooltipWidgetConfig,
  TooltipContent,
} from './widgets';

// Utilities
export {
  toCSSValue,
  normalizeOffset,
  calculateAnchorPosition,
  calculateCustomPosition,
  calculatePosition,
  validateAnchor,
  validatePosition,
  isPositionSSRSafe,
  positionToStyle,
  getInverseAnchor,
  getAdjacentAnchors,
} from './utils/position';

export {
  shouldShowWidget,
  getTransitionClass,
  getTransitionStyle,
  prefersReducedMotion,
  VisibilityStateMachine,
  validateVisibilityConfig,
  adaptVisibilityForTouch,
} from './utils/visibility';

export {
  resolvePath,
  createResolver,
  isPropertyPath,
  extractPropertyPaths,
  getPathType,
  suggestPathsForWidget,
} from './utils/propertyPath';

export {
  validateConfiguration,
  validateWidget,
  validateStyle,
  lintConfiguration,
  validateAndLog,
} from './utils/validation';

export {
  mergeConfigurations,
  mergeMultipleConfigurations,
  mergeWidgets,
  mergeWidget,
  mergeVisibilityConfig,
  mergeWidgetStyle,
  combineClassNames,
  applyDefaults,
  filterWidgetsByGroup,
  groupWidgets,
  removeWidgets,
  upsertWidgets,
  pickWidgets,
} from './utils/merge';

export {
  handleCollisions,
  calculateWidgetBounds,
  boundsOverlap,
  resolveCollisions,
} from './utils/collision';

export type {
  CollisionResult,
  CollisionInfo,
} from './utils/collision';

// Presets
export {
  mediaCardPresets,
  getMediaCardPreset,
  getDefaultMediaCardConfig,
  PresetManager,
  LocalStoragePresetStorage,
  presetManager,
  APIPresetStorage,
  IndexedDBPresetStorage,
} from './presets';

export type {
  PresetStorage,
  APIStorageConfig,
} from './presets';

// Config Converters (for UnifiedSurfaceConfig interoperability)
export {
  toUnifiedSurfaceConfig,
  fromUnifiedSurfaceConfig,
  fromUnifiedWidget,
  isOverlayConfig,
  buildOverlayConfigFromUnified,
} from './overlayConfig';

// Widget Registry (Task 94.1)
export { registerOverlayWidgets } from './overlayWidgetRegistry';
