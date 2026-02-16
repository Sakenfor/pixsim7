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
  directOverlayWidgetDefinitions,
  registerOverlayWidgets,
  panelWidget,
  uploadWidget,
  menuWidget,
  tooltipWidget,
  videoScrubWidget,
  progressWidget,
  // Settings interfaces (remaining direct registrations)
  type PanelWidgetSettings,
  type UploadWidgetSettings,
  type MenuWidgetSettings,
  type TooltipWidgetSettings,
  type VideoScrubWidgetSettings,
  type ProgressWidgetSettings,
} from './overlayWidgets';

// Plugin-based overlay widgets — re-export from their plugin locations
export { widget as badgeWidget, type BadgeWidgetSettings } from '@/plugins/overlay-widgets/badge';
export { widget as buttonWidget, type ButtonWidgetSettings } from '@/plugins/overlay-widgets/button';
export { widget as sceneViewWidget, type SceneViewWidgetSettings } from '@/plugins/overlay-widgets/scene-view';

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
