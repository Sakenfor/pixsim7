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
  registerOverlayWidgets();
  registerBlockWidgets();
  registerBuiltInWidgets();

  console.log('[widgets] All widgets registered in unified registry');
}
