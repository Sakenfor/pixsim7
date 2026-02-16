/**
 * Dev Tools Plugins Index
 *
 * Central place to import and export all dev tool plugins.
 * Register your custom dev tools here.
 *
 */

import {
  sessionStateViewerTool,
  generationHealthTool,
  pluginWorkspaceTool,
  capabilityTestingTool,
  appMapTool,
  dependencyGraphTool,
  backendArchitectureTool,
  templateAnalyticsTool,
  gizmoSurfacesTool,
  mediaHarnessTool,
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
  appMapTool,
  dependencyGraphTool,
  backendArchitectureTool,
  templateAnalyticsTool,
  gizmoSurfacesTool,
  mediaHarnessTool,
  promptLabTool,
  promptBlockGraphTool,
  actionBlockGraphTool,
  blockFitTool,
  typesExplorerTool,
  sqlQueryExplorerTool,
  codegenTool,
};

// Export array of built-in dev tools for bulk registration
export const builtInDevTools = [
  // Session & World State
  sessionStateViewerTool,
  generationHealthTool,

  // Plugin Development
  pluginWorkspaceTool,
  capabilityTestingTool,

  // Architecture & Graph
  appMapTool,
  dependencyGraphTool,
  backendArchitectureTool,

  // Analytics & Metrics
  templateAnalyticsTool,

  // Gizmo & Surface Management
  gizmoSurfacesTool,
  mediaHarnessTool,

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
