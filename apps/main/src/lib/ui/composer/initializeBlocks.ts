/**
 * Block Initialization
 *
 * @deprecated Use `registerAllWidgets()` from `@lib/widgets` instead.
 * This file is kept for backwards compatibility only.
 */

import { registerAllWidgets } from '@lib/widgets';

let initialized = false;

/**
 * Initialize all built-in blocks
 * @deprecated Use `registerAllWidgets()` from `@lib/widgets` instead.
 */
export function initializeBlocks(): void {
  if (initialized) return;
  registerAllWidgets();
  initialized = true;
}

/**
 * Check if blocks have been initialized
 */
export function areBlocksInitialized(): boolean {
  return initialized;
}

/** @deprecated Use `registerAllWidgets()` from `@lib/widgets` instead */
export const initializeWidgets = initializeBlocks;

/** @deprecated Use areBlocksInitialized instead */
export const areWidgetsInitialized = areBlocksInitialized;
