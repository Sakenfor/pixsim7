/**
 * Gating Plugin System
 *
 * Main entry point for the gating plugin system.
 * Exports all types, registry functions, and registers built-in plugins.
 *
 * @see claude-tasks/109-intimacy-and-content-gating-stat-integration.md
 */

// Export types
export type {
  GatingPlugin,
  GatingPluginMeta,
  RelationshipState,
  GatingResult,
  GateRequirements,
} from './types';

// Export registry class instance and functions
export {
  gatingRegistry,
  registerGatingPlugin,
  getGatingPlugin,
  listGatingPlugins,
  unregisterGatingPlugin,
  hasGatingPlugin,
  getWorldGatingPlugin,
} from './registry';

// Import and register built-in plugins
import { intimacyDefaultPlugin } from './plugins/intimacyDefault';
import { registerGatingPlugin } from './registry';

// Register default plugins at module load time
registerGatingPlugin(intimacyDefaultPlugin, {
  category: 'romance',
  tags: ['intimacy', 'relationships', 'default'],
});

// Re-export default plugin for direct access if needed
export { intimacyDefaultPlugin } from './plugins/intimacyDefault';
