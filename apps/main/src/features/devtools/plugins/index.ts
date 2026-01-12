/**
 * Dev Tools Plugins Index
 *
 * Central place to import and export all dev tool plugins.
 * Register your custom dev tools here.
 *
 * Note: Some tools (appMapTool, templateAnalyticsTool) are now auto-registered
 * from their module definitions via page.devTool config.
 */

import {
  sessionStateViewerTool,
  generationHealthTool,
  pluginWorkspaceTool,
  capabilityTestingTool,
  dependencyGraphTool,
  backendArchitectureTool,
  gizmoSurfacesTool,
  promptLabTool,
  promptBlockGraphTool,
  actionBlockGraphTool,
  blockFitTool,
  typesExplorerTool,
  sqlQueryExplorerTool,
  codegenTool,
} from './tools';

// Export all plugins individually
export {
  sessionStateViewerTool,
  generationHealthTool,
  pluginWorkspaceTool,
  capabilityTestingTool,
  dependencyGraphTool,
  backendArchitectureTool,
  gizmoSurfacesTool,
  promptLabTool,
  promptBlockGraphTool,
  actionBlockGraphTool,
  blockFitTool,
  typesExplorerTool,
  sqlQueryExplorerTool,
  codegenTool,
};

// Export array of built-in dev tools for bulk registration
// Note: appMapTool and templateAnalyticsTool are auto-registered from modules
export const builtInDevTools = [
  // Session & World State
  sessionStateViewerTool,
  generationHealthTool,

  // Plugin Development
  pluginWorkspaceTool,
  capabilityTestingTool,

  // Architecture & Graph (appMapTool auto-registered from appMapModule)
  dependencyGraphTool,
  backendArchitectureTool,

  // Analytics & Metrics (templateAnalyticsTool auto-registered from templateAnalyticsModule)

  // Gizmo & Surface Management
  gizmoSurfacesTool,

  // Prompt Tools
  promptLabTool,
  promptBlockGraphTool,
  actionBlockGraphTool,
  blockFitTool,

  // Types & Schema
  typesExplorerTool,

  // Database & Diagnostics
  sqlQueryExplorerTool,

  // Codegen
  codegenTool,
];
