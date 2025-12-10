/**
 * Brain Tool Plugins Index
 *
 * Central place to import and export all brain tool plugins.
 * Register your custom brain tools here.
 */

import { traitsTool } from './traits';
import { moodTool } from './mood';
import { behaviorTool } from './behavior';
import { socialTool } from './social';
import { memoriesTool } from './memories';
import { logicTool } from './logic';
import { instinctTool } from './instinct';

// Export all plugins
export {
  traitsTool,
  moodTool,
  behaviorTool,
  socialTool,
  memoriesTool,
  logicTool,
  instinctTool,
};

// Export a helper to register all built-in tools
export const builtInBrainTools = [
  traitsTool,
  moodTool,
  behaviorTool,
  socialTool,
  memoriesTool,
  logicTool,
  instinctTool,
];
