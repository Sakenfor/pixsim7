/**
 * Widget Initialization
 *
 * Initialize all built-in widgets on application startup.
 * Part of Task 50 Phase 50.4 - Panel Builder/Composer
 */

import { widgetRegistry } from './widgetRegistry';
import { registerBuiltInWidgets } from './builtInWidgets';

let initialized = false;

/**
 * Initialize all built-in widgets
 */
export function initializeWidgets(): void {
  if (initialized) {
    console.warn('Widgets already initialized');
    return;
  }

  try {
    // Register built-in widgets
    registerBuiltInWidgets(widgetRegistry);

    initialized = true;
    console.log('Widgets initialized successfully');
  } catch (error) {
    console.error('Failed to initialize widgets:', error);
    throw error;
  }
}

/**
 * Check if widgets have been initialized
 */
export function areWidgetsInitialized(): boolean {
  return initialized;
}
