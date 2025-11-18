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
import { moodDebugTool } from './moodDebug';
import { sessionFlagsDebugTool } from './sessionFlagsDebug';
import { turnHistoryDebugTool } from './turnHistoryDebug';
import { npcBrainDebugTool } from './npcBrainDebug';
import { worldManifestDebugTool } from './worldManifestDebug';
import { npcPresenceDebugTool } from './npcPresenceDebug';
import { relationshipDiffDebugTool } from './relationshipDiffDebug';

// Export all plugins
export {
  relationshipDashboardTool,
  questLogTool,
  inventoryTool,
  worldInfoTool,
  moodDebugTool,
  sessionFlagsDebugTool,
  turnHistoryDebugTool,
  npcBrainDebugTool,
  worldManifestDebugTool,
  npcPresenceDebugTool,
  relationshipDiffDebugTool,
};

// Export a helper to register all built-in tools
export const builtInWorldTools = [
  relationshipDashboardTool,
  questLogTool,
  inventoryTool,
  worldInfoTool,
  moodDebugTool,
  sessionFlagsDebugTool,
  turnHistoryDebugTool,
  npcBrainDebugTool,
  worldManifestDebugTool,
  npcPresenceDebugTool,
  relationshipDiffDebugTool,
];
