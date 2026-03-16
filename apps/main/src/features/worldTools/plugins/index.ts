/**
 * World Tool Plugins Index
 *
 * Central place to import and export all world tool plugins.
 * Register your custom world tools here.
 */

import { blockPrimitivesDebugTool } from './blockPrimitivesDebug';
import { inventoryTool } from './inventory';
import { moodDebugTool } from './moodDebug';
import { npcBrainDebugTool } from './npcBrainDebug';
import { npcPresenceDebugTool } from './npcPresenceDebug';
import { questLogTool } from './questLog';
import { relationshipDashboardTool } from './relationshipDashboard';
import { relationshipDiffDebugTool } from './relationshipDiffDebug';
import { sessionFlagsDebugTool } from './sessionFlagsDebug';
import { turnHistoryDebugTool } from './turnHistoryDebug';
import { worldInfoTool } from './worldInfo';
import { worldManifestDebugTool } from './worldManifestDebug';
import { worldThemeEditorTool } from './worldThemeEditor';

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
  worldThemeEditorTool,
  blockPrimitivesDebugTool,
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
  worldThemeEditorTool,
  blockPrimitivesDebugTool,
];
