/**
 * Console Module
 *
 * Blender-style command interface for pixsim.
 * Uses a modular plugin-like architecture for registering operations.
 *
 * @example
 * ```ts
 * import { pixsim, initializeConsole, moduleRegistry } from '@lib/dev/console';
 *
 * // Initialize with default modules
 * initializeConsole();
 *
 * // Or register custom modules
 * import { myCustomModule } from './myModule';
 * moduleRegistry.register(myCustomModule);
 *
 * // Use in code or console
 * pixsim.context.scene.id
 * pixsim.data.workspace.activePresetId
 * pixsim.ops.workspace.loadPreset('minimal')
 * pixsim.ops.tools.list()
 * pixsim.ops.tools.set('touch', 'physics.pressure', 0.8)
 * pixsim.ops.stats.max('pleasure')
 * ```
 */

// Core exports
export { dataRegistry, opsRegistry, createPixsimNamespace, initializeNamespace } from './namespace';
export type { DataStoreRegistration } from './dataRegistry';
export type { Operation, OperationCategory } from './opsRegistry';
export type { PixsimNamespace } from './namespace';

export { useConsoleStore } from './consoleStore';
export type { ConsoleEntry, ConsoleState, ConsoleActions } from './consoleStore';

// Module system exports
export { moduleRegistry } from './moduleRegistry';
export type { ConsoleModule } from './moduleRegistry';

// Module exports (for custom registration)
export { defaultModules, coreModule, workspaceModule, toolsModule } from './modules';
export { statsModule } from './modules/stats';
export { useToolConsoleStore } from './modules/tools';

// Legacy exports (deprecated, use modules instead)
export { registerCoreStores } from './registerCoreStores';
export { registerCoreOps } from './registerCoreOps';
export { registerToolOps } from './registerToolOps';
export { registerStatsOps } from './registerStatsOps';

import { createPixsimNamespace, initializeNamespace } from './namespace';
import { moduleRegistry } from './moduleRegistry';
import { getEditorContextSnapshot } from './getEditorContextSnapshot';

/** Global pixsim namespace instance */
export const pixsim = createPixsimNamespace();

/** Expose on window for console access */
if (typeof window !== 'undefined') {
  (window as { pixsim?: typeof pixsim }).pixsim = pixsim;
}

/** Has the console been initialized? */
let initialized = false;

/**
 * Initialize the console system with default modules.
 * Call this once at app startup.
 *
 * @param additionalModules - Optional additional modules to register after defaults
 */
export function initializeConsole(additionalModules?: import('./moduleRegistry').ConsoleModule[]): void {
  if (initialized) {
    console.warn('[Console] Already initialized');
    return;
  }
  initialized = true;

  // Initialize namespace with snapshot-based context getter
  initializeNamespace(getEditorContextSnapshot);

  void import('./modules')
    .then(({ defaultModules }) => {
      // Register default modules (in dependency order)
      moduleRegistry.registerAll(defaultModules);
      return import('./modules/stats');
    })
    .then(({ statsModule }) => {
      // Register stats module (our addition)
      moduleRegistry.register(statsModule);

      // Register any additional modules
      if (additionalModules) {
        moduleRegistry.registerAll(additionalModules);
      }

      const moduleCount = moduleRegistry.keys().length;
      console.log(
        `%cdYZr pixsim console ready %c ${moduleCount} modules loaded. Type pixsim.help() for usage`,
        'color: #7c3aed; font-weight: bold;',
        'color: #888;'
      );
    })
    .catch((error) => {
      console.error('[Console] Failed to initialize modules:', error);
    });
}

/**
 * Check if console is initialized
 */
export function isConsoleInitialized(): boolean {
  return initialized;
}
