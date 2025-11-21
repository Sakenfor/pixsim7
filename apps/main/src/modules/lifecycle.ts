/**
 * Module Lifecycle Helpers
 *
 * Utilities for managing module initialization and hot-reload safety.
 * Part of Phase 31.4 - Module Lifecycle & Hot-Reload Helpers.
 *
 * These helpers ensure that module initialization functions are idempotent
 * under hot-reload, preventing duplicate registrations and noisy warnings.
 */

/**
 * Track which modules have been initialized
 * This persists across hot-reloads within the same page session
 */
const initializedModules = new Map<string, boolean>();

/**
 * Create an idempotent module initializer.
 *
 * Ensures the initialization function runs at most once per page load,
 * even under hot-reload conditions.
 *
 * @param moduleId Unique identifier for the module
 * @param initFn Initialization function to run once
 * @returns Wrapped initialization function that's safe for hot-reload
 *
 * @example
 * ```ts
 * const initialize = createModuleInitializer('game-session', async () => {
 *   registerBuiltinHelpers();
 *   registerCustomHelpers();
 * });
 *
 * export const gameSessionModule: Module = {
 *   id: 'game-session',
 *   name: 'Game Session Module',
 *   initialize,
 * };
 * ```
 */
export function createModuleInitializer(
  moduleId: string,
  initFn: () => Promise<void> | void
): () => Promise<void> {
  return async () => {
    // Check if already initialized
    if (initializedModules.get(moduleId)) {
      if (import.meta.env.DEV) {
        console.debug(`[Module] ${moduleId} already initialized, skipping (hot-reload)`);
      }
      return;
    }

    // Run initialization
    try {
      await initFn();
      initializedModules.set(moduleId, true);

      if (import.meta.env.DEV) {
        console.debug(`[Module] ${moduleId} initialized successfully`);
      }
    } catch (error) {
      console.error(`[Module] ${moduleId} initialization failed:`, error);
      throw error;
    }
  };
}

/**
 * Check if a module has been initialized.
 *
 * Useful for conditional logic that depends on module initialization state.
 *
 * @param moduleId Module identifier
 * @returns True if module has been initialized
 */
export function isModuleInitialized(moduleId: string): boolean {
  return initializedModules.get(moduleId) ?? false;
}

/**
 * Reset initialization state for a module.
 *
 * **Warning**: This should only be used in tests or very special cases.
 * In normal operation, modules should remain initialized for the page lifetime.
 *
 * @param moduleId Module identifier (omit to reset all modules)
 */
export function resetModuleState(moduleId?: string): void {
  if (moduleId) {
    initializedModules.delete(moduleId);
    if (import.meta.env.DEV) {
      console.debug(`[Module] ${moduleId} state reset`);
    }
  } else {
    initializedModules.clear();
    if (import.meta.env.DEV) {
      console.debug('[Module] All module states reset');
    }
  }
}

/**
 * Get list of all initialized modules.
 *
 * Useful for debugging and diagnostics.
 *
 * @returns Array of initialized module IDs
 */
export function getInitializedModules(): string[] {
  return Array.from(initializedModules.keys()).filter((id) =>
    initializedModules.get(id)
  );
}

/**
 * Development-only warning for modules without proper initialization guards.
 *
 * Call this at the start of any module initialization function that doesn't
 * use createModuleInitializer to warn about potential hot-reload issues.
 *
 * @param moduleId Module identifier
 * @param action Description of what's being initialized
 *
 * @example
 * ```ts
 * async initialize() {
 *   warnUnguardedInit('legacy-module', 'registering event handlers');
 *   // ... initialization code
 * }
 * ```
 */
export function warnUnguardedInit(moduleId: string, action: string): void {
  if (import.meta.env.DEV) {
    console.warn(
      `[Module] ${moduleId}: ${action} without hot-reload guard. ` +
        `Consider using createModuleInitializer() to prevent duplicate initialization.`
    );
  }
}

/**
 * Wrapper for creating cleanup functions that are also idempotent.
 *
 * Similar to createModuleInitializer but for cleanup/disposal logic.
 *
 * @param moduleId Module identifier
 * @param cleanupFn Cleanup function to run once
 * @returns Wrapped cleanup function
 */
export function createModuleCleanup(
  moduleId: string,
  cleanupFn: () => Promise<void> | void
): () => Promise<void> {
  let cleanupRan = false;

  return async () => {
    if (cleanupRan) {
      if (import.meta.env.DEV) {
        console.debug(`[Module] ${moduleId} already cleaned up, skipping`);
      }
      return;
    }

    try {
      await cleanupFn();
      cleanupRan = true;
      // Remove from initialized modules
      initializedModules.delete(moduleId);

      if (import.meta.env.DEV) {
        console.debug(`[Module] ${moduleId} cleaned up successfully`);
      }
    } catch (error) {
      console.error(`[Module] ${moduleId} cleanup failed:`, error);
      throw error;
    }
  };
}
