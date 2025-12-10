/**
 * Console Module
 *
 * Blender-style command interface for pixsim.
 * Uses a modular plugin-like architecture for registering operations.
 *
 * @example
 * ```ts
 * import { pixsim, initializeConsole, moduleRegistry } from '@/lib/console';
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
 * pixsim.ops.tools.setPressure(0.8)
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
export { useToolConsoleStore } from './modules/tools';

// Legacy exports (deprecated, use modules instead)
export { registerCoreStores } from './registerCoreStores';
export { registerCoreOps } from './registerCoreOps';
export { registerToolOps } from './registerToolOps';

import { createPixsimNamespace, initializeNamespace } from './namespace';
import { moduleRegistry } from './moduleRegistry';
import { defaultModules } from './modules';
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

  // Initialize namespace with snapshot-based context getter
  initializeNamespace(getEditorContextSnapshot);

  // Register default modules (in dependency order)
  moduleRegistry.registerAll(defaultModules);

  // Register any additional modules
  if (additionalModules) {
    moduleRegistry.registerAll(additionalModules);
  }

  initialized = true;

  const moduleCount = moduleRegistry.keys().length;
  console.log(
    `%c🎮 pixsim console ready %c ${moduleCount} modules loaded. Type pixsim.help() for usage`,
    'color: #7c3aed; font-weight: bold;',
    'color: #888;'
  );
}

/**
 * Check if console is initialized
 */
export function isConsoleInitialized(): boolean {
  return initialized;
}
