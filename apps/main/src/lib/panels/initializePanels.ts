/**
 * Panel Initialization
 *
 * Load core panels plugin on application startup.
 * Part of Task 50 Phase 50.3 - Plugin-based Panel Registry
 */

import { pluginManager } from './panelPlugin';
import { corePanelsPlugin } from './corePanelsPlugin';

let initialized = false;

/**
 * Initialize all built-in panel plugins
 */
export async function initializePanels(): Promise<void> {
  if (initialized) {
    console.warn('Panels already initialized');
    return;
  }

  try {
    // Load core panels plugin
    await pluginManager.loadPlugin(corePanelsPlugin);

    initialized = true;
    console.log('Panels initialized successfully');
  } catch (error) {
    console.error('Failed to initialize panels:', error);
    throw error;
  }
}

/**
 * Check if panels have been initialized
 */
export function arePanelsInitialized(): boolean {
  return initialized;
}
