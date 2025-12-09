/**
 * Console Module
 *
 * Blender-style command interface for pixsim.
 *
 * @example
 * ```ts
 * import { pixsim, initializeConsole } from '@/lib/console';
 *
 * // Initialize with context getter
 * initializeConsole(useEditorContext);
 *
 * // Use in code or console
 * pixsim.context.scene.id
 * pixsim.data.workspace.activePresetId
 * pixsim.ops.workspace.loadPreset('minimal')
 * ```
 */

export { dataRegistry, opsRegistry, createPixsimNamespace, initializeNamespace } from './namespace';
export type { DataStoreRegistration } from './dataRegistry';
export type { Operation, OperationCategory } from './opsRegistry';
export type { PixsimNamespace } from './namespace';

export { useConsoleStore } from './consoleStore';
export type { ConsoleEntry, ConsoleState, ConsoleActions } from './consoleStore';

export { registerCoreStores } from './registerCoreStores';
export { registerCoreOps } from './registerCoreOps';

import { createPixsimNamespace, initializeNamespace } from './namespace';
import { registerCoreStores } from './registerCoreStores';
import { registerCoreOps } from './registerCoreOps';
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
 * Initialize the console system
 * Call this once at app startup
 */
export function initializeConsole(): void {
  if (initialized) {
    console.warn('[Console] Already initialized');
    return;
  }

  // Initialize namespace with snapshot-based context getter
  initializeNamespace(getEditorContextSnapshot);

  // Register core stores and ops
  registerCoreStores();
  registerCoreOps();

  initialized = true;

  console.log(
    '%c🎮 pixsim console ready %c Type pixsim.help() for usage',
    'color: #7c3aed; font-weight: bold;',
    'color: #888;'
  );
}
