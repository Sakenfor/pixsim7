/**
 * Widget Registration
 *
 * Central place to register all widgets in the unified registry.
 * Call registerAllWidgets() during app initialization.
 */

import { registerBuiltInWidgets } from '../builtIn';

import { registerBlockWidgets } from './blockWidgets';
import { registerOverlayWidgets } from './overlayWidgets';

export {
  overlayWidgetDefinitions,
  registerOverlayWidgets,
  badgeWidget,
  panelWidget,
  uploadWidget,
  buttonWidget,
  menuWidget,
  tooltipWidget,
  videoScrubWidget,
  progressWidget,
  sceneViewWidget,
  // Settings interfaces
  type BadgeWidgetSettings,
  type PanelWidgetSettings,
  type UploadWidgetSettings,
  type ButtonWidgetSettings,
  type MenuWidgetSettings,
  type TooltipWidgetSettings,
  type VideoScrubWidgetSettings,
  type ProgressWidgetSettings,
  type SceneViewWidgetSettings,
} from './overlayWidgets';

export {
  blockWidgetDefinitions,
  registerBlockWidgets,
  textBlockWidget,
  metricBlockWidget,
  listBlockWidget,
  galleryGridBlockWidget,
} from './blockWidgets';

// Re-export built-in chrome widgets
export {
  builtInWidgets,
  registerBuiltInWidgets,
  clockWidget,
  deviceStatusWidget,
} from '../builtIn';

let widgetsRegistered = false;

/**
 * Register ALL widgets in the unified registry.
 *
 * Call this once during app initialization.
 * Replaces the need for:
 * - registerOverlayWidgets() from overlay system
 * - registerBuiltInBlocks() from composer system
 * - registerAllLegacyWidgets() adapters
 */
export function registerAllWidgets(): void {
  if (widgetsRegistered) return;
  widgetsRegistered = true;

  registerOverlayWidgets();
  registerBlockWidgets();
  registerBuiltInWidgets();

  console.log('[widgets] All widgets registered in unified registry');
}

// Auto-register widgets on module import.
// This ensures widgets are available before settings modules load.
registerAllWidgets();
