/**
 * World Tool Plugins Index
 *
 * Central place to import and export all world tool plugins.
 * Register your custom world tools here.
 */

import { relationshipDashboardTool } from './relationshipDashboard';
import { questLogTool } from './questLog';
import { inventoryTool } from './inventory';
import { worldInfoTool } from './worldInfo';

// Export all plugins
export {
  relationshipDashboardTool,
  questLogTool,
  inventoryTool,
  worldInfoTool,
};

// Export a helper to register all built-in tools
export const builtInWorldTools = [
  relationshipDashboardTool,
  questLogTool,
  inventoryTool,
  worldInfoTool,
];
