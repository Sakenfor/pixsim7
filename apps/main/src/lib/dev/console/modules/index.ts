/**
 * Console Modules Index
 *
 * Exports all default console modules.
 * Import and register these in your app initialization.
 *
 * @example
 * ```ts
 * import { moduleRegistry } from '@lib/dev/console';
 * import { defaultModules } from '@lib/dev/console/modules';
 *
 * // Register all default modules
 * moduleRegistry.registerAll(defaultModules);
 *
 * // Or register individually
 * import { toolsModule } from '@lib/dev/console/modules';
 * moduleRegistry.register(toolsModule);
 * ```
 */

export { coreModule } from './core';
export { workspaceModule } from '@features/workspace/lib/consoleModule';
export { toolsModule, useToolConsoleStore } from './tools';

// Inspector module system
export {
  createInspectorModule,
  registerInspectorTab,
  unregisterInspectorTab,
  getInspectorTabs,
  getInspectorTab,
  clearInspectorTabs,
  useInspectorTabs,
  modelInspectorModule,
  type InspectorTab,
  type InspectorTabProps,
  type InspectorConfig,
} from './inspectorModule';

// Re-export module type
export type { ConsoleModule } from '../moduleRegistry';

// Default modules in dependency order
import { coreModule } from './core';
import { workspaceModule } from '@features/workspace/lib/consoleModule';
import { toolsModule } from './tools';

/**
 * Default modules to register, in dependency order.
 * Core must be first as other modules depend on it.
 */
export const defaultModules = [
  coreModule,
  workspaceModule,
  toolsModule,
];
